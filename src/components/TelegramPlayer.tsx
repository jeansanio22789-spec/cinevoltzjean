import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveVideoSource } from "@/lib/videoUrl";

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

const buildEmbedUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const clean = url.trim();
  const post = clean.match(/^https?:\/\/(?:t|telegram)\.me\/([^/?#]+(?:\/\d+)?)\/(\d+)(?:[/?#].*)?$/i);
  if (post) {
    return `https://t.me/${post[1]}/${post[2]}?embed=1&mode=tme`;
  }
  const channel = clean.match(/^https?:\/\/(?:t|telegram)\.me\/([^/?#]+)\/?$/i);
  if (channel) return `https://t.me/s/${channel[1]}`;
  return `${clean}${clean.includes("?") ? "&" : "?"}embed=1&mode=tme`;
};

const TelegramPlayer = ({ movie, onBack }: TelegramPlayerProps) => {
  const embedUrl = useMemo(() => buildEmbedUrl(movie.telegram_url), [movie.telegram_url]);
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedUrl, setImportedUrl] = useState<string | null>(movie.video_url || null);

  useEffect(() => {
    setLoaded(false);
    const timer = window.setTimeout(() => setLoaded(true), 5000);
    return () => window.clearTimeout(timer);
  }, [embedUrl]);

  const handleImport = async () => {
    if (!movie.telegram_url) return;
    setImporting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ url: movie.telegram_url }),
      });

      const payload = await response.json().catch(() => null) as { video_url?: string; error?: string } | null;
      const videoUrl = payload?.video_url;
      if (!response.ok || !videoUrl) {
        throw new Error(payload?.error || "O Telegram bloqueou a importação desse vídeo.");
      }

      await supabase.from("movies").update({ video_url: videoUrl }).eq("id", movie.id);

      setImportedUrl(videoUrl);
      toast.success("Vídeo importado! Tocando aqui mesmo.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "O Telegram bloqueou a importação desse vídeo.";
      toast.error("Não deu para tocar esse vídeo dentro do app", {
        description: msg.includes("message to forward not found")
          ? "O bot não consegue acessar essa mensagem. Adicione o bot como admin do canal/grupo e tente novamente."
          : msg,
      });
    } finally {
      setImporting(false);
    }
  };

  // Se já foi importado, usa o player nativo
  if (importedUrl) {
    const source = resolveVideoSource(importedUrl);
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white text-sm font-medium hover:opacity-80"
          >
            <ArrowLeft className="w-5 h-5" /> Voltar
          </button>
          <h2 className="text-white font-semibold text-sm md:text-base truncate max-w-[60%]">
            {movie.title}
          </h2>
          <div className="w-10" />
        </div>
        <div className="flex-1 w-full h-screen flex items-center justify-center">
          {source?.kind === "video" ? (
            <video
              src={source.url}
              poster={movie.thumbnail_url || undefined}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <iframe
              src={source?.url || importedUrl}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              title={movie.title}
            />
          )}
        </div>
      </div>
    );
  }

  if (!embedUrl) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
        Link inválido
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

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={handleImport}
            disabled={importing}
            className="bg-primary text-primary-foreground px-5 py-3 rounded-full font-bold text-sm flex items-center gap-2 shadow-2xl disabled:opacity-60 whitespace-nowrap"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Importando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" /> Tocar dentro do app
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TelegramPlayer;
