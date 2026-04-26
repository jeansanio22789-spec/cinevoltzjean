import { useEffect, useState, useRef } from "react";
import {
  Upload, Film, Clock, CheckCircle, XCircle, Play,
  FileVideo, Image, Type, Tag, Trash2, Loader2, Zap, AlertTriangle, Plus, X, RotateCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useUploadQueue, type UploadJob } from "@/hooks/useUploadQueue";

interface Video {
  id: string;
  title: string;
  video_url: string | null;
  thumbnail_url: string | null;
  genre: string | null;
  duration: string | null;
  status: string | null;
  created_at: string;
}

const fmtEta = (sec: number) =>
  sec > 60 ? `${Math.ceil(sec / 60)}min` : `${Math.ceil(sec)}s`;

// Hora local de término (ex.: 14:32) — usa o ETA pra prever
const fmtEndTime = (etaSec: number) => {
  const end = new Date(Date.now() + etaSec * 1000);
  return end.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Lê arquivo como base64 puro (sem o prefixo data:)
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

// Detecta faixa de áudio pelo nome do arquivo (usado p/ anexar ao TÍTULO em MAIÚSCULAS)
// "Filme.DUAL.1080p.mkv" -> "DUAL"   |   "Serie.LEG.mp4" -> "LEGENDADO"
type AudioTag = "DUBLADO" | "LEGENDADO" | "DUAL";
const detectAudioFromFilename = (name: string): AudioTag | null => {
  const n = name.toLowerCase();
  if (/\b(dual|dual[\s._-]?audio|multi[\s._-]?audio|2audios?)\b/.test(n))
    return "DUAL";
  if (
    /\b(dub|dubl|dublad[oa]|dublagem|nacional|português|portugues|pt[\s._-]?br|ptbr|brazilian)\b/.test(
      n,
    )
  )
    return "DUBLADO";
  if (/\b(leg|legend|legendad[oa]|sub|subbed|subtitle[ds]?|vose)\b/.test(n))
    return "LEGENDADO";
  return null;
};

const detectAudioFromFiles = (files: File[]): AudioTag | null => {
  for (const f of files) {
    const a = detectAudioFromFilename(f.name);
    if (a) return a;
  }
  return null;
};

// Tira sufixo de áudio que já esteja no título (pra não duplicar)
const stripAudioSuffix = (raw: string): string => {
  let t = raw;
  t = t.replace(
    /[\[\(\{][^\]\)\}]*\b(dub(lad[oa])?|leg(endad[oa])?|dual|nacional|pt[\s._-]?br|sub(title[ds]?)?)\b[^\]\)\}]*[\]\)\}]/gi,
    "",
  );
  t = t.replace(
    /[\s\-\|•·:]+\b(dublad[oa]|dub|legendad[oa]|leg|dual(?:\s*[áa]udio)?|nacional|pt[\s._-]?br|sub(?:title[ds]?)?)\b\.?\s*$/gi,
    "",
  );
  return t.replace(/\s{2,}/g, " ").trim();
};

// Junta o título + tag de áudio, tudo em MAIÚSCULAS
const buildTitleWithAudio = (title: string, audio: AudioTag | null): string => {
  const clean = stripAudioSuffix(title).toUpperCase();
  if (!audio) return clean;
  // Evita duplicar se a palavra já estiver lá
  if (new RegExp(`\\b${audio}\\b`).test(clean)) return clean;
  return `${clean} ${audio}`.trim();
};


const statusBadge = (j: UploadJob) => {
  switch (j.status) {
    case "queued":
      return { label: "Na fila", icon: Clock, color: "text-muted-foreground bg-muted" };
    case "uploading":
      return { label: "Enviando", icon: Zap, color: "text-primary bg-primary/15" };
    case "saving":
      return { label: "Publicando", icon: Loader2, color: "text-primary bg-primary/15" };
    case "warning":
      return {
        label: "Demorando…",
        icon: AlertTriangle,
        color: "text-amber-500 bg-amber-500/15",
      };
    case "done":
      return { label: "Publicado", icon: CheckCircle, color: "text-accent bg-accent/15" };
    case "error":
      return { label: "Falhou", icon: XCircle, color: "text-destructive bg-destructive/15" };
  }
};

