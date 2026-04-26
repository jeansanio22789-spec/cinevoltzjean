import { Link } from "react-router-dom";
import { Film, Loader2, ChevronRight } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useUploadQueue } from "@/hooks/useUploadQueue";

/**
 * Fileira de atalho do admin na home: "Filmes em andamento".
 * Sempre visível para admin logado. Mostra contagem de uploads ativos
 * e leva direto pra aba de Envio de Vídeos do painel.
 */
const AdminUploadsRail = () => {
  const { isAdmin } = useIsAdmin();
  const { jobs } = useUploadQueue();

  if (!isAdmin) return null;

  const active = jobs.filter((j) =>
    ["uploading", "warning", "queued", "saving"].includes(j.status),
  ).length;

  const hasActive = active > 0;

  return (
    <section className="px-4 md:px-12 mb-6">
      <Link
        to="/admin?tab=videos"
        className={`group flex items-center justify-between gap-3 w-full rounded-xl border px-4 py-3 transition-all hover:scale-[1.01] ${
          hasActive
            ? "bg-primary/15 border-primary/40 hover:bg-primary/20"
            : "bg-card border-border hover:bg-muted"
        }`}
        aria-label="Abrir painel de filmes em andamento"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`relative flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
              hasActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            <Film className="w-5 h-5" />
            {hasActive && (
              <Loader2 className="w-3 h-3 absolute -top-0.5 -right-0.5 animate-spin text-accent" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm md:text-base truncate">
              Filmes em andamento
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {hasActive
                ? `${active} envio${active > 1 ? "s" : ""} em progresso — toque para abrir o painel`
                : "Nenhum envio agora — toque para enviar novos filmes"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasActive && (
            <span className="bg-primary text-primary-foreground text-xs font-black w-7 h-7 rounded-full flex items-center justify-center">
              {active}
            </span>
          )}
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </Link>
    </section>
  );
};

export default AdminUploadsRail;
