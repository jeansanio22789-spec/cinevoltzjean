import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import {
  Loader2, Save, Download, Server, ExternalLink, CheckCircle2,
  Sparkles, Search, Film, Tv, Bot, Cpu, Radar, Copy,
} from "lucide-react";

const WORKER_URL_KEY = "telegram_worker_url";
const WORKER_TOKEN_KEY = "telegram_worker_token";
const DORAMAS_CHAT_KEY = "telegram_doramas_chat_id";
const DORAMAS_CHAT_TITLE_KEY = "telegram_doramas_chat_title";

interface DiscoveredChat {
  chat_id: number;
  title: string;
  type: string;
  username?: string;
  last_message_preview?: string;
  last_message_date?: number;
}

type ImportMode = "bot" | "worker";

interface FetchResult {
  ok: boolean;
  stream_url?: string;
  video_url?: string;
  caption?: string;
  thumbnail_url?: string;
  duration?: number;
  size?: number;
  error?: string;
}

interface AIMetadata {
  title: string;
  original_title?: string | null;
  year?: number | null;
  genre: string;
  kind: "movie" | "series";
  season?: number | null;
  episode?: number | null;
  synopsis: string;
}

const AdminTelegramImport = () => {
  const { toast } = useToast();

  // Modo de importação
  const [mode, setMode] = useState<ImportMode>("bot");

  // Config worker (opcional)
  const [workerUrl, setWorkerUrl] = useState("");
  const [workerToken, setWorkerToken] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [workerStatus, setWorkerStatus] = useState<"unknown" | "ok" | "down">("unknown");

  // Fluxo de import
  const [telegramLink, setTelegramLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [meta, setMeta] = useState<AIMetadata | null>(null);
  const [thumbOverride, setThumbOverride] = useState("");

  // Descoberta de grupos
  const [savedChatId, setSavedChatId] = useState("");
  const [savedChatTitle, setSavedChatTitle] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoveredChats, setDiscoveredChats] = useState<DiscoveredChat[]>([]);
  const [discoverHint, setDiscoverHint] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", [WORKER_URL_KEY, WORKER_TOKEN_KEY, DORAMAS_CHAT_KEY, DORAMAS_CHAT_TITLE_KEY]);
      const map = new Map((data || []).map((r) => [r.key, r.value || ""]));
      setWorkerUrl(map.get(WORKER_URL_KEY) || "");
      setWorkerToken(map.get(WORKER_TOKEN_KEY) || "");
      setSavedChatId(map.get(DORAMAS_CHAT_KEY) || "");
      setSavedChatTitle(map.get(DORAMAS_CHAT_TITLE_KEY) || "");
      setLoadingConfig(false);
    };
    load();
  }, []);

  const upsertSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase
      .from("platform_settings")
      .select("id")
      .eq("key", key)
      .maybeSingle();
    if (existing) {
      await supabase.from("platform_settings").update({ value }).eq("id", existing.id);
    } else {
      await supabase.from("platform_settings").insert({ key, value });
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const cleanUrl = workerUrl.trim().replace(/\/+$/, "");
      await upsertSetting(WORKER_URL_KEY, cleanUrl);
      await upsertSetting(WORKER_TOKEN_KEY, workerToken.trim());
      setWorkerUrl(cleanUrl);
      toast({ title: "Configuração salva" });
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
        toast({ title: "Worker online" });
      } else {
        setWorkerStatus("down");
        toast({ title: `Worker respondeu ${res.status}`, variant: "destructive" });
      }
    } catch (e) {
      setWorkerStatus("down");
      toast({
        title: "Não consegui conectar no worker",
        description: e instanceof Error ? e.message : "Verifique URL e CORS",
        variant: "destructive",
      });
    }
  };

  const fetchViaBot = async (link: string): Promise<FetchResult> => {
    const { data, error } = await supabase.functions.invoke("telegram-fetch", {
      body: { url: link },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return {
      ok: true,
      stream_url: data.video_url,
      duration: data.duration,
      size: data.size,
      caption: data.caption,
      thumbnail_url: data.thumbnail_url,
    };
  };

  const fetchViaWorker = async (link: string): Promise<FetchResult> => {
    const res = await fetch(`${workerUrl}/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
      },
      body: JSON.stringify({ url: link }),
    });
    const data = (await res.json()) as FetchResult;
    if (!res.ok || !data.ok || !data.stream_url) {
      throw new Error(data.error || `Worker retornou ${res.status}`);
    }
    return data;
  };

  const fetchFromTelegram = async () => {
    if (mode === "worker" && !workerUrl) {
      toast({ title: "Configure o worker antes ou troque pro modo Bot", variant: "destructive" });
      return;
    }
    if (!telegramLink.trim()) {
      toast({ title: "Cole o link do Telegram", variant: "destructive" });
      return;
    }

    setFetching(true);
    setFetchResult(null);
    setMeta(null);
    setThumbOverride("");

    try {
      const data = mode === "bot"
        ? await fetchViaBot(telegramLink.trim())
        : await fetchViaWorker(telegramLink.trim());

      setFetchResult(data);
      setThumbOverride(data.thumbnail_url || "");

      if (data.caption) {
        await enrichWithAI(data.caption);
      } else {
        toast({
          title: "Vídeo encontrado",
          description: "Sem caption — preencha os dados manualmente.",
        });
        setMeta({
          title: "",
          year: new Date().getFullYear(),
          genre: "Ação",
          kind: "movie",
          synopsis: "",
        });
      }
    } catch (e) {
      toast({
        title: "Falha ao buscar do Telegram",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setFetching(false);
    }
  };

  const enrichWithAI = async (caption: string) => {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-movie-metadata", {
        body: { caption },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok || !data.metadata) throw new Error(data?.error || "IA não respondeu");
      setMeta(data.metadata as AIMetadata);
      toast({
        title: "Metadados detectados",
        description: `${data.metadata.title}${data.metadata.year ? ` (${data.metadata.year})` : ""}`,
      });
    } catch (e) {
      toast({
        title: "IA não conseguiu extrair",
        description: e instanceof Error ? e.message : "Preencha manualmente",
        variant: "destructive",
      });
      setMeta({
        title: "",
        year: new Date().getFullYear(),
        genre: "Ação",
        kind: "movie",
        synopsis: "",
      });
    } finally {
      setEnriching(false);
    }
  };

  const publish = async () => {
    if (!meta || !fetchResult?.stream_url) return;
    if (!meta.title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }

    setPublishing(true);
    try {
      const fullTitle =
        meta.kind === "series" && meta.season && meta.episode
          ? `${meta.title} — T${meta.season}E${meta.episode}`
          : meta.title;

      const { error: insertError } = await supabase.from("movies").insert({
        title: fullTitle,
        video_url: fetchResult.stream_url,
        thumbnail_url: thumbOverride || fetchResult.thumbnail_url || null,
        genre: meta.genre,
        year: meta.year || null,
        duration: fetchResult.duration ? `${Math.round(fetchResult.duration / 60)}min` : null,
        status: "published",
        description: meta.synopsis || "Importado do Telegram.",
      });
      if (insertError) throw insertError;

      toast({
        title: "Publicado!",
        description: `${fullTitle} já está no catálogo.`,
      });
      setTelegramLink("");
      setFetchResult(null);
      setMeta(null);
      setThumbOverride("");
    } catch (e) {
      toast({
        title: "Erro ao publicar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const buscarDisabled =
    fetching || enriching || publishing || (mode === "worker" && !workerUrl);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Seletor de modo */}
      <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-panel))] p-5 space-y-3">
        <h2 className="font-bold text-sm">Método de importação</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode("bot")}
            className={`flex flex-col items-center gap-2 rounded-md border-2 p-4 text-xs font-bold transition ${
              mode === "bot"
                ? "border-primary bg-primary/10 text-primary"
                : "border-[hsl(var(--admin-border))] text-muted-foreground"
            }`}
          >
            <Bot className="w-5 h-5" />
            Bot API (padrão)
            <span className="text-[10px] font-normal opacity-70 text-center">
              Funciona se o bot for membro do grupo
            </span>
          </button>
          <button
            onClick={() => setMode("worker")}
            className={`flex flex-col items-center gap-2 rounded-md border-2 p-4 text-xs font-bold transition ${
              mode === "worker"
                ? "border-primary bg-primary/10 text-primary"
                : "border-[hsl(var(--admin-border))] text-muted-foreground"
            }`}
          >
            <Cpu className="w-5 h-5" />
            Worker MTProto
            <span className="text-[10px] font-normal opacity-70 text-center">
              VPS externa (avançado)
            </span>
          </button>
        </div>
      </div>

      {/* Config do worker (só aparece no modo worker) */}
      {mode === "worker" && (
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
                Token (opcional)
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
      )}

      {/* Etapa 1: cola link */}
      <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-panel))] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">1. Cole o link do Telegram</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          A IA vai detectar título, ano, gênero e sinopse do caption. A capa vem da
          thumbnail nativa da mensagem.
        </p>

        <Input
          value={telegramLink}
          onChange={(e) => setTelegramLink(e.target.value)}
          placeholder="https://t.me/c/123456789/42"
          disabled={fetching || enriching || publishing}
        />

        <button
          onClick={fetchFromTelegram}
          disabled={buscarDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-50 w-full sm:w-auto"
        >
          {fetching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Baixando do Telegram…
            </>
          ) : enriching ? (
            <>
              <Sparkles className="w-4 h-4 animate-pulse" /> IA detectando metadados…
            </>
          ) : (
            <>
              <Download className="w-4 h-4" /> Buscar e detectar
            </>
          )}
        </button>

        {mode === "worker" && !workerUrl && (
          <p className="text-[11px] text-destructive">
            Configure e salve a URL do worker acima pra habilitar.
          </p>
        )}
      </div>

      {/* Etapa 2: preview + revisão */}
      {meta && fetchResult && (
        <div className="rounded-lg border border-primary/40 bg-[hsl(var(--admin-panel))] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm">2. Revise e publique</h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wider">
              {meta.kind === "series" ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
              {meta.kind === "series" ? "Série / Dorama" : "Filme"}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="shrink-0 w-full sm:w-40">
              {thumbOverride || fetchResult.thumbnail_url ? (
                <img
                  src={thumbOverride || fetchResult.thumbnail_url}
                  alt={meta.title}
                  className="w-full sm:w-40 aspect-[2/3] object-cover rounded-md shadow-lg border border-[hsl(var(--admin-border))]"
                />
              ) : (
                <div className="w-full sm:w-40 aspect-[2/3] bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">
                  Sem capa
                </div>
              )}
              <Input
                value={thumbOverride}
                onChange={(e) => setThumbOverride(e.target.value)}
                placeholder="URL custom da capa"
                className="mt-2 text-xs"
              />
            </div>

            <div className="flex-1 space-y-3 min-w-0">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Título
                </label>
                <Input
                  value={meta.title}
                  onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                  className="mt-1 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Ano
                  </label>
                  <Input
                    type="number"
                    value={meta.year || ""}
                    onChange={(e) =>
                      setMeta({ ...meta, year: parseInt(e.target.value) || null })
                    }
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Gênero
                  </label>
                  <Input
                    value={meta.genre}
                    onChange={(e) => setMeta({ ...meta, genre: e.target.value })}
                    className="mt-1"
                  />
                </div>
                {meta.kind === "series" && (
                  <>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                        Temp.
                      </label>
                      <Input
                        type="number"
                        value={meta.season || ""}
                        onChange={(e) =>
                          setMeta({ ...meta, season: parseInt(e.target.value) || null })
                        }
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                        Ep.
                      </label>
                      <Input
                        type="number"
                        value={meta.episode || ""}
                        onChange={(e) =>
                          setMeta({ ...meta, episode: parseInt(e.target.value) || null })
                        }
                        className="mt-1"
                      />
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Sinopse
                </label>
                <textarea
                  value={meta.synopsis}
                  onChange={(e) => setMeta({ ...meta, synopsis: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {fetchResult.size && (
                <p className="text-[10px] text-muted-foreground">
                  {(fetchResult.size / 1024 / 1024).toFixed(1)} MB
                  {fetchResult.duration
                    ? ` · ${Math.round(fetchResult.duration / 60)} min`
                    : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={publish}
              disabled={publishing}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Publicar no catálogo
            </button>
            <button
              onClick={() => {
                setFetchResult(null);
                setMeta(null);
                setThumbOverride("");
              }}
              className="rounded-md bg-muted px-4 py-2.5 text-sm font-bold text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTelegramImport;