const AdminVideos = () => {
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<{
    title: string;
    genre: string;
    type: string;
    description: string;
  }>({
    title: "",
    genre: "Ação",
    type: "Filme",
    description: "",
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [recognizingTitle, setRecognizingTitle] = useState(false);

  // Lê o título escrito na capa via IA com visão (OCR semântico).
  // O título final fica TUDO MAIÚSCULO e, se a capa indicar áudio
  // (DUBLADO / LEGENDADO / DUAL), a palavra é colada no fim do título.
  const recognizeTitleFromCover = async (file: File) => {
    setRecognizingTitle(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke(
        "recognize-cover-title",
        { body: { imageBase64, mimeType: file.type || "image/jpeg" } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const rawTitle = (data?.title || "").trim();
      if (!rawTitle) {
        toast.warning("Não consegui ler nenhum título nessa capa.");
        return;
      }

      // Normaliza o áudio devolvido pela IA pra nossa tag em maiúsculas
      const audioRaw = (data?.audio || "").toString().toLowerCase();
      let audioTag: AudioTag | null = null;
      if (audioRaw === "dublado") audioTag = "DUBLADO";
      else if (audioRaw === "legendado") audioTag = "LEGENDADO";
      else if (audioRaw === "dual") audioTag = "DUAL";
      // Se a IA não viu áudio, tenta pelo nome do arquivo do vídeo (fallback)
      if (!audioTag) audioTag = detectAudioFromFiles(selectedFiles);

      const finalTitle = buildTitleWithAudio(rawTitle, audioTag);

      // Trocar capa = trocar nome (sobrescreve sempre)
      setForm((prev) => ({ ...prev, title: finalTitle }));

      toast.success(
        data?.confidence === "high"
          ? `Lido da capa: "${finalTitle}"`
          : `Lido (confiança ${data?.confidence}): "${finalTitle}" — confira`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao ler capa";
      toast.error(msg);
    } finally {
      setRecognizingTitle(false);
    }
  };

  const fetchVideos = async () => {
    const { data, error } = await supabase
      .from("movies")
      .select("id, title, video_url, thumbnail_url, genre, duration, status, created_at")
      .order("created_at", { ascending: false });

    if (!error) setVideos((data as Video[]) || []);
    setLoading(false);
  };

  const { jobs, enqueue, removeJob, clearDone, retry, activeCount } = useUploadQueue(
    () => fetchVideos(),
  );

  useEffect(() => {
    fetchVideos();
  }, []);

  // Avisa o usuário se tentar fechar a aba durante upload ativo
  useEffect(() => {
    if (activeCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Uploads em andamento — se você sair, vão parar!";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [activeCount]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setSelectedFiles((prev) => [...prev, ...arr]);
    // Se o título já tiver sido lido da capa e ainda não tiver tag de áudio,
    // tenta inferir pelo nome do arquivo e anexa
    setForm((f) => {
      if (!f.title) return f;
      if (/\b(DUBLADO|LEGENDADO|DUAL)\b/.test(f.title)) return f;
      const detected = detectAudioFromFiles(arr);
      if (!detected) return f;
      toast.success(`Áudio detectado: ${detected}`);
      return { ...f, title: buildTitleWithAudio(f.title, detected) };
    });
  };

  const removeSelected = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = () => {
    if (selectedFiles.length === 0) {
      toast.error("Selecione pelo menos um arquivo");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }

    // Todos os vídeos usam o mesmo título digitado (ou o reconhecido da capa).
    // Mesma capa pra todos os arquivos do lote.
    const items = selectedFiles.map((file) => ({
      file,
      thumbnail: thumbnailFile,
      meta: {
        title: form.title,
        genre: form.genre,
        description: form.description,
      },
    }));

    enqueue(items);

    toast.success(
      `${items.length} ${items.length === 1 ? "envio iniciado" : "envios iniciados"} em paralelo`,
    );

    // Limpa o formulário, mas mantém o painel aberto para a fila
    setSelectedFiles([]);
    setThumbnailFile(null);
    setForm({
      title: "",
      genre: "Ação",
      type: "Filme",
      description: "",
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este vídeo?")) return;
    const { error } = await supabase.from("movies").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Excluído!");
      fetchVideos();
    }
  };

  const totalSize = videos.length;
  const published = videos.filter((v) => v.status === "published").length;
  const drafts = videos.filter((v) => v.status === "draft").length;
  const doneCount = jobs.filter((j) => j.status === "done").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Envio de Vídeos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e envie filmes, séries e trailers — vários ao mesmo tempo
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-4 h-4" /> Novo Upload
          {activeCount > 0 && (
            <span className="ml-1 bg-primary-foreground/20 px-1.5 py-0.5 rounded-full text-xs">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {showUpload && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files); }}
          >
            <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            {selectedFiles.length > 0 ? (
              <div className="space-y-2 max-w-md mx-auto">
                <p className="text-sm font-semibold text-accent">
                  {selectedFiles.length} {selectedFiles.length === 1 ? "arquivo" : "arquivos"} selecionado{selectedFiles.length === 1 ? "" : "s"}
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto text-left">
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-background rounded px-2 py-1.5 text-xs">
                      <FileVideo className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {(f.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <button
                        onClick={() => removeSelected(i)}
                        className="p-0.5 hover:bg-destructive/20 rounded text-destructive"
                        aria-label="Remover"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <p className="font-medium mb-1">Arraste os vídeos aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground">
                  MP4, MKV, AVI, MOV • Máx. 50 GB por arquivo • vários ao mesmo tempo
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 px-6 py-2 bg-muted text-foreground rounded text-sm font-medium hover:bg-muted/80 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Adicionar Arquivos
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Type className="w-3.5 h-3.5" /> Título</label>
              <input
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Nome do filme ou série"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Gênero</label>
              <select
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
              >
                <option>Ação</option>
                <option>Aventura</option>
                <option>Comédia</option>
                <option>Drama</option>
                <option>Documentário</option>
                <option>Ficção Científica</option>
                <option>Suspense</option>
                <option>Terror</option>
                <option>Thriller</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Film className="w-3.5 h-3.5" /> Tipo</label>
              <select
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option>Filme</option>
                <option>Série - Episódio</option>
                <option>Trailer</option>
                <option>Documentário</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5" /> Áudio
                {form.audio !== "Original" && (
                  <span className="text-[10px] text-accent font-normal">
                    (detectado pelo nome do arquivo)
                  </span>
                )}
              </label>
              <select
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.audio}
                onChange={(e) =>
                  setForm({ ...form, audio: e.target.value as AudioTrack })
                }
              >
                <option value="Original">Original</option>
                <option value="Dublado">Dublado</option>
                <option value="Legendado">Legendado</option>
                <option value="Dual">Dual (Dub + Leg)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Image className="w-3.5 h-3.5" /> Thumbnail (capa)</label>
              <input
                type="file"
                accept="image/*"
                disabled={recognizingTitle}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setThumbnailFile(f);
                  // Lê o título escrito na própria capa via IA
                  void recognizeTitleFromCover(f);
                }}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-muted file:text-foreground disabled:opacity-60"
              />
              {recognizingTitle ? (
                <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Lendo o título escrito na capa…
                </p>
              ) : thumbnailFile ? (
                <p className="text-[11px] text-muted-foreground mt-1 truncate">
                  📎 {thumbnailFile.name}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium mb-1.5 block">Descrição</label>
            <textarea
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="Sinopse do conteúdo..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0}
              className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Enviar e Publicar
              {selectedFiles.length > 1 && ` (${selectedFiles.length})`}
            </button>
            <p className="text-xs text-muted-foreground self-center">
              Você pode adicionar mais arquivos enquanto outros estão enviando.
            </p>
          </div>
        </div>
      )}

      {/* Fila de uploads */}
      {jobs.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Fila de envios
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                {activeCount} ativo{activeCount === 1 ? "" : "s"} • {doneCount} concluído{doneCount === 1 ? "" : "s"}
              </span>
            </h3>
            {doneCount > 0 && (
              <button
                onClick={clearDone}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpar concluídos
              </button>
            )}
          </div>

          {activeCount > 0 && (
            <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 p-2 rounded">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>
                <b>Mantenha esta aba aberta</b> até terminar. Se cair a conexão, os envios retomam automaticamente.
                Envios que passam de <b>2 minutos</b> ficam marcados em amarelo, mas seguem tentando.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {jobs.map((j) => {
              const badge = statusBadge(j);
              const Icon = badge.icon;
              return (
                <div
                  key={j.id}
                  className="bg-background border border-border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <FileVideo className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{j.meta.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {j.file.name} • {(j.file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.color}`}
                    >
                      <Icon
                        className={`w-3 h-3 ${
                          j.status === "saving" || j.status === "uploading"
                            ? "animate-pulse"
                            : ""
                        }`}
                      />
                      {badge.label}
                    </span>

                    {/* Ações */}
                    {j.status === "error" && (
                      <button
                        onClick={() => retry(j.id)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Tentar novamente"
                      >
                        <RotateCw className="w-3.5 h-3.5 text-primary" />
                      </button>
                    )}
                    {(j.status === "done" || j.status === "error") && (
                      <button
                        onClick={() => removeJob(j.id)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Remover da fila"
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  {(j.status === "uploading" ||
                    j.status === "saving" ||
                    j.status === "warning") && (
                    <>
                      <Progress
                        value={j.progress}
                        className={`h-2 ${j.status === "warning" ? "[&>div]:bg-amber-500" : ""}`}
                      />
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono gap-2 flex-wrap">
                        <span>{j.progress.toFixed(1)}%</span>
                        {j.speedMBs > 0 && (
                          <span className="text-right">
                            ⚡ {j.speedMBs.toFixed(1)} MB/s
                            {j.etaSec > 0 && j.etaSec < 99999 && (
                              <>
                                {" "}• ⏱ falta {fmtEta(j.etaSec)}
                                {" "}• 🕒 termina às <b className="text-foreground">{fmtEndTime(j.etaSec)}</b>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {j.status === "warning" && (
                    <p className="text-[11px] text-amber-500">
                      ⚠️ Está demorando mais que 2 minutos, mas continua tentando.
                    </p>
                  )}

                  {j.status === "error" && j.errorMsg && (
                    <p className="text-[11px] text-destructive">
                      ❌ {j.errorMsg}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-black">{totalSize}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-black text-accent">{published}</p>
          <p className="text-xs text-muted-foreground">Publicados</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-black">{drafts}</p>
          <p className="text-xs text-muted-foreground">Rascunhos</p>
        </div>
      </div>

      {/* Video List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <FileVideo className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhum vídeo enviado</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left p-3 font-medium">Vídeo</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Gênero</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted rounded flex items-center justify-center shrink-0 overflow-hidden">
                        {video.thumbnail_url ? (
                          <img src={video.thumbnail_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <Film className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{video.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(video.created_at).toLocaleDateString("pt-BR")}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">{video.genre}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      video.status === "published" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                    }`}>
                      {video.status === "published" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {video.status === "published" ? "Publicado" : "Rascunho"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {video.video_url && (
                        <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-muted rounded transition-colors">
                          <Play className="w-3.5 h-3.5 text-muted-foreground" />
                        </a>
                      )}
                      <button onClick={() => handleDelete(video.id)} className="p-1.5 hover:bg-destructive/20 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminVideos;
