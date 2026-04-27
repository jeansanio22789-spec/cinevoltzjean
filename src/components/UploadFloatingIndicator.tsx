import { Link, useLocation } from "react-router-dom";
import { Upload, Loader2 } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useUploadQueue } from "@/hooks/useUploadQueue";

/**
 * Botão flutuante global que aparece em QUALQUER página quando o admin tem
 * uploads ativos rodando em segundo plano. Garante que ele saiba que o envio
 * continua mesmo fora do painel — basta tocar pra voltar e acompanhar.
 */
const UploadFloatingIndicator = () => {
  const { isAdmin } = useIsAdmin();
  const { jobs } = useUploadQueue();
  const { pathname } = useLocation();

  // Não duplica no painel admin (lá já tem o card grande de uploads)
  if (!isAdmin) return null;
  if (pathname.startsWith("/admin")) return null;

  const active = jobs.filter((j) =>
    ["uploading", "warning", "queued", "saving"].includes(j.status),
  );
  if (active.length === 0) return null;

  // Calcula progresso médio dos uploads ativos
  const avgProgress = Math.round(
    active.reduce((sum, j) => sum + (j.progress || 0), 0) / active.length,
  );

  return (
    <Link
      to="/admin?tab=videos"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-primary text-primary-foreground rounded-full shadow-2xl pl-3 pr-4 py-2.5 hover:scale-105 transition-transform"
      aria-label="Acompanhar uploads em andamento"
    >
      <div className="relative">
        <Upload className="w-5 h-5" />
        <Loader2 className="w-3 h-3 absolute -top-1 -right-1 animate-spin" />
      </div>
      <div className="leading-tight">
        <p className="text-xs font-bold">
          {active.length} envio{active.length > 1 ? "s" : ""} • {avgProgress}%
        </p>
        <p className="text-[10px] opacity-90">Toque pra acompanhar</p>
      </div>
    </Link>
  );
};

export default UploadFloatingIndicator;
