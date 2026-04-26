import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Send } from "lucide-react";

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
 * Converte uma URL t.me/canal/123 no formato de embed oficial do Telegram.
 * Retorna null se for um link de canal sem mensagem específica
 * (não dá pra embedar canal inteiro).
 */
const buildEmbedUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  // Suporta https://t.me/canal/123 e https://telegram.me/canal/123
  const m = url.match(/^https?:\/\/(?:t|telegram)\.me\/([^/?#]+)\/(\d+)(?:[/?#].*)?$/i);
  if (!m) return null;
  const [, channel, msgId] = m;
  // mode=tme = post embebido com player de vídeo nativo do Telegram
  return `https://t.me/${channel}/${msgId}?embed=1&mode=tme`;
};

const TelegramPlayer = ({ movie, onBack }: TelegramPlayerProps) => {
  const embedUrl = useMemo(() => buildEmbedUrl(movie.telegram_url), [movie.telegram_url]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [embedUrl]);

  // Sem URL embeddable → mostra fallback com botão pra abrir externo
  if (!embedUrl) {
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
          <h1 className="text-2xl md:text-3xl font-black">{movie.title}</h1>
          <p className="text-muted-foreground text-sm">
            Esse link aponta pro canal inteiro. Pra embedar dentro do app, cole o link
            de uma mensagem específica (ex: <code>https://t.me/canal/123</code>).
          </p>
          {movie.telegram_url && (
            <a
              href={movie.telegram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-primary text-primary-foreground px-6 py-4 rounded-xl font-black text-base flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" /> Abrir no Telegram
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white text-sm font-medium hover:opacity-80"
        >
          <ArrowLeft className="w-5 h-5" /> Voltar
        </button>
        <h2 className="text-white font-semibold text-sm md:text-base truncate max-w-[55%]">
          {movie.title}
        </h2>
        <a
          href={movie.telegram_url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/80 hover:text-white text-xs flex items-center gap-1"
          title="Abrir no Telegram"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <div className="flex-1 relative w-full h-screen">
        <iframe
          key={embedUrl}
          src={embedUrl}
          title={movie.title}
          className="absolute inset-0 w-full h-full border-0 bg-black"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
        />
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 pointer-events-none">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
            <p className="text-white/80 text-xs">Carregando player...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelegramPlayer;
