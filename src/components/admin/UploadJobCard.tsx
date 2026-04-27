import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileVideo,
  Loader2,
  RotateCw,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { UploadJob } from "@/hooks/useUploadQueue";

const STUCK_THRESHOLD_MS = 30_000; // 30s sem progresso = travado

const fmtEta = (sec: number) =>
  sec > 60 ? `${Math.ceil(sec / 60)}min` : `${Math.ceil(sec)}s`;

// Hora local prevista de término (ex.: 14:32) — recebe um timestamp absoluto
const fmtEndTimeFromTs = (endAtMs: number) => {
  return new Date(endAtMs).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusBadge = (j: UploadJob) => {
  switch (j.status) {
    case "queued":
      return { label: "Na fila", icon: Clock, color: "text-muted-foreground bg-muted" };
    case "uploading":
      return { label: "Em andamento", icon: Zap, color: "text-primary bg-primary/15" };
    case "saving":
      return { label: "Publicando", icon: Loader2, color: "text-primary bg-primary/15" };
    case "warning":
      // Continua marcando como "Em andamento" (não some), só fica âmbar pra indicar lentidão
      return {
        label: "Em andamento",
        icon: AlertTriangle,
        color: "text-amber-500 bg-amber-500/15",
      };
    case "done":
      return { label: "Publicado", icon: CheckCircle, color: "text-accent bg-accent/15" };
    case "error":
      return { label: "Falhou", icon: XCircle, color: "text-destructive bg-destructive/15" };
  }
};

interface Props {
  job: UploadJob;
  onRetry: () => void;
  onRemove: () => void;
}

const UploadJobCard = ({ job: j, onRetry, onRemove }: Props) => {
  const badge = statusBadge(j);
  const Icon = badge.icon;
  const showProgress =
    j.status === "uploading" || j.status === "saving" || j.status === "warning";

  // Estimativas FIXAS vindas do hook (não oscilam).
  // Se ainda não foi travada (uploads muito rápidos ou início), usa o ETA atual.
  const displayEta = j.lockedEtaSec ?? j.etaSec;
  const displayEndAt =
    j.lockedEndAt ?? (j.etaSec > 0 ? Date.now() + j.etaSec * 1000 : 0);
  const displayEndLabel = displayEndAt > 0 ? fmtEndTimeFromTs(displayEndAt) : "";

  return (
    <div className="bg-background border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-3">
        {/* Capa do filme (preview local enquanto faz upload) */}
        {j.thumbPreviewUrl ? (
          <img
            src={j.thumbPreviewUrl}
            alt={j.meta.title}
            className="w-12 h-16 object-cover rounded shrink-0 border border-border"
          />
        ) : (
          <div className="w-12 h-16 rounded shrink-0 bg-muted flex items-center justify-center">
            <FileVideo className="w-5 h-5 text-muted-foreground" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{j.meta.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {j.file.name} • {(j.file.size / 1024 / 1024).toFixed(1)} MB
          </p>

          {/* Hora de lançamento prevista — destaque grande (congela quando lento) */}
          {showProgress && displayEta > 0 && displayEta < 99999 && (
            <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
              🕒 No app às{" "}
              <span className="font-black tracking-wide">{displayEndLabel}</span>
            </div>
          )}
        </div>

        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.color}`}
        >
          <Icon
            className={`w-3 h-3 ${
              j.status === "saving" || j.status === "uploading"
                ? "animate-pulse"
                : ""
            }`}
          />
          {badge.label}
        </span>

        {(j.status === "done" || j.status === "error") && (
          <button
            onClick={onRemove}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Remover da fila"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Botão de Retomar envio — aparece em erro ou travado/lento */}
      {(j.status === "error" || j.status === "warning") && (
        <button
          onClick={onRetry}
          className="w-full inline-flex items-center justify-center gap-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors py-2 rounded"
          title="Reiniciar este envio do zero"
        >
          <RotateCw className="w-3.5 h-3.5" />
          Retomar envio
        </button>
      )}

      {showProgress && (
        <>
          <Progress
            value={j.progress}
            className={`h-2 ${j.status === "warning" ? "[&>div]:bg-amber-500" : ""}`}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono gap-2 flex-wrap">
            <span>{j.progress.toFixed(1)}%</span>
            {j.speedMBs > 0 && (
              <span className="text-right">
                ⚡ {j.speedMBs.toFixed(1)} MB/s
                {displayEta > 0 && displayEta < 99999 && (
                  <> • ⏱ falta {fmtEta(displayEta)}</>
                )}
              </span>
            )}
          </div>
        </>
      )}

      {j.status === "warning" && (
        <p className="text-[11px] text-amber-500">
          ⚠️ Conexão lenta — o envio continua em segundo plano mesmo se você sair do app.
        </p>
      )}

      {j.status === "error" && j.errorMsg && (
        <p className="text-[11px] text-destructive">❌ {j.errorMsg}</p>
      )}
    </div>
  );
};

export default UploadJobCard;
