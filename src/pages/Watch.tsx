import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, Lock, Play, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveVideoSource } from "@/lib/videoUrl";

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

  // ✅ Tem acesso. Se há link do Telegram, prioriza ele.
  if (movie.telegram_url) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-foreground text-sm font-medium hover:opacity-80"
          >
            <ArrowLeft className="w-5 h-5" /> Voltar
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5 max-w-md mx-auto pb-12">
          {movie.thumbnail_url && (
            <img
              src={movie.thumbnail_url}
              alt={movie.title}
              className="w-44 h-64 object-cover rounded-xl shadow-2xl"
            />
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-black mb-2">{movie.title}</h1>
            {movie.description && (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {movie.description}
              </p>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap justify-center">
            {movie.year && <span>{movie.year}</span>}
            {movie.duration && <span>• {movie.duration}</span>}
            {movie.rating && <span>• {movie.rating}</span>}
            {movie.genre && <span>• {movie.genre}</span>}
          </div>

          <a
            href={movie.telegram_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-primary text-primary-foreground px-6 py-4 rounded-xl font-black text-base flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-lg"
          >
            <Send className="w-5 h-5" /> Assistir no Telegram
          </a>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            O conteúdo abre direto no app do Telegram. Você precisa estar no canal
            para assistir.
          </p>
        </div>
      </div>
    );
  }

  const source = resolveVideoSource(movie.video_url);

  return (
    <div className="min-h-screen bg-black">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white text-sm font-medium hover:opacity-80"
        >
          <ArrowLeft className="w-5 h-5" /> Voltar
        </button>
        <h2 className="text-white font-semibold text-sm md:text-base truncate max-w-[60%]">
          {movie.title}
        </h2>
        <div className="w-16" />
      </div>

      <div className="w-full h-screen flex items-center justify-center">
        {!source || source.kind === "unknown" ? (
          <div className="text-center px-6 text-white">
            <p className="mb-4">Este filme ainda não tem vídeo disponível.</p>
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
          </div>
        ) : source.kind === "iframe" ? (
          <iframe
            src={source.url}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            title={movie.title}
          />
        ) : (
          <video
            src={source.url}
            poster={movie.thumbnail_url || undefined}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain bg-black"
          >
            Seu navegador não suporta o player de vídeo.
          </video>
        )}
      </div>
    </div>
  );
};

export default Watch;
