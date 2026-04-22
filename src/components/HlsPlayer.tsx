import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader2, AlertTriangle, Play, Volume2, VolumeX, Maximize, RotateCcw, RefreshCw } from "lucide-react";
import { ensureClockReady, serverNow, forceSyncServerClock, onClockSync } from "@/lib/serverClock";

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
  /**
   * Perfil agressivo de rede: pré-buffer maior, retomada mais forte e
   * priorização de bitrate alto sem travar a UI.
   */
  aggressiveNetwork?: boolean;
  /**
   * Mostra um pequeno HUD com o status da sincronização por hora real
   * (modo PDT/borda) e o drift atual em segundos.
   */
  showSyncIndicator?: boolean;
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
  aggressiveNetwork = false,
  showSyncIndicator = false,
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
  const maxLevelRef = useRef(0);
  const stableFragCountRef = useRef(0);
  // 🕒 Sincronização por hora real:
  //   pdtAnchorRef = { pdt: ms epoch do início do segmento, mediaTime: currentTime correspondente }
  const pdtAnchorRef = useRef<{ pdt: number; mediaTime: number } | null>(null);
  // 📊 Estado da sincronização exposto na UI
  const [syncInfo, setSyncInfo] = useState<{
    mode: "pdt" | "edge" | "idle";
    drift: number; // segundos: + = atrasado, - = à frente
  }>({ mode: "idle", drift: 0 });

  // Inicializa relógio sincronizado (compartilhado entre todas as instâncias)
  useEffect(() => { ensureClockReady(); }, []);

  // Força ressincronização do relógio quando o src PRINCIPAL muda (troca de canal),
  // não a cada fallback interno.
  useEffect(() => {
    void forceSyncServerClock();
  }, [src]);

  // Após cada re-sync do relógio, o watchdog (1s) reavalia drift naturalmente.
  useEffect(() => {
    const off = onClockSync(() => { /* HUD atualiza no próximo tick */ });
    return () => { off(); };
  }, []);

  // Handler manual: força sync do relógio + realinha o vídeo na hora
  const handleForceSync = () => {
    void forceSyncServerClock().then(() => {
      const v = videoRef.current;
      const anchor = pdtAnchorRef.current;
      if (!v || !anchor || v.buffered.length === 0) return;
      const liveEdge = v.buffered.end(v.buffered.length - 1);
      const liveEdgePdt = anchor.pdt + (liveEdge - anchor.mediaTime) * 1000;
      const targetPdt = Math.min(serverNow() - 2500, liveEdgePdt - 300);
      const targetMediaTime = anchor.mediaTime + (targetPdt - anchor.pdt) / 1000;
      try { v.currentTime = targetMediaTime; v.playbackRate = 1; } catch { /* noop */ }
    });
  };

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

  const stepDownQuality = (reason: string) => {
    const hls = hlsRef.current;
    if (!hls || lowQuality || !hls.levels?.length) return false;

    const currentCap = hls.autoLevelCapping >= 0 ? hls.autoLevelCapping : maxLevelRef.current;
    const nextCap = Math.max(0, currentCap - 1);
    if (nextCap === currentCap) return false;

    console.warn(`[HlsPlayer] Reduzindo qualidade (${reason}) para nível`, nextCap);
    stableFragCountRef.current = 0;
    hls.autoLevelCapping = nextCap;
    hls.nextAutoLevel = nextCap;
    return true;
  };

  const applyQualityStrategy = () => {
    const hls = hlsRef.current;
    if (!hls || !hls.levels?.length) return;

    const topLevel = hls.levels.length - 1;
    maxLevelRef.current = topLevel;

    if (lowQuality) {
      hls.autoLevelCapping = 0;
      hls.currentLevel = 0;
      hls.nextLevel = 0;
      hls.loadLevel = 0;
      return;
    }

    hls.autoLevelCapping = topLevel;
    hls.nextAutoLevel = (tvMode || aggressiveNetwork) ? topLevel : Math.min(topLevel, 1);
    hls.capLevelToPlayerSize = !tvMode && !aggressiveNetwork;
  };

  const setupPlayer = () => {
    const video = videoRef.current;
    if (!video || !activeSrc) return;

    setError(null);
    setLoading(true);
    failureCountRef.current = 0;
    stableFragCountRef.current = 0;

    // Limpa instância anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Safari (iOS/macOS) → HLS nativo, com auto-retry silencioso e ESTÁVEL
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      let safariRetries = 0;
      let destroyed = false;
      let retryTimer: number | null = null;
      let watchdogTimer: number | null = null;
      const maxSafariRetries = 3; // antes de mostrar erro / cair no fallback

      const tryLoad = () => {
        if (destroyed) return;
        // ⚠️ NÃO usa cache-buster: muda URL → reseta o player → loop infinito.
        if (video.src !== activeSrc) {
          video.src = activeSrc;
          try { video.load(); } catch { /* noop */ }
        }
        // Watchdog: se em 6s não carregou nada, força um retry / fallback
        if (watchdogTimer) window.clearTimeout(watchdogTimer);
        watchdogTimer = window.setTimeout(() => {
          if (destroyed) return;
          if (video.readyState < 2) {
            console.warn("[HlsPlayer] Safari watchdog: stream não respondeu em 6s");
            onErr();
          }
        }, 6000);
      };
      const onLoaded = () => {
        if (destroyed) return;
        if (watchdogTimer) { window.clearTimeout(watchdogTimer); watchdogTimer = null; }
        setLoading(false);
        setError(null);
        safariRetries = 0;
      };
      const onErr = () => {
        if (destroyed) return;
        // Ignora erros enquanto o vídeo já está reproduzindo OK (eventos espúrios do Safari)
        if (!video.paused && video.readyState >= 3 && video.currentTime > 0) return;
        safariRetries += 1;
        if (retryTimer) window.clearTimeout(retryTimer);
        if (safariRetries < maxSafariRetries) {
          // Mostra status pra usuário não pensar que travou
          setLoading(true);
          retryTimer = window.setTimeout(tryLoad, 600 * safariRetries);
        } else if (!tryFallback("safari error after retries")) {
          // Sem fallback — mostra erro pro usuário poder pular de canal
          setError("Canal indisponível no momento");
          setLoading(false);
        }
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onErr);
      // Cleanup específico para Safari path
      hlsRef.current = {
        destroy: () => {
          destroyed = true;
          if (retryTimer) window.clearTimeout(retryTimer);
          if (watchdogTimer) window.clearTimeout(watchdogTimer);
          video.removeEventListener("loadedmetadata", onLoaded);
          video.removeEventListener("error", onErr);
        },
      } as any;
      tryLoad();
      return;
    }

    // Outros navegadores → HLS.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        // ⚡ Baixa latência REAL: todos os aparelhos ficam no mesmo segundo
        lowLatencyMode: true,
        backBufferLength: lowQuality ? 5 : 10, // pouco histórico = menos delay
        maxBufferLength: lowQuality ? 6 : 8,   // buffer enxuto
        maxMaxBufferLength: lowQuality ? 12 : 16,
        maxBufferSize: lowQuality ? 15 * 1000 * 1000 : 30 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 1,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 20,
        startFragPrefetch: !lowQuality,
        maxStarvationDelay: 4, // não espera muito — pula pra borda viva

        // ABR
        startLevel: lowQuality ? 0 : -1,
        abrEwmaDefaultEstimate: aggressiveNetwork ? 5_000_000 : 1_000_000,
        abrBandWidthFactor: 0.9,
        abrBandWidthUpFactor: 0.7,

        // 🔑 Sincronização live: fica colado na borda
        liveSyncDuration: 2,                  // alvo: 2s atrás da borda
        liveMaxLatencyDuration: 6,            // > 6s = pula pra frente
        liveSyncDurationCount: 2,             // 2 segmentos atrás (ignorado se liveSyncDuration setado)
        liveMaxLatencyDurationCount: 6,
        liveDurationInfinity: true,
        liveSyncOnStallIncrease: 1,
        maxLiveSyncPlaybackRate: 1.5,         // acelera até 1.5x para alcançar a borda
        preserveManualLevelOnError: false,
        fpsDroppedMonitoringPeriod: 3000,
        fpsDroppedMonitoringThreshold: 0.15,

        // Retentativas (servidor JMV-Stream oscila)
        fragLoadingMaxRetry: 20,
        fragLoadingRetryDelay: 200,
        fragLoadingMaxRetryTimeout: 60000,
        manifestLoadingMaxRetry: 20,
        manifestLoadingRetryDelay: 200,
        manifestLoadingMaxRetryTimeout: 60000,
        levelLoadingMaxRetry: 20,
        levelLoadingRetryDelay: 200,
        levelLoadingMaxRetryTimeout: 60000,

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
        applyQualityStrategy();
      });

      // Quando volta a ter dados após buffering, limpa o erro silenciosamente
      hls.on(Hls.Events.FRAG_LOADED, (_e, data: any) => {
        if (failureCountRef.current > 0) failureCountRef.current = Math.max(0, failureCountRef.current - 1);
        if (!lowQuality && hls.autoLevelCapping >= 0 && hls.autoLevelCapping < maxLevelRef.current) {
          stableFragCountRef.current += 1;
          if (stableFragCountRef.current >= 12) {
            const nextCap = Math.min(maxLevelRef.current, hls.autoLevelCapping + 1);
            hls.autoLevelCapping = nextCap;
            stableFragCountRef.current = 0;
          }
        }
        // 🕒 Captura PROGRAM-DATE-TIME → permite sincronizar todos os aparelhos pela hora real
        const frag = data?.frag;
        if (frag && typeof frag.programDateTime === "number" && typeof frag.start === "number") {
          pdtAnchorRef.current = { pdt: frag.programDateTime, mediaTime: frag.start };
        }
        setError(null);
        setLoading(false);
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
            stepDownQuality("buffer stalled");
          }
          return;
        }

        failureCountRef.current += 1;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            stepDownQuality(data.details);
            if (
              data.details === "manifestLoadError" ||
              data.details === "manifestLoadTimeOut" ||
              data.details === "manifestParsingError" ||
              failureCountRef.current >= 3
            ) {
              if (tryFallback(data.details)) return;
              setError("Canal indisponível no momento");
              setLoading(false);
              return;
            }
            setError("Reconectando...");
            try { hls.startLoad(); } catch { /* noop */ }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            stepDownQuality("media error");
            if (failureCountRef.current >= 2) {
              if (tryFallback("media error")) return;
              try { hls.swapAudioCodec(); hls.recoverMediaError(); } catch { /* noop */ }
            } else {
              try { hls.recoverMediaError(); } catch { /* noop */ }
            }
            setError("Recuperando...");
            break;
          default:
            if (tryFallback(data.details)) return;
            setError("Canal indisponível no momento");
            setLoading(false);
            break;
        }
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
  }, [activeSrc, tvMode, lowQuality, aggressiveNetwork]);

  // Força tentativa de play (mudo) sempre que possível
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !autoPlay) return;
    const tryPlay = () => {
      v.muted = true;
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.then(() => { setPlaying(true); setLoading(false); })
         .catch(() => { /* autoplay bloqueado — usuário precisa tocar */ });
      } else {
        setTimeout(() => { if (!v.paused) setPlaying(true); }, 100);
      }
    };
    tryPlay();
    const id = setInterval(() => {
      if (v.paused) tryPlay();
      else { setPlaying(true); clearInterval(id); }
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
  // E ALÉM DISSO mantém todos os aparelhos colados na borda viva (sincronização).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let lastTime = v.currentTime;
    let stuckCount = 0;
    let lastReport = 0;
    const TARGET_LATENCY = 2.5; // segundos atrás da borda — alvo igual em todos os aparelhos
    const MAX_LATENCY = 6;      // se passar disso, pula pra borda

    const reportSync = (mode: "pdt" | "edge" | "idle", drift: number) => {
      if (!showSyncIndicator) return;
      const now = Date.now();
      // Throttle: só atualiza UI a cada 500ms (e arredonda drift pra 1 casa)
      if (now - lastReport < 500) return;
      lastReport = now;
      const rounded = Math.round(drift * 10) / 10;
      setSyncInfo((prev) =>
        prev.mode === mode && prev.drift === rounded ? prev : { mode, drift: rounded }
      );
    };

    const interval = setInterval(() => {
      // 🔄 SINCRONIZAÇÃO POR HORA REAL — todos os aparelhos no MESMO segundo
      if (!v.paused && !v.ended && v.readyState >= 2 && v.buffered.length > 0) {
        const liveEdge = v.buffered.end(v.buffered.length - 1);
        const anchor = pdtAnchorRef.current;

        // Se o stream tem PROGRAM-DATE-TIME, ancoramos pela hora do servidor
        if (anchor) {
          // Tempo absoluto da borda viva (ms epoch)
          const liveEdgePdt = anchor.pdt + (liveEdge - anchor.mediaTime) * 1000;
          // Alvo: ficar TARGET_LATENCY segundos atrás do "agora real" do servidor
          const targetPdt = serverNow() - TARGET_LATENCY * 1000;
          // Se o alvo ultrapassa o que o stream tem, usa a borda viva como teto
          const cappedTargetPdt = Math.min(targetPdt, liveEdgePdt - 0.3 * 1000);
          // Converte de volta pra mediaTime (currentTime do <video>)
          const targetMediaTime = anchor.mediaTime + (cappedTargetPdt - anchor.pdt) / 1000;
          const drift = targetMediaTime - v.currentTime; // positivo = estamos atrás

          reportSync("pdt", drift);

          if (drift > 4) {
            // Muito fora de sincronia → pula direto
            try { v.currentTime = targetMediaTime; v.playbackRate = 1; } catch { /* noop */ }
          } else if (drift > 0.6) {
            // Levemente atrás → acelera suavemente até alcançar
            v.playbackRate = 1.3;
          } else if (drift < -1.5) {
            // À frente da hora real (raro) → desacelera
            v.playbackRate = 0.95;
          } else if (Math.abs(drift) < 0.4 && v.playbackRate !== 1) {
            v.playbackRate = 1;
          }
        } else {
          // Fallback (stream sem PDT): sincroniza pela borda do buffer
          const latency = liveEdge - v.currentTime;
          const drift = latency - TARGET_LATENCY;
          reportSync("edge", drift);

          if (latency > MAX_LATENCY) {
            try { v.currentTime = liveEdge - TARGET_LATENCY; } catch { /* noop */ }
          } else if (latency > TARGET_LATENCY + 1.5) {
            v.playbackRate = 1.3;
          } else if (latency <= TARGET_LATENCY + 0.5 && v.playbackRate !== 1) {
            v.playbackRate = 1;
          }
        }
      } else {
        reportSync("idle", 0);
      }

      // 🛡️ Detecção de stall (igual antes)
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
        if (stuckCount === 3) {
          stepDownQuality("stall watchdog");
          try {
            if (v.buffered.length > 0) {
              const end = v.buffered.end(v.buffered.length - 1);
              if (end > v.currentTime + 0.2) v.currentTime = v.currentTime + 0.1;
            }
            v.play().catch(() => {});
          } catch { /* noop */ }
        }
        if (stuckCount === 6) {
          try { hlsRef.current?.startLoad(); } catch { /* noop */ }
        }
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
  }, [activeSrc, fallbackSrc, showSyncIndicator]);

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

  // Reconexão instantânea: limpa erro na hora e tenta caminhos progressivamente
  const handleRetry = () => {
    setError(null);
    setLoading(true);
    failureCountRef.current = 0;
    stableFragCountRef.current = 0;
    const v = videoRef.current;
    const hls = hlsRef.current;
    try {
      if (hls) {
        try { hls.stopLoad(); } catch { /* noop */ }
        try { hls.startLoad(-1); } catch { /* noop */ }
        try { hls.recoverMediaError(); } catch { /* noop */ }
      }
      if (v) {
        v.muted = true;
        const p = v.play();
        if (p && typeof p.then === "function") p.catch(() => {});
      }
      setTimeout(() => {
        const vv = videoRef.current;
        const stillStuck = !vv || vv.paused || vv.readyState < 2;
        if (stillStuck) {
          if (!tryFallback("manual retry")) setupPlayer();
        }
      }, 1500);
    } catch {
      setupPlayer();
    }
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
        preload="auto"
        muted={muted}
        playsInline
        controls={nativeControls}
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => { setPlaying(true); setLoading(false); }}
        onPlaying={() => { setPlaying(true); setLoading(false); }}
        onPause={() => {
          // Só marca como pausado se realmente está parado (ignora pausas espúrias durante troca)
          const v = videoRef.current;
          if (v && v.ended) return;
          setPlaying(false);
        }}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => {
          const v = videoRef.current;
          if (v && !v.paused) { setPlaying(true); setLoading(false); }
        }}
        onTimeUpdate={() => {
          // Sincronização final: se o vídeo está avançando, está tocando — sem overlay
          const v = videoRef.current;
          if (v && !v.paused && v.currentTime > 0 && !playing) setPlaying(true);
        }}
        className="w-full h-full object-contain bg-black pointer-events-none"
      />

      {/* Tap-to-play (autoplay bloqueado pelo navegador) — só aparece se REALMENTE pausado */}
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
            onClick={handleRetry}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Tentar novamente
          </button>
        </div>
      )}

      {/* 🕒 Indicador de sincronização por hora real */}
      {showSyncIndicator && !error && (
        <div className="absolute top-3 left-3 flex items-center gap-1">
          <div
            className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm text-[10px] font-bold text-white px-2 py-1 rounded-full pointer-events-none border border-white/10"
            title={
              syncInfo.mode === "pdt"
                ? "Sincronização por hora real (PDT) ativa"
                : syncInfo.mode === "edge"
                ? "Sincronização pela borda do buffer (stream sem PDT)"
                : "Aguardando dados do stream"
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                syncInfo.mode === "pdt"
                  ? "bg-emerald-400 animate-pulse"
                  : syncInfo.mode === "edge"
                  ? "bg-amber-400"
                  : "bg-zinc-500"
              }`}
            />
            <span className="uppercase tracking-wider">
              {syncInfo.mode === "pdt" ? "SYNC HORA" : syncInfo.mode === "edge" ? "SYNC BORDA" : "SYNC ..."}
            </span>
            {syncInfo.mode !== "idle" && (
              <span
                className={`tabular-nums ${
                  Math.abs(syncInfo.drift) < 0.5
                    ? "text-emerald-300"
                    : Math.abs(syncInfo.drift) < 1.5
                    ? "text-amber-300"
                    : "text-red-300"
                }`}
              >
                {syncInfo.drift > 0 ? "+" : ""}
                {syncInfo.drift.toFixed(1)}s
              </span>
            )}
          </div>
          <button
            onClick={handleForceSync}
            className="bg-black/55 hover:bg-black/75 backdrop-blur-sm text-white p-1.5 rounded-full border border-white/10 transition-colors"
            aria-label="Forçar sincronização"
            title="Forçar sincronização agora"
          >
            <RefreshCw className="w-3 h-3" />
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
