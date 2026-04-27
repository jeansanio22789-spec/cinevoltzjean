import { Smartphone, Loader2, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { useRemoteUploadJobs } from "@/hooks/useRemoteUploadJobs";

const statusIcon = (status: string) => {
  switch (status) {
    case "done":
      return <CheckCircle2 className="w-4 h-4 text-primary" />;
    case "error":
      return <XCircle className="w-4 h-4 text-destructive" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-accent" />;
    case "saving":
      return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
    case "uploading":
      return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
};

const fmtSize = (bytes: number) => {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
};

const fmtAgo = (iso: string) => {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  return `${Math.floor(diff / 3600)} h atrás`;
};

interface Props {
  /** IDs dos jobs que estão rodando NESTE dispositivo — pra não duplicar. */
  localJobIds: Set<string>;
}

const RemoteUploadsPanel = ({ localJobIds }: Props) => {
  const { jobs, loading } = useRemoteUploadJobs();

  // Mostra só os de OUTROS dispositivos e que ainda estão ativos
  const remote = jobs.filter(
    (j) =>
      !localJobIds.has(j.id) &&
      ["queued", "uploading", "warning", "saving", "error"].includes(j.status),
  );

  if (loading || remote.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold">
          Enviando de outros dispositivos ({remote.length})
        </h3>
      </div>

      <div className="space-y-3">
        {remote.map((j) => (
          <div
            key={j.id}
            className="flex items-center gap-3 p-2 rounded-lg bg-muted/40"
          >
            {statusIcon(j.status)}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">
                {j.title || j.file_name}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{j.device_label || "Outro aparelho"}</span>
                {j.file_size > 0 && (
                  <>
                    <span>•</span>
                    <span>{fmtSize(j.file_size)}</span>
                  </>
                )}
                <span>•</span>
                <span>{fmtAgo(j.updated_at)}</span>
              </div>
              {j.status !== "error" && (
                <div className="mt-1 h-1.5 rounded-full bg-background overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, j.progress)}%` }}
                  />
                </div>
              )}
              {j.status === "error" && j.error_msg && (
                <p className="text-xs text-destructive mt-1 truncate">
                  {j.error_msg}
                </p>
              )}
            </div>
            <span className="text-xs font-bold tabular-nums shrink-0">
              {Math.round(j.progress)}%
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Esses envios estão rodando em outro aparelho — para pausar ou cancelar,
        abra o painel no dispositivo de origem.
      </p>
    </div>
  );
};

export default RemoteUploadsPanel;
