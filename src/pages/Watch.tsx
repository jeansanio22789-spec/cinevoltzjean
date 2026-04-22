import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, Lock, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveVideoSource } from "@/lib/videoUrl";

interface WatchMovie {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  year: number | null;
  duration: string | null;
  genre: string | null;
  rating: string | null;
  status: string | null;
}

const Watch = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [movie, setMovie] = useState<WatchMovie | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setHasAccess(false);
      setCheckingAccess(false);
      return;
    }

    const checkPlan = async () => {
      // Acesso liberado se houver pelo menos uma transação aprovada
      const { data: tx } = await supabase
        .from("transactions")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("status", "Aprovado")
        .limit(1);

      // Ou se for admin
      const { data: isAdmin } = await supabase.rpc("is_admin");

      setHasAccess((tx && tx.length > 0) || !!isAdmin);
      setCheckingAccess(false);
    };
    checkPlan();
  }, [user, authLoading]);

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

  // Sem login → manda pra login com retorno
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-5">
        <Lock className="w-12 h-12 text-primary" />
        <div>
          <h1 className="text-2xl font-bold mb-2">{movie.title}</h1>
          <p className="text-muted-foreground text-sm max-w-md">
            Faça login para assistir a este conteúdo.
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

  // Sem plano ativo → vai pra planos
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
        <div>
          <h1 className="text-2xl font-bold mb-2">{movie.title}</h1>
          <p className="text-muted-foreground text-sm max-w-md">
            Você precisa de um plano ativo para assistir a este filme.
          </p>
        </div>
        <button
          onClick={() => navigate("/planos")}
          className="bg-primary text-primary-foreground px-6 py-3 rounded font-bold text-sm flex items-center gap-2"
        >
          <Play className="w-4 h-4 fill-current" /> Assinar plano
        </button>
      </div>
    );
  }

  const source = resolveVideoSource(movie.video_url);

  return (
    <div className="min-h-screen bg-black">
      {/* Top bar */}
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

      {/* Player */}
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
