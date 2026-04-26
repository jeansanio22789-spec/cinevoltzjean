import { useCallback, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface UploadState {
  uploading: boolean;
  progress: number; // 0..100
  bytesUploaded: number;
  bytesTotal: number;
  speedKbps: number; // velocidade média recente
  status: "idle" | "uploading" | "paused" | "retrying" | "done" | "error";
  error: string | null;
  publicUrl: string | null;
  fileName: string | null;
}

const initialState: UploadState = {
  uploading: false,
  progress: 0,
  bytesUploaded: 0,
  bytesTotal: 0,
  speedKbps: 0,
  status: "idle",
  error: null,
  publicUrl: null,
  fileName: null,
};

interface StartOptions {
  bucket: string;
  /** Caminho dentro do bucket. Se omitido, gera automaticamente. */
  path?: string;
  /** Permite retomar uploads anteriores do mesmo arquivo. */
  resumable?: boolean;
  onSuccess?: (publicUrl: string, path: string) => void;
  onError?: (err: Error) => void;
}

/**
 * Upload resumível para o Supabase Storage via protocolo TUS.
 * - Mostra progresso, velocidade, bytes
 * - Retoma automaticamente após queda de conexão (retryDelays)
 * - Permite pausar/continuar manualmente
 * - Persiste o URL do upload no localStorage para retomar entre reloads
 */
export function useResumableUpload() {
  const [state, setState] = useState<UploadState>(initialState);
  const uploadRef = useRef<tus.Upload | null>(null);
  const lastTickRef = useRef<{ time: number; bytes: number } | null>(null);

  const reset = useCallback(() => {
    if (uploadRef.current) {
      try {
        uploadRef.current.abort();
      } catch {
        /* noop */
      }
      uploadRef.current = null;
    }
    lastTickRef.current = null;
    setState(initialState);
  }, []);

  const start = useCallback(
    async (file: File, opts: StartOptions) => {
      const { bucket, resumable = true, onSuccess, onError } = opts;

      // Sessão Supabase para autenticar o upload
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        const err = new Error("Sessão expirada. Faça login novamente.");
        setState((s) => ({ ...s, status: "error", error: err.message }));
        onError?.(err);
        return;
      }

      const ext = file.name.split(".").pop() || "bin";
      const objectName =
        opts.path ??
        `manual/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      lastTickRef.current = { time: Date.now(), bytes: 0 };

      setState({
        ...initialState,
        uploading: true,
        status: "uploading",
        bytesTotal: file.size,
        fileName: file.name,
      });

      const upload = new tus.Upload(file, {
        endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
        // Retentativas rápidas: reconecta em <1s se cair
        retryDelays: [0, 500, 1500, 3000, 5000, 10000, 20000, 30000],
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-upsert": "false",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        // ⚡ Supabase Storage TUS exige chunks de exatamente 6 MB.
        // parallelUploads > 1 NÃO é suportado pelo Supabase (causa
        // erros silenciosos que deixam o envio lentíssimo). Mantemos 1.
        chunkSize: 6 * 1024 * 1024,
        parallelUploads: 1,
        metadata: {
          bucketName: bucket,
          objectName,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
        },
        // Mantém uploads anteriores no localStorage para resumir entre sessões
        storeFingerprintForResuming: resumable,
        onError: (error) => {
          // tus-js-client tenta sozinho via retryDelays. Se chegou aqui,
          // todas as retentativas falharam.
          setState((s) => ({
            ...s,
            uploading: false,
            status: "error",
            error: error.message || "Falha no upload",
          }));
          onError?.(error as Error);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const now = Date.now();
          const last = lastTickRef.current;
          let speedKbps = 0;
          if (last && now > last.time) {
            const dt = (now - last.time) / 1000;
            const db = bytesUploaded - last.bytes;
            if (dt > 0.5) {
              speedKbps = (db / 1024) / dt;
              lastTickRef.current = { time: now, bytes: bytesUploaded };
            } else {
              speedKbps = (state.speedKbps * 0.7) + ((db / 1024) / Math.max(dt, 0.1)) * 0.3;
            }
          }
          setState((s) => ({
            ...s,
            bytesUploaded,
            bytesTotal,
            progress: Math.round((bytesUploaded / bytesTotal) * 100),
            speedKbps: Math.max(0, Math.round(speedKbps)),
            status: "uploading",
          }));
        },
        onSuccess: () => {
          const { data } = supabase.storage.from(bucket).getPublicUrl(objectName);
          setState((s) => ({
            ...s,
            uploading: false,
            progress: 100,
            status: "done",
            publicUrl: data.publicUrl,
          }));
          onSuccess?.(data.publicUrl, objectName);
        },
        // Notifica retentativas (queda de rede)
        onShouldRetry: (_err, retryAttempt, _options) => {
          setState((s) => ({
            ...s,
            status: "retrying",
            error: `Conexão instável — retomando (tentativa ${retryAttempt + 1})...`,
          }));
          return true;
        },
      });

      uploadRef.current = upload;

      // Procura uploads anteriores não finalizados deste arquivo
      try {
        const previous = await upload.findPreviousUploads();
        if (previous.length > 0) {
          upload.resumeFromPreviousUpload(previous[0]);
        }
      } catch {
        /* sem retomada disponível, segue normal */
      }

      upload.start();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pause = useCallback(() => {
    uploadRef.current?.abort();
    setState((s) => ({ ...s, status: "paused", uploading: false }));
  }, []);

  const resume = useCallback(() => {
    if (!uploadRef.current) return;
    setState((s) => ({ ...s, status: "uploading", uploading: true, error: null }));
    uploadRef.current.start();
  }, []);

  return { state, start, pause, resume, reset };
}
