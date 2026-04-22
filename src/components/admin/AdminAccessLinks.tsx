import { useEffect, useState } from "react";
import { Loader2, Plus, Copy, CheckCheck, Trash2, Link2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Token {
  id: string;
  token: string;
  movie_id: string | null;
  max_uses: number | null;
  uses: number;
  expires_at: string;
  created_at: string;
  label: string | null;
}

interface Movie { id: string; title: string; }

const AdminAccessLinks = () => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [movieId, setMovieId] = useState<string>("");
  const [hours, setHours] = useState<number>(24);
  const [maxUses, setMaxUses] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [t, m] = await Promise.all([
      supabase.from("access_tokens").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("movies").select("id, title").order("title"),
    ]);
    setTokens((t.data as Token[]) || []);
    setMovies((m.data as Movie[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!movieId) { toast.error("Escolha um filme"); return; }
    setCreating(true);
    const expires = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("access_tokens").insert({
      movie_id: movieId,
      expires_at: expires,
      max_uses: maxUses ? Number(maxUses) : null,
      label: label || null,
    });
    setCreating(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Link gerado!");
    setMovieId(""); setMaxUses(""); setLabel("");
    load();
  };

  const buildLink = (t: Token) => {
    const movieId = t.movie_id;
    return `${window.location.origin}/assistir/${movieId}?token=${t.token}`;
  };

  const copy = (t: Token) => {
    navigator.clipboard.writeText(buildLink(t));
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Link copiado!");
  };

  const remove = async (id: string) => {
    if (!confirm("Revogar este link?")) return;
    const { error } = await supabase.from("access_tokens").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Link revogado");
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="admin-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="w-4 h-4 text-primary" />
          <h3 className="font-bold">Gerar link de acesso</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={movieId}
            onChange={(e) => setMovieId(e.target.value)}
            className="bg-background border border-border rounded px-3 py-2 text-sm"
          >
            <option value="">Selecionar filme</option>
            {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          <input
            type="number" min={1} max={720}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            placeholder="Horas válidas"
            className="bg-background border border-border rounded px-3 py-2 text-sm"
          />
          <input
            type="number" min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="Limite de usos (opcional)"
            className="bg-background border border-border rounded px-3 py-2 text-sm"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Etiqueta (ex: Cliente João)"
            className="bg-background border border-border rounded px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={create} disabled={creating}
          className="mt-4 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Gerar link
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          O cliente abre o link e assiste sem precisar de cadastro ou login.
        </p>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="p-4 border-b border-[hsl(var(--admin-border))]">
          <h3 className="font-bold text-sm">Links ativos</h3>
        </div>
        {tokens.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">Nenhum link gerado ainda.</p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--admin-border))]/50">
            {tokens.map((t) => {
              const movie = movies.find((m) => m.id === t.movie_id);
              const expired = new Date(t.expires_at) < new Date();
              const usedUp = t.max_uses != null && t.uses >= t.max_uses;
              return (
                <li key={t.id} className="p-4 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{movie?.title || "Filme removido"}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />
                        {expired ? "Expirado" : `expira ${new Date(t.expires_at).toLocaleString("pt-BR")}`}
                      </span>
                      <span>{t.uses}{t.max_uses != null ? `/${t.max_uses}` : ""} usos</span>
                      {t.label && <span className="text-primary">· {t.label}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => copy(t)}
                    disabled={expired || usedUp}
                    className="text-xs flex items-center gap-1 px-3 py-1.5 rounded bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-40"
                  >
                    {copiedId === t.id ? <><CheckCheck className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar link</>}
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    className="text-xs text-destructive hover:bg-destructive/10 p-1.5 rounded"
                    title="Revogar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminAccessLinks;
