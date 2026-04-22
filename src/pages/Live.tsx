import Navbar from "@/components/Navbar";
import { Radio, Tv } from "lucide-react";
import { useState, useMemo } from "react";

const YT_VIDEO_ID = "ABVQXgr2LW4";

const Live = () => {
  const [loadError, setLoadError] = useState(false);

  // Player nocookie com parâmetros que removem botões externos do YouTube
  // e impedem que o vídeo "saia" do app.
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
      disablekb: "1",
      showinfo: "0",
      origin,
    });
    return `https://www.youtube-nocookie.com/embed/${YT_VIDEO_ID}?${params.toString()}`;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 px-4 md:px-12 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full animate-pulse">
            <Radio className="w-3.5 h-3.5" /> AO VIVO
          </span>
          <h1 className="text-xl md:text-2xl font-black">SBT ao Vivo</h1>
          <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">
            Transmissão exclusiva
          </span>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          {loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <Tv className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Não foi possível carregar a transmissão.
              </p>
            </div>
          ) : (
            <>
              <iframe
                src={streamUrl}
                className="w-full h-full border-0"
                allowFullScreen
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                title="SBT ao Vivo"
                onError={() => setLoadError(true)}
              />
              {/* Bloqueia o clique no logo "YouTube" no canto inferior direito
                  que abriria o vídeo fora do app */}
              <div
                className="absolute bottom-0 right-0 w-24 h-10 z-10 cursor-default"
                aria-hidden="true"
              />
            </>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-3">
          Para assistir em tela cheia, toque no botão de tela cheia do player.
        </p>
      </div>
    </div>
  );
};

export default Live;
