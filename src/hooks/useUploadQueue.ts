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
const REMOTE_DEBOUNCE_MS = 4000; // não martela a API a cada onProgress

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
  retryCount?: number;
  /** Estratégia real em uso, para evitar retomar job grande no caminho antigo. */
  uploadMode?: "direct" | "direct-parts" | "tus" | "tus-resume";
  uploadPartsTotal?: number;
  uploadPartBytes?: number;
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
  retryCount: job.retryCount ?? 0,
  uploadMode: job.uploadMode,
  uploadPartsTotal: job.uploadPartsTotal,
  uploadPartBytes: job.uploadPartBytes,
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
  /**
   * Remove jobs antigos com erro (especialmente 413 / "Maximum size exceeded").
   * Útil pra limpar a fila quando o limite do Storage foi aumentado e os
   * envios antigos ficaram travados em estado de falha.
   * Retorna a quantidade de jobs removidos.
   */
  clearErrors(opts: { onlyOversize?: boolean } = {}): number {
    const isOversize = (msg?: string) =>
      !!msg && /Maximum size exceeded|response code: 413|\b413\b|muito grande/i.test(msg);
    const targets = this.jobs.filter((j) => {
      if (j.status !== "error") return false;
      if (opts.onlyOversize) return isOversize(j.errorMsg);
      return true;
    });
    if (targets.length === 0) return 0;
    const ids = targets.map((j) => j.id);
    targets.forEach((j) => {
      try {
        j.abort?.();
      } catch {
        /* noop */
      }
      if (j.thumbPreviewUrl) URL.revokeObjectURL(j.thumbPreviewUrl);
    });
    this.jobs = this.jobs.filter((j) => !ids.includes(j.id));
    void deletePersistedUploadJobs(ids);
    ids.forEach((id) => void deleteRemoteJob(id));
    this.emit();
    return targets.length;
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
  file: Blob,
  onProgress: (pct: number, speedMBs: number, etaSec: number) => void,
  registerAbort: (fn: () => void) => void,
): Promise<string> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  // ⚡ Hostname direto do storage (mesma otimização do TUS).
  // Pula o gateway principal e vai direto pros servidores de upload.
  const url = `https://${projectId}.storage.supabase.co/storage/v1/object/${bucket}/${path}`;
  const startTime = Date.now();
  const samples: { t: number; bytes: number }[] = [];
  let lastProgressAt = 0;

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
      // Throttle: só atualiza UI a cada 250ms (evita re-renders excessivos
      // durante uploads rápidos que disparam dezenas de eventos por segundo)
      const now = Date.now();
      if (now - lastProgressAt < 250 && e.loaded < e.total) return;
      lastProgressAt = now;
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

const uploadErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err || "");

const isAbortUploadError = (err: unknown) =>
  /cancelado|abort|aborted/i.test(uploadErrorMessage(err));

const isStorageLimitUploadError = (err: unknown) =>
  /Maximum size exceeded|response code: 413|\b413\b/i.test(uploadErrorMessage(err));

const formatUploadSize = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${(bytes / 1024 ** 2).toFixed(0)} MB`;

const uploadFileTus = (
  bucket: string,
  path: string,
  file: Blob,
  onProgress: (pct: number, speedMBs: number, etaSec: number) => void,
  registerAbort: (fn: () => void) => void,
  options: { resumePrevious?: boolean; cleanPrevious?: boolean } = {},
): Promise<string> =>
  new Promise(async (resolve, reject) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      reject(new Error("Sessão expirada. Faça login novamente."));
      return;
    }
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const storageBaseUrl = projectId
      ? `https://${projectId}.storage.supabase.co`
      : import.meta.env.VITE_SUPABASE_URL;
    const endpoint = `${storageBaseUrl}/storage/v1/upload/resumable`;
    const startTime = Date.now();
    const samples: { t: number; bytes: number }[] = [];
    let lastProgressAt = 0;

    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 500, 1000, 2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000, 45000, 60000, 90000, 120000],
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
        // Throttle: só notifica a UI a cada 250ms para evitar re-renders
        // excessivos durante chunks grandes (que disparam progresso byte-a-byte)
        const now = Date.now();
        if (now - lastProgressAt < 250 && bytesUploaded < bytesTotal) return;
        lastProgressAt = now;
        updateProgress(startTime, samples, bytesUploaded, bytesTotal, onProgress);
      },
      onSuccess: () => {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        resolve(data.publicUrl);
      },
    });

    registerAbort(() => upload.abort(true).catch(() => {}));
    try {
      const prev = await upload.findPreviousUploads();
      if (options.cleanPrevious) {
        await Promise.all(
          prev.map((p) =>
            tus.defaultOptions.urlStorage.removeUpload(p.urlStorageKey).catch(() => {}),
          ),
        );
      } else if (options.resumePrevious !== false && prev.length) {
        upload.resumeFromPreviousUpload(prev[0]);
      }
    } catch {
      /* se a retomada local estiver corrompida, inicia um TUS novo */
    }
    upload.start();
  });

