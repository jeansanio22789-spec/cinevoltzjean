import { useEffect, useState } from "react";
import { Download, X, Smartphone, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBranding } from "@/hooks/useBranding";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "install_prompt_dismissed_at";
const DISMISS_DAYS = 7;

const InstallAppPrompt = () => {
  const brand = useBranding();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Já instalado? Não mostra
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-ignore
      window.navigator.standalone === true;
    if (standalone) return;

    // Dismiss recente?
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const days = (Date.now() - Number(dismissed)) / (1000 * 60 * 60 * 24);
      if (days < DISMISS_DAYS) return;
    }

    // Detecta iOS (Safari não dispara beforeinstallprompt)
    const ua = window.navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua);
    if (iOS) {
      setIsIOS(true);
      setTimeout(() => setVisible(true), 1500);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setTimeout(() => setVisible(true), 1500);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferred(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4 animate-in slide-in-from-bottom duration-500">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl shadow-primary/20 overflow-hidden">
        <div className="relative p-4">
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3 pr-6">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-fuchsia-600 flex items-center justify-center shadow-lg shadow-primary/40">
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <Smartphone className="w-6 h-6 text-primary-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm leading-tight">
                Instalar {brand.name || "StreamFlix"} no seu celular
              </h3>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {isIOS
                  ? "Acesso rápido na tela inicial. Funciona offline."
                  : "Tenha acesso instantâneo, mesmo offline."}
              </p>
            </div>
          </div>

          {isIOS ? (
            <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs space-y-1.5">
              <p className="flex items-center gap-1.5">
                <span className="font-bold text-primary">1.</span>
                Toque em <Share className="inline w-3.5 h-3.5 mx-0.5" /> <span className="font-semibold">Compartilhar</span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-bold text-primary">2.</span>
                Selecione <span className="font-semibold">"Adicionar à Tela de Início"</span>
              </p>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button
                onClick={handleInstall}
                className="flex-1 gap-2 font-semibold"
                size="sm"
              >
                <Download className="w-4 h-4" />
                Instalar app
              </Button>
              <Button onClick={handleDismiss} variant="ghost" size="sm">
                Agora não
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallAppPrompt;
