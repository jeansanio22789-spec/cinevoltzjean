import { useEffect, useState } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, CreditCard,
  QrCode, Smartphone, Receipt, Download, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const AdminBilling = () => {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, count: 0 });

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      const txs = data || [];
      const total = txs.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
      setTransactions(txs);
      setStats({ total, count: txs.length });
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const methodCounts: Record<string, { count: number; total: number }> = {};
  transactions.forEach((tx) => {
    const m = tx.method || "Outro";
    if (!methodCounts[m]) methodCounts[m] = { count: 0, total: 0 };
    methodCounts[m].count++;
    methodCounts[m].total += Number(tx.amount || 0);
  });

  const methodIcons: Record<string, any> = {
    "Cartão": CreditCard,
    "PIX": QrCode,
    "Google Pay": Smartphone,
    "Apple Pay": Smartphone,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Faturamento</h2>
          <p className="text-sm text-muted-foreground mt-1">Receita, transações e métricas financeiras</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <p className="text-2xl font-black">R$ {stats.total.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">Receita Total</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <Receipt className="w-5 h-5 text-accent" />
          </div>
          <p className="text-2xl font-black">{stats.count}</p>
          <p className="text-xs text-muted-foreground mt-1">Total de Transações</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-5 h-5 text-yellow-400" />
          </div>
          <p className="text-2xl font-black">R$ {stats.count > 0 ? (stats.total / stats.count).toFixed(2) : "0.00"}</p>
          <p className="text-xs text-muted-foreground mt-1">Ticket Médio</p>
        </div>
      </div>

      {/* Payment Methods */}
      {Object.keys(methodCounts).length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-bold mb-4">Métodos de Pagamento</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(methodCounts).map(([method, data]) => {
              const Icon = methodIcons[method] || CreditCard;
              const pct = stats.count > 0 ? ((data.count / stats.count) * 100).toFixed(0) : 0;
              return (
                <div key={method} className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border">
                  <Icon className="w-8 h-8 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{method}</p>
                    <p className="text-xs text-muted-foreground">R$ {data.total.toFixed(2)} • {pct}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transactions Table */}
      {transactions.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhuma transação registrada</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <div className="p-4 border-b border-border">
            <h3 className="font-bold">Transações Recentes</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left p-3 font-medium">Usuário</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Plano</th>
                <th className="text-left p-3 font-medium">Valor</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Método</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Data</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{tx.user_name || tx.user_email || "—"}</td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">{tx.plan}</td>
                  <td className="p-3 font-medium">R$ {Number(tx.amount).toFixed(2)}</td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">{tx.method}</td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">{new Date(tx.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="p-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      tx.status === "Aprovado" ? "bg-accent/20 text-accent"
                      : tx.status === "Pendente" ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-destructive/20 text-destructive"
                    }`}>
                      {tx.status}
                    </span>
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

export default AdminBilling;
