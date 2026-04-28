import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, FolderOpen, Search, Download, CheckCircle2, ExternalLink, ImagePlus, X } from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  thumbnailLink?: string;
  videoMediaMetadata?: { durationMillis?: string; width?: number; height?: number };
}

const formatSize = (bytes?: string) => {
  if (!bytes) return "";
  const n = Number(bytes);
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export default function AdminGoogleDriveImport() {
  const { toast } = useToast();
  const [folderId, setFolderId] = useState("");
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [covers, setCovers] = useState<Record<string, { url: string; uploading?: boolean }>>({});

  const uploadCover = async (fileId: string, file: File) => {
    setCovers((c) => ({ ...c, [fileId]: { url: c[fileId]?.url || "", uploading: true } }));
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `gdrive/${fileId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("thumbnails").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
      setCovers((c) => ({ ...c, [fileId]: { url: data.publicUrl, uploading: false } }));
      toast({ title: "Capa carregada" });
    } catch (e) {
      setCovers((c) => ({ ...c, [fileId]: { url: c[fileId]?.url || "", uploading: false } }));
      toast({ title: "Erro ao subir capa", description: (e as Error).message, variant: "destructive" });
    }
  };

  const extractFolderId = (input: string): string => {
    const m = input.match(/\/folders\/([\w-]+)/);
    return m ? m[1] : input.trim();
  };

  const loadFiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gdrive-list", {
        body: {
          folderId: folderId.trim() ? extractFolderId(folderId) : undefined,
          q: search.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(JSON.stringify(data.error));
      setFiles(data?.files || []);
      if (!data?.files?.length) {
        toast({ title: "Nenhum vídeo encontrado", description: "Confira a pasta ou os termos de busca." });
      }
    } catch (e) {
      toast({
        title: "Falha ao listar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const importFile = async (file: DriveFile) => {
    setImporting(file.id);
    try {
      const { data, error } = await supabase.functions.invoke("gdrive-import", {
        body: {
          fileId: file.id,
          title: file.name.replace(/\.(mp4|mkv|webm|mov|avi)$/i, ""),
          thumbnailUrl: covers[file.id]?.url || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setImported((s) => new Set(s).add(file.id));
      toast({
        title: "Filme adicionado!",
        description: `"${data.movie.title}" entrou no catálogo.`,
      });
    } catch (e) {
      toast({
        title: "Erro ao importar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FolderOpen className="h-4 w-4 text-primary" />
          Importar do Google Drive
        </div>
        <p className="text-xs text-muted-foreground">
          Cole o link da pasta do Drive (ex: <code>https://drive.google.com/drive/folders/ABC123</code>)
          ou deixe vazio para listar todos os vídeos da sua conta. O arquivo é marcado automaticamente
          como público ao importar.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="Link/ID da pasta (opcional)"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          />
          <Input
            placeholder="Buscar por nome (opcional)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadFiles()}
          />
          <Button onClick={loadFiles} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-2">Listar</span>
          </Button>
        </div>
      </Card>

      {files.length > 0 && (
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-3">
            {files.length} vídeo(s) encontrado(s)
          </div>
          <div className="space-y-2">
            {files.map((f) => {
              const isDone = imported.has(f.id);
              const isImporting = importing === f.id;
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-md border p-2 hover:bg-muted/40"
                >
                  <div className="relative h-12 w-20 shrink-0">
                    {covers[f.id]?.url ? (
                      <img src={covers[f.id].url} alt="" className="h-12 w-20 rounded object-cover bg-muted" />
                    ) : f.thumbnailLink ? (
                      <img src={f.thumbnailLink} alt="" className="h-12 w-20 rounded object-cover bg-muted" />
                    ) : (
                      <div className="h-12 w-20 rounded bg-muted flex items-center justify-center">
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    {covers[f.id]?.uploading && (
                      <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatSize(f.size)}
                      {f.videoMediaMetadata?.durationMillis && (
                        <> · {Math.round(Number(f.videoMediaMetadata.durationMillis) / 60000)} min</>
                      )}
                      {covers[f.id]?.url && <> · <span className="text-primary">capa custom</span></>}
                    </div>
                  </div>
                  <label
                    className="cursor-pointer text-muted-foreground hover:text-foreground p-1"
                    title="Enviar capa própria"
                  >
                    <ImagePlus className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadCover(f.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {covers[f.id]?.url && (
                    <button
                      onClick={() => setCovers((c) => { const n = { ...c }; delete n[f.id]; return n; })}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Remover capa custom"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <a
                    href={`https://drive.google.com/file/d/${f.id}/view`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground p-1"
                    title="Abrir no Drive"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <Button
                    size="sm"
                    variant={isDone ? "secondary" : "default"}
                    onClick={() => importFile(f)}
                    disabled={isImporting || isDone}
                  >
                    {isImporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isDone ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="ml-1">{isDone ? "Importado" : "Importar"}</span>
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
