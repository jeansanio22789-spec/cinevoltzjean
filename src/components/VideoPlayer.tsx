import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Captions,
  Languages,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import Hls from "hls.js";
import { cn } from "@/lib/utils";
import {
  getPlayerPrefs,
  updatePlayerPrefs,
  pickQualityIndex,
  pickTrackId,
} from "@/lib/playerPrefs";

interface QualityLevel {
  index: number; // -1 = auto
  height: number; // 0 = auto
  bitrate: number;
  label: string;
}

interface AudioTrack {
  id: number;
  name: string;
  lang?: string;
}

interface SubtitleTrack {
  id: number;
  name: string;
  lang?: string;
}

interface VideoPlayerProps {
  src: string;
  poster?: string | null;
  title?: string;
  onBack?: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const labelForHeight = (h: number, bitrate?: number): string => {
  if (h >= 4320) return "8K (4320p)";
  if (h >= 2160) return "4K UHD (2160p)";
  if (h >= 1440) return "2K (1440p)";
  if (h >= 1080) return "Full HD (1080p)";
  if (h >= 720) return "HD (720p)";
  if (h >= 480) return "SD (480p)";
  if (h > 0) return `${h}p`;
  if (bitrate) return `${Math.round(bitrate / 1000)} kbps`;
  return "Auto";
};

// ---------- Subcomponentes do menu de configurações ----------
const SettingsRow = ({
  icon,
  label,
  value,
  onClick,
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors",
      disabled
        ? "opacity-40 cursor-not-allowed"
        : "hover:bg-white/10 active:bg-white/20",
    )}
  >
    {icon && <span className="text-white/70">{icon}</span>}
    <span className="flex-1 text-white font-medium">{label}</span>
    <span className="text-xs text-white/60 truncate max-w-[100px]">{value}</span>
    <span className="text-white/40">›</span>
  </button>
);