// Limite acima do qual usamos TUS desde o início.
// ⚠️ O gateway do Supabase Storage rejeita POSTs únicos > 50MB com erro 413
// "Maximum size exceeded". Por isso baixamos o threshold pra 40MB —
// arquivos maiores DEVEM ir por TUS (chunks de 6MB que passam pelo gateway).
const TUS_THRESHOLD_BYTES = 40 * 1024 * 1024; // 40 MB (abaixo do limite de 50MB)
const MAX_VIDEO_FILE_BYTES = Number.MAX_SAFE_INTEGER; // sem teto de tamanho
// 🚀 MODO DOWNLOAD-INVERTIDO: tudo > 30MB vai em partes pequenas via XHR direto
// (POST único por parte, sem overhead do TUS). Igual baixar arquivo em partes,
// só que ao contrário. Muito mais rápido em conexões boas.
const SPLIT_VIDEO_THRESHOLD_BYTES = 30 * 1024 * 1024; // > 30MB já parte
const SPLIT_PART_BYTES = 30 * 1024 * 1024; // 30MB por parte: fica ABAIXO do TUS_THRESHOLD e força XHR direto

const uploadFileFast = async (
  bucket: string,
  path: string,
  file: Blob,
  onProgress: (pct: number, speedMBs: number, etaSec: number) => void,
  registerAbort: (fn: () => void) => void,
  forceTus = false,
): Promise<string> => {
  // Retomada, modo turbo OU arquivos > 40MB vão direto pro TUS — única forma
  // de não bater no limite de 50MB do gateway de upload do Storage.
  const shouldUseTus = forceTus || turboForced || file.size >= TUS_THRESHOLD_BYTES;
  if (shouldUseTus) {
    try {
      return await uploadFileTus(bucket, path, file, onProgress, registerAbort, {
        resumePrevious: forceTus,
      });
    } catch (err) {
      if (isAbortUploadError(err)) throw err;
      // Alguns 413/offset vêm de URL TUS antiga/corrompida no navegador.
      // Limpa essa retomada local e cria uma sessão TUS nova para o mesmo arquivo.
      return uploadFileTus(bucket, path, file, onProgress, registerAbort, {
        resumePrevious: false,
        cleanPrevious: true,
      });
    }
  }
  try {
    return await uploadFileDirect(bucket, path, file, onProgress, registerAbort);
  } catch (err) {
    if (isAbortUploadError(err)) throw err;
    // Fallback resiliente: 413 (tamanho), falha de rede, etc → retoma com TUS.
    return uploadFileTus(bucket, path, file, onProgress, registerAbort, {
      resumePrevious: false,
      cleanPrevious: true,
    });
  }
};

