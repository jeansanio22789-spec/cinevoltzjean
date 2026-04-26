import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Play } from "lucide-react";

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

/**
 * Telegram permite embed oficial em posts de canais públicos via ?embed=1.
 * Para canais privados (/c/) tentamos extrair o <video> direto via proxy.
 * Retorna { kind, url }:
 *   - "embed"  → iframe oficial do Telegram
 *   - "proxy"  → URL para o proxy-stream extrair o vídeo
 *   - "redirect" → não embedável, abrir no Telegram
 */
type EmbedSource =
  | { kind: "embed"; url: string }
  | { kind: "proxy"; pageUrl: string }
  | { kind: "redirect" };

const resolveEmbed = (telegramUrl: string): EmbedSource => {
  try {
    const parsed = new URL(telegramUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    // Canal privado: /c/<id>/<msg> — não suporta embed=1
    if (parts[0] === "c") {
      return { kind: "proxy", pageUrl: telegramUrl };
    }
    // Canal público com post: /<canal>/<msg>
    if (parts.length >= 2) {
      const url = `${parsed.origin}/${parts[0]}/${parts[1]}?embed=1&mode=tme`;
      return { kind: "embed", url };
    }
    return { kind: "redirect" };
  } catch {
    return { kind: "redirect" };
  }
};

const buildTelegramAppUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "c" && parts.length >= 3) {
      // tg://privatepost?channel=<id>&post=<msg>
      return `tg://privatepost?channel=${parts[1]}&post=${parts[2]}`;
    }
    if (parts.length >= 2) {
      return `tg://resolve?domain=${parts[0]}&post=${parts[1]}`;
    }
    if (parts.length === 1) {
      return `tg://resolve?domain=${parts[0]}`;
    }
  } catch {
    // mantém fallback web
  }
  return url;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const TelegramPlayer = ({ movie, onBack }: TelegramPlayerProps) => {
  const telegramUrl = useMemo(() => normalizeTelegramUrl(movie.telegram_url), [movie.telegram_url]);
  const embed = useMemo(() => (telegramUrl ? resolveEmbed(telegramUrl) : null), [telegramUrl]);
  const appUrl = useMemo(() => (telegramUrl ? buildTelegramAppUrl(telegramUrl) : null), [telegramUrl]);

  const [proxyVideo, setProxyVideo] = useState<string | null>(null);
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyFailed, setProxyFailed] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);

  // Para canais privados: busca a página via proxy e extrai a tag <video>
  useEffect(() => {
    if (!embed || embed.kind !== "proxy") return;
    let cancelled = false;
    const fetchVideo = async () => {
      setProxyLoading(true);
      setProxyFailed(false);
      try {
        const proxied = `${SUPABASE_URL}/functions/v1/proxy-stream?url=${encodeURIComponent(embed.pageUrl + "?embed=1")}`;
        const res = await fetch(proxied);
        if (!res.ok) throw new Error("proxy");
        const html = await res.text();
        // Procura <video src="..."> ou property="og:video"
        const videoMatch =
          html.match(/<video[^>]+src=["']([^"']+\.mp4[^"']*)["']/i) ||
          html.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i) ||
          html.match(/property=["']og:video:url["']\s+content=["']([^"']+)["']/i);
        if (!cancelled && videoMatch) {
          setProxyVideo(videoMatch[1]);
        } else if (!cancelled) {
          setProxyFailed(true);
        }
      } catch {
        if (!cancelled) setProxyFailed(true);
      } finally {
        if (!cancelled) setProxyLoading(false);
      }
    };
    fetchVideo();
    return () => {
      cancelled = true;
    };
  }, [embed]);

  if (!telegramUrl || !embed || !appUrl) {
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

  // Header reutilizado nas três variantes
  const Header = (
    <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-4 bg-gradient-to-b from-black/80 to-transparent">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-white"
      >
        <ArrowLeft className="h-5 w-5" /> Voltar
      </button>
      <h1 className="max-w-[58%] truncate text-sm font-bold text-white md:text-base">
        {movie.title}
      </h1>
      <a
        href={telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        aria-label="Abrir no Telegram"
      >
        <ExternalLink className="h-5 w-5" />
      </a>
    </div>
  );

  // 1. Canal público + iframe carregou: player oficial do Telegram inline
  if (embed.kind === "embed" && !iframeFailed) {
    return (
      <div className="min-h-screen bg-black relative flex items-center justify-center">
        {Header}
        <iframe
          src={embed.url}
          className="w-full h-screen border-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          onError={() => setIframeFailed(true)}
          title={movie.title}
        />
      </div>
    );
  }

  // 2. Canal privado com vídeo extraído: player HTML5 nativo
  if (embed.kind === "proxy" && proxyVideo) {
    const proxiedVideo = `${SUPABASE_URL}/functions/v1/proxy-stream?url=${encodeURIComponent(proxyVideo)}`;
    return (
      <div className="min-h-screen bg-black relative flex items-center justify-center">
        {Header}
        <video
          src={proxiedVideo}
          poster={movie.thumbnail_url || undefined}
          controls
          autoPlay
          playsInline
          className="w-full h-screen object-contain bg-black"
        >
          Seu navegador não suporta o player de vídeo.
        </video>
      </div>
    );
  }

  // 3. Carregando extração
  if (embed.kind === "proxy" && proxyLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 text-white">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Carregando vídeo do Telegram...</p>
      </div>
    );
  }

  // 4. Fallback: não conseguiu embedar — mostra botões para abrir
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
        <div className="w-10" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        {movie.thumbnail_url && (
          <img
            src={movie.thumbnail_url}
            alt={movie.title}
            className="h-60 w-44 rounded-lg object-cover shadow-2xl"
          />
        )}
        <div className="space-y-2">
          <p className="text-2xl font-black">Vídeo protegido</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {proxyFailed
              ? "Este canal é privado e não permite reprodução direta. Abra no Telegram para assistir."
              : "Toque abaixo para abrir o vídeo no Telegram."}
          </p>
        </div>
        <a
          href={appUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-md bg-primary px-6 py-4 text-sm font-black text-primary-foreground"
        >
          <Play className="h-5 w-5 fill-current" /> Abrir no Telegram
        </a>
        <a
          href={telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-md bg-muted px-6 py-3 text-sm font-bold text-foreground"
        >
          <ExternalLink className="h-4 w-4" /> Abrir no navegador
        </a>
      </div>
    </div>
  );
};

export default TelegramPlayer;
