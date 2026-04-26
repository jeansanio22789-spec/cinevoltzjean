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

const VideoPlayer = ({ src, poster, title, onBack }: VideoPlayerProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fs, setFs] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [seeking, setSeeking] = useState(false);
  const [centerHint, setCenterHint] = useState<null | "play" | "pause" | "back" | "forward">(null);

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
    const onMeta = () => setDuration(v.duration || 0);
    const onWait = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onProgress = () => {
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onVol = () => {
      setVolume(v.volume);
      setMuted(v.muted);
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
    setShowSettings(false);
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
        src={src}
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

            {/* Velocidade */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors flex items-center gap-1"
                aria-label="Configurações"
              >
                <Settings className="w-5 h-5" />
                {speed !== 1 && (
                  <span className="text-[10px] font-bold bg-primary px-1.5 py-0.5 rounded">
                    {speed}x
                  </span>
                )}
              </button>
              {showSettings && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/95 backdrop-blur-md rounded-lg overflow-hidden ring-1 ring-white/10 shadow-2xl min-w-[120px] animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="text-[11px] text-white/60 px-3 py-2 border-b border-white/10 font-semibold uppercase tracking-wide">
                    Velocidade
                  </div>
                  {SPEEDS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setPlaybackRate(r)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center justify-between",
                        speed === r && "text-primary font-bold",
                      )}
                    >
                      <span>{r === 1 ? "Normal" : `${r}x`}</span>
                      {speed === r && <span>•</span>}
                    </button>
                  ))}
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
