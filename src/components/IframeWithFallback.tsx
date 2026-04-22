import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";

interface Props {
  src: string;
  title: string;
  poster?: string | null;
}

/**
 * Iframe que detecta automaticamente quando a página externa bloqueia embed
 * (X-Frame-Options / CSP frame-ancestors) e mostra um botão para abrir o
 * conteúdo dentro do app via /externo, sem nova aba e sem aviso de origem.
 */
const IframeWithFallback = ({ src, title, poster }: Props) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setBlocked(false);
    setLoaded(false);
    const t = setTimeout(() => {
      if (!loaded) setBlocked(true);
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const openInternal = () => {
    navigate(`/externo?url=${encodeURIComponent(src)}&title=${encodeURIComponent(title)}`);
  };

  if (blocked) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black"
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
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
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
    );
  }

  return (
    <iframe
      ref={ref}
      src={src}
      className="w-full h-full border-0"
      allowFullScreen
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
      title={title}
      onLoad={() => setLoaded(true)}
    />
  );
};

export default IframeWithFallback;
