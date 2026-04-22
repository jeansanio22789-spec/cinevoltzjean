import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Shield,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  CheckCircle2,
  XCircle,
  Upload,
  Settings as SettingsIcon,
  FileClock,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  description: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const actionMeta: Record<string, { label: string; icon: typeof Plus; color: string }> = {
  create: { label: "Criação", icon: Plus, color: "text-accent bg-accent/10" },
  update: { label: "Edição", icon: Pencil, color: "text-blue-400 bg-blue-400/10" },
  delete: { label: "Exclusão", icon: Trash2, color: "text-destructive bg-destructive/10" },
  publish: { label: "Publicação", icon: Eye, color: "text-accent bg-accent/10" },
  unpublish: { label: "Despublicação", icon: EyeOff, color: "text-muted-foreground bg-muted/30" },
  login: { label: "Login", icon: LogIn, color: "text-blue-400 bg-blue-400/10" },
  logout: { label: "Logout", icon: LogOut, color: "text-muted-foreground bg-muted/30" },
  approve: { label: "Aprovação", icon: CheckCircle2, color: "text-accent bg-accent/10" },
  reject: { label: "Rejeição", icon: XCircle, color: "text-destructive bg-destructive/10" },
  upload: { label: "Upload", icon: Upload, color: "text-primary bg-primary/10" },
  settings_change: { label: "Configuração", icon: SettingsIcon, color: "text-yellow-400 bg-yellow-400/10" },
};

const resourceLabel: Record<string, string> = {
  movie: "Filme",
  user: "Usuário",
  transaction: "Transação",
  settings: "Configuração",
  video: "Vídeo",
  auth: "Autenticação",
  plan: "Plano",
};

const AdminAuditLog = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLogs((data as AuditLog[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (resourceFilter !== "all" && log.resource_type !== resourceFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          log.description?.toLowerCase().includes(q) ||
          log.user_email?.toLowerCase().includes(q) ||
          log.resource_id?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, search, actionFilter, resourceFilter]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: logs.length,
      today: logs.filter((l) => new Date(l.created_at).toDateString() === today).length,
      uniqueUsers: new Set(logs.map((l) => l.user_id).filter(Boolean)).size,
    };
  }, [logs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Log de Auditoria
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico completo de ações na plataforma
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded text-sm font-medium hover:bg-muted/70 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="admin-card p-4">
          <p className="text-xs text-muted-foreground">Total de eventos</p>
          <p className="text-2xl font-black mt-1">{stats.total}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-xs text-muted-foreground">Hoje</p>
          <p className="text-2xl font-black mt-1 text-primary">{stats.today}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-xs text-muted-foreground">Usuários ativos</p>
          <p className="text-2xl font-black mt-1">{stats.uniqueUsers}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição, email ou ID..."
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">Todas as ações</option>
          {Object.entries(actionMeta).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">Todos os recursos</option>
          {Object.entries(resourceLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-card p-12 text-center">
          <FileClock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhum evento registrado</p>
          <p className="text-sm text-muted-foreground mt-1">
            As ações dos usuários aparecerão aqui assim que ocorrerem.
          </p>
        </div>
      ) : (
        <div className="admin-card overflow-hidden">
          <div className="divide-y divide-[hsl(var(--admin-border))]">
            {filtered.map((log) => {
              const meta = actionMeta[log.action] ?? {
                label: log.action,
                icon: Filter,
                color: "text-muted-foreground bg-muted/30",
              };
              const Icon = meta.icon;
              const isOpen = expanded === log.id;
              const hasDetails = log.changes || log.metadata;

              return (
                <div key={log.id}>
                  <button
                    onClick={() => hasDetails && setExpanded(isOpen ? null : log.id)}
                    className="w-full flex items-start gap-3 p-4 text-left hover:bg-[hsl(var(--admin-panel-hover))] transition-colors"
                  >
                    <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${meta.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {meta.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-muted/50 rounded text-muted-foreground">
                          {resourceLabel[log.resource_type] ?? log.resource_type}
                        </span>
                      </div>
                      <p className="text-sm font-medium mt-1 truncate">
                        {log.description ?? "Sem descrição"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span className="font-medium">
                          {log.user_email ?? "Sistema"}
                        </span>
                        <span>•</span>
                        <span>
                          {format(new Date(log.created_at), "dd 'de' MMM 'às' HH:mm:ss", { locale: ptBR })}
                        </span>
                        {log.resource_id && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[10px]">
                              ID: {log.resource_id.slice(0, 8)}…
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {hasDetails && (
                      <div className="shrink-0 text-muted-foreground">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    )}
                  </button>

                  {isOpen && hasDetails && (
                    <div className="bg-background/40 px-4 pb-4 pt-2 space-y-3">
                      {log.changes && (
                        <div>
                          <p className="text-xs font-bold text-muted-foreground mb-1.5">
                            Alterações
                          </p>
                          <pre className="text-[11px] bg-background border border-border rounded p-3 overflow-x-auto font-mono leading-relaxed">
                            {JSON.stringify(log.changes, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.metadata && (
                        <div>
                          <p className="text-xs font-bold text-muted-foreground mb-1.5">
                            Metadados
                          </p>
                          <pre className="text-[11px] bg-background border border-border rounded p-3 overflow-x-auto font-mono leading-relaxed">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAuditLog;
