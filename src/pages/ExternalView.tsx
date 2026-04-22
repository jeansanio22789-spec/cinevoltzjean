import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";

/**
 * Tela cheia que carrega um conteúdo externo dentro do app.
 * - Tenta primeiro via iframe (funciona quando o site permite embed).
 * - Se em 4s o iframe não carregar (X-Frame-Options/CSP), faz uma
 *   navegação direta no MESMO contexto via window.location.replace —
 *   isso evita abrir nova aba e mantém a sensação de "ainda dentro do app".
 *
 * Em PWA standalone (instalado), a navegação permanece dentro da janela
 * do app, sem barra de navegador.
 */
const ExternalView = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const url = params.get("url");
  const title = params.get("title") || "Ao vivo";

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [fallbackTriggered, setFallbackTriggered] = useState(false);

  useEffect(() => {
    if (!url) return;
    // Se em 4s não carregou, redireciona o navegador para a URL.
    // Isso preserva o histórico (botão voltar do navegador funciona).
    const t = setTimeout(() => {
      if (!loaded && !fallbackTriggered) {
        setFallbackTriggered(true);
        window.location.replace(url);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [url, loaded, fallbackTriggered]);

  if (!url) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">Endereço não informado.</p>
        <button
          onClick={() => navigate(-1)}
          className="bg-primary text-primary-foreground px-5 py-2 rounded font-semibold text-sm"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header minimalista — não menciona origem */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/80 backdrop-blur-md border-b border-white/10 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white text-sm font-medium px-2 py-1 rounded hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <h1 className="text-white text-sm font-semibold truncate px-2">{title}</h1>
        <button
          onClick={() => {
            setLoaded(false);
            setFallbackTriggered(false);
            if (iframeRef.current) {
              // força reload do iframe
              const u = iframeRef.current.src;
              iframeRef.current.src = "about:blank";
              setTimeout(() => {
                if (iframeRef.current) iframeRef.current.src = u;
              }, 50);
            }
          }}
          className="text-white p-2 rounded hover:bg-white/10"
          aria-label="Recarregar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Conteúdo */}
      <div className="relative flex-1 bg-black">
        {!loaded && !fallbackTriggered && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
            <p className="text-white/70 text-xs">Carregando...</p>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={url}
          className="w-full h-full border-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
          allowFullScreen
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          title={title}
        />
      </div>
    </div>
  );
};

export default ExternalView;
