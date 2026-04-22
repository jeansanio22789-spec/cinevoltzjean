import Navbar from "@/components/Navbar";
import HlsPlayer from "@/components/HlsPlayer";
import { Radio, Tv, Search, X, Monitor, Minimize2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLiveViewers, useLiveViewersMulti } from "@/hooks/useLiveViewers";

interface Channel {
  id: string;
  name: string;
  stream_url: string;
  fallback_url: string | null;
  logo_url: string | null;
  category: string | null;
  sort_order: number;
  is_active: boolean;
}

const isHls = (url: string) => /\.m3u8(\?.*)?$/i.test(url || "");

const Live = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Fallback: link único antigo das settings (para compatibilidade)
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [fallbackTitle, setFallbackTitle] = useState("AO VIVO");
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [tvMode, setTvMode] = useState(false);
  const playerWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const [chanRes, settingsRes] = await Promise.all([
        supabase
          .from("live_channels")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("platform_settings")
          .select("key, value")
          .in("key", ["live_stream_url", "live_stream_title"]),
      ]);

      const list = (chanRes.data || []) as Channel[];
      setChannels(list);
      setSelectedId((prev) => prev ?? (list[0]?.id ?? null));

      const map: Record<string, string> = {};
      (settingsRes.data || []).forEach((s: any) => { map[s.key] = s.value; });
      setFallbackUrl(map.live_stream_url || "");
      if (map.live_stream_title) setFallbackTitle(map.live_stream_title);
      setLoaded(true);
    };
    load();

    const channel = supabase
      .channel("live-page-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_channels" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_settings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const selected = useMemo(
    () => channels.find((c) => c.id === selectedId) || null,
    [channels, selectedId]
  );

  // Lista de categorias disponíveis
  const categories = useMemo(() => {
    const set = new Set<string>();
    channels.forEach((c) => set.add(c.category || "Outros"));
    return ["all", ...Array.from(set)];
  }, [channels]);

  // Filtro por busca + categoria
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((c) => {
      if (activeCategory !== "all" && (c.category || "Outros") !== activeCategory) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.category || "").toLowerCase().includes(q);
    });
  }, [channels, search, activeCategory]);

  // Agrupa por categoria
  const grouped = useMemo(() => {
    const g: Record<string, Channel[]> = {};
    filtered.forEach((c) => {
      const cat = c.category || "Outros";
      if (!g[cat]) g[cat] = [];
      g[cat].push(c);
    });
    return g;
  }, [filtered]);

  // Toggle modo TV: alterna fullscreen no container do player
  const toggleTvMode = useCallback(async () => {
    const el = playerWrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        setTvMode(true);
        if (el.requestFullscreen) await el.requestFullscreen();
        // @ts-ignore — Safari
        else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        setTvMode(false);
      }
    } catch {
      // alguns navegadores bloqueiam — só ativa o HUD mínimo
      setTvMode((v) => !v);
    }
  }, []);

  // Sincroniza estado quando o usuário sai do fullscreen pelo ESC
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setTvMode(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 flex justify-center">
          <Tv className="w-8 h-8 text-muted-foreground animate-pulse" />
        </div>
      </div>
    );
  }

  // Decide o que tocar: canal selecionado OU fallback do settings
  const playUrl = selected?.stream_url || fallbackUrl;
  const playTitle = selected?.name || fallbackTitle;
  const hasContent = !!playUrl;

  // Espectadores assistindo o canal atual (este usuário entra na contagem)
  const viewerKey = selected?.id || (fallbackUrl ? "fallback" : null);
  const viewersHere = useLiveViewers(viewerKey, true);

  // Espectadores em todos os outros canais (apenas observa, não conta nele)
  const otherIds = useMemo(
    () => channels.map((c) => c.id).filter((id) => id !== selected?.id),
    [channels, selected?.id]
  );
  const viewersByChannel = useLiveViewersMulti(otherIds);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 px-4 md:px-12 max-w-6xl mx-auto pb-12">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full animate-pulse">
            <Radio className="w-3.5 h-3.5" /> AO VIVO
          </span>
          <h1 className="text-xl md:text-2xl font-black truncate">{playTitle}</h1>
          {viewersHere > 0 && (
            <span
              className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-card border border-border text-foreground"
              title={`${viewersHere} ${viewersHere === 1 ? "espectador" : "espectadores"} assistindo agora`}
            >
              <Users className="w-3.5 h-3.5 text-accent" />
              {viewersHere.toLocaleString("pt-BR")}
              <span className="text-muted-foreground font-normal hidden sm:inline">
                {viewersHere === 1 ? "assistindo" : "assistindo"}
              </span>
            </span>
          )}
          <button
            onClick={toggleTvMode}
            className="ml-auto flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full bg-card border border-border hover:border-primary/60 hover:text-primary transition-colors"
            aria-label={tvMode ? "Sair do modo TV" : "Ativar modo TV"}
          >
            {tvMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
            {tvMode ? "Sair TV" : "Modo TV"}
          </button>
        </div>


        <div
          ref={playerWrapRef}
          className={`relative rounded-xl overflow-hidden bg-black ${tvMode ? "fixed inset-0 z-[100] rounded-none" : "aspect-video"}`}
        >
          {!hasContent ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
              <Tv className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-sm">
                Nenhum canal configurado. Adicione canais em <b>Admin → Configurações</b>.
              </p>
            </div>
          ) : isHls(playUrl) ? (
            <HlsPlayer
              key={`${playUrl}-${tvMode}`}
              src={playUrl}
              fallbackSrc={
                selected?.fallback_url ||
                channels.find((c) => c.id !== selected?.id && isHls(c.stream_url))?.stream_url ||
                (fallbackUrl && isHls(fallbackUrl) && fallbackUrl !== playUrl ? fallbackUrl : null)
              }
              autoPlay
              tvMode={tvMode}
              aggressiveNetwork
            />
          ) : (
            <iframe
              src={playUrl}
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope"
              referrerPolicy="strict-origin-when-cross-origin"
              title={playTitle}
            />
          )}
          {tvMode && (
            <button
              onClick={toggleTvMode}
              className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label="Sair do modo TV"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Busca + filtros de categoria */}
        {channels.length > 0 && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Buscar entre ${channels.length} canais ao vivo...`}
                  className="w-full pl-10 pr-9 py-2.5 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground hidden sm:inline whitespace-nowrap">
                {filtered.length} de {channels.length}
              </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-thin">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  }`}
                >
                  {cat === "all" ? `Todos (${channels.length})` : cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de canais agrupada */}
        {channels.length > 0 && (
          <div className="mt-6 space-y-6">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum canal encontrado para "{search}".
              </p>
            )}
            {Object.entries(grouped).map(([category, list]) => (
              <section key={category}>
                <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3 font-bold">
                  {category} <span className="text-muted-foreground/50 normal-case tracking-normal">· {list.length}</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {list.map((ch) => {
                    const active = ch.id === selectedId;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => setSelectedId(ch.id)}
                        className={`group relative aspect-video rounded-lg overflow-hidden border-2 transition-all text-left ${
                          active
                            ? "border-primary ring-2 ring-primary/40 scale-[1.02]"
                            : "border-border hover:border-primary/60"
                        }`}
                      >
                        {ch.logo_url ? (
                          <img
                            src={ch.logo_url}
                            alt={ch.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-muted to-background flex items-center justify-center">
                            <Tv className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <p className="text-[11px] font-bold text-white truncate">{ch.name}</p>
                        </div>
                        {active && (
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 bg-destructive text-destructive-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                            <Radio className="w-2.5 h-2.5" /> AO VIVO
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-center mt-6">
          Player nativo HLS — toca direto no app, sem YouTube.
        </p>
      </div>
    </div>
  );
};

export default Live;
