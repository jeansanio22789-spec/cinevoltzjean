import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import Navbar from "@/components/Navbar";
import { Radio, Volume2, VolumeX, Maximize, Users } from "lucide-react";

const STREAM_URL = "https://live-hls-web-aje.getaj.net/AJE/01.m3u8"; // placeholder — replace with real BBB stream

const Live = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(STREAM_URL);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setError(true);
      });
      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = STREAM_URL;
    }
  }, []);

  const toggleFullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 px-4 md:px-12 max-w-6xl mx-auto">
        {/* Live badge */}
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full animate-pulse">
            <Radio className="w-3.5 h-3.5" /> AO VIVO
          </span>
          <h1 className="text-xl md:text-2xl font-black">BBB ao Vivo</h1>
        </div>

        {/* Player */}
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Radio className="w-10 h-10" />
              <p className="font-medium">Transmissão indisponível</p>
              <p className="text-xs">Verifique a URL do stream ou tente novamente mais tarde</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              muted={muted}
              playsInline
              className="w-full h-full object-contain"
            />
          )}

          {/* Controls overlay */}
          {!error && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 flex items-center justify-between">
              <button
                onClick={() => setMuted(!muted)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                {muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
              </button>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-white/70">
                  <Users className="w-3.5 h-3.5" /> Ao vivo
                </span>
                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <Maximize className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          Assista à transmissão ao vivo 24 horas. Para alterar a URL do stream, edite a constante <code className="text-accent">STREAM_URL</code> em <code className="text-accent">src/pages/Live.tsx</code>.
        </p>
      </div>
    </div>
  );
};

export default Live;
