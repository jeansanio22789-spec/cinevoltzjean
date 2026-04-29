import type { CapacitorConfig } from "@capacitor/cli";

// Para gerar APK de PRODUÇÃO (instalável no celular sem depender da Lovable),
// o bloco "server" deve ficar comentado — assim o app usa os arquivos locais (webDir).
// Para desenvolvimento com hot-reload, descomente o bloco server.
const config: CapacitorConfig = {
  appId: "app.lovable.4705526e6b1747e68c13d2bb053eb366",
  appName: "StreamFlix",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  plugins: {
    ScreenOrientation: {
      orientation: "portrait",
    },
  },
  // server: {
  //   url: "https://4705526e-6b17-47e6-8c13-d2bb053eb366.lovableproject.com?forceHideBadge=true",
  //   cleartext: true,
  // },
};

export default config;
