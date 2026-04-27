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

// ---------------------------------------------------------------------------
// 🌐 Sincronização com Supabase (tabela upload_jobs)
// Permite que o admin acompanhe o progresso de uploads iniciados em OUTROS
// dispositivos. O arquivo continua subindo do device original — apenas o
// estado (progresso, status, erro) é replicado pra todos.
// ---------------------------------------------------------------------------
const getDeviceLabel = (): string => {
  if (typeof navigator === "undefined") return "Desconhecido";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return "iPhone/iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "Web";
};

const remoteSyncQueue = new Map<string, ReturnType<typeof setTimeout>>();
const REMOTE_DEBOUNCE_MS = 2500; // não martela a API a cada onProgress

const syncJobToRemote = (job: UploadJob, immediate = false) => {
  const existing = remoteSyncQueue.get(job.id);
  if (existing) clearTimeout(existing);

  const run = async () => {
    remoteSyncQueue.delete(job.id);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user.id;
      if (!userId) return;
      await supabase.from("upload_jobs").upsert(
        {
          id: job.id,
          user_id: userId,
          device_label: getDeviceLabel(),
          file_name: job.file?.name ?? "arquivo.mp4",
          file_size: job.file?.size ?? 0,
          title: job.meta.title,
          genre: job.meta.genre,
          description: job.meta.description,
          status: job.status,
          progress: Math.round(job.progress || 0),
          speed_mbs: Number((job.speedMBs || 0).toFixed(2)),
          eta_sec: Math.round(job.etaSec || 0),
          upload_path: job.uploadPath ?? null,
          error_msg: job.errorMsg ?? null,
          started_at: job.startedAt ? new Date(job.startedAt).toISOString() : null,
        },
        { onConflict: "id" },
      );
    } catch {
      /* offline / sem permissão — ignora */
    }
  };

  if (immediate) {
    void run();
  } else {
    remoteSyncQueue.set(job.id, setTimeout(run, REMOTE_DEBOUNCE_MS));
  }
};

const deleteRemoteJob = async (id: string) => {
  try {
    await supabase.from("upload_jobs").delete().eq("id", id);
  } catch {
    /* ignora */
  }
};

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
  /** Estimativa CONGELADA do tempo restante (não oscila). Setado uma vez. */
  lockedEtaSec?: number;
  /** Timestamp absoluto (ms) da hora prevista de término. Não muda. */
  lockedEndAt?: number;
  errorMsg?: string;
  startedAt?: number;
  timedOut: boolean;
  abort?: () => void;
  /** Caminho fixo do arquivo no Storage. Persistido para que o TUS consiga
   *  retomar exatamente o mesmo upload após o app ser recarregado. */
  uploadPath?: string;
  /** Timestamp do último progresso recebido — usado para detectar travamento. */
  lastProgressAt?: number;
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
  // Mantém o status real para identificar jobs que estavam ativos no refresh.
  status:
    job.status === "done"
      ? "done"
      : job.status === "error"
        ? "error"
        : "uploading",
  // Persiste o progresso REAL — assim ao recarregar o app a barra continua
  // do mesmo ponto enquanto o TUS retoma a transferência.
  progress: job.status === "done" ? 100 : Math.round(job.progress || 0),
  speedMBs: 0,
  etaSec: 0,
  errorMsg: job.errorMsg,
  startedAt: job.startedAt,
  timedOut: false,
  uploadPath: job.uploadPath,
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
    if (updated) {
      // Status crítico vai imediato; progresso vai com debounce.
      const immediate =
        patch.status !== undefined ||
        patch.errorMsg !== undefined ||
        patch.uploadPath !== undefined;
      syncJobToRemote(updated, immediate);
    }
    this.emit();
  },
  add(jobs: UploadJob[]) {
    this.jobs = [...this.jobs, ...jobs];
    jobs.forEach((j) => {
      void persistUploadJob(toPersistedJob(j));
      syncJobToRemote(j, true);
    });
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
    void deleteRemoteJob(id);
    this.emit();
  },
  clearDone() {
    const doneIds = this.jobs.filter((j) => j.status === "done").map((j) => j.id);
    this.jobs
      .filter((j) => j.status === "done" && j.thumbPreviewUrl)
      .forEach((j) => URL.revokeObjectURL(j.thumbPreviewUrl!));
    this.jobs = this.jobs.filter((j) => j.status !== "done");
    void deletePersistedUploadJobs(doneIds);
    doneIds.forEach((id) => void deleteRemoteJob(id));
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

  // Quando a aba volta do background, re-pede wake lock e retoma
  // qualquer job que estava rodando mas perdeu o XHR vivo.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (hasActiveUploads()) void requestWakeLock();
    // Retoma jobs que estavam ativos mas não têm runner vivo (ex.: aba foi
    // pro background no mobile e o navegador matou o XHR).
    store.jobs.forEach((j) => {
      const isActive =
        j.status === "uploading" ||
        j.status === "warning" ||
        j.status === "queued";
      if (isActive && !runningJobIds.has(j.id)) {
        void runJob(j);
      }
    });
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
    // ⚡ Hostname direto do storage = MUITO mais rápido (otimização oficial Supabase).
    // Pula o gateway principal e vai direto pros servidores de upload.
    const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
    const startTime = Date.now();
    const samples: { t: number; bytes: number }[] = [];

    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 500, 1500, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        "x-upsert": "true",
      },
      // ⚠️ Config oficial do Supabase — NÃO mudar:
      // - uploadDataDuringCreation: true (obrigatório)
      // - chunkSize: 6MB exato (obrigatório, único valor aceito)
      // - parallelUploads NÃO é suportado pelo Supabase
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

