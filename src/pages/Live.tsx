import Navbar from "@/components/Navbar";
import { Radio, ExternalLink, Tv } from "lucide-react";

const STREAM_URL = "https://www2.meufut.xyz/bbb26";

const Live = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 px-4 md:px-12 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <span className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full animate-pulse">
            <Radio className="w-3.5 h-3.5" /> AO VIVO
          </span>
          <h1 className="text-xl md:text-2xl font-black">BBB ao Vivo</h1>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex flex-col items-center justify-center gap-6">
          <Tv className="w-16 h-16 text-muted-foreground" />
          <p className="text-lg font-semibold text-foreground">Transmissão ao vivo do BBB 26</p>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            Clique no botão abaixo para assistir à transmissão ao vivo em tela cheia.
          </p>
          <a
            href={STREAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-destructive text-destructive-foreground px-6 py-3 rounded-lg text-sm font-bold hover:bg-destructive/90 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Assistir Agora
          </a>
        </div>
      </div>
    </div>
  );
};

export default Live;
