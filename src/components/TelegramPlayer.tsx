import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Send } from "lucide-react";

interface TelegramPlayerProps {
  movie: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    telegram_url: string | null;
    year: number | null;
    duration: string | null;
    genre: string | null;
    rating: string | null;
  };
  onBack: () => void;
}

/**
 * Player para conteúdos hospedados no Telegram.
 * - Tenta abrir o link automaticamente em uma nova aba assim que carrega
 * - Mantém um botão grande de fallback caso o popup seja bloqueado
 */
const TelegramPlayer = ({ movie, onBack }: TelegramPlayerProps) => {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!movie.telegram_url) return;
    const w = window.open(movie.telegram_url, "_blank", "noopener,noreferrer");
    if (w) setOpened(true);
  }, [movie.telegram_url]);

  if (!movie.telegram_url) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-foreground text-sm font-medium hover:opacity-80"
        >
          <ArrowLeft className="w-5 h-5" /> Voltar
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5 max-w-md mx-auto pb-12">
        {movie.thumbnail_url && (
          <img
            src={movie.thumbnail_url}
            alt={movie.title}
            className="w-44 h-64 object-cover rounded-xl shadow-2xl"
          />
        )}
        <div>
          <h1 className="text-2xl md:text-3xl font-black mb-2">{movie.title}</h1>
          {movie.description && (
            <p className="text-muted-foreground text-sm leading-relaxed">
              {movie.description}
            </p>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap justify-center">
          {movie.year && <span>{movie.year}</span>}
          {movie.duration && <span>• {movie.duration}</span>}
          {movie.rating && <span>• {movie.rating}</span>}
          {movie.genre && <span>• {movie.genre}</span>}
        </div>

        <a
          href={movie.telegram_url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-primary text-primary-foreground px-6 py-4 rounded-xl font-black text-base flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-lg"
        >
          {opened ? (
            <>
              <ExternalLink className="w-5 h-5" /> Reabrir no Telegram
            </>
          ) : (
            <>
              <Send className="w-5 h-5" /> Assistir no Telegram
            </>
          )}
        </a>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {opened
            ? "Abrimos o conteúdo em uma nova aba. Se não apareceu, libere os pop-ups e clique no botão acima."
            : "O conteúdo abre direto no app do Telegram. Você precisa estar no canal para assistir."}
        </p>
      </div>
    </div>
  );
};

export default TelegramPlayer;
