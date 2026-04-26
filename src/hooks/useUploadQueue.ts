import { useCallback, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

export type UploadStatus =
  | "queued"
  | "uploading"
  | "saving"
  | "done"
  | "error"
  | "warning"; // demorando mais que o limite, mas ainda tentando

export interface UploadJob {
  id: string;
  file: File;
  thumbnail?: File | null;
  // Metadados que serão salvos no DB ao terminar
  meta: {
    title: string;
    genre: string;
    description: string;
  };
  status: UploadStatus;
  progress: number;
  speedMBs: number;
  etaSec: number;
  errorMsg?: string;
  startedAt?: number;
  // Sinaliza se já passamos do tempo máximo (apenas para UI — não cancela)
  timedOut: boolean;
  // Para cancelar o upload manualmente
  abort?: () => void;
}

const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos

const uploadFileTus = (
  bucket: string,
  path: string,
  file: File,
  onProgress: (pct: number, speedMBs: number, etaSec: number) => void,
  registerAbort: (fn: () => void) => void,
): Promise<string> =>
  new Promise(async (resolve, reject) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const endpoint = `https://${projectId}.supabase.co/storage/v1/upload/resumable`;

    const startTime = Date.now();
    // Janela móvel pra calcular velocidade real (últimos 5s) — ETA precisa
    const samples: { t: number; bytes: number }[] = [];
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000],
      headers: {
        authorization: `Bearer ${token}`,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        const now = Date.now();
        const pct = (bytesUploaded / bytesTotal) * 100;

        // Mantém só amostras dos últimos 5s pra refletir a velocidade ATUAL
        samples.push({ t: now, bytes: bytesUploaded });
        const cutoff = now - 5000;
        while (samples.length > 2 && samples[0].t < cutoff) samples.shift();

        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = (last.t - first.t) / 1000;
        const db = last.bytes - first.bytes;
        // Velocidade janela; se não dá pra medir, cai pra média total
        const speedMBs =
          dt > 0.5 && db > 0
            ? db / 1024 / 1024 / dt
            : bytesUploaded / 1024 / 1024 /
              Math.max((now - startTime) / 1000, 0.1);

        const remaining = (bytesTotal - bytesUploaded) / 1024 / 1024;
        const etaSec = remaining / Math.max(speedMBs, 0.01);
        onProgress(pct, speedMBs, etaSec);
      },
      onSuccess: () => {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        resolve(data.publicUrl);
      },
    });

    registerAbort(() => upload.abort(true).catch(() => {}));

    const prev = await upload.findPreviousUploads();
    if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
    upload.start();
  });

interface EnqueueInput {
  file: File;
  thumbnail?: File | null;
  meta: { title: string; genre: string; description: string };
}

export const useUploadQueue = (onJobDone?: () => void) => {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const jobsRef = useRef<UploadJob[]>([]);

  const update = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs((prev) => {
      const next = prev.map((j) => (j.id === id ? { ...j, ...patch } : j));
      jobsRef.current = next;
      return next;
    });
  }, []);

  const runJob = useCallback(
    async (job: UploadJob) => {
      // Timer de aviso: 2 min sem terminar → marca como "warning" (continua tentando)
      const timeoutTimer = window.setTimeout(() => {
        const cur = jobsRef.current.find((j) => j.id === job.id);
        if (cur && (cur.status === "uploading" || cur.status === "saving")) {
          update(job.id, { status: "warning", timedOut: true });
        }
      }, TIMEOUT_MS);

      try {
        update(job.id, {
          status: "uploading",
          progress: 0,
          startedAt: Date.now(),
        });

        // Upload do vídeo
        const ext = job.file.name.split(".").pop() || "mp4";
        const path = `videos/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

        const videoUrl = await uploadFileTus(
          "videos",
          path,
          job.file,
          (pct, speedMBs, etaSec) => {
            // Mantém status "warning" se já marcou
            const cur = jobsRef.current.find((j) => j.id === job.id);
            const keepWarn = cur?.status === "warning";
            update(job.id, {
              progress: pct,
              speedMBs,
              etaSec,
              status: keepWarn ? "warning" : "uploading",
            });
          },
          (abortFn) => update(job.id, { abort: abortFn }),
        );

        // Upload de thumbnail (opcional)
        let thumbnailUrl: string | null = null;
        if (job.thumbnail) {
          const thExt = job.thumbnail.name.split(".").pop() || "jpg";
          const thPath = `thumbnails/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 7)}.${thExt}`;
          thumbnailUrl = await uploadFileTus(
            "videos",
            thPath,
            job.thumbnail,
            () => {},
            () => {},
          );
        }

        // Salvar no catálogo
        update(job.id, { status: "saving", progress: 99 });
        const { error } = await supabase.from("movies").insert({
          title: job.meta.title,
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl,
          genre: job.meta.genre,
          description: job.meta.description,
          audio: job.meta.audio || "Original",
          status: "published",
        });
        if (error) throw error;

        update(job.id, { status: "done", progress: 100 });
        onJobDone?.();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        update(job.id, { status: "error", errorMsg: msg });
      } finally {
        window.clearTimeout(timeoutTimer);
      }
    },
    [update, onJobDone],
  );

  const enqueue = useCallback(
    (inputs: EnqueueInput[]) => {
      const newJobs: UploadJob[] = inputs.map((inp) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: inp.file,
        thumbnail: inp.thumbnail ?? null,
        meta: inp.meta,
        status: "queued",
        progress: 0,
        speedMBs: 0,
        etaSec: 0,
        timedOut: false,
      }));
      setJobs((prev) => {
        const next = [...prev, ...newJobs];
        jobsRef.current = next;
        return next;
      });
      // Dispara em paralelo
      newJobs.forEach((j) => void runJob(j));
    },
    [runJob],
  );

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => {
      const target = prev.find((j) => j.id === id);
      target?.abort?.();
      const next = prev.filter((j) => j.id !== id);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const clearDone = useCallback(() => {
    setJobs((prev) => {
      const next = prev.filter((j) => j.status !== "done");
      jobsRef.current = next;
      return next;
    });
  }, []);

  const retry = useCallback(
    (id: string) => {
      const target = jobsRef.current.find((j) => j.id === id);
      if (!target) return;
      update(id, {
        status: "queued",
        progress: 0,
        errorMsg: undefined,
        timedOut: false,
      });
      void runJob({ ...target, status: "queued", timedOut: false });
    },
    [runJob, update],
  );

  const activeCount = jobs.filter(
    (j) => j.status === "uploading" || j.status === "saving" || j.status === "warning" || j.status === "queued",
  ).length;

  return {
    jobs,
    enqueue,
    removeJob,
    clearDone,
    retry,
    activeCount,
    timeoutMs: TIMEOUT_MS,
  };
};
