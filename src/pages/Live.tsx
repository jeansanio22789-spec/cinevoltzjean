import Navbar from "@/components/Navbar";
import HlsPlayer from "@/components/HlsPlayer";
import { Radio, Tv } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Detecta se a URL é HLS (.m3u8), senão cai pro iframe (compatível com links antigos)
const isHls = (url: string) => /\.m3u8(\?.*)?$/i.test(url || "");

const Live = () => {
  const [url, setUrl] = useState<string>("");
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
      setUrl(map.live_stream_url || "");
      if (map.live_stream_title) setTitle(map.live_stream_title);
      setLoaded(true);
    };
    load();

    // Atualiza em tempo real quando o admin trocar o link
    const channel = supabase
      .channel("live-page-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_settings" },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
          {!url ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
              <Tv className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-sm">
                Nenhuma transmissão configurada. Configure o link em <b>Admin → Configurações → live_stream_url</b>.
              </p>
            </div>
          ) : isHls(url) ? (
            <HlsPlayer src={url} autoPlay />
          ) : (
            // Fallback para links de iframe (YouTube, sites etc.)
            <iframe
              src={url}
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
              referrerPolicy="strict-origin-when-cross-origin"
              title={title}
            />
          )}
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-3">
          Player nativo HLS — toca direto no app, sem YouTube.
        </p>
      </div>
    </div>
  );
};

export default Live;
