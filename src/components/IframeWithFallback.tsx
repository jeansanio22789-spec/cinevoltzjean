import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  src: string;
  title: string;
  poster?: string | null;
}

const PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-stream`;

const proxied = (url: string) => `${PROXY_BASE}?url=${encodeURIComponent(url)}`;

/**
 * Tenta carregar a URL diretamente num iframe. Se em 4s não disparar onLoad
 * (X-Frame-Options/CSP bloqueou), automaticamente reabre via proxy edge
 * function que remove esses cabeçalhos — assim sites como Globoplay
 * conseguem ser embedados sem que o usuário perceba a troca.
 */
const IframeWithFallback = ({ src, title }: Props) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [useProxy, setUseProxy] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setUseProxy(false);
    const t = setTimeout(() => {
      if (!loaded) setUseProxy(true);
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const finalSrc = useProxy ? proxied(src) : src;

  return (
    <div className="absolute inset-0 bg-black">
      <iframe
        ref={ref}
        key={finalSrc}
        src={finalSrc}
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
        title={title}
        onLoad={() => setLoaded(true)}
      />
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none bg-black/80">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
          <p className="text-white/80 text-xs font-medium">
            {useProxy ? "Conectando via servidor seguro..." : `Sintonizando ${title}...`}
          </p>
        </div>
      )}
    </div>
  );
};

export default IframeWithFallback;
