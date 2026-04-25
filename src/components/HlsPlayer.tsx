import { forwardRef, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader2, AlertTriangle, Play, Volume2, VolumeX, Maximize, RotateCcw, RefreshCw, Cast } from "lucide-react";
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
   * Modo SAT: canal via satélite + rede móvel/lenta. Buffer EXTRA grande,
   * qualidade reduzida automaticamente, retries mais espaçados — reduz
   * travamentos quando o sinal vem de uplink + 4G/3G.
   */
  satelliteMode?: boolean;
  /**
   * Mostra um pequeno HUD com o status da sincronização por hora real
   * (modo PDT/borda) e o drift atual em segundos.
   */
  showSyncIndicator?: boolean;
  /** Notifica o componente pai quando o player troca para estado de erro/recuperação */
  onError?: (msg: string | null) => void;
  /**
   * Callback periódico (≈1s) com estatísticas técnicas do player.
   * Usado pelo painel de diagnóstico em /ao-vivo.
   */
  onStats?: (stats: {
    engine: "hls.js" | "native" | "idle";
    readyState: number;
    networkState: number;
    paused: boolean;
    currentTime: number;
    bufferAhead: number;
    buffered: number;
    bandwidth: number;
    currentLevel: number;
    autoLevelCap: number;
    levelHeight: number | null;
    levelBitrate: number | null;
    liveLatency: number | null;
    droppedFrames: number;
    lastError: string | null;
    lastErrorAt: number | null;
    errorCount: number;
    activeSrc: string;
    usingFallback: boolean;
  }) => void;
}

/**
 * Detecta Smart TVs Samsung (Tizen) e navegadores embutidos da Samsung.
 * Esses aparelhos têm CPU/decoder fracos e rede instável → precisam de
 * buffer maior, menos retries agressivos e sem low-latency mode.
 */
const detectSamsungTV = () => {
  if (typeof navigator === "undefined") return { isSamsungTV: false, isTizen: false, isSamsungBrowser: false };
  const ua = navigator.userAgent || "";
  const isTizen = /Tizen/i.test(ua);
  const isSamsungTV = isTizen || /SMART-TV|SmartTV|SamsungBrowser.*TV|Maple/i.test(ua);
  const isSamsungBrowser = /SamsungBrowser/i.test(ua);
  return { isSamsungTV, isTizen, isSamsungBrowser };
};

const shouldUseNativeHls = (video: HTMLVideoElement) => {
  // Samsung Tizen tem HLS nativo MUITO mais estável que hls.js (decoder de hardware).
  // Sempre que o canPlayType disser que sim, usamos nativo.
  const { isSamsungTV } = detectSamsungTV();
  if (isSamsungTV && video.canPlayType("application/vnd.apple.mpegurl")) return true;

  if (!video.canPlayType("application/vnd.apple.mpegurl")) return false;
  if (typeof navigator === "undefined") return true;

  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isSafariDesktop = /Mac/.test(platform) && /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|Android/i.test(ua);

  return isIOS || isSafariDesktop;
};

/**
 * Player HLS nativo. Toca .m3u8 direto, sem YouTube/iframe.
 */
