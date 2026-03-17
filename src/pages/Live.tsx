import Navbar from "@/components/Navbar";
import { Radio, ExternalLink, Tv } from "lucide-react";
import { useState } from "react";

const STREAM_URL = "https://www2.meufut.xyz/bbb26";

const Live = () => {
  const [loadError, setLoadError] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 px-4 md:px-12 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full animate-pulse">
            <Radio className="w-3.5 h-3.5" /> AO VIVO
          </span>
          <h1 className="text-xl md:text-2xl font-black">BBB ao Vivo</h1>
          <a
            href={STREAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir em nova aba
          </a>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          {loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <Tv className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                O site bloqueia reprodução embutida.
              </p>
              <a
                href={STREAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-destructive text-destructive-foreground px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-destructive/90 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Assistir Agora
              </a>
            </div>
          ) : (
            <iframe
              src={STREAM_URL}
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
              title="BBB ao Vivo"
              onError={() => setLoadError(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Live;
