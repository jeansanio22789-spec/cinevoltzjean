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

createRoot(document.getElementById("root")!).render(<App />);
