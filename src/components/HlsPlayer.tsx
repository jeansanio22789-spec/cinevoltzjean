import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader2, AlertTriangle, Play, Volume2, VolumeX, Maximize, RotateCcw } from "lucide-react";

interface HlsPlayerProps {
  /** Link da playlist .m3u8 (HLS) */
  src: string;
  /** Link reserva (.m3u8) usado automaticamente se o src principal falhar */
  fallbackSrc?: string | null;
  /** Imagem opcional mostrada antes do play */
  poster?: string;
  /** Inicia automaticamente (mudo). Padrão: true */
  autoPlay?: boolean;
  /** Mostrar controles do navegador (padrão: false — usa custom) */
  nativeControls?: boolean;
  /** Classe CSS extra */
  className?: string;
  /**
   * Modo TV: HUD mínimo (só badge AO VIVO discreto), trava na maior qualidade,
   * ignora cliques de pausa, sem controles flutuantes.
   */
  tvMode?: boolean;
  /**
   * Modo leve: trava na MENOR qualidade, buffer pequeno, ideal para thumbnails
   * ou quando há vários players simultâneos.
   */
  lowQuality?: boolean;
}

/**
 * Player HLS nativo. Toca .m3u8 direto, sem YouTube/iframe.
 */
const HlsPlayer = ({
  src,
  fallbackSrc,
  poster,
  autoPlay = true,
  nativeControls = false,
  className = "",
  tvMode = false,
  lowQuality = false,
}: HlsPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [activeSrc, setActiveSrc] = useState(src);
  const [usingFallback, setUsingFallback] = useState(false);
  const failureCountRef = useRef(0);

  // Tenta o fallback se houver — retorna true se o switch ocorreu
  const tryFallback = (reason: string) => {
    if (fallbackSrc && !usingFallback && fallbackSrc !== src) {
      console.warn(`[HlsPlayer] Trocando para fallback (${reason}):`, fallbackSrc);
      setUsingFallback(true);
      setActiveSrc(fallbackSrc);
      setError(null);
      return true;
    }
    return false;
  };

  const setupPlayer = () => {
    const video = videoRef.current;
    if (!video || !activeSrc) return;

    setError(null);
    setLoading(true);
    failureCountRef.current = 0;

    // Limpa instância anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Safari (iOS/macOS) → HLS nativo
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = activeSrc;
      const onLoaded = () => setLoading(false);
      const onErr = () => {
        if (!tryFallback("safari error")) {
          setError("Stream indisponível no momento.");
          setLoading(false);
        }
      };
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onErr, { once: true });
      return;
    }

    // Outros navegadores → HLS.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        // Latência baixa, mas com colchão maior para resistir a microcortes
        lowLatencyMode: !lowQuality,
        backBufferLength: lowQuality ? 5 : 30,
        maxBufferLength: lowQuality ? 10 : 30,
        maxMaxBufferLength: lowQuality ? 20 : 60,
        maxBufferSize: lowQuality ? 15 * 1000 * 1000 : 60 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 1,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 10,

        // ABR: thumbnail começa baixo, player principal começa automático
        startLevel: lowQuality ? 0 : -1,
        abrEwmaDefaultEstimate: 1_000_000,
        abrBandWidthFactor: 0.9,
        abrBandWidthUpFactor: 0.7,

        // Retentativas agressivas
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 500,
        fragLoadingMaxRetryTimeout: 30000,
        manifestLoadingMaxRetry: 8,
        manifestLoadingRetryDelay: 500,
        levelLoadingMaxRetry: 8,
        levelLoadingRetryDelay: 500,

        // Live: 4 segments do edge (estável)
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 12,
        liveDurationInfinity: true,

        enableWorker: true,
        capLevelToPlayerSize: !tvMode,
        testBandwidth: !lowQuality,
        progressive: true,
      });
      hlsRef.current = hls;
      hls.loadSource(activeSrc);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        failureCountRef.current = 0;
        if (!hls.levels || hls.levels.length === 0) return;
        if (tvMode) {
          // Trava na maior qualidade
          const topLevel = hls.levels.length - 1;
          hls.currentLevel = topLevel;
          hls.nextLevel = topLevel;
        } else if (lowQuality) {
          // Trava na MENOR qualidade (thumbnail / múltiplos players)
          hls.currentLevel = 0;
          hls.nextLevel = 0;
          hls.loadLevel = 0;
        }
      });

      // Quando volta a ter dados após buffering, limpa o erro silenciosamente
      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (failureCountRef.current > 0) failureCountRef.current = Math.max(0, failureCountRef.current - 1);
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        console.warn("[HlsPlayer]", data.type, data.details, data.fatal ? "FATAL" : "");

        // Erros não-fatais: apenas log, hls.js auto-recupera
        if (!data.fatal) {
          // bufferStalledError → cutuca o vídeo um pouco à frente
          if (data.details === "bufferStalledError") {
            const v = videoRef.current;
            if (v && v.buffered.length > 0) {
              try { v.currentTime = v.currentTime + 0.1; } catch { /* noop */ }
            }
          }
          return;
        }

        failureCountRef.current += 1;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (
              data.details === "manifestLoadError" ||
              data.details === "manifestLoadTimeOut" ||
              data.details === "manifestParsingError" ||
              failureCountRef.current >= 3
            ) {
              if (tryFallback(data.details)) return;
            }
            setError("Reconectando...");
            try { hls.startLoad(); } catch { /* noop */ }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            if (failureCountRef.current >= 2) {
              if (tryFallback("media error")) return;
              // Última tentativa: troca de codecs
              try { hls.swapAudioCodec(); hls.recoverMediaError(); } catch { /* noop */ }
            } else {
              try { hls.recoverMediaError(); } catch { /* noop */ }
            }
            setError("Recuperando...");
            break;
          default:
            if (tryFallback(data.details)) return;
            // Última cartada: destrói e recria
            try {
              hls.destroy();
              hlsRef.current = null;
              setTimeout(() => setupPlayer(), 1000);
            } catch { /* noop */ }
            setError("Reiniciando...");
            break;
        }
        setLoading(false);
      });
    } else {
      setError("Seu navegador não suporta este tipo de transmissão.");
      setLoading(false);
    }
  };

  // Reseta para o stream principal quando o src principal muda
  useEffect(() => {
    setUsingFallback(false);
    setActiveSrc(src);
  }, [src]);

  useEffect(() => {
    setupPlayer();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrc, tvMode, lowQuality]);

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
  }, [activeSrc, autoPlay]);

  // Em modo TV: nunca deixa pausado — se o usuário pausar de qualquer jeito, retoma
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !tvMode) return;
    const onPause = () => {
      // Pequeno delay para não brigar com troca de fonte
      setTimeout(() => {
        if (v.paused) v.play().catch(() => {});
      }, 50);
    };
    v.addEventListener("pause", onPause);
    return () => v.removeEventListener("pause", onPause);
  }, [tvMode, src]);

  // Watchdog: detecta stall silencioso (vídeo "tocando" mas currentTime não avança)
  // e força recuperação ou fallback se persistir.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let lastTime = v.currentTime;
    let stuckCount = 0;
    const interval = setInterval(() => {
      if (v.paused || v.ended || v.readyState < 2) {
        lastTime = v.currentTime;
        stuckCount = 0;
        return;
      }
      const advanced = v.currentTime - lastTime > 0.05;
      if (advanced) {
        lastTime = v.currentTime;
        stuckCount = 0;
      } else {
        stuckCount += 1;
        // 3s travado: tenta cutucar
        if (stuckCount === 3) {
          try {
            if (v.buffered.length > 0) {
              const end = v.buffered.end(v.buffered.length - 1);
              if (end > v.currentTime + 0.2) v.currentTime = v.currentTime + 0.1;
            }
            v.play().catch(() => {});
          } catch { /* noop */ }
        }
        // 6s travado: força reload do hls
        if (stuckCount === 6) {
          try { hlsRef.current?.startLoad(); } catch { /* noop */ }
        }
        // 10s travado: reseta o player ou cai pro fallback
        if (stuckCount >= 10) {
          stuckCount = 0;
          if (!tryFallback("watchdog stall")) {
            setupPlayer();
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrc, fallbackSrc]);

  const handlePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => { /* autoplay blocked */ });
    } else if (!tvMode) {
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

      {/* HUD mínimo do modo TV: só badge AO VIVO discreto + mudo invisível por hover */}
      {tvMode && !error && (
        <>
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm text-[10px] uppercase tracking-wider font-bold text-white/90 px-2 py-1 rounded-full pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" /> AO VIVO
          </div>
          <button
            onClick={toggleMute}
            className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
            aria-label={muted ? "Ativar som" : "Silenciar"}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </>
      )}

      {/* Controles padrão — só volume e tela cheia (oculto no modo TV) */}
      {!nativeControls && !error && !tvMode && (
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
