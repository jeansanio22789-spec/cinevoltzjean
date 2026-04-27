import { Play, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { DbMovie } from "@/hooks/useMovies";
import type { UploadJob } from "@/hooks/useUploadQueue";

export interface RailMovie extends DbMovie {
  /** Quando presente, este "filme" ainda está sendo enviado (não publicado). */
  _pending?: UploadJob;
}

interface MovieCardProps {
  movie: RailMovie;
}

const fmtEndTime = (endAtMs: number) =>
  new Date(endAtMs).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

const MovieCard = ({ movie }: MovieCardProps) => {
  const navigate = useNavigate();
  const pending = movie._pending;
  const isPending = !!pending;

  const goToWatch = () => {
    if (isPending) {
      const endAt =
        pending!.lockedEndAt ??
        (pending!.etaSec > 0 ? Date.now() + pending!.etaSec * 1000 : 0);
      const label = endAt > 0 ? `Disponível às ${fmtEndTime(endAt)}` : "Chegando em breve";
      toast.info(`${movie.title}`, { description: label });
      return;
    }
    navigate(`/assistir/${movie.id}`);
  };

  const endAt = pending
    ? pending.lockedEndAt ??
      (pending.etaSec > 0 ? Date.now() + pending.etaSec * 1000 : 0)
    : 0;
  const endLabel = endAt > 0 ? fmtEndTime(endAt) : null;

  return (
    <div
      onClick={goToWatch}
      className={`poster-card relative flex-shrink-0 w-[120px] sm:w-[140px] md:w-[180px] snap-start rounded-md overflow-hidden group ${
        isPending ? "cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <div className="aspect-[2/3] relative bg-muted">
        {movie.thumbnail_url ? (
          <img
            src={movie.thumbnail_url}
            alt={movie.title}
            className={`w-full h-full object-cover ${isPending ? "opacity-80" : ""}`}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">
            {movie.title}
          </div>
        )}

        {/* Selo "CHEGANDO" + barra de progresso para itens em envio */}
        {isPending && (
          <>
            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-black tracking-wider px-2 py-0.5 rounded uppercase shadow">
              Chegando
            </div>
            {endLabel && (
              <div className="absolute top-2 right-2 inline-flex items-center gap-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                <Clock className="w-3 h-3" />
                {endLabel}
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
              <div
                className={`h-full transition-all ${
                  pending!.status === "warning" ? "bg-amber-500" : "bg-primary"
                }`}
                style={{ width: `${pending!.progress}%` }}
              />
            </div>
            <div className="absolute inset-x-0 bottom-1 px-2 pt-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
              <p className="text-white text-[11px] font-semibold truncate">
                {pending!.progress.toFixed(0)}% enviado
              </p>
            </div>
          </>
        )}

        {/* Hover normal só para filmes publicados */}
        {!isPending && (
          <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-2 p-3">
            <button
              onClick={(e) => { e.stopPropagation(); goToWatch(); }}
              className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center"
              aria-label="Assistir"
            >
              <Play className="w-4 h-4 text-background fill-current ml-0.5" />
            </button>
            <span className="text-xs font-bold text-center leading-tight">{movie.title}</span>
            <span className="text-[10px] text-muted-foreground">
              {movie.year} {movie.duration && `• ${movie.duration}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieCard;
