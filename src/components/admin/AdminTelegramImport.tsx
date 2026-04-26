import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Download, Server, ExternalLink, CheckCircle2 } from "lucide-react";

const WORKER_URL_KEY = "telegram_worker_url";
const WORKER_TOKEN_KEY = "telegram_worker_token";

interface ImportResult {
  ok: boolean;
  file_id?: string;
  stream_url?: string;
  title?: string;
  duration?: number;
  size?: number;
  thumbnail_url?: string;
  error?: string;
}

const AdminTelegramImport = () => {
  const { toast } = useToast();

  // Config do worker
  const [workerUrl, setWorkerUrl] = useState("");
  const [workerToken, setWorkerToken] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [workerStatus, setWorkerStatus] = useState<"unknown" | "ok" | "down">("unknown");

  // Form de importação
  const [telegramLink, setTelegramLink] = useState("");
  const [movieTitle, setMovieTitle] = useState("");
  const [genre, setGenre] = useState("Ação");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", [WORKER_URL_KEY, WORKER_TOKEN_KEY]);
      const map = new Map((data || []).map((r) => [r.key, r.value || ""]));
      setWorkerUrl(map.get(WORKER_URL_KEY) || "");
      setWorkerToken(map.get(WORKER_TOKEN_KEY) || "");
      setLoadingConfig(false);
    };
    load();
  }, []);

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const cleanUrl = workerUrl.trim().replace(/\/+$/, "");
      const upserts = [
        { key: WORKER_URL_KEY, value: cleanUrl },
        { key: WORKER_TOKEN_KEY, value: workerToken.trim() },
      ];
      for (const row of upserts) {
        const { data: existing } = await supabase
          .from("platform_settings")
          .select("id")
          .eq("key", row.key)
          .maybeSingle();
        if (existing) {
          await supabase.from("platform_settings").update({ value: row.value }).eq("id", existing.id);
        } else {
          await supabase.from("platform_settings").insert(row);
        }
      }
      setWorkerUrl(cleanUrl);
      toast({ title: "Configuração salva", description: "Worker atualizado." });
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const testWorker = async () => {
    if (!workerUrl) {
      toast({ title: "Configure a URL do worker primeiro", variant: "destructive" });
      return;
    }
    setWorkerStatus("unknown");
    try {
      const res = await fetch(`${workerUrl}/health`, {
        headers: workerToken ? { Authorization: `Bearer ${workerToken}` } : {},
      });
      if (res.ok) {
        setWorkerStatus("ok");
        toast({ title: "Worker online", description: "Conexão OK." });
      } else {
        setWorkerStatus("down");
        toast({ title: `Worker respondeu ${res.status}`, variant: "destructive" });
      }
    } catch (e) {
      setWorkerStatus("down");
      toast({
        title: "Não consegui conectar no worker",
        description: e instanceof Error ? e.message : "Verifique a URL e CORS",
        variant: "destructive",
      });
    }
  };

  const runImport = async () => {
    if (!workerUrl) {
      toast({ title: "Configure o worker antes", variant: "destructive" });
      return;
    }
    if (!telegramLink.trim()) {
      toast({ title: "Cole o link do Telegram", variant: "destructive" });
      return;
    }

    setImporting(true);
    setLastResult(null);
    try {
      const res = await fetch(`${workerUrl}/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
        },
        body: JSON.stringify({ url: telegramLink.trim() }),
      });
      const data = (await res.json()) as ImportResult;
      if (!res.ok || !data.ok || !data.stream_url) {
        throw new Error(data.error || `Worker retornou ${res.status}`);
      }
      setLastResult(data);

      // Cria o filme apontando o video_url pro stream do worker
      const { error: insertError } = await supabase.from("movies").insert({
        title: movieTitle.trim() || data.title || "Sem título",
        video_url: data.stream_url,
        thumbnail_url: data.thumbnail_url || null,
        genre,
        year,
        duration: data.duration ? `${Math.round(data.duration / 60)}min` : null,
        status: "published",
        description: `Importado do Telegram via worker MTProto.`,
      });
      if (insertError) throw insertError;

      toast({
        title: "Filme importado!",
        description: "Já aparece no catálogo e toca direto no site.",
      });
      setTelegramLink("");
      setMovieTitle("");
    } catch (e) {
      toast({
        title: "Falha na importação",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Config do worker */}
      <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-panel))] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Worker MTProto Externo</h2>
          {workerStatus === "ok" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary">
              <CheckCircle2 className="w-3 h-3" /> ONLINE
            </span>
          )}
          {workerStatus === "down" && (
            <span className="text-[10px] font-bold text-destructive">OFFLINE</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          O worker roda em VPS/Railway/Fly.io e expõe os endpoints{" "}
          <code className="text-foreground">/health</code>,{" "}
          <code className="text-foreground">/import</code> e{" "}
          <code className="text-foreground">/stream</code>. Configure aqui o endereço público.
        </p>

        <div className="grid gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              URL do worker
            </label>
            <Input
              value={workerUrl}
              onChange={(e) => setWorkerUrl(e.target.value)}
              placeholder="https://meu-worker.up.railway.app"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Token (opcional, header Bearer)
            </label>
            <Input
              type="password"
              value={workerToken}
              onChange={(e) => setWorkerToken(e.target.value)}
              placeholder="••••••••"
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {savingConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Salvar
            </button>
            <button
              onClick={testWorker}
              className="inline-flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-xs font-bold text-foreground"
            >
              <ExternalLink className="w-3 h-3" /> Testar conexão
            </button>
          </div>
        </div>
      </div>

      {/* Importação */}
      <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-panel))] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Importar filme do Telegram</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Cole o link da mensagem (ex.{" "}
          <code className="text-foreground">https://t.me/c/123456789/42</code>). O worker baixa via
          MTProto, gera URL de streaming com Range/HLS e cria o filme aqui.
        </p>

        <div className="grid gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Link da mensagem do Telegram
            </label>
            <Input
              value={telegramLink}
              onChange={(e) => setTelegramLink(e.target.value)}
              placeholder="https://t.me/c/123456789/42"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Título (opcional)
              </label>
              <Input
                value={movieTitle}
                onChange={(e) => setMovieTitle(e.target.value)}
                placeholder="Detectar do caption se vazio"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Ano
              </label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || year)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Gênero
            </label>
            <Input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="Ação, Drama, Comédia..."
              className="mt-1"
            />
          </div>

          <button
            onClick={runImport}
            disabled={importing || !workerUrl}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {importing ? "Importando…" : "Importar e publicar"}
          </button>
        </div>

        {lastResult?.ok && (
          <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs">
            <p className="font-bold text-primary mb-1">✓ Importado</p>
            <p className="text-muted-foreground break-all">
              <span className="text-foreground">URL:</span> {lastResult.stream_url}
            </p>
            {lastResult.size && (
              <p className="text-muted-foreground">
                <span className="text-foreground">Tamanho:</span>{" "}
                {(lastResult.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminTelegramImport;
