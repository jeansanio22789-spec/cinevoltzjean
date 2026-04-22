import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Play, Tv } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Channel {
  id: string;
  name: string;
  stream_url: string;
  fallback_url: string | null;
  logo_url: string | null;
  category: string | null;
  is_active: boolean;
}

type Status = "idle" | "loading" | "ok" | "blocked";

/**
 * Modo de teste de canais — só admin.
 * - Lista todos os canais ativos.
 * - Para cada um, monta um iframe escondido e mede se onLoad dispara em 5s.
 *   - Se sim → status "OK" (embed funciona).
 *   - Se não → status "Bloqueado" (X-Frame-Options/CSP).
 * - Botão "Abrir /externo" navega para a visualização interna em tela cheia.
 */
const TestChannels = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("live_channels")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setChannels((data || []) as Channel[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/admin"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Admin
          </Link>
          <h1 className="text-2xl font-black">Teste de canais</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Cada canal abaixo é testado num iframe oculto. Se o embed for recusado,
          o status muda para <b>Bloqueado</b> e você pode validar o fluxo de
          fallback abrindo a visualização interna em <code>/externo</code>.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Tv className="w-10 h-10 mx-auto mb-2 opacity-50" />
            Nenhum canal ativo.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {channels.map((ch) => (
              <ChannelTestCard
                key={ch.id}
                channel={ch}
                onStatus={(s) => setStatuses((prev) => ({ ...prev, [ch.id]: s }))}
              />
            ))}
          </div>
        )}

        {!loading && channels.length > 0 && (
          <div className="mt-6 text-xs text-muted-foreground border-t border-border pt-4">
            Resultado:{" "}
            <span className="text-emerald-500 font-bold">
              {Object.values(statuses).filter((s) => s === "ok").length} OK
            </span>{" "}
            ·{" "}
            <span className="text-destructive font-bold">
              {Object.values(statuses).filter((s) => s === "blocked").length} bloqueados
            </span>{" "}
            · {channels.length} total
          </div>
        )}
      </div>
    </div>
  );
};

const ChannelTestCard = ({
  channel,
  onStatus,
}: {
  channel: Channel;
  onStatus: (s: Status) => void;
}) => {
  const [status, setStatus] = useState<Status>("loading");
  const ref = useRef<HTMLIFrameElement>(null);
  const isHls = /\.m3u8(\?.*)?$/i.test(channel.stream_url);

  useEffect(() => {
    if (isHls) {
      // HLS sempre toca via player nativo, não precisa testar embed
      setStatus("ok");
      onStatus("ok");
      return;
    }
    setStatus("loading");
    onStatus("loading");
    const t = setTimeout(() => {
      setStatus((prev) => {
        if (prev === "loading") {
          onStatus("blocked");
          return "blocked";
        }
        return prev;
      });
    }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.stream_url]);

  const handleLoad = () => {
    setStatus("ok");
    onStatus("ok");
  };

  const externoUrl = `/externo?url=${encodeURIComponent(channel.stream_url)}&title=${encodeURIComponent(channel.name)}`;

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {channel.logo_url ? (
          <img
            src={channel.logo_url}
            alt={channel.name}
            className="w-12 h-12 object-contain rounded bg-black/20"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
            <Tv className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold truncate">{channel.name}</h3>
          <p className="text-xs text-muted-foreground truncate">
            {channel.category || "Sem categoria"} · {isHls ? "HLS" : "Iframe"}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="text-[11px] text-muted-foreground break-all bg-muted/30 px-2 py-1.5 rounded">
        {channel.stream_url}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to={externoUrl}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Abrir /externo
        </Link>
        <button
          onClick={() => {
            setStatus("loading");
            onStatus("loading");
            if (ref.current) {
              const u = ref.current.src;
              ref.current.src = "about:blank";
              setTimeout(() => {
                if (ref.current) ref.current.src = u;
              }, 50);
            }
          }}
          className="text-xs font-medium px-3 py-1.5 rounded-full border border-border hover:bg-muted/50 transition-colors"
        >
          Re-testar
        </button>
      </div>

      {/* Iframe oculto que efetivamente faz o teste */}
      {!isHls && (
        <iframe
          ref={ref}
          src={channel.stream_url}
          className="w-full h-32 rounded border border-border bg-black"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleLoad}
          title={`teste ${channel.name}`}
        />
      )}
    </div>
  );
};

const StatusBadge = ({ status }: { status: Status }) => {
  if (status === "loading" || status === "idle") {
    return (
      <span className="flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Testando
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span className="flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3" /> OK
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
      <XCircle className="w-3 h-3" /> Bloqueado
    </span>
  );
};

export default TestChannels;
