import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import {
  Loader2, Save, Download, Server, ExternalLink, CheckCircle2,
  Sparkles, Search, Film, Tv, Bot, Cpu, Radar, Copy,
} from "lucide-react";
import TelegramImageDriveFolder from "./TelegramImageDriveFolder";
import DriveCoverSync from "./DriveCoverSync";

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

  const discoverChats = async () => {
    setDiscovering(true);
    setDiscoverHint("");
    try {
      const { data, error } = await supabase.functions.invoke("telegram-discover-chats", {
        body: {},
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Falha ao buscar grupos");
      setDiscoveredChats(data.chats || []);
      setDiscoverHint(data.hint || "");
      if ((data.chats || []).length === 0) {
        toast({
          title: "Nenhum grupo detectado",
          description: "Mande uma mensagem no grupo (com o bot dentro) e tente de novo.",
        });
      } else {
        toast({
          title: `${data.chats.length} chat(s) detectado(s)`,
          description: "Escolha o grupo Doramas VIP e clique em salvar.",
        });
      }
    } catch (e) {
      toast({
        title: "Erro ao descobrir grupos",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setDiscovering(false);
    }
  };

  const saveChat = async (chat: DiscoveredChat) => {
    try {
      await upsertSetting(DORAMAS_CHAT_KEY, String(chat.chat_id));
      await upsertSetting(DORAMAS_CHAT_TITLE_KEY, chat.title);
      setSavedChatId(String(chat.chat_id));
      setSavedChatTitle(chat.title);
      toast({
        title: "Grupo salvo",
        description: `${chat.title} (${chat.chat_id}) está cadastrado.`,
      });
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    }
  };

  const clearSavedChat = async () => {
    try {
      await upsertSetting(DORAMAS_CHAT_KEY, "");
      await upsertSetting(DORAMAS_CHAT_TITLE_KEY, "");
      setSavedChatId("");
      setSavedChatTitle("");
      toast({ title: "Grupo removido" });
    } catch (e) {
      toast({
        title: "Erro ao remover",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    }
  };

  // Fila de revisão (preview antes de publicar)
  interface PreviewItem {
    update_id: number;
    title: string;
    video_url: string;
    thumbnail_url: string | null;
    duration_min: number | null;
    size_mb: number | null;
    meta: AIMetadata;
  }

  // Persistência local: edições do usuário sobrevivem a reload e a recarregar
  // a prévia. Chave por update_id.
  type EditOverride = {
    title?: string;
    synopsis?: string;
    genre?: string;
    year?: number | null;
    season?: number | null;
    episode?: number | null;
    kind?: "movie" | "series";
    thumbnail_url?: string | null;
    updated_at: number;
  };
  const EDITS_STORAGE_KEY = "telegram_preview_edits_v1";

  const loadEdits = (): Record<string, EditOverride> => {
    try {
      const raw = localStorage.getItem(EDITS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, EditOverride>) : {};
    } catch {
      return {};
    }
  };

  const saveEdits = (edits: Record<string, EditOverride>) => {
    try {
      localStorage.setItem(EDITS_STORAGE_KEY, JSON.stringify(edits));
    } catch {
      // ignora — quota ou modo privado
    }
  };

  const mergeEditIntoItem = (item: PreviewItem, edit?: EditOverride): PreviewItem => {
    if (!edit) return item;
    return {
      ...item,
      thumbnail_url:
        edit.thumbnail_url !== undefined ? edit.thumbnail_url : item.thumbnail_url,
      meta: {
        ...item.meta,
        title: edit.title ?? item.meta.title,
        synopsis: edit.synopsis ?? item.meta.synopsis,
        genre: edit.genre ?? item.meta.genre,
        year: edit.year !== undefined ? edit.year : item.meta.year,
        kind: edit.kind ?? item.meta.kind,
        season: edit.season !== undefined ? edit.season : item.meta.season,
        episode: edit.episode !== undefined ? edit.episode : item.meta.episode,
      },
    };
  };

  const upsertEdit = (updateId: number, patch: Partial<EditOverride>) => {
    const all = loadEdits();
    const current = all[String(updateId)] || { updated_at: 0 };
    all[String(updateId)] = { ...current, ...patch, updated_at: Date.now() };
    saveEdits(all);
  };

  const removeEdit = (updateId: number) => {
    const all = loadEdits();
    delete all[String(updateId)];
    saveEdits(all);
  };

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{
    skipped: number;
    errors: number;
    still_pending: number;
  } | null>(null);
  const [publishingId, setPublishingId] = useState<number | null>(null);

  const loadPreviewQueue = async () => {
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-bulk-import", {
        body: { limit: 5, dryRun: true },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Falha desconhecida");

      const edits = loadEdits();
      const items: PreviewItem[] = (data.results || [])
        .filter((r: any) => r.status === "preview")
        .map((r: any) => {
          const base: PreviewItem = {
            update_id: r.update_id,
            title: r.title,
            video_url: r.video_url,
            thumbnail_url: r.thumbnail_url,
            duration_min: r.duration_min,
            size_mb: r.size_mb,
            meta: r.meta,
          };
          return mergeEditIntoItem(base, edits[String(r.update_id)]);
        });
      setPreviewItems(items);
      setPreviewSummary({
        skipped: data.skipped || 0,
        errors: data.errors || 0,
        still_pending: data.still_pending || 0,
      });

      if (items.length === 0) {
        toast({
          title: "Nada pra revisar",
          description: data.still_pending > 0
            ? `${data.still_pending} pendente(s) — todos falharam ao baixar.`
            : "Não há vídeos pendentes do canal.",
        });
      } else {
        toast({
          title: `${items.length} vídeo(s) pronto(s) pra revisar`,
          description: "Confira capa/título e clique em Publicar.",
        });
      }
    } catch (e) {
      toast({
        title: "Erro ao preparar fila",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const updatePreviewItem = (updateId: number, patch: Partial<PreviewItem>) => {
    setPreviewItems((prev) =>
      prev.map((it) => (it.update_id === updateId ? { ...it, ...patch } : it)),
    );
    if (patch.thumbnail_url !== undefined) {
      upsertEdit(updateId, { thumbnail_url: patch.thumbnail_url });
    }
  };

  const updatePreviewMeta = (updateId: number, patch: Partial<AIMetadata>) => {
    setPreviewItems((prev) =>
      prev.map((it) =>
        it.update_id === updateId ? { ...it, meta: { ...it.meta, ...patch } } : it,
      ),
    );
    // Persiste só os campos editáveis
    const editPatch: Partial<EditOverride> = {};
    if (patch.title !== undefined) editPatch.title = patch.title;
    if (patch.synopsis !== undefined) editPatch.synopsis = patch.synopsis;
    if (patch.genre !== undefined) editPatch.genre = patch.genre;
    if (patch.year !== undefined) editPatch.year = patch.year;
    if (patch.kind !== undefined) editPatch.kind = patch.kind;
    if (patch.season !== undefined) editPatch.season = patch.season;
    if (patch.episode !== undefined) editPatch.episode = patch.episode;
    if (Object.keys(editPatch).length > 0) {
      upsertEdit(updateId, editPatch);
    }
  };

  const confirmPublish = async (item: PreviewItem) => {
    if (!item.meta.title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    setPublishingId(item.update_id);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-publish-one", {
        body: {
          update_id: item.update_id,
          title: item.meta.title,
          video_url: item.video_url,
          thumbnail_url: item.thumbnail_url,
          genre: item.meta.genre,
          year: item.meta.year,
          duration_min: item.duration_min,
          description: item.meta.synopsis,
          kind: item.meta.kind,
          season: item.meta.season,
          episode: item.meta.episode,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Falha ao publicar");
      toast({ title: "Publicado!", description: data.title });
      removeEdit(item.update_id);
      setPreviewItems((prev) => prev.filter((it) => it.update_id !== item.update_id));
    } catch (e) {
      toast({
        title: "Erro ao publicar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setPublishingId(null);
    }
  };

  const discardItem = async (item: PreviewItem) => {
    setPublishingId(item.update_id);
    try {
      const { error } = await supabase
        .from("telegram_messages")
        .update({
          processing_status: "discarded",
          processed_at: new Date().toISOString(),
        })
        .eq("update_id", item.update_id);
      if (error) throw error;
      removeEdit(item.update_id);
      setPreviewItems((prev) => prev.filter((it) => it.update_id !== item.update_id));
      toast({ title: "Vídeo descartado" });
    } catch (e) {
      toast({
        title: "Erro ao descartar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setPublishingId(null);
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

      <TelegramImageDriveFolder />

      <DriveCoverSync />

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

      {/* Descobrir grupos via getUpdates */}
      <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-panel))] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Descobrir grupos do bot</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Mande qualquer mensagem no grupo Doramas VIP (com o bot dentro), depois
          clique em <span className="font-bold">Detectar grupos</span>. O sistema lê
          as últimas mensagens do bot via <code className="text-[10px]">getUpdates</code> e
          lista os chats encontrados.
        </p>

        {savedChatId && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-primary font-bold">
                Grupo cadastrado
              </p>
              <p className="text-sm font-bold truncate">{savedChatTitle || "Sem título"}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{savedChatId}</p>
            </div>
            <button
              onClick={clearSavedChat}
              className="rounded-md bg-muted px-3 py-1.5 text-[11px] font-bold text-foreground shrink-0"
            >
              Remover
            </button>
          </div>
        )}

        <button
          onClick={discoverChats}
          disabled={discovering}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50 w-full sm:w-auto"
        >
          {discovering ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</>
          ) : (
            <><Radar className="w-4 h-4" /> Detectar grupos</>
          )}
        </button>

        {discoverHint && (
          <p className="text-[11px] text-muted-foreground italic">{discoverHint}</p>
        )}

        {discoveredChats.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Chats encontrados ({discoveredChats.length})
            </p>
            {discoveredChats.map((c) => {
              const isSaved = String(c.chat_id) === savedChatId;
              return (
                <div
                  key={c.chat_id}
                  className={`rounded-md border p-3 flex items-center justify-between gap-3 ${
                    isSaved
                      ? "border-primary/40 bg-primary/5"
                      : "border-[hsl(var(--admin-border))]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold truncate">{c.title}</p>
                      <span className="text-[9px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {c.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {c.chat_id}
                      {c.username ? ` · @${c.username}` : ""}
                    </p>
                    {c.last_message_preview && (
                      <p className="text-[11px] text-muted-foreground truncate mt-1">
                        “{c.last_message_preview}”
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => saveChat(c)}
                      disabled={isSaved}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50"
                    >
                      {isSaved ? <CheckCircle2 className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                      {isSaved ? "Salvo" : "Salvar"}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(String(c.chat_id));
                        toast({ title: "chat_id copiado" });
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-3 py-1.5 text-[11px] font-bold text-foreground"
                    >
                      <Copy className="w-3 h-3" /> ID
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fila de revisão: prepara prévia (capa+título+vídeo) e admin confirma */}
      {savedChatId && (
        <div className="rounded-lg border border-primary/40 bg-[hsl(var(--admin-panel))] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm">Revisar & publicar do canal</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Carrega até 5 vídeos pendentes de <span className="font-bold">{savedChatTitle}</span>:
            baixa, sobe pro storage e a IA sugere título/gênero/sinopse. Você revisa
            cada um (capa, nome, vídeo) e clica em <span className="font-bold">Publicar</span>.
          </p>
          <p className="text-[11px] text-muted-foreground">
            ⚠️ Tenta baixar arquivos de qualquer tamanho — vídeos grandes podem
            demorar bastante. Se o Telegram recusar (limite da Bot API), o erro
            é registrado e você pode tentar de novo ou usar o Worker MTProto.
          </p>

          <button
            onClick={loadPreviewQueue}
            disabled={previewLoading}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-50 w-full sm:w-auto"
          >
            {previewLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Preparando prévia...</>
            ) : (
              <><Download className="w-4 h-4" /> Carregar próximos 5 pra revisar</>
            )}
          </button>

          {previewSummary && previewItems.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">
              Pulados: {previewSummary.skipped} · Erros: {previewSummary.errors} · Pendentes: {previewSummary.still_pending}
            </p>
          )}

          {previewItems.length > 0 && (
            <div className="space-y-4">
              {previewItems.map((item) => {
                const isBusy = publishingId === item.update_id;
                return (
                  <div
                    key={item.update_id}
                    className="rounded-lg border border-[hsl(var(--admin-border))] bg-background p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row gap-3">
                      {/* Capa */}
                      <div className="shrink-0 w-full sm:w-32">
                        {item.thumbnail_url ? (
                          <img
                            src={item.thumbnail_url}
                            alt={item.meta.title}
                            className="w-full sm:w-32 aspect-[2/3] object-cover rounded-md border border-[hsl(var(--admin-border))]"
                          />
                        ) : (
                          <div className="w-full sm:w-32 aspect-[2/3] bg-muted rounded-md flex items-center justify-center text-[10px] text-muted-foreground text-center p-2">
                            Sem capa
                          </div>
                        )}
                        <Input
                          value={item.thumbnail_url || ""}
                          onChange={(e) =>
                            updatePreviewItem(item.update_id, { thumbnail_url: e.target.value })
                          }
                          placeholder="URL da capa"
                          className="mt-2 text-[11px] h-8"
                        />
                      </div>

                      {/* Vídeo + dados */}
                      <div className="flex-1 space-y-2 min-w-0">
                        <video
                          src={item.video_url}
                          controls
                          preload="metadata"
                          className="w-full max-h-48 rounded-md bg-black"
                        />
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                            Título
                          </label>
                          <Input
                            value={item.meta.title}
                            onChange={(e) =>
                              updatePreviewMeta(item.update_id, { title: e.target.value })
                            }
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
                              value={item.meta.year || ""}
                              onChange={(e) =>
                                updatePreviewMeta(item.update_id, {
                                  year: parseInt(e.target.value) || null,
                                })
                              }
                              className="mt-1"
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                              Gênero
                            </label>
                            <Input
                              value={item.meta.genre}
                              onChange={(e) =>
                                updatePreviewMeta(item.update_id, { genre: e.target.value })
                              }
                              className="mt-1"
                            />
                          </div>
                          {item.meta.kind === "series" && (
                            <>
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                                  Temp.
                                </label>
                                <Input
                                  type="number"
                                  value={item.meta.season || ""}
                                  onChange={(e) =>
                                    updatePreviewMeta(item.update_id, {
                                      season: parseInt(e.target.value) || null,
                                    })
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
                                  value={item.meta.episode || ""}
                                  onChange={(e) =>
                                    updatePreviewMeta(item.update_id, {
                                      episode: parseInt(e.target.value) || null,
                                    })
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
                            value={item.meta.synopsis}
                            onChange={(e) =>
                              updatePreviewMeta(item.update_id, { synopsis: e.target.value })
                            }
                            rows={2}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {item.meta.kind === "series" ? "Série" : "Filme"}
                          {item.size_mb ? ` · ${item.size_mb} MB` : ""}
                          {item.duration_min ? ` · ${item.duration_min} min` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => confirmPublish(item)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-black text-primary-foreground disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        Confirmar e publicar
                      </button>
                      <button
                        onClick={() => discardItem(item)}
                        disabled={isBusy}
                        className="rounded-md bg-muted px-4 py-2 text-xs font-bold text-foreground disabled:opacity-50"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                );
              })}
              {previewSummary && previewSummary.still_pending > 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                  Mais {previewSummary.still_pending} pendente(s) — publique/descarte estes e clique em "Carregar próximos" de novo.
                </p>
              )}
            </div>
          )}
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
