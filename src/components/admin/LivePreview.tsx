import { useState, useRef } from "react";
import {
  Smartphone, Monitor, Tablet, RefreshCw, ExternalLink, Maximize2,
  X, Eye, Wifi,
} from "lucide-react";

type Device = "mobile" | "tablet" | "desktop";

const DEVICE_SIZES: Record<Device, { w: number; h: number; label: string; icon: any }> = {
  mobile: { w: 390, h: 720, label: "Mobile", icon: Smartphone },
  tablet: { w: 768, h: 720, label: "Tablet", icon: Tablet },
  desktop: { w: 1280, h: 720, label: "Desktop", icon: Monitor },
};

const ROUTES = [
  { path: "/", label: "Home" },
  { path: "/pricing", label: "Planos" },
  { path: "/live", label: "Ao Vivo" },
  { path: "/login", label: "Login" },
  { path: "/minha-conta", label: "Conta" },
];

const LivePreview = () => {
  const [device, setDevice] = useState<Device>("mobile");
  const [route, setRoute] = useState("/");
  const [fullscreen, setFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const baseUrl = window.location.origin;
  const previewUrl = `${baseUrl}${route}`;
  const size = DEVICE_SIZES[device];

  const reload = () => setReloadKey((k) => k + 1);

  const FrameContent = (
    <div className="relative w-full h-full flex items-center justify-center bg-black/40 overflow-hidden">
      <div
        className="relative bg-background rounded-[28px] border-4 border-zinc-800 shadow-2xl overflow-hidden transition-all duration-300"
        style={{
          width: `min(${size.w}px, 100%)`,
          aspectRatio: `${size.w} / ${size.h}`,
          maxHeight: "100%",
        }}
      >
        {device === "mobile" && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-4 bg-zinc-900 rounded-b-2xl z-10 flex items-center justify-center gap-1">
            <div className="w-1 h-1 rounded-full bg-zinc-700" />
            <div className="w-8 h-1 rounded-full bg-zinc-800" />
          </div>
        )}
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={previewUrl}
          title="Preview ao vivo"
          className="w-full h-full border-0 bg-background"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>

      {/* Live indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded-full border border-accent/30">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
        </span>
        <span className="text-[10px] uppercase tracking-wider font-bold text-accent">Ao vivo</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="admin-card overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-[hsl(var(--admin-border))]">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <Eye className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold">Preview ao vivo do App</h3>
                <Wifi className="w-3 h-3 text-accent" />
              </div>
              <p className="text-xs text-muted-foreground">
                Veja o app do cliente em tempo real, como ele vê
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Device switcher */}
            <div className="flex items-center bg-background/40 border border-[hsl(var(--admin-border))] rounded-lg p-0.5">
              {(Object.keys(DEVICE_SIZES) as Device[]).map((d) => {
                const Icon = DEVICE_SIZES[d].icon;
                const active = device === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDevice(d)}
                    title={DEVICE_SIZES[d].label}
                    className={`px-2 py-1.5 rounded-md transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>

            <button
              onClick={reload}
              title="Recarregar"
              className="w-8 h-8 rounded-lg border border-[hsl(var(--admin-border))] text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--admin-panel-hover))] flex items-center justify-center transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFullscreen(true)}
              title="Tela cheia"
              className="w-8 h-8 rounded-lg border border-[hsl(var(--admin-border))] text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--admin-panel-hover))] flex items-center justify-center transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              title="Abrir em nova aba"
              className="w-8 h-8 rounded-lg border border-[hsl(var(--admin-border))] text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--admin-panel-hover))] flex items-center justify-center transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Route tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[hsl(var(--admin-border))] overflow-x-auto">
          {ROUTES.map((r) => {
            const active = route === r.path;
            return (
              <button
                key={r.path}
                onClick={() => setRoute(r.path)}
                className={`text-xs px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                  active
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--admin-panel-hover))]"
                }`}
              >
                {r.label}
              </button>
            );
          })}
          <span className="text-[10px] text-muted-foreground ml-auto pl-3 truncate hidden md:inline">
            {previewUrl}
          </span>
        </div>

        {/* Frame */}
        <div className="h-[520px] p-4 bg-[hsl(var(--admin-panel-hover))]/30">
          {FrameContent}
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--admin-border))]">
            <div className="flex items-center gap-3">
              <Eye className="w-4 h-4 text-primary" />
              <p className="font-bold">Preview ao vivo — {DEVICE_SIZES[device].label}</p>
              <span className="text-xs text-muted-foreground hidden sm:inline">{previewUrl}</span>
            </div>
            <button
              onClick={() => setFullscreen(false)}
              className="w-9 h-9 rounded-lg border border-[hsl(var(--admin-border))] text-muted-foreground hover:text-foreground flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 p-4 overflow-hidden">{FrameContent}</div>
        </div>
      )}
    </>
  );
};

export default LivePreview;
