import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResumableUpload } from "@/hooks/useResumableUpload";
import VideoUploadProgress from "./VideoUploadProgress";
import { Upload, Save, Loader2, Image as ImageIcon, X, Sparkles } from "lucide-react";

const cleanTitle = (raw: string) => {
  let t = raw.replace(/\.(mp4|mkv|webm|mov|avi|m4v|ts|flv|wmv)$/i, "");
  t = t.replace(/[._]+/g, " ");
  t = t.replace(
    /\b(1080p|720p|480p|2160p|4k|web[-\s]?dl|bluray|bdrip|hdrip|x264|x265|h264|h265|hevc|aac|ac3|dual[-\s]?audio|dublado|legendado|nacional|hdtv|hdr|10bit|amzn|nf|atmos|repack|proper|extended|remastered)\b/gi,
    "",
  );
  t = t.replace(/[\[\(].*?[\]\)]/g, "");
  return t.replace(/\s{2,}/g, " ").trim();
};

export default function DirectVideoUploader() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const { state, start, pause, resume, reset } = useResumableUpload();

  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [isPremiere, setIsPremiere] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleVideoPick = (file: File) => {
    if (!title) setTitle(cleanTitle(file.name));
    reset();
    start(file, {
      bucket: "videos",
      onSuccess: (publicUrl) => {
        setVideoUrl(publicUrl);
        toast({ title: "Vídeo enviado!" });
      },
      onError: (err) => {
        toast({ title: "Falha no envio", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleCoverPick = async (file: File) => {
    setUploadingCover(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `direct/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("thumbnails").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
      setThumbnailUrl(data.publicUrl);
      toast({ title: "Capa enviada!" });
    } catch (e) {
      toast({ title: "Erro ao enviar capa", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Informe o título", variant: "destructive" });
      return;
    }
    if (!videoUrl) {
      toast({ title: "Envie o vídeo primeiro", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("movies").insert({
      title: title.trim(),
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl || null,
      status: "published",
      is_premiere: isPremiere,
      year: new Date().getFullYear(),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao publicar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Filme publicado!" });
    setTitle("");
    setVideoUrl("");
    setThumbnailUrl("");
    setIsPremiere(false);
    reset();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Upload className="h-4 w-4 text-primary" />
        Enviar vídeo direto (do PC ou celular)
      </div>
      <p className="text-xs text-muted-foreground">
        Envie o vídeo direto para o app sem passar pelo Drive. Suporta pausa e retomada automática.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          (e.target as HTMLInputElement).value = "";
          if (f) handleVideoPick(f);
        }}
      />
      <VideoUploadProgress
        state={state}
        onPick={() => fileInputRef.current?.click()}
        onPause={pause}
        onResume={resume}
        onCancel={reset}
      />

      <div className="space-y-2 pt-1">
        <Input
          placeholder="Título do filme"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            (e.target as HTMLInputElement).value = "";
            if (f) handleCoverPick(f);
          }}
        />
        {thumbnailUrl ? (
          <div className="relative rounded-md overflow-hidden border border-border">
            <img src={thumbnailUrl} alt="Capa" className="w-full h-32 object-cover" />
            <button
              type="button"
              onClick={() => setThumbnailUrl("")}
              className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm p-1 rounded-full hover:bg-destructive/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={uploadingCover}
            onClick={() => coverInputRef.current?.click()}
          >
            {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            <span className="ml-2">{uploadingCover ? "Enviando capa..." : "Enviar capa (opcional)"}</span>
          </Button>
        )}

        <label className="flex items-center justify-between gap-3 p-2.5 rounded-md border border-border bg-background/50 cursor-pointer hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-2 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Marcar como <strong>Estreia</strong></span>
          </div>
          <input
            type="checkbox"
            checked={isPremiere}
            onChange={(e) => setIsPremiere(e.target.checked)}
            className="w-4 h-4 accent-primary cursor-pointer"
          />
        </label>

        <Button
          onClick={handleSave}
          disabled={saving || !videoUrl || !title.trim()}
          className="w-full"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span className="ml-2">{saving ? "Publicando..." : "Publicar no app"}</span>
        </Button>
      </div>
    </Card>
  );
}