const uploadLargeVideoInParts = async (
  path: string,
  file: File,
  onProgress: (pct: number, speedMBs: number, etaSec: number) => void,
  registerAbort: (fn: () => void) => void,
): Promise<string> => {
  const totalParts = Math.ceil(file.size / SPLIT_PART_BYTES);
  const base = path.replace(/\.[^.]+$/, "");
  const ext = path.split(".").pop() || "mp4";

  // Progresso por parte (0..1) — somamos ponderado pelo tamanho de cada parte.
  const partProgress = new Array<number>(totalParts).fill(0);
  const partSizes = new Array<number>(totalParts).fill(0);
  for (let i = 0; i < totalParts; i++) {
    const start = i * SPLIT_PART_BYTES;
    const end = Math.min(file.size, start + SPLIT_PART_BYTES);
    partSizes[i] = end - start;
  }
  const startedAt = Date.now();

  const reportProgress = () => {
    let uploaded = 0;
    for (let i = 0; i < totalParts; i++) uploaded += partSizes[i] * partProgress[i];
    const pct = (uploaded / file.size) * 100;
    const elapsed = Math.max(0.1, (Date.now() - startedAt) / 1000);
    const speedMBs = uploaded / 1024 / 1024 / elapsed;
    const remainingMB = (file.size - uploaded) / 1024 / 1024;
    const etaSec = remainingMB / Math.max(speedMBs, 0.01);
    onProgress(pct, speedMBs, etaSec);
  };

  // Aborts de cada parte ativa
  const partAborts = new Map<number, () => void>();
  registerAbort(() => {
    partAborts.forEach((fn) => {
      try { fn(); } catch { /* noop */ }
    });
  });

  // ⚡ Paralelismo agressivo: 8 partes por vez = banda saturada.
  // Cada parte é POST único (XHR direto), igual baixar arquivo em partes.
  const PARALLEL_PARTS = turboForced ? 2 : 8;

  const uploadPart = async (i: number): Promise<void> => {
    const start = i * SPLIT_PART_BYTES;
    const end = Math.min(file.size, start + SPLIT_PART_BYTES);
    const part = file.slice(start, end, file.type || "video/mp4");
    const partPath = `${base}.part-${String(i).padStart(4, "0")}.${ext}`;

    let attempt = 0;
    // Loop infinito de retomada — só sai com sucesso ou abort do usuário.
    while (true) {
      try {
        // forceTus=false + parte < 40MB → cada parte sobe via XHR direto (POST único),
        // sem overhead do TUS. É o "download invertido" pedido pelo usuário.
        await uploadFileFast(
          "videos",
          partPath,
          part,
          (partPct) => {
            partProgress[i] = Math.max(0, Math.min(1, partPct / 100));
            reportProgress();
          },
          (fn) => partAborts.set(i, fn),
          false,
        );
        partProgress[i] = 1;
        partAborts.delete(i);
        reportProgress();
        return;
      } catch (err) {
        if (isAbortUploadError(err)) throw err;
        attempt++;
        // Backoff curto (max 10s). Nunca desiste.
        await new Promise((r) => setTimeout(r, Math.min(10_000, 1_000 * attempt)));
      }
    }
  };

  // Janela deslizante de PARALLEL_PARTS uploads simultâneos
  let nextIndex = 0;
  const workers: Promise<void>[] = [];
  const launch = async (): Promise<void> => {
    while (nextIndex < totalParts) {
      const i = nextIndex++;
      await uploadPart(i);
    }
  };
  for (let w = 0; w < Math.min(PARALLEL_PARTS, totalParts); w++) {
    workers.push(launch());
  }
  await Promise.all(workers);

  return `split://${base}|${totalParts}|${ext}`;
};

// ---------------------------------------------------------------------------
// Execução do job (continua rodando mesmo se o componente desmontar)
// ---------------------------------------------------------------------------
const runningJobIds = new Set<string>();
const retryJobIds = new Set<string>();

const queueJobRetry = (jobId: string, delayMs: number) => {
  if (retryJobIds.has(jobId)) return;
  retryJobIds.add(jobId);
  window.setTimeout(() => {
    retryJobIds.delete(jobId);
    const fresh = store.jobs.find((j) => j.id === jobId);
    if (!fresh || fresh.status === "done" || runningJobIds.has(jobId)) return;
    void runJob(fresh);
  }, delayMs);
};

const isRetryableUploadError = (err: unknown) => {
  const msg = uploadErrorMessage(err);
  if (isStorageLimitUploadError(err)) return false;
  // Praticamente tudo que não é 413 deve ser retomado — sinal agressivo.
  return /tus:|chunk|offset|network|fetch|timeout|falha de rede|failed to upload|connection|reset|ECONN|ETIMEDOUT|socket|stream|aborted by network|503|502|504|500|429|unknown|empty response/i.test(msg)
    || msg.length === 0;
};

// 🚦 Fila sequencial inteligente
// Em conexões lentas, vários uploads em paralelo dividem a banda e o overhead
// do TUS (round-trip por chunk) explode — o usuário sente que "travou".
// Solução: se a última velocidade medida for < 2 MB/s, segura novos jobs
// até o atual terminar. Em conexões rápidas, libera paralelo total.
const SLOW_THRESHOLD_MBS = 2;
const pendingJobIds: string[] = [];

// ⚡ Modo Turbo Forçado — usuário pediu pra acelerar manualmente.
// Quando ligado: SEMPRE 1 upload por vez (mesmo em conexão rápida) e
// renegocia a fila imediatamente, jogando os ativos extras de volta pro
// "queued" para liberar 100% da banda pro primeiro.
let turboForced = false;
const turboListeners = new Set<(on: boolean) => void>();

export const getTurboMode = () => turboForced;
export const subscribeTurboMode = (cb: (on: boolean) => void) => {
  turboListeners.add(cb);
  return () => turboListeners.delete(cb);
};

