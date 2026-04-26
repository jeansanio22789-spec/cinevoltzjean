import { Loader2, Pause, Play, RotateCw, Upload, X, Wifi, WifiOff, CheckCircle2 } from "lucide-react";
import type { UploadState } from "@/hooks/useResumableUpload";

interface Props {
  state: UploadState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onPick: () => void;
}

const fmtBytes = (n: number) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
};

const fmtEta = (state: UploadState) => {
  if (state.speedKbps <= 0) return "—";
  const remaining = state.bytesTotal - state.bytesUploaded;
  const seconds = remaining / 1024 / state.speedKbps;
  if (!isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${(seconds / 3600).toFixed(1)}h`;
};

const VideoUploadProgress = ({ state, onPause, onResume, onCancel, onPick }: Props) => {
  if (state.status === "idle") {
    return (
      <button
        type="button"
        onClick={onPick}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-3 rounded text-sm font-bold transition-colors"
      >
        <Upload className="w-4 h-4" />
        Enviar arquivo de vídeo (toca inline no app)
      </button>
    );
  }

  if (state.status === "done") {
    return (
      <div className="w-full flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary px-3 py-3 rounded text-sm font-semibold">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        <span className="truncate flex-1">{state.fileName} enviado</span>
        <button
          type="button"
          onClick={onPick}
          className="text-xs underline-offset-2 hover:underline"
        >
          Trocar
        </button>
      </div>
    );
  }

  const pct = state.progress;
  const isActive = state.status === "uploading";
  const isRetrying = state.status === "retrying";
  const isPaused = state.status === "paused";
  const isError = state.status === "error";

  return (
    <div className="w-full border border-border rounded-lg p-3 bg-card space-y-2.5">
      <div className="flex items-center gap-2">
        {isRetrying ? (
          <WifiOff className="w-4 h-4 text-yellow-500 animate-pulse flex-shrink-0" />
        ) : isError ? (
          <WifiOff className="w-4 h-4 text-destructive flex-shrink-0" />
        ) : isPaused ? (
          <Pause className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <Wifi className="w-4 h-4 text-primary flex-shrink-0" />
        )}
        <span className="text-xs font-medium truncate flex-1">{state.fileName}</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-destructive p-0.5"
          aria-label="Cancelar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-200 ${
            isError ? "bg-destructive" : isRetrying ? "bg-yellow-500" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-mono">
          {fmtBytes(state.bytesUploaded)} / {fmtBytes(state.bytesTotal)} ({pct}%)
        </span>
        {isActive && state.speedKbps > 0 && (
          <span className="font-mono">
            {state.speedKbps > 1024
              ? `${(state.speedKbps / 1024).toFixed(1)} MB/s`
              : `${state.speedKbps} KB/s`}{" "}
            • {fmtEta(state)}
          </span>
        )}
        {isRetrying && <span className="text-yellow-600 dark:text-yellow-500">Reconectando...</span>}
        {isPaused && <span>Pausado</span>}
      </div>

      {(state.error || isError || isRetrying) && (
        <div className={`text-[11px] ${isError ? "text-destructive" : "text-muted-foreground"}`}>
          {state.error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {isActive && (
          <button
            type="button"
            onClick={onPause}
            className="flex-1 flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/70 px-3 py-1.5 rounded text-xs font-semibold"
          >
            <Pause className="w-3 h-3" /> Pausar
          </button>
        )}
        {(isPaused || isError) && (
          <button
            type="button"
            onClick={onResume}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded text-xs font-bold"
          >
            {isError ? <RotateCw className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isError ? "Tentar novamente" : "Continuar"}
          </button>
        )}
        {isRetrying && (
          <div className="flex-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Retomando automaticamente...
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoUploadProgress;
