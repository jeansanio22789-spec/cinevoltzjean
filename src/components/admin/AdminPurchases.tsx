import { useEffect, useState } from "react";
import { Loader2, ShoppingBag, CheckCircle2, Clock, XCircle, Search, RefreshCw, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Purchase {
  id: string;
  user_email: string | null;
  user_name: string | null;
  plan: string;
  amount: number;
  status: string;
  method: string;
  created_at: string;
  paid_at: string | null;
  mp_payment_id: string | null;
}

const STATUS_MAP: Record<string, { label: string; cls: string; icon: any }> = {
  approved:  { label: "Aprovado",  cls: "bg-accent/20 text-accent",            icon: CheckCircle2 },
  pending:   { label: "Pendente",  cls: "bg-yellow-500/20 text-yellow-400",    icon: Clock },
  rejected:  { label: "Rejeitado", cls: "bg-destructive/20 text-destructive",  icon: XCircle },
  cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground",      icon: XCircle },
  refunded:  { label: "Estornado", cls: "bg-muted text-muted-foreground",      icon: RefreshCw },
};

const AdminPurchases = () => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const handleRefund = async (p: Purchase) => {
    const ok = window.confirm(
      `Reembolsar R$ ${Number(p.amount).toFixed(2)} para ${p.user_email || "usuário"}?\n\n` +
      `O dinheiro volta para o cliente e o acesso é cancelado. Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    setRefundingId(p.id);
    try {
      const { data, error } = await supabase.functions.invoke("mp-refund", {
        body: { purchase_id: p.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Reembolso processado com sucesso");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao processar reembolso");
    } finally {
      setRefundingId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("purchases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setPurchases((data as Purchase[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = purchases.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (p.user_email || "").toLowerCase().includes(q) ||
        (p.user_name || "").toLowerCase().includes(q) ||
        (p.mp_payment_id || "").includes(q)
      );
    }
    return true;
  });

  const totalApproved = purchases
    .filter((p) => p.status === "approved")
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="admin-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Receita confirmada</p>
          <p className="text-2xl font-black mt-1">R$ {totalApproved.toFixed(2)}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Total compras</p>
          <p className="text-2xl font-black mt-1">{purchases.length}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Aguardando pagamento</p>
          <p className="text-2xl font-black mt-1 text-yellow-400">
            {purchases.filter((p) => p.status === "pending").length}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          {(["all", "approved", "pending", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-md ${
                filter === s
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "Todas" : STATUS_MAP[s]?.label || s}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar email, nome ou ID..."
            className="bg-card border border-border rounded pl-8 pr-3 py-1.5 text-sm w-64"
          />
        </div>
        <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Atualizar
        </button>
      </div>

      <div className="admin-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingBag className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma compra encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-[hsl(var(--admin-border))]">
                  <th className="text-left p-3 font-semibold">Cliente</th>
                  <th className="text-left p-3 font-semibold hidden sm:table-cell">Plano</th>
                  <th className="text-left p-3 font-semibold">Valor</th>
                  <th className="text-left p-3 font-semibold hidden md:table-cell">Data</th>
                  <th className="text-right p-3 font-semibold">Status</th>
                  <th className="text-right p-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const st = STATUS_MAP[p.status] || STATUS_MAP.pending;
                  const Icon = st.icon;
                  const canRefund = p.status === "approved" && !!p.mp_payment_id;
                  return (
                    <tr key={p.id} className="border-b border-[hsl(var(--admin-border))]/50 last:border-0">
                      <td className="p-3">
                        <p className="font-medium truncate max-w-[200px]">{p.user_name || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.user_email || "Sem login"}</p>
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell">{p.plan}</td>
                      <td className="p-3 font-bold">R$ {Number(p.amount).toFixed(2)}</td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell text-xs">
                        {new Date(p.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="p-3 text-right">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full inline-flex items-center gap-1 ${st.cls}`}>
                          <Icon className="w-3 h-3" /> {st.label}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {canRefund ? (
                          <button
                            onClick={() => handleRefund(p)}
                            disabled={refundingId === p.id}
                            className="text-xs px-2.5 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 inline-flex items-center gap-1"
                            title="Reembolsar este pagamento"
                          >
                            {refundingId === p.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Undo2 className="w-3 h-3" />
                            )}
                            Reembolsar
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPurchases;
