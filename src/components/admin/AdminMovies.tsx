import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Film, Link as LinkIcon, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Movie {
  id: string;
  title: string;
  video_url: string | null;
  thumbnail_url: string | null;
  description: string | null;
  genre: string | null;
  year: number | null;
  duration: string | null;
  rating: string | null;
  status: string | null;
}

const AdminMovies = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Movie | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    video_url: "",
    thumbnail_url: "",
    description: "",
    genre: "Ação",
    year: 2025,
    duration: "",
    rating: "14+",
    status: "draft",
  });

  const fetchMovies = async () => {
    const { data, error } = await supabase
      .from("movies")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar filmes");
    } else {
      setMovies((data as Movie[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMovies();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", video_url: "", thumbnail_url: "", description: "", genre: "Ação", year: 2025, duration: "", rating: "14+", status: "draft" });
    setShowForm(true);
  };

  const openEdit = (movie: Movie) => {
    setEditing(movie);
    setForm({
      title: movie.title,
      video_url: movie.video_url || "",
      thumbnail_url: movie.thumbnail_url || "",
      description: movie.description || "",
      genre: movie.genre || "Ação",
      year: movie.year || 2025,
      duration: movie.duration || "",
      rating: movie.rating || "14+",
      status: movie.status || "draft",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("O título é obrigatório");
      return;
    }

    setSaving(true);

    if (editing) {
      const { error } = await supabase
        .from("movies")
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq("id", editing.id);

      if (error) {
        toast.error("Erro ao atualizar filme");
      } else {
        toast.success("Filme atualizado!");
      }
    } else {
      const { error } = await supabase.from("movies").insert(form);

      if (error) {
        toast.error("Erro ao adicionar filme");
      } else {
        toast.success("Filme adicionado!");
      }
    }

    setSaving(false);
    setShowForm(false);
    fetchMovies();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este filme?")) return;

    const { error } = await supabase.from("movies").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Filme excluído");
      fetchMovies();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Gerenciar Filmes</h2>
          <p className="text-sm text-muted-foreground mt-1">Adicione e edite filmes da plataforma</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Filme
        </button>
      </div>

      {/* Movie List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : movies.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Film className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhum filme ainda</p>
          <p className="text-sm text-muted-foreground mt-1">Clique em "Novo Filme" para adicionar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {movies.map((movie) => (
            <div
              key={movie.id}
              onClick={() => openEdit(movie)}
              className="bg-card border border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group"
            >
              {movie.thumbnail_url ? (
                <img
                  src={movie.thumbnail_url}
                  alt={movie.title}
                  className="w-full h-40 object-cover"
                />
              ) : (
                <div className="w-full h-40 bg-muted flex items-center justify-center">
                  <Film className="w-10 h-10 text-muted-foreground" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold truncate">{movie.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {movie.genre} • {movie.year} • {movie.rating}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    movie.status === "published" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                  }`}>
                    {movie.status === "published" ? "Publicado" : "Rascunho"}
                  </span>
                </div>
                {movie.video_url && (
                  <p className="text-xs text-primary mt-2 truncate flex items-center gap-1">
                    <LinkIcon className="w-3 h-3 shrink-0" />
                    {movie.video_url}
                  </p>
                )}
                <div className="flex items-center justify-end gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(movie); }}
                    className="p-1.5 hover:bg-muted rounded transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(movie.id); }}
                    className="p-1.5 hover:bg-destructive/20 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Add Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowForm(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold mb-5">
              {editing ? "Editar Filme" : "Novo Filme"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Título *</label>
                <input
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Nome do filme"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" /> URL do Vídeo
                </label>
                <input
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="https://... (YouTube, Vimeo, link direto)"
                  value={form.video_url}
                  onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">URL da Thumbnail</label>
                <input
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="https://... (imagem de capa)"
                  value={form.thumbnail_url}
                  onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Descrição</label>
                <textarea
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  rows={3}
                  placeholder="Sinopse do filme..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Gênero</label>
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
                  <label className="text-sm font-medium mb-1.5 block">Ano</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || 2025 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Duração</label>
                  <input
                    className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="2h 15min"
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Classificação</label>
                  <select
                    className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.rating}
                    onChange={(e) => setForm({ ...form, rating: e.target.value })}
                  >
                    <option>L</option>
                    <option>10+</option>
                    <option>12+</option>
                    <option>14+</option>
                    <option>16+</option>
                    <option>18+</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Status</label>
                <select
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-3 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMovies;
