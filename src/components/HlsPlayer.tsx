import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader2, AlertTriangle, Play, Volume2, VolumeX, Maximize, RotateCcw } from "lucide-react";

interface HlsPlayerProps {
  /** Link da playlist .m3u8 (HLS) */
  src: string;
  /** Imagem opcional mostrada antes do play */
  poster?: string;
  /** Inicia automaticamente (mudo). Padrão: true */
  autoPlay?: boolean;
  /** Mostrar controles do navegador (padrão: false — usa custom) */
  nativeControls?: boolean;
  /** Classe CSS extra */
  className?: string;
}

/**
 * Player HLS nativo. Toca .m3u8 direto, sem YouTube/iframe.
 * - Usa HLS.js em navegadores (Chrome, Firefox, Edge, Android)
 * - Usa <video> nativo no Safari (suporta HLS por padrão)
 */
const HlsPlayer = ({
  src,
  poster,
  autoPlay = true,
  nativeControls = false,
  className = "",
}: HlsPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  const setupPlayer = () => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    setLoading(true);

    // Limpa instância anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Safari (iOS/macOS) → HLS nativo
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", () => setLoading(false), { once: true });
      return;
    }

    // Outros navegadores → HLS.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        // Baixa latência (delay mínimo possível em HLS)
        lowLatencyMode: true,
        // Buffer mais agressivo: começa a tocar logo, mantém pouco backbuffer
        backBufferLength: 10,
        maxBufferLength: 15,
        maxMaxBufferLength: 30,
        // Inicia já com a maior qualidade disponível
        startLevel: -1,
        // ABR otimizado pra rede instável
        abrEwmaDefaultEstimate: 1_000_000,
        // Recuperação automática de erros
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 6,
        levelLoadingMaxRetry: 6,
        // Sincroniza com o "ao vivo" sempre que possível
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 5,
        enableWorker: true,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        // Pula direto pro ponto mais ao vivo
        if (video.duration === Infinity || isNaN(video.duration)) {
          // live stream — sem ação extra
        }
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        console.error("[HlsPlayer]", data.type, data.details, data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError(`Erro de rede: ${data.details}`);
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              setError("Erro de mídia — recuperando...");
              break;
            default:
              setError(`Erro: ${data.details}`);
              break;
          }
          setLoading(false);
        }
      });
    } else {
      setError("Seu navegador não suporta este tipo de transmissão.");
      setLoading(false);
    }
  };

  useEffect(() => {
    setupPlayer();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Força tentativa de play (mudo) sempre que possível
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !autoPlay) return;
    const tryPlay = () => {
      v.muted = true;
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.catch(() => { /* autoplay bloqueado — usuário precisa tocar */ });
      }
    };
    tryPlay();
    const id = setInterval(() => {
      if (v.paused) tryPlay();
      else clearInterval(id);
    }, 1500);
    return () => clearInterval(id);
  }, [src, autoPlay]);

  const handlePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => { /* autoplay blocked */ });
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const goFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen();
    // @ts-ignore — iOS Safari
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  };

  return (
    <div
      className={`relative w-full h-full bg-black overflow-hidden select-none ${className}`}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
    >
      <video
        ref={videoRef}
        poster={poster}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        controls={nativeControls}
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        className="w-full h-full object-contain bg-black pointer-events-none"
      />

      {/* Tap-to-play (autoplay bloqueado pelo navegador) */}
      {!playing && !loading && !error && (
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white"
          aria-label="Iniciar transmissão"
        >
          <div className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-2xl animate-pulse">
            <Play className="w-7 h-7 fill-current ml-1" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider">Toque para iniciar</span>
        </button>
      )}

      {/* Loading overlay */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <p className="text-sm text-white">{error}</p>
          <button
            onClick={setupPlayer}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Tentar novamente
          </button>
        </div>
      )}

      {/* Custom controls — só volume e tela cheia */}
      {!nativeControls && !error && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center gap-2 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            onClick={toggleMute}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            aria-label={muted ? "Ativar som" : "Silenciar"}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <span className="ml-auto text-[10px] uppercase tracking-wider font-bold text-white/80 bg-destructive px-2 py-0.5 rounded-full">
            ● AO VIVO
          </span>
          <button
            onClick={goFullscreen}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            aria-label="Tela cheia"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default HlsPlayer;