// Limite acima do qual usamos TUS desde o início (paralelismo + retomada).
// Abaixo disso, POST direto é mais rápido (sem overhead de criação de sessão).
// Reduzido para 20 MB porque até esse tamanho o paralelismo do TUS já compensa
// o overhead de criar a sessão — fica MUITO mais rápido em 4G/5G.
const TUS_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20 MB

const uploadFileFast = async (
  bucket: string,
  path: string,
  file: File,
  onProgress: (pct: number, speedMBs: number, etaSec: number) => void,
  registerAbort: (fn: () => void) => void,
  forceTus = false,
): Promise<string> => {
  // Retomada (após refresh) ou arquivos grandes vão direto pro TUS — só assim
  // dá pra continuar de onde parou em vez de recomeçar do zero.
  if (forceTus || file.size >= TUS_THRESHOLD_BYTES) {
    return uploadFileTus(bucket, path, file, onProgress, registerAbort);
  }
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
    // Quando retomando após refresh, mantém o progresso já carregado (não zera)
    const existing = store.jobs.find((j) => j.id === job.id);
    const isResuming = !!existing?.uploadPath;
    store.update(job.id, {
      status: "uploading",
      progress: isResuming ? existing!.progress : 0,
      startedAt: existing?.startedAt ?? Date.now(),
    });

    const ext = job.file.name.split(".").pop() || "mp4";
    // Reusa o caminho persistido para que o TUS consiga retomar exatamente
    // o mesmo objeto no Storage. Se for primeiro envio, gera novo.
    const path =
      existing?.uploadPath ??
      `videos/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    if (!existing?.uploadPath) {
      store.update(job.id, { uploadPath: path });
    }

    const videoUrl = await uploadFileFast(
      "videos",
      path,
      job.file,
      (pct, speedMBs, etaSec) => {
        const cur = store.jobs.find((j) => j.id === job.id);
        const keepWarn = cur?.status === "warning";

        // 🔒 Trava a estimativa UMA VEZ, quando temos velocidade estável
        // (entre 3% e 15% de progresso). Depois disso, NÃO oscila mais.
        // Só recalcula se a previsão estourou em mais de 50% (rede caiu de vez).
        let lockedEtaSec = cur?.lockedEtaSec;
        let lockedEndAt = cur?.lockedEndAt;

        const shouldLockNow =
          !lockedEndAt && pct >= 3 && pct <= 15 && etaSec > 0 && etaSec < 99999;
        const shouldRelock =
          lockedEndAt &&
          Date.now() > lockedEndAt + 60_000 && // já passou mais de 1min da hora prevista
          etaSec > 0 &&
          etaSec < 99999;

        if (shouldLockNow || shouldRelock) {
          lockedEtaSec = Math.round(etaSec);
          lockedEndAt = Date.now() + lockedEtaSec * 1000;
        }

        store.update(job.id, {
          progress: pct,
          speedMBs,
          etaSec,
          lockedEtaSec,
          lockedEndAt,
          status: keepWarn ? "warning" : "uploading",
          lastProgressAt: Date.now(),
        });
      },
      (abortFn) => store.update(job.id, { abort: abortFn }),
      isResuming, // forceTus quando estamos retomando após refresh
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
// Inicialização global — chame UMA vez no boot do app (App.tsx) para garantir
// que jobs persistidos sejam retomados mesmo se nenhum componente que usa o
// hook estiver montado ainda.
// ---------------------------------------------------------------------------
// Verifica se o blob do File ainda é legível. No mobile, depois que o
// SO mata o app em background, o handle do arquivo pode ficar inválido —
// nesse caso o TUS falharia silenciosamente. Detectamos antes de tentar.
const isFileReadable = async (file: File): Promise<boolean> => {
  try {
    if (!file || typeof file.slice !== "function" || !file.size) return false;
    const slice = file.slice(0, 1);
    await slice.arrayBuffer();
    return true;
  } catch {
    return false;
  }
};

export const initUploadQueue = () => {
  if (store.initialized) return;
  store.initialized = true;
  void loadPersistedUploadJobs().then(async (saved) => {
    if (!saved.length || store.jobs.length > 0) return;

    const candidates = saved.filter((j) => j.status !== "done");

    // Valida cada arquivo ANTES de hidratar — assim quem perdeu o blob
    // aparece imediatamente como "precisa selecionar de novo" em vez de
    // ficar travado em 0% pra sempre.
    const restoredJobs: UploadJob[] = await Promise.all(
      candidates.map(async (j) => {
        const fileOk = await isFileReadable(j.file);
        const thumbOk = j.thumbnail ? await isFileReadable(j.thumbnail) : true;
        const dead = !fileOk;
        return {
          ...j,
          status: dead ? "error" : j.status === "error" ? "error" : "queued",
          progress: j.status === "error" ? j.progress : (j.progress ?? 0),
          speedMBs: 0,
          etaSec: 0,
          timedOut: false,
          thumbPreviewUrl:
            j.thumbnail && thumbOk ? URL.createObjectURL(j.thumbnail) : null,
          uploadPath: j.uploadPath,
          errorMsg: dead
            ? "O app foi fechado e o arquivo precisa ser selecionado novamente. Toque em remover e reenvie o vídeo."
            : j.errorMsg,
        } satisfies UploadJob;
      }),
    );

    store.hydrate(restoredJobs);
    restoredJobs
      .filter((j) => j.status !== "error")
      .forEach((j) => void runJob(j));
  });
};

// ---------------------------------------------------------------------------
// Hook que apenas se "pluga" no store global
// ---------------------------------------------------------------------------
export const useUploadQueue = (onJobDone?: () => void) => {
  const [jobs, setJobs] = useState<UploadJob[]>(store.jobs);

  useEffect(() => {
    const unsub = store.subscribe(setJobs);
    initUploadQueue();
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
    // Aborta qualquer XHR/TUS que ainda esteja rodando para esse job
    try {
      target.abort?.();
    } catch {
      /* noop */
    }
    runningJobIds.delete(id);
    store.update(id, {
      status: "queued",
      // Mantém o progresso atual — o TUS vai retomar de onde parou,
      // não faz sentido voltar a barra para 0.
      progress: target.uploadPath ? target.progress : 0,
      speedMBs: 0,
      etaSec: 0,
      lockedEtaSec: undefined,
      lockedEndAt: undefined,
      errorMsg: undefined,
      timedOut: false,
      abort: undefined,
      lastProgressAt: Date.now(),
    });
    // Pequeno delay pra garantir que o abort propagou antes de redisparar
    setTimeout(() => {
      const fresh = store.jobs.find((j) => j.id === id);
      if (fresh) void runJob(fresh);
    }, 100);
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
