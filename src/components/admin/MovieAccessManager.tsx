import { useEffect, useState } from "react";
import { X, Users, Trash2, Plus, Loader2, Search, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Profile {
  id: string;
  email: string | null;
  name: string | null;
}

interface AccessRow {
  id: string;
  user_id: string;
  granted_at: string;
  expires_at: string | null;
  profile?: Profile | null;
}

interface Props {
  movie: { id: string; title: string };
  onClose: () => void;
}

const MovieAccessManager = ({ movie, onClose }: Props) => {
  const [loading, setLoading] = useState(true);
  const [accesses, setAccesses] = useState<AccessRow[]>([]);
  const [search, setSearch] = useState("");
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [granting, setGranting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [accRes, usersRes] = await Promise.all([
      supabase
        .from("user_movie_access")
        .select("id, user_id, granted_at, expires_at")
        .eq("movie_id", movie.id),
      supabase.from("profiles").select("id, email, name").order("email"),
    ]);

    const profiles = (usersRes.data as Profile[]) || [];
    setAllUsers(profiles);

    const rows = ((accRes.data as AccessRow[]) || []).map((r) => ({
      ...r,
      profile: profiles.find((p) => p.id === r.user_id) || null,
    }));
    setAccesses(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id]);

  const grant = async (userId: string) => {
    setGranting(userId);
    const { error } = await supabase
      .from("user_movie_access")
      .insert({ user_id: userId, movie_id: movie.id });
    setGranting(null);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Usuário já tem acesso" : "Erro ao liberar");
      return;
    }
    toast.success("Acesso liberado");
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Remover o acesso deste usuário?")) return;
    const { error } = await supabase.from("user_movie_access").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover");
      return;
    }
    toast.success("Acesso removido");
    load();
  };

  const grantedIds = new Set(accesses.map((a) => a.user_id));
  const term = search.trim().toLowerCase();
  const candidates = allUsers
    .filter((u) => !grantedIds.has(u.id))
    .filter(
      (u) =>
        !term ||
        (u.email || "").toLowerCase().includes(term) ||
        (u.name || "").toLowerCase().includes(term),
    )
    .slice(0, 20);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">Liberar acesso</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Quem pode assistir <span className="font-semibold text-foreground">{movie.title}</span>
        </p>

        {/* Lista de quem já tem acesso */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Liberados ({accesses.length})
          </p>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : accesses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center bg-muted/30 rounded-lg">
              Ninguém tem acesso ainda. Use a busca abaixo pra liberar.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {accesses.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {a.profile?.name || a.profile?.email || a.user_id.slice(0, 8)}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {a.profile?.email}
                    </p>
                  </div>
                  <button
                    onClick={() => revoke(a.id)}
                    className="p-1.5 hover:bg-destructive/20 rounded transition-colors shrink-0"
                    title="Remover acesso"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Buscar usuários pra liberar */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Adicionar usuário
          </p>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por email ou nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              {term ? "Nenhum usuário encontrado" : "Digite pra buscar usuários"}
            </p>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {candidates.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.name || u.email}</p>
                    {u.name && u.email && (
                      <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                    )}
                  </div>
                  <button
                    onClick={() => grant(u.id)}
                    disabled={granting === u.id}
                    className="flex items-center gap-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1.5 rounded transition-colors disabled:opacity-50 shrink-0"
                  >
                    {granting === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Liberar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-2.5 bg-muted text-foreground rounded-lg text-sm font-semibold hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" /> Pronto
        </button>
      </div>
    </div>
  );
};

export default MovieAccessManager;