const HlsPlayer = forwardRef<HTMLDivElement, HlsPlayerProps>(({
  src,
  fallbackSrc,
  poster,
  autoPlay = true,
  nativeControls = false,
  className = "",
  tvMode = false,
  lowQuality = false,
  aggressiveNetwork = false,
  satelliteMode = false,
  showSyncIndicator = false,
  onError,
  onStats,
}, _forwardedRef) => {
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
  const recoveryTimerRef = useRef<number | null>(null);
  const lastProgressAtRef = useRef(Date.now());
  // 📊 Telemetria para o painel de diagnóstico
  const lastErrorRef = useRef<{ msg: string; at: number } | null>(null);
  const errorCountRef = useRef(0);
  const engineRef = useRef<"hls.js" | "native" | "idle">("idle");
  // 🕒 Sincronização por hora real:
  //   pdtAnchorRef = { pdt: ms epoch do início do segmento, mediaTime: currentTime correspondente }
  const pdtAnchorRef = useRef<{ pdt: number; mediaTime: number } | null>(null);
  // 📊 Estado da sincronização exposto na UI
  const [syncInfo, setSyncInfo] = useState<{
    mode: "pdt" | "edge" | "idle";
    drift: number; // segundos: + = atrasado, - = à frente
  }>({ mode: "idle", drift: 0 });

  // 📺 Espelhamento (AirPlay / Chromecast)
  const [airplayAvailable, setAirplayAvailable] = useState(false);
  const [castAvailable, setCastAvailable] = useState(false);

  // Notifica o componente pai sempre que o estado de erro mudar
  useEffect(() => {
    onError?.(error);
  }, [error, onError]);

  // Detecta suporte a AirPlay (Safari/iOS)
  useEffect(() => {
    const v = videoRef.current as any;
    if (!v) return;
    if (typeof window !== "undefined" && (window as any).WebKitPlaybackTargetAvailabilityEvent) {
      const onAvail = (e: any) => setAirplayAvailable(e.availability === "available");
      v.addEventListener("webkitplaybacktargetavailabilitychanged", onAvail);
      return () => v.removeEventListener("webkitplaybacktargetavailabilitychanged", onAvail);
    }
  }, []);

  // Inicializa Google Cast (Chromecast)
  useEffect(() => {
    const w = window as any;
    const init = () => {
      try {
        const ctx = w.cast?.framework?.CastContext.getInstance();
        if (!ctx) return;
        ctx.setOptions({
          receiverApplicationId: w.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || "CC1AD845",
          autoJoinPolicy: w.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED,
        });
        setCastAvailable(true);
      } catch {
        // ignora
      }
    };
    if (w.cast?.framework) {
      init();
    } else {
      w.__onGCastApiAvailable = (available: boolean) => { if (available) init(); };
    }
  }, []);

  const startAirplay = () => {
    const v = videoRef.current as any;
    if (v?.webkitShowPlaybackTargetPicker) {
      try { v.webkitShowPlaybackTargetPicker(); } catch {}
    }
  };

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

  // 🌐 Reconexão automática quando a rede volta (offline → online)
  // Quando o navegador detecta que voltou a ter internet (Wi-Fi ou 4G),
  // tenta retomar o stream imediatamente em vez de esperar o usuário tocar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      console.log("[HlsPlayer] Rede voltou — tentando retomar stream");
      const v = videoRef.current;
      const hls = hlsRef.current as (Hls & { startLoad?: () => void }) | null;
      setError(null);
      setLoading(true);
      failureCountRef.current = 0;
      try {
        if (hls && typeof hls.startLoad === "function") {
          hls.startLoad();
        } else if (v) {
          reloadNativeStream(v, activeSrc);
        }
        if (v && v.paused) {
          v.muted = true;
          v.play().catch(() => {});
        }
      } catch { /* noop */ }
    };
    const onOffline = () => {
      console.log("[HlsPlayer] Rede caiu — aguardando voltar");
      setError("Sem conexão — aguardando rede voltar...");
      setLoading(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrc]);

  const syncPlaybackState = (nextPlaying: boolean) => {
    setPlaying((prev) => (prev === nextPlaying ? prev : nextPlaying));
    if (nextPlaying) {
      setLoading(false);
      setError(null);
      lastProgressAtRef.current = Date.now();
    }
  };

  const clearScheduledRecovery = () => {
    if (recoveryTimerRef.current !== null) {
      window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  };

  const reloadNativeStream = (video: HTMLVideoElement, url: string) => {
    lastProgressAtRef.current = Date.now();
    try { video.pause(); } catch { /* noop */ }
    try {
      video.removeAttribute("src");
      video.load();
    } catch {
      /* noop */
    }
    try {
      video.src = url;
      video.load();
    } catch {
      /* noop */
    }
    if (autoPlay || tvMode) {
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.then === "function") {
        playAttempt.then(() => syncPlaybackState(true)).catch(() => { /* noop */ });
      }
    }
  };

  const recoverPlayback = (reason: string, hard = false) => {
    const v = videoRef.current;
    if (!v) return false;

    console.warn(`[HlsPlayer] Forçando retomada (${reason})${hard ? " [hard]" : ""}`);
    setError(hard ? "Reconectando sinal ao vivo..." : null);
    setLoading(true);

    const hls = hlsRef.current as (Hls & { startLoad?: (startPosition?: number) => void; recoverMediaError?: () => void }) | null;
    const isNativePath = !hls || typeof hls.startLoad !== "function";

    if (isNativePath) {
      reloadNativeStream(v, activeSrc);
      return true;
    }

    try {
      if (v.buffered.length > 0) {
        const liveEdge = v.buffered.end(v.buffered.length - 1);
        // Em celular/Modo SAT, NÃO cola na borda do ao vivo: mantém folga real
        // de buffer para não entrar em loop de bufferStalledError.
        const targetLatency = satelliteMode ? 20 : (lowQuality ? 3 : 6);
        const targetTime = Math.max(0, liveEdge - targetLatency);
        if (hard || liveEdge - v.currentTime > targetLatency + 8) {
          v.currentTime = targetTime;
        }
      }
    } catch {
      /* noop */
    }

    try { hls.startLoad?.(-1); } catch {
      try { hls.startLoad?.(); } catch { /* noop */ }
    }
    if (hard) {
      try { hls.recoverMediaError?.(); } catch { /* noop */ }
    }

    if ((autoPlay || tvMode) && v.paused) {
      const playAttempt = v.play();
      if (playAttempt && typeof playAttempt.then === "function") {
        playAttempt.then(() => syncPlaybackState(true)).catch(() => { /* noop */ });
      }
    } else if (!v.paused) {
      syncPlaybackState(true);
    }

    return true;
  };

  const scheduleRecovery = (reason: string, delay = 180, hard = false) => {
    if (recoveryTimerRef.current !== null && !hard) return;
    clearScheduledRecovery();
    recoveryTimerRef.current = window.setTimeout(() => {
      recoveryTimerRef.current = null;
      recoverPlayback(reason, hard);
    }, delay);
  };

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

    // 🛰️ Modo SAT: limita à metade inferior das qualidades pra economizar dados
    // móveis e evitar travamentos (ex.: em 5 níveis, cap = 2)
    if (satelliteMode) {
      const satCap = Math.max(0, Math.floor(topLevel / 2));
      hls.autoLevelCapping = satCap;
      hls.nextAutoLevel = 0;
      hls.capLevelToPlayerSize = true;
      return;
    }

    hls.autoLevelCapping = topLevel;
    hls.nextAutoLevel = (tvMode || aggressiveNetwork) ? topLevel : Math.min(topLevel, 1);
    hls.capLevelToPlayerSize = !tvMode && !aggressiveNetwork;
  };

  const setupPlayer = () => {
    const video = videoRef.current;
    if (!video || !activeSrc) return;

    clearScheduledRecovery();
    setError(null);
    setLoading(true);
    setPlaying(false);
    failureCountRef.current = 0;
    stableFragCountRef.current = 0;

    // Limpa instância anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Safari/iOS → HLS nativo. Em Android/WebView preferimos hls.js, que é mais estável.
    if (shouldUseNativeHls(video)) {
      engineRef.current = "native";
      let safariRetries = 0;
      let destroyed = false;
      let retryTimer: number | null = null;
      let watchdogTimer: number | null = null;
      const maxSafariRetries = 3; // antes de mostrar erro / cair no fallback

      const getBufferAhead = () => {
        try {
          if (video.buffered.length === 0) return 0;
          const end = video.buffered.end(video.buffered.length - 1);
          return Math.max(0, end - video.currentTime);
        } catch {
          return 0;
        }
      };

      const markSafariProgress = () => {
        lastProgressAtRef.current = Date.now();
        if (!video.paused && video.currentTime > 0) syncPlaybackState(true);
      };

      const tryLoad = (forceReload = false) => {
        if (destroyed) return;
        if (forceReload || video.src !== activeSrc) {
          reloadNativeStream(video, activeSrc);
        } else if (!video.src) {
          video.src = activeSrc;
          try { video.load(); } catch { /* noop */ }
        }
        // Watchdog: se em 15s não carregou nada, força um retry / fallback
        // (segmentos JMVStream chegam a 4s; damos folga real para 1ª conexão)
        if (watchdogTimer) window.clearTimeout(watchdogTimer);
        watchdogTimer = window.setTimeout(() => {
          if (destroyed) return;
          const bufferAhead = getBufferAhead();
          const noRecentProgress = Date.now() - lastProgressAtRef.current > 14000;
          const neverStarted = video.currentTime < 0.1 && video.readyState < 2 && bufferAhead < 0.2;
          if (neverStarted && noRecentProgress) {
            console.warn("[HlsPlayer] Safari watchdog: stream não respondeu em 15s");
            onErr();
          }
        }, 15000);
      };
      const onLoaded = () => {
        if (destroyed) return;
        if (watchdogTimer) { window.clearTimeout(watchdogTimer); watchdogTimer = null; }
        lastProgressAtRef.current = Date.now();
        setLoading(false);
        setError(null);
        safariRetries = 0;
        if (autoPlay || tvMode) {
          const playAttempt = video.play();
          if (playAttempt && typeof playAttempt.then === "function") {
            playAttempt.then(() => syncPlaybackState(true)).catch(() => { /* noop */ });
          }
        }
      };
      const onErr = () => {
        if (destroyed) return;
        const bufferAhead = getBufferAhead();
        const hasRecentProgress = Date.now() - lastProgressAtRef.current < 4000;
        // Ignora erros enquanto o vídeo já está reproduzindo OK (eventos espúrios do Safari)
        if (hasRecentProgress || (!video.paused && video.currentTime > 0.1 && bufferAhead > 0.2)) return;
        safariRetries += 1;
        // 📊 Telemetria
        lastErrorRef.current = { msg: `native/error_${safariRetries}`, at: Date.now() };
        errorCountRef.current += 1;
        if (retryTimer) window.clearTimeout(retryTimer);
        if (safariRetries < maxSafariRetries) {
          setError(`Reconectando sinal ao vivo... (${safariRetries}/${maxSafariRetries - 1})`);
          setLoading(true);
          retryTimer = window.setTimeout(() => tryLoad(true), 900 * safariRetries);
        } else if (!tryFallback("safari error after retries")) {
          setError("Canal indisponível no momento");
          setLoading(false);
        }
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("loadeddata", markSafariProgress);
      video.addEventListener("canplay", markSafariProgress);
      video.addEventListener("playing", markSafariProgress);
      video.addEventListener("timeupdate", markSafariProgress);
      video.addEventListener("progress", markSafariProgress);
      video.addEventListener("error", onErr);
      // Cleanup específico para Safari path
      hlsRef.current = {
        destroy: () => {
          destroyed = true;
          if (retryTimer) window.clearTimeout(retryTimer);
          if (watchdogTimer) window.clearTimeout(watchdogTimer);
          video.removeEventListener("loadedmetadata", onLoaded);
          video.removeEventListener("loadeddata", markSafariProgress);
          video.removeEventListener("canplay", markSafariProgress);
          video.removeEventListener("playing", markSafariProgress);
          video.removeEventListener("timeupdate", markSafariProgress);
          video.removeEventListener("progress", markSafariProgress);
          video.removeEventListener("error", onErr);
        },
      } as any;
      tryLoad();
      return;
    }

    // Outros navegadores → HLS.js
    if (Hls.isSupported()) {
      engineRef.current = "hls.js";
      const { isSamsungTV, isSamsungBrowser } = detectSamsungTV();
      // Samsung Tizen / SamsungBrowser: CPU/decoder fracos → buffer grande,
      // sem low-latency, sem aceleração e retries mais espaçados.
      const samsungTune = isSamsungTV || isSamsungBrowser;

      const hls = new Hls({
        // Estabilidade acima de baixa latência: o JMVStream está emitindo chunks
        // curtos (1–4s). Low-latency + live-edge agressivo causa bufferStalledError.
        lowLatencyMode: false,
        backBufferLength: satelliteMode ? 120 : (samsungTune ? 90 : (lowQuality ? 12 : 60)),
        maxBufferLength: satelliteMode ? 120 : (samsungTune ? 90 : (lowQuality ? 18 : 60)),
        maxMaxBufferLength: satelliteMode ? 240 : (samsungTune ? 180 : (lowQuality ? 36 : 120)),
        maxBufferSize: satelliteMode ? 220 * 1000 * 1000 : (samsungTune ? 160 * 1000 * 1000 : (lowQuality ? 40 * 1000 * 1000 : 120 * 1000 * 1000)),
        maxBufferHole: satelliteMode ? 6 : (samsungTune ? 4 : 3),
        highBufferWatchdogPeriod: satelliteMode ? 8 : (samsungTune ? 6 : 4),
        nudgeOffset: 0.08,
        nudgeMaxRetry: 20,
        startFragPrefetch: true,
        maxStarvationDelay: satelliteMode ? 30 : (samsungTune ? 20 : 14),

        // ABR conservador: começa baixo e só sobe se a conexão provar estabilidade.
        startLevel: 0,
        abrEwmaDefaultEstimate: satelliteMode ? 450_000 : (aggressiveNetwork ? 1_500_000 : 700_000),
        abrBandWidthFactor: satelliteMode ? 0.55 : 0.65,
        abrBandWidthUpFactor: satelliteMode ? 0.2 : (samsungTune ? 0.25 : 0.35),

        // Live com folga de buffer; sem aceleração automática de playbackRate.
        liveSyncDurationCount: satelliteMode ? 10 : (samsungTune ? 8 : 6),
        liveMaxLatencyDurationCount: satelliteMode ? 36 : (samsungTune ? 28 : 20),
        liveDurationInfinity: true,
        liveSyncOnStallIncrease: 2,
        maxLiveSyncPlaybackRate: 1.0,
        preserveManualLevelOnError: false,
        fpsDroppedMonitoringPeriod: 5000,
        fpsDroppedMonitoringThreshold: 0.2,

        fragLoadingTimeOut: satelliteMode ? 45000 : 30000,
        fragLoadingMaxRetry: satelliteMode ? 60 : 45,
        fragLoadingRetryDelay: satelliteMode ? 1500 : (samsungTune ? 1000 : 800),
        fragLoadingMaxRetryTimeout: satelliteMode ? 180000 : 120000,
        manifestLoadingTimeOut: satelliteMode ? 45000 : 30000,
        manifestLoadingMaxRetry: satelliteMode ? 60 : 45,
        manifestLoadingRetryDelay: satelliteMode ? 1500 : (samsungTune ? 1000 : 800),
        manifestLoadingMaxRetryTimeout: satelliteMode ? 180000 : 120000,
        levelLoadingTimeOut: satelliteMode ? 45000 : 30000,
        levelLoadingMaxRetry: satelliteMode ? 60 : 45,
        levelLoadingRetryDelay: satelliteMode ? 1500 : (samsungTune ? 1000 : 800),
        levelLoadingMaxRetryTimeout: satelliteMode ? 180000 : 120000,

        enableWorker: !samsungTune,
        capLevelToPlayerSize: true,
        testBandwidth: !lowQuality,
        progressive: false,
      });
      hlsRef.current = hls;
      hls.loadSource(activeSrc);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        failureCountRef.current = 0;
        applyQualityStrategy();
        if (!video.paused) syncPlaybackState(true);
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
        lastProgressAtRef.current = Date.now();
        setError(null);
        setLoading(false);
        if (!video.paused) syncPlaybackState(true);
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        console.warn("[HlsPlayer]", data.type, data.details, data.fatal ? "FATAL" : "");
        // 📊 Telemetria: registra TODA falha (fatal ou não) para o painel
        lastErrorRef.current = { msg: `${data.type}/${data.details}`, at: Date.now() };
        if (data.fatal) errorCountRef.current += 1;


        // Erros não-fatais: o hls.js auto-recupera; não ficar pulando currentTime
        // a cada bufferStalledError, porque isso cria loop de travamento no ao vivo.
        if (!data.fatal) {
          if (data.details === "bufferStalledError") {
            stepDownQuality("buffer stalled");
            scheduleRecovery("buffer stalled", satelliteMode ? 2500 : 1400);
          }
          // levelLoadTimeOut não-fatal → CDN engasgou; força reload imediato
          // antes que vire fatal e o player desista.
          if (
            data.details === "levelLoadTimeOut" ||
            data.details === "manifestLoadTimeOut" ||
            data.details === "fragLoadTimeOut"
          ) {
            try { hls.startLoad(); } catch { /* noop */ }
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
              if (!recoverPlayback(data.details, true)) {
                setError("Canal indisponível no momento");
                setLoading(false);
              }
              return;
            }
            setError("Reconectando...");
            scheduleRecovery(data.details, 180 * failureCountRef.current, failureCountRef.current >= 2);
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
            scheduleRecovery("media error", 120, true);
            break;
          default:
            if (tryFallback(data.details)) return;
            if (!recoverPlayback(data.details || "unknown error", true)) {
              setError("Canal indisponível no momento");
              setLoading(false);
            }
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
  }, [activeSrc, tvMode, lowQuality, aggressiveNetwork, satelliteMode]);

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
    const TARGET_LATENCY = satelliteMode ? 20 : 8; // mais folga = menos congelamento
    const MAX_LATENCY = satelliteMode ? 45 : 24;

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

          if (drift > MAX_LATENCY) {
            // Muito atrasado → pula com folga, sem encostar na borda viva.
            try { v.currentTime = targetMediaTime; v.playbackRate = 1; } catch { /* noop */ }
          } else if (v.playbackRate !== 1) {
            v.playbackRate = 1;
          }
        } else {
          // Fallback (stream sem PDT): sincroniza pela borda do buffer, sempre
          // mantendo folga suficiente para evitar bufferStalledError.
          const latency = liveEdge - v.currentTime;
          const drift = latency - TARGET_LATENCY;
          reportSync("edge", drift);

          if (latency > MAX_LATENCY) {
            try { v.currentTime = liveEdge - TARGET_LATENCY; v.playbackRate = 1; } catch { /* noop */ }
          } else if (v.playbackRate !== 1) {
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
      const bufferAhead = (() => {
        try {
          if (v.buffered.length === 0) return 0;
          const end = v.buffered.end(v.buffered.length - 1);
          return Math.max(0, end - v.currentTime);
        } catch {
          return 0;
        }
      })();
      const advanced = v.currentTime - lastTime > 0.02;
      if (advanced) {
        lastTime = v.currentTime;
        lastProgressAtRef.current = Date.now();
        stuckCount = 0;
      } else {
        const noRecentProgress = Date.now() - lastProgressAtRef.current > 7000;
        if (!noRecentProgress) return;
        stuckCount += 1;
        if (stuckCount === 3) {
          stepDownQuality("stall watchdog");
          try {
            if (bufferAhead > 0.15 && v.buffered.length > 0) {
              const end = v.buffered.end(v.buffered.length - 1);
              if (end > v.currentTime + 0.2) v.currentTime = v.currentTime + 0.1;
            }
            v.play().catch(() => {});
          } catch { /* noop */ }
        }
        if (stuckCount === 6) {
          try { hlsRef.current?.startLoad(); } catch { /* noop */ }
        }
        if (stuckCount >= 12) {
          stuckCount = 0;
          if (!tryFallback("watchdog stall")) {
            if (!recoverPlayback("watchdog stall", true)) setupPlayer();
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrc, fallbackSrc, showSyncIndicator]);

  // 📊 Reporter de telemetria — emite snapshot a cada 1s para o painel de diagnóstico
  useEffect(() => {
    if (!onStats) return;
    const interval = setInterval(() => {
      const v = videoRef.current;
      if (!v) {
        onStats({
          engine: "idle", readyState: 0, networkState: 0, paused: true,
          currentTime: 0, bufferAhead: 0, buffered: 0, bandwidth: 0,
          currentLevel: -1, autoLevelCap: -1, levelHeight: null, levelBitrate: null,
          liveLatency: null, droppedFrames: 0,
          lastError: lastErrorRef.current?.msg || null,
          lastErrorAt: lastErrorRef.current?.at || null,
          errorCount: errorCountRef.current,
          activeSrc, usingFallback,
        });
        return;
      }
      let bufferAhead = 0;
      let buffered = 0;
      try {
        if (v.buffered.length > 0) {
          const end = v.buffered.end(v.buffered.length - 1);
          const start = v.buffered.start(0);
          bufferAhead = Math.max(0, end - v.currentTime);
          buffered = Math.max(0, end - start);
        }
      } catch { /* noop */ }

      let droppedFrames = 0;
      try {
        const q = (v as any).getVideoPlaybackQuality?.();
        if (q) droppedFrames = q.droppedVideoFrames || 0;
        else droppedFrames = (v as any).webkitDroppedFrameCount || 0;
      } catch { /* noop */ }

      const hls = hlsRef.current as any;
      const isHlsJs = engineRef.current === "hls.js" && hls && typeof hls.loadLevel === "number";

      let bandwidth = 0;
      let currentLevel = -1;
      let autoLevelCap = -1;
      let levelHeight: number | null = null;
      let levelBitrate: number | null = null;
      let liveLatency: number | null = null;

      if (isHlsJs) {
        bandwidth = hls.bandwidthEstimate || 0;
        currentLevel = typeof hls.currentLevel === "number" ? hls.currentLevel : -1;
        autoLevelCap = typeof hls.autoLevelCapping === "number" ? hls.autoLevelCapping : -1;
        const lvl = hls.levels?.[hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel];
        if (lvl) {
          levelHeight = lvl.height || null;
          levelBitrate = lvl.bitrate || null;
        }
        if (typeof hls.latency === "number" && hls.latency > 0) liveLatency = hls.latency;
      }

      onStats({
        engine: engineRef.current,
        readyState: v.readyState,
        networkState: v.networkState,
        paused: v.paused,
        currentTime: v.currentTime,
        bufferAhead,
        buffered,
        bandwidth,
        currentLevel,
        autoLevelCap,
        levelHeight,
        levelBitrate,
        liveLatency,
        droppedFrames,
        lastError: lastErrorRef.current?.msg || null,
        lastErrorAt: lastErrorRef.current?.at || null,
        errorCount: errorCountRef.current,
        activeSrc,
        usingFallback,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onStats, activeSrc, usingFallback]);

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

  const startCast = () => {
    const w = window as any;
    try {
      const ctx = w.cast?.framework?.CastContext.getInstance();
      if (!ctx) return;
      ctx.requestSession().then(() => {
        const session = ctx.getCurrentSession();
        if (!session) return;
        const mediaInfo = new w.chrome.cast.media.MediaInfo(activeSrc, "application/x-mpegURL");
        mediaInfo.streamType = w.chrome.cast.media.StreamType.LIVE;
        const request = new w.chrome.cast.media.LoadRequest(mediaInfo);
        session.loadMedia(request).catch(() => {});
      }).catch(() => {});
    } catch {
      // ignora
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
        controlsList="nodownload noplaybackrate"
        // Habilita AirPlay (iOS/Safari/Apple TV)
        {...({ "x-webkit-airplay": "allow" } as any)}
        // Não bloqueia controles remotos (Chromecast/AirPlay/Miracast)
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
          {typeof navigator !== "undefined" && !navigator.onLine ? (
            <>
              <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center animate-pulse">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <p className="text-sm text-white font-semibold">Sem conexão</p>
              <p className="text-xs text-white/70 max-w-xs">
                Aguardando Wi-Fi ou 4G voltar — vai retomar sozinho.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="w-10 h-10 text-amber-400" />
              <p className="text-sm text-white">{error}</p>
            </>
          )}
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Tentar agora
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
          {(airplayAvailable || castAvailable) && (
            <button
              onClick={airplayAvailable ? startAirplay : startCast}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
              aria-label={airplayAvailable ? "Espelhar via AirPlay" : "Espelhar via Chromecast"}
              title={airplayAvailable ? "AirPlay" : "Chromecast"}
            >
              <Cast className="w-4 h-4" />
            </button>
          )}
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
});

HlsPlayer.displayName = "HlsPlayer";

export default HlsPlayer;
