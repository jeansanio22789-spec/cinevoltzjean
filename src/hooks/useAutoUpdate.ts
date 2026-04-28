import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Detecta nova versão publicada comparando /version.json com o build local.
 * Quando há atualização, exibe um toast persistente com botão "Atualizar agora".
 * Resolve o caso de PWAs/apps já instalados não receberem novas alterações.
 */
export const useAutoUpdate = () => {
  const notifiedRef = useRef(false);
  const reloadingRef = useRef(false);

  useEffect(() => {
    const isInIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    const isPreviewHost =
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com");

    // Não roda no preview/editor da Lovable
    if (isPreviewHost || isInIframe) return;

    const LOCAL_BUILD = (typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "").trim();
    if (!LOCAL_BUILD) return;

    const applyUpdate = async () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            regs.map(async (r) => {
              try {
                if (r.waiting) r.waiting.postMessage({ type: "SKIP_WAITING" });
                await r.update();
              } catch {
                /* ignore */
              }
            })
          );
        }
      } catch {
        /* ignore */
      }
      const url = new URL(window.location.href);
      url.searchParams.set("_v", Date.now().toString());
      window.location.replace(url.toString());
    };

    const showUpdateToast = () => {
      if (notifiedRef.current) return;
      notifiedRef.current = true;
      toast("Nova versão disponível 🎉", {
        description: "Toque em Atualizar para carregar a versão mais recente.",
        duration: Infinity,
        action: {
          label: "Atualizar agora",
          onClick: () => void applyUpdate(),
        },
      });
    };

    const checkVersion = async () => {
      if (notifiedRef.current) return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        const remote = (data?.version || "").trim();
        if (remote && remote !== LOCAL_BUILD) showUpdateToast();
      } catch {
        /* offline — ignora */
      }
    };

    const onFocus = () => void checkVersion();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const initial = window.setTimeout(() => void checkVersion(), 1500);
    const interval = window.setInterval(() => void checkVersion(), 60 * 1000);

    // Quando o SW novo assume o controle, também notifica
    const onControllerChange = () => showUpdateToast();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    }

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(initial);
      window.clearInterval(interval);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      }
    };
  }, []);
};
