import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Tv } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import IframeWithFallback from "@/components/IframeWithFallback";
import HlsPlayer from "@/components/HlsPlayer";

interface Channel {
  id: string;
  name: string;
  stream_url: string;
  fallback_url: string | null;
  logo_url: string | null;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const isHls = (url: string) => /\.m3u8(\?.*)?$/i.test(url || "");

/**
 * Rota anônima /c/:slug — apresenta o canal sem expor a URL real
 * (ex: globoplay.globo.com) na barra de endereço. O slug é gerado a
 * partir do nome do canal cadastrado no banco.
 */
const ChannelView = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("live_channels")
        .select("id, name, stream_url, fallback_url, logo_url")
        .eq("is_active", true);
      if (cancelled) return;
      const list = (data || []) as Channel[];
      const found = list.find((c) => slugify(c.name) === slug) || null;
      setChannel(found);
      setNotFound(!found);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const title = channel?.name || "Ao vivo";

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (notFound || !channel) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Tv className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Canal não encontrado.</p>
        <button
          onClick={() => navigate("/ao-vivo")}
          className="bg-primary text-primary-foreground px-5 py-2 rounded font-semibold text-sm"
        >
          Ver canais
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-black/80 backdrop-blur-md border-b border-white/10 shrink-0">
        <button
          onClick={() => navigate("/ao-vivo")}
          className="flex items-center gap-1.5 text-white text-sm font-medium px-2 py-1 rounded hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <h1 className="text-white text-sm font-semibold truncate px-2">{title}</h1>
        <span className="w-12" />
      </div>
      <div className="relative flex-1 bg-black">
        {isHls(channel.stream_url) ? (
          <HlsPlayer
            src={channel.stream_url}
            fallbackSrc={channel.fallback_url || undefined}
            autoPlay
          />
        ) : (
          <IframeWithFallback
            src={channel.stream_url}
            title={title}
            poster={channel.logo_url}
          />
        )}
      </div>
    </div>
  );
};

export default ChannelView;
