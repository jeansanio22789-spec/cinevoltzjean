import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  src: string;
  title: string;
  poster?: string | null;
}

/**
 * Carrega conteúdo externo SEMPRE dentro do app, sem mencionar origem.
 * Estratégia: tenta múltiplos espelhos/proxies em sequência. Se um for
 * bloqueado por X-Frame-Options/CSP (não dispara onLoad em ~5s), passa
 * automaticamente para o próximo, sem aviso, sem nova aba e sem redirect.
 */
const IframeWithFallback = ({ src, title, poster }: Props) => {
  // Gera lista de tentativas: original + espelhos via proxies de embed
  // públicos que reescrevem cabeçalhos. Tudo permanece dentro do iframe.
  const candidates = useMemo(() => {
    const list = [src];
    try {
      const enc = encodeURIComponent(src);
      // Proxies públicos que removem X-Frame-Options para permitir embed.
      list.push(`https://r.jina.ai/${src}`);
      list.push(`https://api.allorigins.win/raw?url=${enc}`);
      list.push(`https://cors.eu.org/${src}`);
    } catch {
      // ignore
    }
    return list;
  }, [src]);

  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setLoaded(false);
    const t = setTimeout(() => {
      if (!loaded) {
        // Não carregou — passa para o próximo espelho silenciosamente
        setAttempt((a) => (a + 1 < candidates.length ? a + 1 : a));
      }
    }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, candidates]);

  const currentSrc = candidates[attempt] || src;

  return (
    <div className="absolute inset-0 bg-black">
      {!loaded && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none"
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
          <div className="relative z-10 flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
            <p className="text-white/80 text-xs font-medium">Sintonizando {title}...</p>
          </div>
        </div>
      )}
      <iframe
        key={currentSrc}
        ref={ref}
        src={currentSrc}
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
        title={title}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
};

export default IframeWithFallback;
