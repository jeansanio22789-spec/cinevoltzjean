import { useEffect, useState } from "react";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import {
  deletePersistedUploadJob,
  deletePersistedUploadJobs,
  loadPersistedUploadJobs,
  persistUploadJob,
  type PersistedUploadJob,
} from "@/lib/uploadQueuePersistence";

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
  // URL local (object URL) da capa, pra mostrar preview na fila
  thumbPreviewUrl?: string | null;
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
  timedOut: boolean;
  abort?: () => void;
}

const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos (apenas para marcar "warning")

// ---------------------------------------------------------------------------
// 🔁 Store global (singleton) para o upload sobreviver à navegação entre páginas
// ---------------------------------------------------------------------------
type Listener = (jobs: UploadJob[]) => void;

const toPersistedJob = (job: UploadJob): PersistedUploadJob => ({
  id: job.id,
  file: job.file,
  thumbnail: job.thumbnail ?? null,
  meta: job.meta,
  status: job.status === "done" ? "done" : job.status === "error" ? "error" : "queued",
  progress: job.status === "done" ? 100 : 0,
  speedMBs: 0,
  etaSec: 0,
  errorMsg: job.errorMsg,
  startedAt: job.startedAt,
  timedOut: false,
});

const store = {
  jobs: [] as UploadJob[],
  listeners: new Set<Listener>(),
  initialized: false,
  emit() {
    for (const l of this.listeners) l([...this.jobs]);
  },
  update(id: string, patch: Partial<UploadJob>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    const updated = this.jobs.find((j) => j.id === id);
    if (updated && updated.status !== "done") void persistUploadJob(toPersistedJob(updated));
    this.emit();
  },
  add(jobs: UploadJob[]) {
    this.jobs = [...this.jobs, ...jobs];
    jobs.forEach((j) => void persistUploadJob(toPersistedJob(j)));
    this.emit();
  },
  hydrate(jobs: UploadJob[]) {
    this.jobs = jobs;
    this.initialized = true;
    this.emit();
  },
  remove(id: string) {
    const target = this.jobs.find((j) => j.id === id);
    target?.abort?.();
    if (target?.thumbPreviewUrl) URL.revokeObjectURL(target.thumbPreviewUrl);
    this.jobs = this.jobs.filter((j) => j.id !== id);
    void deletePersistedUploadJob(id);
    this.emit();
  },
  clearDone() {
    const doneIds = this.jobs.filter((j) => j.status === "done").map((j) => j.id);
    this.jobs
      .filter((j) => j.status === "done" && j.thumbPreviewUrl)
      .forEach((j) => URL.revokeObjectURL(j.thumbPreviewUrl!));
    this.jobs = this.jobs.filter((j) => j.status !== "done");
    void deletePersistedUploadJobs(doneIds);
    this.emit();
  },
  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  },
};

// Avisa o usuário se tentar fechar a aba durante upload ativo (precisa ser global)
// + Wake Lock pra evitar que o navegador suspenda a aba quando ela vai pro background
let wakeLock: WakeLockSentinel | null = null;

const hasActiveUploads = () =>
  store.jobs.some(
    (j) =>
      j.status === "uploading" ||
      j.status === "saving" ||
      j.status === "warning" ||
      j.status === "queued",
  );

const requestWakeLock = async () => {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: string) => Promise<WakeLockSentinel> };
    };
    if (nav.wakeLock && !wakeLock) {
      wakeLock = await nav.wakeLock.request("screen");
    }
  } catch {
    /* navegador não suporta - ignora */
  }
};

const releaseWakeLock = async () => {
  try {
    await wakeLock?.release();
  } catch {
    /* ignora */
  }
  wakeLock = null;
};

if (typeof window !== "undefined") {
  // Bloqueia o fechar da aba enquanto tem upload rolando
  window.addEventListener("beforeunload", (e: BeforeUnloadEvent) => {
    if (!hasActiveUploads()) return;
    e.preventDefault();
    e.returnValue = "Uploads em andamento — se fechar, vão parar!";
  });

  // Quando a aba volta do background, re-pede wake lock (browser solta sozinho)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hasActiveUploads()) {
      void requestWakeLock();
    }
  });
}

