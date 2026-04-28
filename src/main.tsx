import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// PWA: prevent service worker from polluting the Lovable editor preview.
// In production (published site), the SW registered by vite-plugin-pwa
// works normally. In iframes / preview hosts we proactively unregister.
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

if ((isPreviewHost || isInIframe) && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

// =============================================================
// Auto-update para apps já instalados (PWA / Capacitor)
// Verifica /version.json contra a versão do bundle e força reload
// quando há nova versão publicada. Resolve "app não recebe alterações".
// =============================================================
if (!isPreviewHost && !isInIframe) {
  const LOCAL_BUILD = (typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "").trim();
  let reloading = false;

  const forceReload = async () => {
    if (reloading) return;
    reloading = true;
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => null)));
      }
    } catch {
      /* ignore */
    }
    // bust HTTP cache
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  };

  const checkVersion = async () => {
    if (!LOCAL_BUILD) return;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { version?: string };
      const remote = (data?.version || "").trim();
      if (remote && remote !== LOCAL_BUILD) {
        await forceReload();
      }
    } catch {
      /* offline ou erro de rede — ignora */
    }
  };

  // Checa imediatamente, ao voltar foco e a cada 60s
  window.addEventListener("focus", () => void checkVersion());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkVersion();
  });
  setTimeout(() => void checkVersion(), 1500);
  setInterval(() => void checkVersion(), 60 * 1000);

  // Quando o SW novo assume controle, recarrega
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