export const setTurboMode = (on: boolean) => {
  if (turboForced === on) return;
  turboForced = on;
  turboListeners.forEach((l) => l(on));

  if (on) {
    // Renegocia: mantém só 1 ativo, devolve os outros pra fila
    const active = store.jobs.filter(
      (j) =>
        runningJobIds.has(j.id) &&
        (j.status === "uploading" || j.status === "warning"),
    );
    // Ordena pelo mais avançado primeiro — esse continua, os outros pausam
    active.sort((a, b) => b.progress - a.progress);
    active.slice(1).forEach((j) => {
      try {
        j.abort?.();
      } catch {
        /* noop */
      }
      runningJobIds.delete(j.id);
      if (!pendingJobIds.includes(j.id)) pendingJobIds.unshift(j.id);
      store.update(j.id, {
        status: "queued",
        speedMBs: 0,
        etaSec: 0,
        abort: undefined,
      });
    });
  } else {
    // Saiu do turbo — tenta dar vazão à fila normalmente
    drainPending();
  }
};

const isConnectionSlow = (): boolean => {
  if (turboForced) return true; // turbo = sempre sequencial
  // Olha pro job ativo mais recente. Se ele tá indo < 2 MB/s, é lenta.
  const active = store.jobs.find(
    (j) =>
      runningJobIds.has(j.id) &&
      (j.status === "uploading" || j.status === "warning") &&
      j.progress > 5, // só conta depois que estabilizou
  );
  if (!active) return false;
  return active.speedMBs > 0 && active.speedMBs < SLOW_THRESHOLD_MBS;
};

const drainPending = () => {
  // Sem turbo = paralelo total. Com turbo = 1 por vez.
  const maxConcurrent = turboForced ? 1 : Infinity;
  while (pendingJobIds.length > 0 && runningJobIds.size < maxConcurrent) {
    const nextId = pendingJobIds.shift()!;
    const next = store.jobs.find((j) => j.id === nextId);
    if (next && !runningJobIds.has(next.id)) {
      void runJob(next);
    }
  }
};