const SettingsList = <T extends string | number>({
  title,
  items,
  activeId,
  onPick,
  onBack,
}: {
  title: string;
  items: { id: T; label: string; hint?: string }[];
  activeId: T;
  onPick: (id: T) => void;
  onBack: () => void;
}) => (
  <div>
    <button
      type="button"
      onClick={onBack}
      className="w-full flex items-center gap-2 px-3 py-2 border-b border-white/10 text-xs text-white/70 font-semibold uppercase tracking-wide hover:bg-white/5"
    >
      <span>‹</span>
      <span>{title}</span>
    </button>
    <div className="py-1">
      {items.map((it) => (
        <button
          key={String(it.id)}
          type="button"
          onClick={() => onPick(it.id)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors",
            activeId === it.id && "text-primary font-bold",
          )}
        >
          <span className="w-4 text-center">{activeId === it.id ? "•" : ""}</span>
          <span className="flex-1 text-left">{it.label}</span>
          {it.hint && (
            <span
              className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                it.hint === "4K"
                  ? "bg-accent text-accent-foreground"
                  : "bg-white/10 text-white/70",
              )}
            >
              {it.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  </div>
);


const VideoPlayer = ({ src, poster, title, onBack }: VideoPlayerProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => getPlayerPrefs().volume ?? 1);
  const [muted, setMuted] = useState(() => getPlayerPrefs().muted ?? false);
  const [fs, setFs] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsTab, setSettingsTab] = useState<
    null | "main" | "speed" | "quality" | "audio" | "subs"
  >(null);
  const [speed, setSpeed] = useState(() => getPlayerPrefs().speed ?? 1);
  const [seeking, setSeeking] = useState(false);
  const [centerHint, setCenterHint] = useState<null | "play" | "pause" | "back" | "forward">(null);

  // ---- HLS / qualidade / áudio / legendas ----
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = auto
  const [autoActiveHeight, setAutoActiveHeight] = useState<number>(0);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentAudio, setCurrentAudio] = useState<number>(-1);
  const [subTracks, setSubTracks] = useState<SubtitleTrack[]>([]);
  const [currentSub, setCurrentSub] = useState<number>(-1);

  // Resolução nativa do <video> (para MP4: descobre se é 4K/1080p/etc)
  const [nativeHeight, setNativeHeight] = useState<number>(0);

  const isHls = useMemo(() => /\.m3u8(\?.*)?$/i.test(src), [src]);
  const showSettings = settingsTab !== null;

  // 📺 Lista de qualidades exibida no menu.
  // Para HLS: usa as do manifest (já em `qualities`).
  // Para MP4: gera opções fixas até a resolução nativa do arquivo
  //   (downscale via CSS — útil em telas pequenas e p/ economizar dados/bateria).
  const FALLBACK_HEIGHTS = [2160, 1440, 1080, 720, 480, 360];
  const displayQualities: QualityLevel[] = useMemo(() => {
    if (qualities.length > 0) return qualities;
    if (!nativeHeight) return [];
    return FALLBACK_HEIGHTS.filter((h) => h <= nativeHeight).map((h, i) => ({
      index: i,
      height: h,
      bitrate: 0,
      label: labelForHeight(h),
    }));
  }, [qualities, nativeHeight]);

  // Altura efetiva para aplicar downscale CSS (apenas MP4 e quando não-Auto)
  const cssScaleHeight = useMemo(() => {
    if (qualities.length > 0) return 0; // HLS lida sozinho
    if (currentQuality === -1) return 0; // Auto = nativo
    const q = displayQualities.find((d) => d.index === currentQuality);
    return q?.height ?? 0;
  }, [qualities.length, currentQuality, displayQualities]);


  // ---- Auto-hide controles ----
  const armHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    hideTimerRef.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 2800);
  }, []);

  // ---- Listeners do <video> ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrent(v.currentTime);
    const onMeta = () => {
      setDuration(v.duration || 0);
      // Detecta resolução nativa do arquivo (para MP4 popular menu de qualidade)
      if (v.videoHeight) setNativeHeight(v.videoHeight);
    };
    const onWait = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onProgress = () => {
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    let volSaveTimer: number | null = null;
    const onVol = () => {
      setVolume(v.volume);
      setMuted(v.muted);
      // Salva com debounce para não escrever no localStorage a cada frame do slider
      if (volSaveTimer) window.clearTimeout(volSaveTimer);
      volSaveTimer = window.setTimeout(() => {
        updatePlayerPrefs({ volume: v.volume, muted: v.muted });
      }, 300);
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("waiting", onWait);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("canplay", onPlaying);
    v.addEventListener("progress", onProgress);
    v.addEventListener("volumechange", onVol);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("waiting", onWait);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("canplay", onPlaying);
      v.removeEventListener("progress", onProgress);
      v.removeEventListener("volumechange", onVol);
    };
  }, []);

  // ---- Aplica preferências (volume/velocidade) ao trocar de filme ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const prefs = getPlayerPrefs();
    if (typeof prefs.volume === "number") v.volume = prefs.volume;
    if (typeof prefs.muted === "boolean") v.muted = prefs.muted;
    if (typeof prefs.speed === "number") v.playbackRate = prefs.speed;
  }, [src]);

  // ---- HLS: streams adaptativos com qualidade até 4K + faixas de áudio/legendas ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Limpa instância anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setQualities([]);
    setAudioTracks([]);
    setSubTracks([]);
    setCurrentQuality(-1);
    setCurrentAudio(-1);
    setCurrentSub(-1);
    setAutoActiveHeight(0);

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        // ⚡ Configurações para máxima qualidade + carregamento rápido
        capLevelToPlayerSize: false, // permite escolher 4K mesmo em janela menor
        startLevel: -1, // começa em Auto
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 30,
        maxMaxBufferLength: 120,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(v);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const prefs = getPlayerPrefs();

        const levels: QualityLevel[] = hls.levels.map((lvl, i) => ({
          index: i,
          height: lvl.height,
          bitrate: lvl.bitrate,
          label: labelForHeight(lvl.height, lvl.bitrate),
        }));
        // Ordena do maior para o menor
        levels.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
        setQualities(levels);

        // 🎯 Aplica qualidade preferida (se houver e bater com algum nível)
        const preferredQ = pickQualityIndex(levels, prefs.qualityHeight);
        if (preferredQ !== -1) {
          hls.currentLevel = preferredQ;
          setCurrentQuality(preferredQ);
        }

        const audios: AudioTrack[] = hls.audioTracks.map((a, i) => ({
          id: i,
          name: a.name || a.lang || `Faixa ${i + 1}`,
          lang: a.lang,
        }));
        setAudioTracks(audios);

        // 🎯 Aplica faixa de áudio preferida (por idioma)
        const preferredA = pickTrackId(audios, prefs.audioLang, prefs.audioName);
        if (preferredA !== -1 && preferredA !== hls.audioTrack) {
          hls.audioTrack = preferredA;
          setCurrentAudio(preferredA);
        } else {
          setCurrentAudio(hls.audioTrack);
        }

        const subs: SubtitleTrack[] = hls.subtitleTracks.map((s, i) => ({
          id: i,
          name: s.name || s.lang || `Legenda ${i + 1}`,
          lang: s.lang,
        }));
        setSubTracks(subs);

        // 🎯 Aplica legenda preferida ("off" desliga; idioma seleciona)
        if (prefs.subLang === "off") {
          hls.subtitleTrack = -1;
          setCurrentSub(-1);
        } else if (prefs.subLang) {
          const preferredS = pickTrackId(subs, prefs.subLang, prefs.subName);
          if (preferredS !== -1) {
            hls.subtitleTrack = preferredS;
            setCurrentSub(preferredS);
          } else {
            setCurrentSub(hls.subtitleTrack);
          }
        } else {
          setCurrentSub(hls.subtitleTrack);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        const lvl = hls.levels[data.level];
        if (lvl) setAutoActiveHeight(lvl.height);
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) => {
        setCurrentAudio(data.id);
      });

      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_e, data) => {
        setCurrentSub(data.id);
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          console.warn("HLS fatal error:", data);
          // Tenta recuperar
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        }
      });
    } else {
      // Vídeo regular (mp4/webm/etc) ou HLS nativo (Safari)
      v.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, isHls]);

  // ---- Fullscreen ----
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFs = useCallback(async () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }, []);

  // ---- Ações ----
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setCenterHint("play");
    } else {
      v.pause();
      setCenterHint("pause");
    }
    window.setTimeout(() => setCenterHint(null), 500);
    armHide();
  }, [armHide]);

  const seek = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    setCenterHint(delta > 0 ? "forward" : "back");
    window.setTimeout(() => setCenterHint(null), 500);
    armHide();
  }, [armHide]);

  const onSeekBar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const t = (parseFloat(e.target.value) / 100) * duration;
    v.currentTime = t;
    setCurrent(t);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  };

  const onVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    v.muted = val === 0;
  };

  const setPlaybackRate = (r: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = r;
    setSpeed(r);
    updatePlayerPrefs({ speed: r });
    setSettingsTab(null);
  };

  const toggleSettings = () => {
    setSettingsTab((t) => (t === null ? "main" : null));
    armHide();
  };

  // ---- Atalhos de teclado ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowright":
        case "l":
          seek(10);
          break;
        case "arrowleft":
        case "j":
          seek(-10);
          break;
        case "f":
          toggleFs();
          break;
        case "m":
          toggleMute();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seek, toggleFs]);

  // ---- Auto play inicial ----
  useEffect(() => {
    armHide();
  }, [armHide]);

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full bg-black overflow-hidden select-none group"
      onMouseMove={armHide}
      onTouchStart={armHide}
      onClick={(e) => {
        // Clique simples no vídeo (não nos controles) → play/pause
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "VIDEO") {
          togglePlay();
        }
      }}
      onDoubleClick={(e) => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        if (x < rect.width / 2) seek(-10);
        else seek(10);
      }}
    >
      <video
        ref={videoRef}
        poster={poster || undefined}
        autoPlay
        playsInline
        className="w-full h-full object-contain bg-black"
      />

      {/* Loading spinner central */}
      {waiting && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-14 h-14 text-white animate-spin drop-shadow-lg" />
        </div>
      )}

      {/* Hint central de ação (play/pause/seek) */}
      {centerHint && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 backdrop-blur-md rounded-full p-5 animate-in fade-in zoom-in duration-200">
            {centerHint === "play" && <Play className="w-10 h-10 text-white fill-white" />}
            {centerHint === "pause" && <Pause className="w-10 h-10 text-white fill-white" />}
            {centerHint === "back" && <RotateCcw className="w-10 h-10 text-white" />}
            {centerHint === "forward" && <RotateCw className="w-10 h-10 text-white" />}
          </div>
        </div>
      )}

      {/* Overlay de controles */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo: voltar + título (gradiente) */}
        <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent px-3 py-3 flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 -ml-1 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
          )}
          {title && (
            <h2 className="text-white text-sm md:text-base font-semibold truncate flex-1 drop-shadow-md">
              {title}
            </h2>
          )}
        </div>

        {/* Centro: botão grande de play quando pausado */}
        <div className="flex-1 flex items-center justify-center">
          {!playing && !waiting && (
            <button
              type="button"
              onClick={togglePlay}
              className="bg-white/15 hover:bg-white/25 backdrop-blur-md rounded-full p-6 transition-all hover:scale-110 active:scale-95 ring-1 ring-white/20"
              aria-label="Reproduzir"
            >
              <Play className="w-12 h-12 text-white fill-white ml-1" />
            </button>
          )}
        </div>

        {/* Base: controles completos */}
        <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-3 pt-8 space-y-2">
          {/* Barra de progresso */}
          <div className="relative h-6 flex items-center group/seek">
            {/* Buffer */}
            <div className="absolute left-0 right-0 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-white/40"
                style={{ width: `${bufPct}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Bolinha */}
            <div
              className={cn(
                "absolute h-3 w-3 rounded-full bg-primary shadow-lg pointer-events-none transition-transform",
                seeking ? "scale-150" : "scale-0 group-hover/seek:scale-100",
              )}
              style={{ left: `calc(${pct}% - 6px)` }}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={0.01}
              value={pct}
              onChange={onSeekBar}
              onPointerDown={() => setSeeking(true)}
              onPointerUp={() => setSeeking(false)}
              className="absolute inset-0 w-full h-6 opacity-0 cursor-pointer"
              aria-label="Posição do vídeo"
            />
          </div>

          {/* Linha de botões */}
          <div className="flex items-center gap-1.5 text-white">
            <button
              type="button"
              onClick={togglePlay}
              className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
              aria-label={playing ? "Pausar" : "Reproduzir"}
            >
              {playing ? (
                <Pause className="w-6 h-6 fill-white" />
              ) : (
                <Play className="w-6 h-6 fill-white" />
              )}
            </button>

            <button
              type="button"
              onClick={() => seek(-10)}
              className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors hidden sm:block"
              aria-label="Voltar 10 segundos"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => seek(10)}
              className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors hidden sm:block"
              aria-label="Avançar 10 segundos"
            >
              <RotateCw className="w-5 h-5" />
            </button>

            {/* Volume (desktop) */}
            <div className="hidden md:flex items-center gap-1 group/vol">
              <button
                type="button"
                onClick={toggleMute}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                aria-label={muted ? "Ativar som" : "Silenciar"}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={onVolume}
                className="w-0 group-hover/vol:w-20 h-1 transition-all duration-300 accent-primary cursor-pointer"
              />
            </div>

            {/* Volume (mobile) */}
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 rounded-full hover:bg-white/10 transition-colors md:hidden"
              aria-label={muted ? "Ativar som" : "Silenciar"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>

            {/* Tempo */}
            <div className="text-xs font-mono tabular-nums ml-1 opacity-90">
              <span>{fmt(current)}</span>
              <span className="opacity-60"> / {fmt(duration)}</span>
            </div>

            <div className="flex-1" />

            {/* Configurações: qualidade / áudio / legendas / velocidade */}
            <div className="relative">
              <button
                type="button"
                onClick={toggleSettings}
                className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors flex items-center gap-1"
                aria-label="Configurações"
              >
                <Settings className={cn("w-5 h-5 transition-transform", showSettings && "rotate-90")} />
                {currentQuality === -1 && autoActiveHeight >= 2160 && (
                  <span className="text-[9px] font-bold bg-accent text-accent-foreground px-1 py-0.5 rounded leading-none">
                    4K
                  </span>
                )}
                {currentQuality !== -1 && qualities[currentQuality]?.height >= 2160 && (
                  <span className="text-[9px] font-bold bg-accent text-accent-foreground px-1 py-0.5 rounded leading-none">
                    4K
                  </span>
                )}
                {speed !== 1 && (
                  <span className="text-[10px] font-bold bg-primary px-1.5 py-0.5 rounded">
                    {speed}x
                  </span>
                )}
              </button>

              {showSettings && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/95 backdrop-blur-md rounded-xl overflow-hidden ring-1 ring-white/10 shadow-2xl min-w-[220px] max-h-[60vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-150">
                  {settingsTab === "main" && (
                    <div className="py-1">
                      <SettingsRow
                        icon={<Sparkles className="w-4 h-4" />}
                        label="Qualidade"
                        value={
                          currentQuality === -1
                            ? autoActiveHeight
                              ? `Auto (${autoActiveHeight}p)`
                              : "Auto"
                            : qualities[currentQuality]?.label || "—"
                        }
                        onClick={() => setSettingsTab("quality")}
                        disabled={qualities.length === 0}
                      />
                      <SettingsRow
                        icon={<Languages className="w-4 h-4" />}
                        label="Áudio / Dublagem"
                        value={
                          audioTracks.find((t) => t.id === currentAudio)?.name ||
                          "Padrão"
                        }
                        onClick={() => setSettingsTab("audio")}
                        disabled={audioTracks.length <= 1}
                      />
                      <SettingsRow
                        icon={<Captions className="w-4 h-4" />}
                        label="Legendas"
                        value={
                          currentSub === -1
                            ? "Desligadas"
                            : subTracks.find((t) => t.id === currentSub)?.name || "Padrão"
                        }
                        onClick={() => setSettingsTab("subs")}
                        disabled={subTracks.length === 0}
                      />
                      <SettingsRow
                        label="Velocidade"
                        value={speed === 1 ? "Normal" : `${speed}x`}
                        onClick={() => setSettingsTab("speed")}
                      />
                    </div>
                  )}

                  {settingsTab === "quality" && (
                    <SettingsList
                      title="Qualidade"
                      onBack={() => setSettingsTab("main")}
                      items={[
                        {
                          id: -1,
                          label: "Auto",
                          hint: autoActiveHeight ? `${autoActiveHeight}p` : undefined,
                        },
                        ...qualities.map((q) => ({
                          id: q.index,
                          label: q.label,
                          hint: q.height >= 2160 ? "4K" : q.height >= 1080 ? "HD" : undefined,
                        })),
                      ]}
                      activeId={currentQuality}
                      onPick={(id) => {
                        setCurrentQuality(id);
                        if (hlsRef.current) hlsRef.current.currentLevel = id;
                        // 💾 Salva preferência (altura ou 0 = Auto)
                        const h = id === -1 ? 0 : qualities.find((q) => q.index === id)?.height ?? 0;
                        updatePlayerPrefs({ qualityHeight: h });
                        setSettingsTab(null);
                      }}
                    />
                  )}

                  {settingsTab === "audio" && (
                    <SettingsList
                      title="Áudio / Dublagem"
                      onBack={() => setSettingsTab("main")}
                      items={audioTracks.map((t) => ({
                        id: t.id,
                        label: t.name,
                        hint: t.lang?.toUpperCase(),
                      }))}
                      activeId={currentAudio}
                      onPick={(id) => {
                        setCurrentAudio(id);
                        if (hlsRef.current) hlsRef.current.audioTrack = id;
                        // 💾 Salva por idioma (mais portável entre filmes)
                        const t = audioTracks.find((tr) => tr.id === id);
                        updatePlayerPrefs({ audioLang: t?.lang, audioName: t?.name });
                        setSettingsTab(null);
                      }}
                    />
                  )}

                  {settingsTab === "subs" && (
                    <SettingsList
                      title="Legendas"
                      onBack={() => setSettingsTab("main")}
                      items={[
                        { id: -1, label: "Desligadas" },
                        ...subTracks.map((t) => ({
                          id: t.id,
                          label: t.name,
                          hint: t.lang?.toUpperCase(),
                        })),
                      ]}
                      activeId={currentSub}
                      onPick={(id) => {
                        setCurrentSub(id);
                        if (hlsRef.current) hlsRef.current.subtitleTrack = id;
                        // 💾 Salva preferência ("off" ou idioma)
                        if (id === -1) {
                          updatePlayerPrefs({ subLang: "off", subName: undefined });
                        } else {
                          const t = subTracks.find((tr) => tr.id === id);
                          updatePlayerPrefs({ subLang: t?.lang, subName: t?.name });
                        }
                        setSettingsTab(null);
                      }}
                    />
                  )}

                  {settingsTab === "speed" && (
                    <SettingsList
                      title="Velocidade"
                      onBack={() => setSettingsTab("main")}
                      items={SPEEDS.map((r) => ({
                        id: r,
                        label: r === 1 ? "Normal" : `${r}x`,
                      }))}
                      activeId={speed}
                      onPick={(id) => setPlaybackRate(id as number)}
                    />
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleFs}
              className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
              aria-label={fs ? "Sair de tela cheia" : "Tela cheia"}
            >
              {fs ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
