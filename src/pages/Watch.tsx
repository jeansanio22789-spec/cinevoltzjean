import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, Lock, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveVideoSource } from "@/lib/videoUrl";
import { useLocalVideoSrc } from "@/hooks/useLocalVideoSrc";
import TelegramPlayer from "@/components/TelegramPlayer";
import VideoPlayer from "@/components/VideoPlayer";
import IntroVignette from "@/components/IntroVignette";

interface WatchMovie {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  telegram_url: string | null;
  year: number | null;
  duration: string | null;
  genre: string | null;
  rating: string | null;
  status: string | null;
}

const Watch = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [movie, setMovie] = useState<WatchMovie | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [tokenAccess, setTokenAccess] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  const token = params.get("token");

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase
        .from("movies")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      setMovie(data as WatchMovie | null);
      setLoading(false);
    };
    load();
  }, [id]);

  // Resgata token mágico (sem precisar de login)
  useEffect(() => {
    if (!token || !id) return;
    const redeem = async () => {
      const { data } = await supabase.rpc("redeem_access_token", {
        _token: token,
        _movie_id: id,
      });
      if ((data as { ok?: boolean } | null)?.ok) {
        setTokenAccess(true);
        await supabase.rpc("consume_access_token", { _token: token });
      }
    };
    redeem();
  }, [token, id]);

  useEffect(() => {
    if (authLoading) return;
    if (tokenAccess) {
      setHasAccess(true);
      setCheckingAccess(false);
      return;
    }
    if (!user || !id) {
      setHasAccess(false);
      setCheckingAccess(false);
      return;
    }

    const checkAccess = async () => {
      // 1. Acesso individual ao filme (liberado pelo admin)
      const { data: movieAcc } = await supabase.rpc("has_movie_access", {
        _user_id: user.id,
        _movie_id: id,
      });
      if (movieAcc) {
        setHasAccess(true);
        setCheckingAccess(false);
        return;
      }
      // 2. Plano ativo libera tudo
      const { data: planAcc } = await supabase.rpc("has_active_access", { _user_id: user.id });
      setHasAccess(!!planAcc);
      setCheckingAccess(false);
    };
    checkAccess();
  }, [user, authLoading, tokenAccess, id]);

  const isLoading = loading || authLoading || checkingAccess;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <p className="text-lg font-bold">Filme não encontrado</p>
        <button
          onClick={() => navigate("/")}
          className="bg-foreground text-background px-5 py-2 rounded text-sm font-semibold"
        >
          Voltar para o início
        </button>
      </div>
    );
  }

  if (!user && !tokenAccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-5">
        <Lock className="w-12 h-12 text-primary" />
        <div>
          <h1 className="text-2xl font-bold mb-2">{movie.title}</h1>
          <p className="text-muted-foreground text-sm max-w-md">
            Faça login ou utilize um link de acesso válido para assistir.
          </p>
        </div>
        <button
          onClick={() => navigate(`/login?redirect=/assistir/${movie.id}`)}
          className="bg-primary text-primary-foreground px-6 py-3 rounded font-bold text-sm"
        >
          Entrar para assistir
        </button>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-5">
        {movie.thumbnail_url && (
          <img
            src={movie.thumbnail_url}
            alt={movie.title}
            className="w-40 h-56 object-cover rounded-lg shadow-lg"
          />
        )}
        <Lock className="w-10 h-10 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold mb-2">{movie.title}</h1>
          <p className="text-muted-foreground text-sm max-w-md">
            Você não tem acesso a este conteúdo. Fale com o administrador para liberar
            ou assine um plano para ver tudo.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
          <button
            onClick={() => navigate("/planos")}
            className="flex-1 bg-primary text-primary-foreground px-5 py-3 rounded font-bold text-sm flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" /> Assinar
          </button>
          <button
            onClick={() => navigate("/")}
            className="flex-1 bg-muted text-foreground px-5 py-3 rounded font-semibold text-sm"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // ✅ Tem acesso. Detecta link do Telegram em qualquer um dos campos.
  const isTelegram = (u: string | null | undefined) =>
    !!u && /^https?:\/\/(t\.me|telegram\.me)\//i.test(u);
  if (isTelegram(movie.telegram_url) || isTelegram(movie.video_url)) {
    const movieForTg = { ...movie, telegram_url: movie.telegram_url || movie.video_url };
    return <TelegramPlayer movie={movieForTg} onBack={() => navigate(-1)} />;
  }

  const source = resolveVideoSource(movie.video_url);

  // Mostra a vinheta de abertura (estilo Netflix) só quando há vídeo de fato
  const hasPlayableVideo = source && source.kind !== "unknown";
  const showIntro = hasPlayableVideo && !introDone;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      {showIntro && <IntroVignette onFinish={() => setIntroDone(true)} />}
      <div className="w-full h-screen">
        {!source || source.kind === "unknown" ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 text-white gap-4">
            <p>Este filme ainda não tem vídeo disponível.</p>
            {source?.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-primary px-5 py-2.5 rounded text-sm font-semibold"
              >
                <ExternalLink className="w-4 h-4" /> Abrir link externo
              </a>
            )}
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-white/80 text-sm hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
          </div>
        ) : source.kind === "iframe" ? (
          <div className="relative w-full h-full">
            <button
              onClick={() => navigate(-1)}
              className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-black/60 backdrop-blur-md text-white text-sm font-medium px-3 py-2 rounded-full hover:bg-black/80 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <iframe
              src={source.url}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              title={movie.title}
            />
          </div>
        ) : (
          <VideoPlayer
            src={source.url}
            poster={movie.thumbnail_url}
            title={movie.title}
            onBack={() => navigate(-1)}
          />
        )}
      </div>
    </div>
  );
};

export default Watch;
