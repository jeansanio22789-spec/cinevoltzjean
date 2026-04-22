import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Radio, X, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import HlsPlayer from "@/components/HlsPlayer";
import LiveClockSignal from "@/components/LiveClockSignal";

const isHls = (url: string) => /\.m3u8(\?.*)?$/i.test(url || "");

const LiveThumbnail = () => {
  const [enabled, setEnabled] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [title, setTitle] = useState("AO VIVO");
  const [closed, setClosed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["live_thumbnail_enabled", "live_stream_url", "live_stream_title"]);
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.key] = s.value; });
      const newEnabled = map.live_thumbnail_enabled !== "false";
      const newUrl = map.live_stream_url || "";
      const newTitle = map.live_stream_title || "AO VIVO";
      setEnabled((prev) => (prev === newEnabled ? prev : newEnabled));
      setStreamUrl((prev) => (prev === newUrl ? prev : newUrl));
      setTitle((prev) => (prev === newTitle ? prev : newTitle));
    };
    load();

    const channel = supabase
      .channel("live-thumb-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_settings" },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Esconde apenas no login e na própria página ao vivo (admin agora vê)
  const hide =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/ao-vivo");

  if (!enabled || closed || hide) return null;

  const openLive = () => navigate("/ao-vivo");

  return (
    <div
      className={`fixed z-40 shadow-2xl transition-all duration-300 ${
        expanded
          ? "bottom-4 right-4 w-[min(360px,90vw)]"
          : "bottom-4 right-4 w-[180px] sm:w-[220px]"
      }`}
    >
      <div className="relative bg-black rounded-xl overflow-hidden border-2 border-primary/40 ring-1 ring-black/40">
        {/* Live badge + relógio + sinal */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 flex-wrap max-w-[calc(100%-80px)]">
          <span className="flex items-center gap-1 bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-1 rounded-full animate-pulse">
            <Radio className="w-3 h-3" /> {title}
          </span>
          <LiveClockSignal size="mini" />
        </div>

        {/* Controls */}
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            title={expanded ? "Reduzir" : "Ampliar"}
            className="w-7 h-7 rounded-full bg-black/70 backdrop-blur text-white hover:bg-black flex items-center justify-center"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setClosed(true); }}
            title="Fechar"
            className="w-7 h-7 rounded-full bg-black/70 backdrop-blur text-white hover:bg-black flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Stream — sempre ativo */}
        <div className="relative aspect-video bg-black cursor-pointer" onClick={openLive}>
          {isHls(streamUrl) ? (
            <div className="pointer-events-none w-full h-full">
              <HlsPlayer src={streamUrl} autoPlay nativeControls={false} lowQuality />
            </div>
          ) : streamUrl ? (
            <iframe
              src={streamUrl}
              className="w-full h-full border-0 pointer-events-none"
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin"
              title="Transmissão ao vivo"
            />
          ) : null}
          {/* Overlay clicável */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-2">
            <span className="text-[11px] font-bold text-white drop-shadow">
              Toque para assistir em tela cheia
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveThumbnail;