// Tipo mínimo do WakeLockSentinel pra TS não reclamar
interface WakeLockSentinel {
  release(): Promise<void>;
}

// Callbacks "globais" para notificar quando um job terminar (ex: refetch da lista)
const doneCallbacks = new Set<() => void>();

const updateProgress = (
  startTime: number,
  samples: { t: number; bytes: number }[],
  bytesUploaded: number,
  bytesTotal: number,
  onProgress: (pct: number, speedMBs: number, etaSec: number) => void,
) => {
  const now = Date.now();
  const pct = (bytesUploaded / bytesTotal) * 100;

  samples.push({ t: now, bytes: bytesUploaded });
  const cutoff = now - 5000;
  while (samples.length > 2 && samples[0].t < cutoff) samples.shift();

  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = (last.t - first.t) / 1000;
  const db = last.bytes - first.bytes;
  const speedMBs =
    dt > 0.5 && db > 0
      ? db / 1024 / 1024 / dt
      : bytesUploaded / 1024 / 1024 / Math.max((now - startTime) / 1000, 0.1);

  const remaining = (bytesTotal - bytesUploaded) / 1024 / 1024;
  const etaSec = remaining / Math.max(speedMBs, 0.01);
  onProgress(pct, speedMBs, etaSec);
};

const uploadFileDirect = async (
  bucket: string,
  path: string,
  file: File,
  onProgress: (pct: number, speedMBs: number, etaSec: number) => void,
  registerAbort: (fn: () => void) => void,
): Promise<string> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const startTime = Date.now();
  const samples: { t: number; bytes: number }[] = [];

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    registerAbort(() => xhr.abort());

    xhr.open("POST", url, true);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("cache-control", "3600");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      updateProgress(startTime, samples, e.loaded, e.total, onProgress);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        resolve(data.publicUrl);
        return;
      }
      reject(new Error(xhr.responseText || `Falha no upload (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Falha de rede no upload"));
    xhr.onabort = () => reject(new Error("Upload cancelado"));
    xhr.send(file);
  });
};

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
        updateProgress(startTime, samples, bytesUploaded, bytesTotal, onProgress);
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

const uploadFileFast = async (
  bucket: string,
  path: string,
  file: File,
  onProgress: (pct: number, speedMBs: number, etaSec: number) => void,
  registerAbort: (fn: () => void) => void,
): Promise<string> => {
  try {
    return await uploadFileDirect(bucket, path, file, onProgress, registerAbort);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/cancelado|abort/i.test(msg)) throw err;
    // Fallback resiliente: se o upload direto falhar, retoma com TUS.
    return uploadFileTus(bucket, path, file, onProgress, registerAbort);
  }
};

// ---------------------------------------------------------------------------
// Execução do job (continua rodando mesmo se o componente desmontar)
// ---------------------------------------------------------------------------
const runningJobIds = new Set<string>();

const runJob = async (job: UploadJob) => {
  if (runningJobIds.has(job.id)) return;
  runningJobIds.add(job.id);
  // Pede pra tela ficar acordada — ajuda muito em mobile
  void requestWakeLock();

  const timeoutTimer = window.setTimeout(() => {
    const cur = store.jobs.find((j) => j.id === job.id);
    if (cur && (cur.status === "uploading" || cur.status === "saving")) {
      store.update(job.id, { status: "warning", timedOut: true });
    }
  }, TIMEOUT_MS);

  try {
    store.update(job.id, {
      status: "uploading",
      progress: 0,
      startedAt: Date.now(),
    });

    const ext = job.file.name.split(".").pop() || "mp4";
    const path = `videos/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

    const videoUrl = await uploadFileFast(
      "videos",
      path,
      job.file,
      (pct, speedMBs, etaSec) => {
        const cur = store.jobs.find((j) => j.id === job.id);
        const keepWarn = cur?.status === "warning";
        store.update(job.id, {
          progress: pct,
          speedMBs,
          etaSec,
          status: keepWarn ? "warning" : "uploading",
        });
      },
      (abortFn) => store.update(job.id, { abort: abortFn }),
    );

    let thumbnailUrl: string | null = null;
    if (job.thumbnail) {
      const thExt = job.thumbnail.name.split(".").pop() || "jpg";
      const thPath = `thumbnails/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}.${thExt}`;
      thumbnailUrl = await uploadFileFast(
        "videos",
        thPath,
        job.thumbnail,
        () => {},
        () => {},
      );
    }

    store.update(job.id, { status: "saving", progress: 99 });
    const { error } = await supabase.from("movies").insert({
      title: job.meta.title,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      genre: job.meta.genre,
      description: job.meta.description,
      status: "published",
    });
    if (error) throw error;

    store.update(job.id, { status: "done", progress: 100 });
    void deletePersistedUploadJob(job.id);
    for (const cb of doneCallbacks) {
      try {
        cb();
      } catch {
        /* noop */
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    store.update(job.id, { status: "error", errorMsg: msg });
  } finally {
    runningJobIds.delete(job.id);
    window.clearTimeout(timeoutTimer);
    // Libera o wake lock se não tem mais nada rolando
    if (!hasActiveUploads()) void releaseWakeLock();
  }
};

interface EnqueueInput {
  file: File;
  thumbnail?: File | null;
  meta: { title: string; genre: string; description: string };
}

// ---------------------------------------------------------------------------
// Hook que apenas se "pluga" no store global
// ---------------------------------------------------------------------------
export const useUploadQueue = (onJobDone?: () => void) => {
  const [jobs, setJobs] = useState<UploadJob[]>(store.jobs);

  useEffect(() => {
    const unsub = store.subscribe(setJobs);

    if (!store.initialized) {
      store.initialized = true;
      void loadPersistedUploadJobs().then((saved) => {
        if (!saved.length || store.jobs.length > 0) return;
        const restoredJobs: UploadJob[] = saved
          .filter((j) => j.status !== "done")
          .map((j) => ({
            ...j,
            status: j.status === "error" ? "error" : "queued",
            progress: j.status === "error" ? j.progress : 0,
            speedMBs: 0,
            etaSec: 0,
            timedOut: false,
            thumbPreviewUrl: j.thumbnail ? URL.createObjectURL(j.thumbnail) : null,
          }));

        store.hydrate(restoredJobs);
        restoredJobs
          .filter((j) => j.status !== "error")
          .forEach((j) => void runJob(j));
      });
    }

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!onJobDone) return;
    doneCallbacks.add(onJobDone);
    return () => {
      doneCallbacks.delete(onJobDone);
    };
  }, [onJobDone]);

  const enqueue = (inputs: EnqueueInput[]) => {
    const newJobs: UploadJob[] = inputs.map((inp) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: inp.file,
      thumbnail: inp.thumbnail ?? null,
      thumbPreviewUrl: inp.thumbnail
        ? URL.createObjectURL(inp.thumbnail)
        : null,
      meta: inp.meta,
      status: "queued",
      progress: 0,
      speedMBs: 0,
      etaSec: 0,
      timedOut: false,
    }));
    store.add(newJobs);
    // Dispara em paralelo — roda solto, não depende do componente
    newJobs.forEach((j) => void runJob(j));
  };

  const removeJob = (id: string) => store.remove(id);
  const clearDone = () => store.clearDone();

  const retry = (id: string) => {
    const target = store.jobs.find((j) => j.id === id);
    if (!target) return;
    store.update(id, {
      status: "queued",
      progress: 0,
      errorMsg: undefined,
      timedOut: false,
    });
    void runJob({ ...target, status: "queued", timedOut: false });
  };

  const activeCount = jobs.filter(
    (j) =>
      j.status === "uploading" ||
      j.status === "saving" ||
      j.status === "warning" ||
      j.status === "queued",
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
