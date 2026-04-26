import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Download,
  Play,
  Film,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chatId: number | null;
  chatTitle: string;
}

interface VideoRow {
  update_id: number;
  message_id: number | null;
  caption: string | null;
  text: string | null;
  mime_type: string | null;
  duration: number | null;
  file_size: number | null;
  processing_status: string;
  processing_error: string | null;
  created_at: string;
  movie_id: string | null;
  raw_update: any;
}

interface MovieInfo {
  id: string;
  title: string;
  thumbnail_url: string | null;
  video_url: string | null;
  status: string | null;
}

const formatBytes = (n: number | null) => {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
};

const extractThumb = (raw: any): string | null => {
  const msg = raw?.message ?? raw?.channel_post;
  // Try first photo size or video thumbnail
  const photo = msg?.photo?.[msg.photo.length - 1];
  if (photo?.file_id) return null; // we don't have URL, just file_id
  return null;
};

const extractTitle = (caption: string | null, text: string | null, msgId: number | null) => {
  const raw = (caption || text || "").trim();
  if (raw) return raw.split("\n")[0].slice(0, 100);
  return `Mensagem #${msgId ?? "?"}`;
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "done" || status === "published")
    return <CheckCircle2 className="w-3.5 h-3.5 text-primary" />;
  if (status === "error" || status === "failed")
    return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  if (status === "processing")
    return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
};

const ChannelVideosDialog = ({ open, onOpenChange, chatId, chatTitle }: Props) => {
  const [rows, setRows] = useState<VideoRow[]>([]);
  const [movies, setMovies] = useState<Record<string, MovieInfo>>({});
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<Record<number, boolean>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  const load = async () => {
    if (!chatId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("telegram_messages")
      .select(
        "update_id,message_id,caption,text,mime_type,duration,file_size,processing_status,processing_error,created_at,movie_id,raw_update",
      )
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      toast.error("Erro ao carregar vídeos do canal");
      setLoading(false);
      return;
    }

    const list = (data as VideoRow[]) || [];
    setRows(list);

    // Hydrate movie info for already-published items
    const movieIds = list.map((r) => r.movie_id).filter((x): x is string => !!x);
    if (movieIds.length > 0) {
      const { data: m } = await supabase
        .from("movies")
        .select("id,title,thumbnail_url,video_url,status")
        .in("id", movieIds);
      const map: Record<string, MovieInfo> = {};
      (m || []).forEach((mv) => (map[mv.id] = mv as MovieInfo));
      setMovies(map);
    } else {
      setMovies({});
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && chatId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chatId]);

  const videos = useMemo(
    () => rows.filter((r) => r.mime_type?.startsWith("video") || r.movie_id),
    [rows],
  );

  const reprocess = async (updateId: number) => {
    setProcessing((p) => ({ ...p, [updateId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("telegram-reprocess-one", {
        body: { update_id: updateId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Vídeo reprocessado");
      await load();
    } catch (e: any) {
      toast.error(`Falha: ${e?.message ?? "erro desconhecido"}`);
    } finally {
      setProcessing((p) => ({ ...p, [updateId]: false }));
    }
  };

  const reprocessAllPending = async () => {
    const pending = videos.filter(
      (v) => !v.movie_id && (v.processing_status === "pending" || v.processing_status === "error"),
    );
    if (pending.length === 0) {
      toast.info("Nada para reprocessar");
      return;
    }
    setBulkRunning(true);
    let ok = 0;
    let fail = 0;
    for (const v of pending) {
      try {
        const { data, error } = await supabase.functions.invoke("telegram-reprocess-one", {
          body: { update_id: v.update_id },
        });
        if (error || (data as any)?.error) {
          fail++;
        } else {
          ok++;
        }
      } catch {
        fail++;
      }
    }
    setBulkRunning(false);
    toast.success(`Concluído: ${ok} ok, ${fail} falhas`);
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="w-5 h-5" />
            {chatTitle}
          </DialogTitle>
          <DialogDescription>
            {videos.length} vídeo(s) encontrados neste grupo • ID {chatId}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-3 border-b">
          <Button size="sm" variant="outline" onClick={load} disabled={loading || bulkRunning}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            <span className="ml-1.5">Atualizar</span>
          </Button>
          <Button size="sm" onClick={reprocessAllPending} disabled={bulkRunning || loading}>
            {bulkRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Processando...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Baixar e publicar pendentes
              </>
            )}
          </Button>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-16">
              <Film className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum vídeo neste grupo ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
              {videos.map((v) => {
                const movie = v.movie_id ? movies[v.movie_id] : null;
                const title = movie?.title ?? extractTitle(v.caption, v.text, v.message_id);
                const isProc = processing[v.update_id];
                const isBusy = isProc || v.processing_status === "processing";
                return (
                  <div
                    key={v.update_id}
                    className="border rounded-lg overflow-hidden bg-card flex flex-col"
                  >
                    <div className="aspect-video bg-muted relative overflow-hidden">
                      {movie?.thumbnail_url ? (
                        <img
                          src={movie.thumbnail_url}
                          alt={title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Film className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <StatusIcon status={v.processing_status} />
                          {v.processing_status}
                        </Badge>
                      </div>
                    </div>
                    <div className="p-3 flex-1 flex flex-col gap-2">
                      <div className="font-medium text-sm line-clamp-2">{title}</div>
                      <div className="text-[11px] text-muted-foreground flex gap-2">
                        <span>{formatBytes(v.file_size)}</span>
                        {v.duration ? <span>• {Math.floor(v.duration / 60)}min</span> : null}
                      </div>
                      {v.processing_error && (
                        <div className="text-[11px] text-destructive line-clamp-2">
                          {v.processing_error}
                        </div>
                      )}
                      <div className="mt-auto flex gap-2 pt-1">
                        {movie?.video_url ? (
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                            className="flex-1"
                          >
                            <a href={movie.video_url} target="_blank" rel="noopener noreferrer">
                              <Play className="w-3.5 h-3.5 mr-1" />
                              Assistir
                            </a>
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant={movie ? "outline" : "default"}
                          onClick={() => reprocess(v.update_id)}
                          disabled={isBusy || bulkRunning}
                          className="flex-1"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5 mr-1" />
                              {movie ? "Refazer" : "Baixar"}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ChannelVideosDialog;
