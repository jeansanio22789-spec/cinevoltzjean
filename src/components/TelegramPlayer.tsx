import { useEffect, useMemo } from "react";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

interface TelegramPlayerProps {
  movie: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    telegram_url: string | null;
    video_url?: string | null;
    year: number | null;
    duration: string | null;
    genre: string | null;
    rating: string | null;
  };
  onBack: () => void;
}

const normalizeTelegramUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const clean = url.trim();
  if (!clean) return null;
  return clean.replace(/^https?:\/\/telegram\.me\//i, "https://t.me/");
};

const TelegramPlayer = ({ movie, onBack }: TelegramPlayerProps) => {
  const telegramUrl = useMemo(() => normalizeTelegramUrl(movie.telegram_url), [movie.telegram_url]);

  useEffect(() => {
    if (!telegramUrl) return;
    const timer = window.setTimeout(() => {
      window.location.assign(telegramUrl);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [telegramUrl]);

  if (!telegramUrl) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-bold">Link do Telegram inválido</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <ArrowLeft className="h-5 w-5" /> Voltar
        </button>
        <h1 className="max-w-[58%] truncate text-sm font-bold md:text-base">{movie.title}</h1>
        <a
          href={telegramUrl}
          rel="noopener noreferrer"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground"
          aria-label="Abrir filme"
        >
          <ExternalLink className="h-5 w-5" />
        </a>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        {movie.thumbnail_url && (
          <img
            src={movie.thumbnail_url}
            alt={movie.title}
            className="h-56 w-40 rounded-lg object-cover shadow-2xl"
          />
        )}
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
        <div className="space-y-2">
          <p className="text-xl font-black">Abrindo o filme agora...</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Se não abrir automaticamente, toque no botão abaixo.
          </p>
        </div>
        <a
          href={telegramUrl}
          rel="noopener noreferrer"
          className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-md bg-primary px-6 py-4 text-sm font-black text-primary-foreground"
        >
          <ExternalLink className="h-4 w-4" /> Abrir filme
        </a>
      </div>
    </div>
  );
};

export default TelegramPlayer;