const runJob = async (job: UploadJob) => {
  if (runningJobIds.has(job.id)) return;

  // Só segura na fila se o usuário ligou o Turbo manualmente.
  // No modo normal todos rodam em paralelo, mesmo em conexão lenta.
  if (runningJobIds.size > 0 && turboForced) {
    if (!pendingJobIds.includes(job.id)) pendingJobIds.push(job.id);
    store.update(job.id, { status: "queued" });
    return;
  }

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
    if (job.file.size > MAX_VIDEO_FILE_BYTES) {
      throw new Error(
        `Arquivo muito grande (${formatUploadSize(job.file.size)}). O limite por vídeo é 1 TB.`,
      );
    }

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

    const onVideoProgress = (pct: number, speedMBs: number, etaSec: number) => {
        const cur = store.jobs.find((j) => j.id === job.id);
        const keepWarn = cur?.status === "warning";

        // 🔒 Trava a hora prevista UMA VEZ e NUNCA mais oscila.
        // - Trava assim que tivermos velocidade real (pct >= 1%).
        // - Só ESTENDE (nunca antecipa) se o envio atrasou MUITO
        //   (mais de 5min da hora prevista).
        // Resultado: o usuário sempre vê a MESMA hora, sem ficar mudando.
        let lockedEtaSec = cur?.lockedEtaSec;
        let lockedEndAt = cur?.lockedEndAt;

        const haveSignal = etaSec > 0 && etaSec < 99999;
        const shouldLockNow = !lockedEndAt && pct >= 1 && haveSignal;
        const shouldExtend =
          !!lockedEndAt &&
          haveSignal &&
          Date.now() > (lockedEndAt as number) + 5 * 60_000; // atrasou +5min

        if (shouldLockNow) {
          lockedEtaSec = Math.round(etaSec);
          lockedEndAt = Date.now() + lockedEtaSec * 1000;
        } else if (shouldExtend) {
          // Só empurra pra frente, nunca pra trás
          const candidate = Date.now() + Math.round(etaSec) * 1000;
          if (candidate > (lockedEndAt as number)) {
            lockedEndAt = candidate;
            lockedEtaSec = Math.round(etaSec);
          }
        }

        store.update(job.id, {
          progress: pct,
          speedMBs,
          etaSec,
          lockedEtaSec,
          lockedEndAt,
          status: keepWarn ? "warning" : "uploading",
          lastProgressAt: Date.now(),
          // ⚠️ NÃO zera retryCount aqui — se zerasse a cada chunk com
          // progresso, um upload que avança 1% e cai sempre nunca
          // atingiria o teto de tentativas e ficaria "reiniciando" eternamente.
        });
      };
    const registerVideoAbort = (abortFn: () => void) => store.update(job.id, { abort: abortFn });
    const videoUrl = job.file.size > SPLIT_VIDEO_THRESHOLD_BYTES
      ? await uploadLargeVideoInParts(path, job.file, onVideoProgress, registerVideoAbort)
      : await uploadFileFast(
          "videos",
          path,
          job.file,
          onVideoProgress,
          registerVideoAbort,
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

    store.update(job.id, { status: "done", progress: 100, retryCount: 0 });
    void deletePersistedUploadJob(job.id);
    void deleteRemoteJob(job.id);
    for (const cb of doneCallbacks) {
      try {
        cb();
      } catch {
        /* noop */
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    if (isAbortUploadError(err)) {
      const cur = store.jobs.find((j) => j.id === job.id);
      if (cur && cur.status !== "queued" && cur.status !== "done") {
        store.update(job.id, { status: "queued", speedMBs: 0, etaSec: 0 });
      }
    } else if (isRetryableUploadError(err)) {
      const cur = store.jobs.find((j) => j.id === job.id);
      const retryCount = (cur?.retryCount ?? job.retryCount ?? 0) + 1;
      // 🔥 Sinal agressivo: nunca desiste sozinho. Reconecta indefinidamente.
      // Backoff curto (máx 15s) pra retomar rápido assim que a rede voltar.
      const delayMs = Math.min(15_000, 1_500 * retryCount);
      store.update(job.id, {
        status: "warning",
        errorMsg: `Reconectando automaticamente (tentativa ${retryCount})...`,
        speedMBs: 0,
        etaSec: 0,
        retryCount,
        lastProgressAt: Date.now(),
      });
      queueJobRetry(job.id, delayMs);
    } else {
      // Mostra o erro REAL retornado pelo servidor para facilitar o diagnóstico,
      // em vez de mascarar tudo como "limite de tamanho".
      store.update(job.id, {
        status: "error",
        errorMsg: msg || "Falha desconhecida no envio.",
      });
    }
  } finally {
    runningJobIds.delete(job.id);
    window.clearTimeout(timeoutTimer);
    // Libera o wake lock se não tem mais nada rolando
    if (!hasActiveUploads()) void releaseWakeLock();
    // 🚦 Liberou um slot — tenta puxar o próximo da fila sequencial
    drainPending();
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

    // 🧹 Remove automaticamente da fila tudo que já terminou ou ficou com erro.
    // Mantemos apenas o que ainda não foi concluído (queued/uploading/warning/etc).
    const discarded = saved.filter(
      (j) => j.status === "done" || j.status === "error",
    );
    if (discarded.length) {
      void deletePersistedUploadJobs(discarded.map((j) => j.id));
      void Promise.all(
        discarded.map((j) =>
          supabase.from("upload_jobs").delete().eq("id", j.id),
        ),
      ).catch(() => {});
    }

    const candidates = saved.filter(
      (j) => j.status !== "done" && j.status !== "error",
    );

    // Valida cada arquivo ANTES de hidratar — se o blob se perdeu, descarta
    // direto em vez de deixar um item travado eternamente na fila.
    const restoredJobs: UploadJob[] = [];
    const deadIds: string[] = [];

    await Promise.all(
      candidates.map(async (j) => {
        const fileOk = await isFileReadable(j.file);
        if (!fileOk) {
          deadIds.push(j.id);
          return;
        }
        const thumbOk = j.thumbnail ? await isFileReadable(j.thumbnail) : true;
        restoredJobs.push({
          ...j,
          status: "queued",
          progress: j.progress ?? 0,
          speedMBs: 0,
          etaSec: 0,
          timedOut: false,
          thumbPreviewUrl:
            j.thumbnail && thumbOk ? URL.createObjectURL(j.thumbnail) : null,
          uploadPath: j.uploadPath,
          errorMsg: undefined,
        } satisfies UploadJob);
      }),
    );

    if (deadIds.length) {
      void deletePersistedUploadJobs(deadIds);
      void Promise.all(
        deadIds.map((id) =>
          supabase.from("upload_jobs").delete().eq("id", id),
        ),
      ).catch(() => {});
    }

    if (!restoredJobs.length) return;

    store.hydrate(restoredJobs);
    restoredJobs.forEach((j) => void runJob(j));
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
  const clearErrors = (opts?: { onlyOversize?: boolean }) => store.clearErrors(opts ?? {});

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
      retryCount: 0,
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
    clearErrors,
    retry,
    activeCount,
    timeoutMs: TIMEOUT_MS,
  };
};
