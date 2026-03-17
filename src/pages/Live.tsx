import Navbar from "@/components/Navbar";
import { Radio } from "lucide-react";

const STREAM_URL = "https://www2.meufut.xyz/bbb26";

const Live = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 px-4 md:px-12 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full animate-pulse">
            <Radio className="w-3.5 h-3.5" /> AO VIVO
          </span>
          <h1 className="text-xl md:text-2xl font-black">BBB ao Vivo</h1>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          <iframe
            src={STREAM_URL}
            className="w-full h-full border-0"
            allowFullScreen
            allow="autoplay; encrypted-media; fullscreen"
            title="BBB ao Vivo"
          />
        </div>
      </div>
    </div>
  );
};

export default Live;
