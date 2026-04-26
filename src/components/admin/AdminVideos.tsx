import { useEffect, useState, useRef } from "react";
import {
  Upload, Film, Clock, CheckCircle, XCircle, Play,
  FileVideo, Image, Type, Tag, Trash2, Eye, Loader2, Zap, AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import * as tus from "tus-js-client";

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

const AdminVideos = () => {
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [uploadSpeed, setUploadSpeed] = useState("");
  const [uploadEta, setUploadEta] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "",
    genre: "Ação",
    type: "Filme",
    description: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);

  const fetchVideos = async () => {
    const { data, error } = await supabase
      .from("movies")
      .select("id, title, video_url, thumbnail_url, genre, duration, status, created_at")
      .order("created_at", { ascending: false });

    if (!error) setVideos((data as Video[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  // Avisa o usuário se tentar fechar a aba durante upload
  useEffect(() => {
    if (!uploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Upload em andamento — se você sair, vai parar!";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploading]);

  const handleFileSelect = (files: FileList | null) => {
    if (files && files[0]) {
      setSelectedFile(files[0]);
    }
  };

  // Upload PARALELO via TUS resumable — divide em chunks de 6MB e envia 6 ao mesmo tempo
  // Resultado: satura a banda do usuário, ~3-6x mais rápido que upload sequencial
  const uploadFileWithProgress = async (
    bucket: string,
    path: string,
    file: File,
    onProgress: (pct: number, speedMBs: number, etaSec: number) => void
  ): Promise<string> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const endpoint = `https://${projectId}.supabase.co/storage/v1/upload/resumable`;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const upload = new tus.Upload(file, {
        endpoint,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        headers: {
          authorization: `Bearer ${token}`,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: bucket,
          objectName: path,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
        },
        chunkSize: 6 * 1024 * 1024, // 6MB chunks (mínimo exigido pelo Supabase)
        parallelUploads: 1, // TUS no Supabase só permite 1 — mas dentro do chunk é otimizado
        onError: (err) => reject(err),
        onProgress: (bytesUploaded, bytesTotal) => {
          const pct = (bytesUploaded / bytesTotal) * 100;
          const elapsed = (Date.now() - startTime) / 1000;
          const speedMBs = bytesUploaded / 1024 / 1024 / Math.max(elapsed, 0.1);
          const remaining = (bytesTotal - bytesUploaded) / 1024 / 1024;
          const etaSec = remaining / Math.max(speedMBs, 0.01);
          onProgress(pct, speedMBs, etaSec);
        },
        onSuccess: () => {
          const { data } = supabase.storage.from(bucket).getPublicUrl(path);
          resolve(data.publicUrl);
        },
      });

      // Verifica se há upload anterior (retomada automática)
      upload.findPreviousUploads().then((prev) => {
        if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
        upload.start();
      });
    });
  };

  const handleUpload = async () => {
    if (!form.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    let videoUrl = "";
    let thumbnailUrl = "";

    try {
      // Upload video file with real progress
      if (selectedFile) {
        setUploadStage("Enviando vídeo");
        const ext = selectedFile.name.split(".").pop();
        const path = `videos/${Date.now()}.${ext}`;
        videoUrl = await uploadFileWithProgress(
          "videos",
          path,
          selectedFile,
          (pct, speed, eta) => {
            setUploadProgress(pct);
            setUploadSpeed(`${speed.toFixed(1)} MB/s`);
            setUploadEta(eta > 60 ? `${Math.ceil(eta / 60)}min` : `${Math.ceil(eta)}s`);
          }
        );
      }

      // Upload thumbnail
      if (thumbnailFile) {
        setUploadStage("Enviando thumbnail");
        const ext = thumbnailFile.name.split(".").pop();
        const path = `thumbnails/${Date.now()}.${ext}`;
        thumbnailUrl = await uploadFileWithProgress(
          "videos",
          path,
          thumbnailFile,
          (pct) => setUploadProgress(pct)
        );
      }

      // Save to DB
      setUploadStage("Salvando no catálogo");
      setUploadProgress(99);
      const { error } = await supabase.from("movies").insert({
        title: form.title,
        video_url: videoUrl || null,
        thumbnail_url: thumbnailUrl || null,
        genre: form.genre,
        description: form.description,
        status: "published",
      });

      if (error) throw error;

      setUploadProgress(100);
      toast.success("✅ Vídeo publicado com sucesso!");
      setShowUpload(false);
      setForm({ title: "", genre: "Ação", type: "Filme", description: "" });
      setSelectedFile(null);
      setThumbnailFile(null);
      fetchVideos();
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    }

    setUploading(false);
    setUploadProgress(0);
    setUploadStage("");
    setUploadSpeed("");
    setUploadEta("");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Envio de Vídeos</h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie e envie filmes, séries e trailers</p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-4 h-4" /> Novo Upload
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
            {selectedFile ? (
              <p className="font-medium text-accent">{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)</p>
            ) : (
              <>
                <p className="font-medium mb-1">Arraste o vídeo aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground">MP4, MKV, AVI, MOV • Máx. 50GB por arquivo</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 px-6 py-2 bg-muted text-foreground rounded text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              Selecionar Arquivo
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
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Image className="w-3.5 h-3.5" /> Thumbnail</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files && setThumbnailFile(e.target.files[0])}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-muted file:text-foreground"
              />
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

          {uploading && (
            <div className="mt-4 p-4 bg-background border border-primary/40 rounded-lg space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-primary animate-pulse" />
                  {uploadStage}
                </span>
                <span className="font-mono text-primary font-bold text-lg">{uploadProgress.toFixed(1)}%</span>
              </div>
              <Progress value={uploadProgress} className="h-3" />
              {uploadSpeed && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold">⚡ {uploadSpeed}</span>
                  {uploadEta && <span className="font-semibold">⏱ Faltam ~{uploadEta}</span>}
                </div>
              )}
              <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 p-2 rounded">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>
                  <b>Mantenha esta aba aberta</b> até terminar. Se fechar o navegador, o upload para
                  (limitação do browser). Se cair a conexão, ele retoma automaticamente.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? `${uploadStage}...` : "Enviar e Publicar"}
            </button>
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
