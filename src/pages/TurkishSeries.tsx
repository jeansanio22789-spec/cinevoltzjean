import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, Play, PlayCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Series {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  language: string | null;
  episodes_count: number;
}

interface Episode {
  id: string;
  episode_number: number;
  title: string;
}

const TurkishSeries = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [openSeries, setOpenSeries] = useState<Series | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [playingEp, setPlayingEp] = useState<Episode | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [showPlay, setShowPlay] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { document.title = "Novelas Turcas"; }, []);

  // Carrega séries
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("turkish_series")
        .select("id, slug, title, description, thumbnail_url, language, episodes_count")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setSeries((data as Series[]) ?? []);
      setLoading(false);
    })();
  }, []);

  // Verifica assinatura ativa
  useEffect(() => {
    if (!user) { setHasAccess(false); return; }
    (async () => {
      const { data: roleRow } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (roleRow) { setHasAccess(true); return; }
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status, expires_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      const ok = !!sub && (!sub.expires_at || new Date(sub.expires_at) > new Date());
      setHasAccess(ok);
    })();
  }, [user]);

  const filtered = series.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()));

  const openSerie = async (s: Series) => {
    if (!hasAccess) {
      toast.error("Conteúdo exclusivo para assinantes");
      navigate("/planos");
      return;
    }
    setOpenSeries(s);
    setEpisodes([]);
    const { data } = await supabase
      .from("turkish_episodes")
      .select("id, episode_number, title")
      .eq("series_id", s.id)
      .order("episode_number", { ascending: true });
    setEpisodes((data as Episode[]) ?? []);
  };

  const startEpisode = async (ep: Episode) => {
    setPlayingEp(ep);
    setVideoUrl(null);
    setShowPlay(true);
    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke("turkish-resolve", {
        body: { episode_id: ep.id },
      });
      if (error || !data?.url) {
        toast.error("Não foi possível carregar este episódio.");
        setResolving(false);
        return;
      }
      setVideoUrl(data.url);
    } catch {
      toast.error("Erro ao carregar vídeo");
    } finally {
      setResolving(false);
    }
  };

  const handlePlay = () => {
    setShowPlay(false);
    videoRef.current?.play().catch(() => {
      // Autoplay bloqueado — mantém botão
      setShowPlay(true);
    });
  };

  const closePlayer = () => {
    setPlayingEp(null);
    setVideoUrl(null);
    setShowPlay(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="px-4 md:px-12 pt-24 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Novelas Turcas</h1>
            <p className="text-muted-foreground text-sm">Catálogo dublado e legendado</p>
          </div>
          <Input
            placeholder="Buscar novela..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-72"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">
            Nenhuma novela disponível ainda.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => openSerie(s)}
                className="poster-card relative rounded-md overflow-hidden bg-muted text-left group"
              >
                <div className="aspect-[2/3] relative">
                  {s.thumbnail_url ? (
                    <img src={s.thumbnail_url} alt={s.title} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs p-2">{s.title}</div>
                  )}
                  {!hasAccess && (
                    <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-foreground/80" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                    <p className="text-white text-xs font-bold truncate">{s.title}</p>
                    <p className="text-[10px] text-white/70">{s.language} • {s.episodes_count} ep.</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modal de série/episódios */}
      <Dialog open={!!openSeries} onOpenChange={(o) => { if (!o) { setOpenSeries(null); closePlayer(); } }}>
        <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden border-border/50 bg-background max-h-[92vh] overflow-y-auto">
          {/* Hero com backdrop */}
          <div className="relative">
            <div className="relative h-48 sm:h-64 w-full overflow-hidden">
              {openSeries?.thumbnail_url && (
                <>
                  <img
                    src={openSeries.thumbnail_url}
                    alt={openSeries.title}
                    className="w-full h-full object-cover blur-sm scale-110 opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
                </>
              )}
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 flex items-end gap-4">
                {openSeries?.thumbnail_url && (
                  <img
                    src={openSeries.thumbnail_url}
                    alt={openSeries.title}
                    className="w-20 sm:w-28 aspect-[2/3] object-cover rounded-md shadow-2xl border border-border/50 flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0 pb-1">
                  <DialogHeader className="text-left space-y-1">
                    <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight line-clamp-2">
                      {openSeries?.title}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                    {openSeries?.language && (
                      <span className="px-2 py-0.5 rounded-sm bg-secondary text-secondary-foreground font-medium">
                        {openSeries.language}
                      </span>
                    )}
                    <span>{episodes.length || openSeries?.episodes_count || 0} episódios</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 pb-6 space-y-5">
            {openSeries?.description && !playingEp && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {openSeries.description}
              </p>
            )}

            {playingEp ? (
              <div className="space-y-4">
                {/* Player */}
                <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden shadow-2xl ring-1 ring-border/50">
                  {resolving && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 bg-black">
                      <Loader2 className="w-10 h-10 animate-spin text-primary" />
                      <p className="text-xs text-white/70">Carregando episódio...</p>
                    </div>
                  )}
                  {videoUrl && (
                    <>
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        controls
                        autoPlay
                        playsInline
                        className="w-full h-full"
                        controlsList="nodownload noremoteplayback"
                        onContextMenu={(e) => e.preventDefault()}
                        onPlay={() => setShowPlay(false)}
                        onEnded={() => {
                          const idx = episodes.findIndex((e) => e.id === playingEp?.id);
                          const next = idx >= 0 ? episodes[idx + 1] : null;
                          if (next) {
                            toast.success(`Próximo: ${next.title}`);
                            startEpisode(next);
                          } else {
                            toast.info("Você assistiu o último episódio disponível.");
                          }
                        }}
                      />
                      {showPlay && (
                        <button
                          onClick={handlePlay}
                          aria-label="Reproduzir"
                          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/70 via-black/20 to-black/40 hover:from-black/60 hover:to-black/30 transition group"
                        >
                          <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                            <Play className="w-10 h-10 text-primary-foreground fill-current ml-1" />
                          </div>
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Header do episódio + ações */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Reproduzindo</p>
                    <h3 className="text-lg font-bold truncate">{playingEp.title}</h3>
                  </div>
                  <Button variant="secondary" size="sm" onClick={closePlayer} className="flex-shrink-0">
                    ← Lista
                  </Button>
                </div>

                {/* Próximos episódios */}
                {episodes.length > 1 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground/90">Continue assistindo</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {episodes
                        .filter((e) => e.id !== playingEp.id)
                        .slice(0, 8)
                        .map((ep) => (
                          <button
                            key={ep.id}
                            onClick={() => startEpisode(ep)}
                            className="group relative aspect-video rounded-md overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition"
                          >
                            {openSeries?.thumbnail_url && (
                              <img src={openSeries.thumbnail_url} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-2">
                              <p className="text-[11px] font-bold text-white truncate">{ep.title}</p>
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                              <PlayCircle className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-primary" />
                  Episódios
                </h3>
                {episodes.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {episodes.map((ep, idx) => (
                      <button
                        key={ep.id}
                        onClick={() => startEpisode(ep)}
                        className="group flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card/40 hover:bg-card hover:border-primary/60 transition text-left"
                      >
                        <div className="w-10 h-10 rounded-md bg-primary/10 group-hover:bg-primary text-primary group-hover:text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0 transition">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ep.title}</p>
                          <p className="text-[11px] text-muted-foreground">Episódio {ep.episode_number || idx + 1}</p>
                        </div>
                        <Play className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:fill-current flex-shrink-0 transition" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default TurkishSeries;
