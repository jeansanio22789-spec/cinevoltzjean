import { useEffect, useState } from "react";
import {
  Users, UserCheck, UserX, Search, Loader2, Pencil, X, Save,
  Ban, CheckCircle2, ShieldPlus, ShieldMinus, Trash2, MoreVertical,
  UserPlus, Mail, Crown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAudit } from "@/lib/auditLog";

interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  status: string | null;
  created_at: string;
}

interface RoleRow { user_id: string; role: string }

const PLANS = ["Básico", "Padrão", "Premium"];
const STATUSES = ["Ativo", "Inativo", "Banido"];

const AdminUsers = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editPlan, setEditPlan] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteAsAdmin, setInviteAsAdmin] = useState(false);
  const [inviting, setInviting] = useState(false);

  const fetchAll = async () => {
    const [{ data: usersData }, { data: rolesData }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setUsers((usersData as Profile[]) || []);
    const map: Record<string, string[]> = {};
    (rolesData as RoleRow[] || []).forEach((r) => {
      if (!map[r.user_id]) map[r.user_id] = [];
      map[r.user_id].push(r.role);
    });
    setRoles(map);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // close menu on outside click
  useEffect(() => {
    const close = () => setOpenMenu(null);
    if (openMenu) {
      document.addEventListener("click", close);
      return () => document.removeEventListener("click", close);
    }
  }, [openMenu]);

  const openEdit = (user: Profile) => {
    setEditing(user);
    setEditPlan(user.plan || "Básico");
    setEditStatus(user.status || "Ativo");
  };

  const handleSave = async () => {
    if (!editing) return;
    const before = { plan: editing.plan, status: editing.status };
    const { error } = await supabase
      .from("profiles")
      .update({ plan: editPlan, status: editStatus })
      .eq("id", editing.id);

    if (error) {
      toast.error("Erro ao atualizar usuário");
    } else {
      await logAudit({
        action: "update",
        resource_type: "user",
        resource_id: editing.id,
        description: `Atualizou usuário ${editing.email}`,
        changes: { before, after: { plan: editPlan, status: editStatus } },
      });
      toast.success("Usuário atualizado!");
      setEditing(null);
      fetchAll();
    }
  };

  const setStatus = async (u: Profile, status: string) => {
    const { error } = await supabase.rpc("admin_set_user_status", { _target: u.id, _status: status });
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    await logAudit({
      action: "update",
      resource_type: "user",
      resource_id: u.id,
      description: `${status === "Banido" ? "Baniu" : status === "Ativo" ? "Reativou" : "Desativou"} ${u.email}`,
      changes: { before: { status: u.status }, after: { status } },
    });
    toast.success(status === "Banido" ? "Usuário banido" : status === "Ativo" ? "Usuário reativado" : "Usuário desativado");
    fetchAll();
  };

  const toggleAdmin = async (u: Profile) => {
    const isCurrentlyAdmin = (roles[u.id] || []).includes("admin");
    if (isCurrentlyAdmin) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", u.id).eq("role", "admin");
      if (error) return toast.error("Erro: " + error.message);
      await logAudit({ action: "update", resource_type: "user", resource_id: u.id, description: `Removeu admin de ${u.email}` });
      toast.success("Admin removido");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: u.id, role: "admin" });
      if (error) return toast.error("Erro: " + error.message);
      await logAudit({ action: "update", resource_type: "user", resource_id: u.id, description: `Promoveu ${u.email} a admin` });
      toast.success("Promovido a admin");
    }
    fetchAll();
  };

  const handleDelete = async (u: Profile) => {
    if (!confirm(`Excluir definitivamente o perfil de ${u.email}?\n(Isso remove o perfil; o login pode persistir até remover na autenticação.)`)) return;
    // Remove roles e profile
    await supabase.from("user_roles").delete().eq("user_id", u.id);
    const { error } = await supabase.from("profiles").delete().eq("id", u.id);
    if (error) return toast.error("Erro: " + error.message);
    await logAudit({ action: "delete", resource_type: "user", resource_id: u.id, description: `Excluiu perfil ${u.email}` });
    toast.success("Perfil removido");
    fetchAll();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    const { data, error } = await supabase.auth.signUp({
      email: inviteEmail,
      password: invitePassword,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message);
      setInviting(false);
      return;
    }
    const newUserId = data.user?.id;
    if (newUserId && inviteAsAdmin) {
      await supabase.from("user_roles").insert({ user_id: newUserId, role: "admin" });
    }
    await logAudit({
      action: "create",
      resource_type: "user",
      resource_id: newUserId || undefined,
      description: `Cadastrou usuário ${inviteEmail}${inviteAsAdmin ? " (admin)" : ""}`,
    });
    toast.success("Usuário cadastrado!");
    setInviteOpen(false);
    setInviteEmail("");
    setInvitePassword("");
    setInviteAsAdmin(false);
    setInviting(false);
    fetchAll();
  };

  const activeCount = users.filter((u) => u.status === "Ativo").length;
  const bannedCount = users.filter((u) => u.status === "Banido").length;
  const inactiveCount = users.length - activeCount - bannedCount;

  const filtered = users.filter((u) => {
    const matchSearch =
      (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === "all" || u.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Gestão de Usuários</h2>
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded font-semibold text-sm hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Cadastrar usuário
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total" value={users.length} icon={Users} />
        <KPI label="Ativos" value={activeCount} icon={UserCheck} accent="text-accent" />
        <KPI label="Inativos" value={inactiveCount} icon={UserX} accent="text-muted-foreground" />
        <KPI label="Banidos" value={bannedCount} icon={Ban} accent="text-destructive" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">Todos os status</option>
          <option value="Ativo">Ativos</option>
          <option value="Inativo">Inativos</option>
          <option value="Banido">Banidos</option>
        </select>
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
                <th className="text-left p-3 font-medium hidden md:table-cell">Função</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Desde</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isAdminUser = (roles[u.id] || []).includes("admin");
                return (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{u.name || "—"}</td>
                    <td className="p-3 text-muted-foreground hidden sm:table-cell">{u.email}</td>
                    <td className="p-3">
                      <span className={`text-xs font-semibold ${u.plan === "Premium" ? "text-yellow-400" : u.plan === "Padrão" ? "text-primary" : "text-muted-foreground"}`}>
                        {u.plan || "Básico"}
                      </span>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={u.status || "Ativo"} />
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      {isAdminUser ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-400">
                          <Crown className="w-3 h-3" /> Admin
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Usuário</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3 text-right relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === u.id ? null : u.id); }}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenu === u.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-2 top-10 z-30 w-52 bg-popover border border-border rounded-lg shadow-xl py-1 text-left"
                        >
                          <MenuItem icon={Pencil} label="Editar plano/status" onClick={() => { openEdit(u); setOpenMenu(null); }} />
                          {u.status !== "Ativo" ? (
                            <MenuItem icon={CheckCircle2} label="Reativar" onClick={() => { setStatus(u, "Ativo"); setOpenMenu(null); }} />
                          ) : (
                            <MenuItem icon={UserX} label="Desativar" onClick={() => { setStatus(u, "Inativo"); setOpenMenu(null); }} />
                          )}
                          {u.status !== "Banido" ? (
                            <MenuItem icon={Ban} label="Banir acesso" danger onClick={() => { setStatus(u, "Banido"); setOpenMenu(null); }} />
                          ) : (
                            <MenuItem icon={CheckCircle2} label="Desbanir" onClick={() => { setStatus(u, "Ativo"); setOpenMenu(null); }} />
                          )}
                          <div className="my-1 border-t border-border" />
                          {isAdminUser ? (
                            <MenuItem icon={ShieldMinus} label="Remover admin" onClick={() => { toggleAdmin(u); setOpenMenu(null); }} />
                          ) : (
                            <MenuItem icon={ShieldPlus} label="Promover a admin" onClick={() => { toggleAdmin(u); setOpenMenu(null); }} />
                          )}
                          <div className="my-1 border-t border-border" />
                          <MenuItem icon={Trash2} label="Excluir perfil" danger onClick={() => { handleDelete(u); setOpenMenu(null); }} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <Modal onClose={() => setEditing(null)} title="Editar Usuário" subtitle={editing.email || ""}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Plano</label>
              <select
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
              >
                {PLANS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Status</label>
              <select
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="w-full mt-5 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            <Save className="w-4 h-4" /> Salvar
          </button>
        </Modal>
      )}

      {/* Invite modal */}
      {inviteOpen && (
        <Modal onClose={() => setInviteOpen(false)} title="Cadastrar novo usuário" subtitle="Crie a conta direto pelo painel">
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="usuario@email.com"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Senha provisória</label>
              <input
                type="text"
                required
                minLength={6}
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={inviteAsAdmin} onChange={(e) => setInviteAsAdmin(e.target.checked)} className="w-4 h-4 accent-primary" />
              Cadastrar como administrador
            </label>
            <button
              type="submit"
              disabled={inviting}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" /> {inviting ? "Criando..." : "Criar usuário"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
};

const KPI = ({ label, value, icon: Icon, accent = "" }: { label: string; value: number; icon: any; accent?: string }) => (
  <div className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
    <Icon className={`w-5 h-5 ${accent || "text-muted-foreground"}`} />
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const styles = status === "Ativo"
    ? "bg-accent/20 text-accent"
    : status === "Banido"
    ? "bg-destructive/20 text-destructive"
    : "bg-muted text-muted-foreground";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles}`}>{status}</span>;
};

const MenuItem = ({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${danger ? "text-destructive" : ""}`}
  >
    <Icon className="w-3.5 h-3.5" /> {label}
  </button>
);

const Modal = ({ children, onClose, title, subtitle }: { children: React.ReactNode; onClose: () => void; title: string; subtitle?: string }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6 relative animate-in fade-in zoom-in-95 duration-200">
      <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
        <X className="w-5 h-5" />
      </button>
      <h3 className="text-lg font-bold mb-1">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>}
      {children}
    </div>
  </div>
);

export default AdminUsers;
