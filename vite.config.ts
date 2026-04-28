import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// Build version (timestamp ISO) — injetado no app e em /version.json para
// permitir comparar a versão do preview com a versão publicada.
const BUILD_VERSION = new Date().toISOString();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    {
      name: "lovable-build-version",
      // Em dev, expõe /version.json com o timestamp do servidor atual
      configureServer(server: any) {
        server.middlewares.use("/version.json", (_req: any, res: any) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ version: BUILD_VERSION }));
        });
      },
      // No build de produção, escreve o version.json no dist
      generateBundle(this: any) {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ version: BUILD_VERSION }),
        });
      },
    } as any,
    VitePWA({
      registerType: "autoUpdate",
      // Use the static public/manifest.webmanifest instead of generating one
      manifest: false,
      devOptions: {
        enabled: false,
      },
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api/, /^\/functions/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,webmanifest}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/icons/"),
            handler: "CacheFirst",
            options: {
              cacheName: "pwa-icons",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "manifest.webmanifest",
        "icons/*.png",
        "screenshot-mobile.png",
      ],
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["@capacitor/core", "react", "react-dom"],
  },
}));
