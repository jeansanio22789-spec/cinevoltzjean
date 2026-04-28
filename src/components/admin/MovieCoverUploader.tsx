import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageIcon, Loader2, Search, Upload, CheckCircle2 } from "lucide-react";

type Movie = {
  id: string;
  title: string;
  thumbnail_url: string | null;
};

export default function MovieCoverUploader() {
  const { toast } = useToast();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("movies")
      .select("id, title, thumbnail_url")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: "Erro ao carregar filmes", description: error.message, variant: "destructive" });
    } else {
      setMovies(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleFile = async (movie: Movie, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem.", variant: "destructive" });
      return;
    }
    setUploadingId(movie.id);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `app-uploads/${movie.id}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("thumbnails")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("thumbnails").getPublicUrl(path);

      const { error: updErr } = await supabase
        .from("movies")
        .update({ thumbnail_url: pub.publicUrl })
        .eq("id", movie.id);
      if (updErr) throw updErr;

      setMovies((prev) =>
        prev.map((m) => (m.id === movie.id ? { ...m, thumbnail_url: pub.publicUrl } : m)),
      );
      toast({ title: "Capa atualizada", description: movie.title });
    } catch (e) {
      toast({
        title: "Erro no upload",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploadingId(null);
    }
  };

  const filtered = movies.filter((m) => {
    if (onlyMissing && m.thumbnail_url) return false;
    if (filter && !m.title.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const missingCount = movies.filter((m) => !m.thumbnail_url).length;

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-panel))] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary" />
        <h2 className="font-bold text-sm">Capas dos Filmes (upload direto)</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {missingCount} sem capa de {movies.length}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Envie a imagem direto do celular/PC. Sem Drive, sem login Google. A capa é
        salva no app e aparece na hora.
      </p>

      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar pelo título..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          Só sem capa
        </label>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Recarregar"}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-sm text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          {onlyMissing ? "🎉 Todos os filmes têm capa!" : "Nenhum filme encontrado."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((m) => {
            const busy = uploadingId === m.id;
            return (
              <div
                key={m.id}
                className="rounded-md border border-[hsl(var(--admin-border))] overflow-hidden bg-background flex flex-col"
              >
                <div className="aspect-[2/3] bg-muted relative">
                  {m.thumbnail_url ? (
                    <img
                      src={m.thumbnail_url}
                      alt={m.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground p-2 text-center">
                      sem capa
                    </div>
                  )}
                  {m.thumbnail_url && (
                    <CheckCircle2 className="absolute top-1 right-1 w-4 h-4 text-green-500 drop-shadow" />
                  )}
                </div>
                <div className="p-2 space-y-2">
                  <p className="text-[11px] font-medium line-clamp-2 leading-tight" title={m.title}>
                    {m.title}
                  </p>
                  <input
                    ref={(el) => (fileInputs.current[m.id] = el)}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(m, f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    variant={m.thumbnail_url ? "secondary" : "default"}
                    className="w-full h-7 text-[11px]"
                    disabled={busy}
                    onClick={() => fileInputs.current[m.id]?.click()}
                  >
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-3 w-3 mr-1" />
                        {m.thumbnail_url ? "Trocar" : "Enviar capa"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
