import { Play } from "lucide-react";
import type { DbMovie } from "@/hooks/useMovies";

interface MovieCardProps {
  movie: DbMovie;
}

const MovieCard = ({ movie }: MovieCardProps) => {
  return (
    <div className="poster-card relative flex-shrink-0 w-[140px] md:w-[180px] rounded-md overflow-hidden cursor-pointer group">
      <div className="aspect-[2/3] relative bg-muted">
        {movie.thumbnail_url ? (
          <img
            src={movie.thumbnail_url}
            alt={movie.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">
            {movie.title}
          </div>
        )}
        <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-2 p-3">
          <button className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center">
            <Play className="w-4 h-4 text-background fill-current ml-0.5" />
          </button>
          <span className="text-xs font-bold text-center leading-tight">{movie.title}</span>
          <span className="text-[10px] text-muted-foreground">
            {movie.year} {movie.duration && `• ${movie.duration}`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MovieCard;
