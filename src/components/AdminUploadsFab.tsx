import { Link } from "react-router-dom";
import { Film, Loader2 } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useUploadQueue } from "@/hooks/useUploadQueue";

/**
 * Botão flutuante visível APENAS para admin.
 * Mostra a quantidade de filmes em andamento (uploads ativos) e leva
 * direto pro painel admin → aba de Envio de Vídeos.
 */
const AdminUploadsFab = () => {
  const { isAdmin } = useIsAdmin();
  const { jobs } = useUploadQueue();

  if (!isAdmin) return null;

  const active = jobs.filter((j) =>
    ["uploading", "warning", "queued", "saving"].includes(j.status),
  ).length;

  const hasActive = active > 0;

  return (
    <Link
      to="/admin?tab=videos"
      className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105 font-semibold text-sm ${
        hasActive
          ? "bg-primary text-primary-foreground shadow-primary/40 hover:bg-primary/90"
          : "bg-card text-foreground border border-border hover:bg-muted shadow-black/30"
      }`}
      aria-label="Abrir painel de filmes em andamento"
    >
      <div className="relative">
        <Film className="w-5 h-5" />
        {hasActive && (
          <Loader2 className="w-3 h-3 absolute -top-1 -right-1 animate-spin text-accent" />
        )}
      </div>
      <span>Filmes em andamento</span>
      {hasActive && (
        <span className="bg-primary-foreground text-primary text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">
          {active}
        </span>
      )}
    </Link>
  );
};

export default AdminUploadsFab;
