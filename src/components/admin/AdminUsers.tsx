import { useEffect, useState } from "react";
import { Users, UserCheck, UserX, Search, Loader2, Pencil, X, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  status: string | null;
  created_at: string;
}

const AdminUsers = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editPlan, setEditPlan] = useState("");
  const [editStatus, setEditStatus] = useState("");

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar usuários");
    } else {
      setUsers((data as Profile[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openEdit = (user: Profile) => {
    setEditing(user);
    setEditPlan(user.plan || "Básico");
    setEditStatus(user.status || "Ativo");
  };

  const handleSave = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("profiles")
      .update({ plan: editPlan, status: editStatus })
      .eq("id", editing.id);

    if (error) {
      toast.error("Erro ao atualizar usuário");
    } else {
      toast.success("Usuário atualizado!");
      setEditing(null);
      fetchUsers();
    }
  };

  const activeCount = users.filter((u) => u.status === "Ativo").length;
  const inactiveCount = users.filter((u) => u.status !== "Ativo").length;

  const filtered = users.filter(
    (u) =>
      (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Gestão de Usuários</h2>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 text-accent"><UserCheck className="w-4 h-4" /> {activeCount} ativos</span>
          <span className="flex items-center gap-1 text-muted-foreground"><UserX className="w-4 h-4" /> {inactiveCount} inativos</span>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar usuário..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhum usuário encontrado</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left p-3 font-medium">Nome</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Email</th>
                <th className="text-left p-3 font-medium">Plano</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Desde</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{u.name || "—"}</td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">{u.email}</td>
                  <td className="p-3">
                    <span className={`text-xs font-semibold ${u.plan === "Premium" ? "text-yellow-400" : u.plan === "Padrão" ? "text-primary" : "text-muted-foreground"}`}>
                      {u.plan || "Básico"}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.status === "Ativo" ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                      {u.status || "Ativo"}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => openEdit(u)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button onClick={() => setEditing(null)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold mb-4">Editar Usuário</h3>
            <p className="text-sm text-muted-foreground mb-4">{editing.email}</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Plano</label>
                <select
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                >
                  <option>Básico</option>
                  <option>Padrão</option>
                  <option>Premium</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Status</label>
                <select
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  <option>Ativo</option>
                  <option>Inativo</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSave}
              className="w-full mt-5 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              <Save className="w-4 h-4" /> Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
