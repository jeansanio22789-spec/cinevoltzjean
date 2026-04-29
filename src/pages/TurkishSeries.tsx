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

      {/* Modal de episódios */}
      <Dialog open={!!openSeries} onOpenChange={(o) => { if (!o) { setOpenSeries(null); closePlayer(); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openSeries?.title}</DialogTitle>
          </DialogHeader>
          {openSeries?.description && (
            <p className="text-sm text-muted-foreground">{openSeries.description}</p>
          )}

          {playingEp ? (
            <div className="space-y-2">
              <Button variant="outline" size="sm" onClick={closePlayer}>← Voltar à lista</Button>
              <div className="relative aspect-video w-full bg-black rounded overflow-hidden">
                {resolving && (
                  <div className="absolute inset-0 flex items-center justify-center text-white">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                )}
                {videoUrl && (
                  <>
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      controls
                      playsInline
                      className="w-full h-full"
                      controlsList="nodownload noremoteplayback"
                      disablePictureInPicture={false}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {/* Legenda em português, se disponível na origem */}
                    </video>
                    {showPlay && (
                      <button
                        onClick={handlePlay}
                        aria-label="Reproduzir"
                        className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition"
                      >
                        <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center shadow-2xl">
                          <Play className="w-10 h-10 text-primary-foreground fill-current ml-1" />
                        </div>
                      </button>
                    )}
                  </>
                )}
              </div>
              <p className="text-sm font-semibold">{playingEp.title}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {episodes.length === 0 ? (
                <p className="text-sm text-muted-foreground col-span-2">Carregando episódios...</p>
              ) : episodes.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => startEpisode(ep)}
                  className="flex items-center gap-2 p-2 rounded border border-border hover:bg-muted text-left"
                >
                  <PlayCircle className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm truncate">{ep.title}</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default TurkishSeries;
