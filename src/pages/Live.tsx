import Navbar from "@/components/Navbar";
import { Radio, Tv, AlertTriangle } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ⚠️ Para trocar o vídeo, mude no painel admin (Configurações → live_stream_url)
// ou edite o fallback abaixo. O vídeo precisa PERMITIR embed (caso contrário, dá erro 150/153).
const FALLBACK_VIDEO_ID = "jfKfPfyJRdk"; // lofi hip hop — sempre permite embed (placeholder)

const extractYouTubeId = (url: string): string | null => {
  if (!url) return null;
  // Aceita ID puro
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : null;
};

const Live = () => {
  const [videoId, setVideoId] = useState<string>(FALLBACK_VIDEO_ID);
  const [title, setTitle] = useState("AO VIVO");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["live_stream_url", "live_stream_title"]);
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.key] = s.value; });
      const id = extractYouTubeId(map.live_stream_url || "");
      if (id) setVideoId(id);
      if (map.live_stream_title) setTitle(map.live_stream_title);
      setLoaded(true);
    };
    load();
  }, []);

  const streamUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({
      autoplay: "1",
      mute: "1",
      playsinline: "1",
      controls: "1",
      modestbranding: "1",
      rel: "0",
      fs: "1",
      iv_load_policy: "3",
      showinfo: "0",
      enablejsapi: "1",
      origin,
    });
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
  }, [videoId]);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 flex justify-center">
          <Tv className="w-8 h-8 text-muted-foreground animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 px-4 md:px-12 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full animate-pulse">
            <Radio className="w-3.5 h-3.5" /> AO VIVO
          </span>
          <h1 className="text-xl md:text-2xl font-black">{title}</h1>
          <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider hidden sm:inline">
            Transmissão exclusiva
          </span>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          <iframe
            key={videoId}
            src={streamUrl}
            className="w-full h-full border-0"
            allowFullScreen
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
            title={title}
          />
        </div>

        <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p>
            Se aparecer <b>"Assistir o vídeo no YouTube"</b> ou <b>Erro 150/153</b>, o canal bloqueou a reprodução fora do YouTube — esse vídeo específico não pode tocar dentro do app.
            Use no painel admin um link de transmissão que <b>permita incorporação</b>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Live;
