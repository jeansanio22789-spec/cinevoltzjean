import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// PWA: prevent service worker from polluting the Lovable editor preview.
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

// Trava a orientação em retrato (celular em pé) sempre que o navegador
// permitir. Funciona em PWA instalado em Android/Chrome; iOS Safari ignora
// silenciosamente — nesse caso o lock acontece via manifest/Capacitor.
const lockPortrait = () => {
  try {
    const so: any = (screen as any).orientation;
    if (so && typeof so.lock === "function") {
      so.lock("portrait").catch(() => { /* ignora se não suportado */ });
    }
  } catch { /* ignore */ }
};
lockPortrait();
window.addEventListener("orientationchange", lockPortrait);

createRoot(document.getElementById("root")!).render(<App />);
