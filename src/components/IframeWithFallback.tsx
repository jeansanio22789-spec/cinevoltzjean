import { useEffect, useRef, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  src: string;
  title: string;
  poster?: string | null;
}

/**
 * Tenta carregar o conteúdo num iframe. Se em 5s não disparar onLoad
 * (X-Frame-Options/CSP recusou), mostra um overlay discreto com um botão
 * "Assistir agora" que abre a visualização interna em /externo — sem
 * mencionar a origem e sem abrir nova aba.
 */
const IframeWithFallback = ({ src, title, poster }: Props) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setBlocked(false);
    const t = setTimeout(() => {
      if (!loaded) setBlocked(true);
    }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const openInternal = () => {
    navigate(`/externo?url=${encodeURIComponent(src)}&title=${encodeURIComponent(title)}`);
  };

  return (
    <div className="absolute inset-0 bg-black">
      <iframe
        ref={ref}
        src={src}
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
        title={title}
        onLoad={() => {
          setLoaded(true);
          setBlocked(false);
        }}
      />
      {!loaded && !blocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none bg-black/80">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
          <p className="text-white/80 text-xs font-medium">Sintonizando {title}...</p>
        </div>
      )}
      {blocked && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20"
          style={
            poster
              ? {
                  backgroundImage: `url(${poster})`,
                  backgroundSize: "contain",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                }
              : undefined
          }
        >
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div className="relative z-10 flex flex-col items-center gap-4 text-center px-6">
            <h2 className="text-white text-xl font-bold">{title}</h2>
            <button
              onClick={openInternal}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-bold text-sm hover:bg-primary/90 transition-colors shadow-lg"
            >
              <Play className="w-4 h-4 fill-current" />
              Assistir agora
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IframeWithFallback;
