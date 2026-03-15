import {
  DollarSign, TrendingUp, TrendingDown, CreditCard,
  QrCode, Smartphone, Receipt, Download, ArrowUpRight, ArrowDownRight
} from "lucide-react";

const monthlyRevenue = [
  { month: "Jan", revenue: 62.4, subscriptions: 2180000, churn: 3.2 },
  { month: "Fev", revenue: 65.1, subscriptions: 2210000, churn: 2.9 },
  { month: "Mar", revenue: 68.7, subscriptions: 2280000, churn: 2.7 },
  { month: "Abr", revenue: 64.2, subscriptions: 2250000, churn: 3.5 },
  { month: "Mai", revenue: 70.5, subscriptions: 2320000, churn: 2.4 },
  { month: "Jun", revenue: 73.8, subscriptions: 2350000, churn: 2.1 },
  { month: "Jul", revenue: 75.2, subscriptions: 2370000, churn: 2.3 },
  { month: "Ago", revenue: 72.1, subscriptions: 2340000, churn: 2.8 },
  { month: "Set", revenue: 74.9, subscriptions: 2360000, churn: 2.5 },
  { month: "Out", revenue: 76.3, subscriptions: 2380000, churn: 2.2 },
  { month: "Nov", revenue: 78.1, subscriptions: 2400000, churn: 2.0 },
  { month: "Dez", revenue: 78.3, subscriptions: 2420000, churn: 1.9 },
];

const recentTransactions = [
  { id: "TXN-84721", user: "Ana Silva", plan: "Premium", amount: "R$ 55,90", method: "Cartão", date: "15 Mar 2026", status: "Aprovado" },
  { id: "TXN-84720", user: "Carlos Santos", plan: "Padrão", amount: "R$ 39,90", method: "PIX", date: "15 Mar 2026", status: "Aprovado" },
  { id: "TXN-84719", user: "Maria Oliveira", plan: "Básico", amount: "R$ 18,90", method: "Cartão", date: "15 Mar 2026", status: "Pendente" },
  { id: "TXN-84718", user: "João Pereira", plan: "Premium", amount: "R$ 55,90", method: "Google Pay", date: "14 Mar 2026", status: "Aprovado" },
  { id: "TXN-84717", user: "Lucia Costa", plan: "Padrão", amount: "R$ 39,90", method: "PIX", date: "14 Mar 2026", status: "Aprovado" },
  { id: "TXN-84716", user: "Pedro Lima", plan: "Premium", amount: "R$ 55,90", method: "Apple Pay", date: "14 Mar 2026", status: "Reembolso" },
  { id: "TXN-84715", user: "Fernanda Souza", plan: "Básico", amount: "R$ 18,90", method: "Cartão", date: "14 Mar 2026", status: "Aprovado" },
  { id: "TXN-84714", user: "Ricardo Alves", plan: "Padrão", amount: "R$ 39,90", method: "PIX", date: "13 Mar 2026", status: "Aprovado" },
];

const planBreakdown = [
  { plan: "Básico", users: 680000, percentage: 28, revenue: "R$ 12.8M", color: "bg-muted-foreground" },
  { plan: "Padrão", users: 1020000, percentage: 42, revenue: "R$ 40.7M", color: "bg-primary" },
  { plan: "Premium", users: 720000, percentage: 30, revenue: "R$ 40.2M", color: "bg-yellow-400" },
];

const paymentMethodStats = [
  { method: "Cartão de Crédito", icon: CreditCard, percentage: 52, amount: "R$ 40.7M" },
  { method: "PIX", icon: QrCode, percentage: 35, amount: "R$ 27.4M" },
  { method: "Carteiras Digitais", icon: Smartphone, percentage: 13, amount: "R$ 10.2M" },
];

const AdminBilling = () => {
  const maxRevenue = Math.max(...monthlyRevenue.map((d) => d.revenue));
  const currentMonth = monthlyRevenue[monthlyRevenue.length - 1];
  const prevMonth = monthlyRevenue[monthlyRevenue.length - 2];
  const revenueGrowth = (((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Faturamento</h2>
          <p className="text-sm text-muted-foreground mt-1">Receita, transações e métricas financeiras</p>
        </div>
        <button className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded text-sm font-medium hover:bg-muted/80 transition-colors">
          <Download className="w-4 h-4" /> Exportar Relatório
        </button>
      </div>

      {/* Financial Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <DollarSign className="w-5 h-5 text-primary" />
            <span className="flex items-center gap-0.5 text-xs font-medium text-accent">
              <ArrowUpRight className="w-3 h-3" /> +{revenueGrowth}%
            </span>
          </div>
          <p className="text-2xl font-black">R$ {currentMonth.revenue}M</p>
          <p className="text-xs text-muted-foreground mt-1">Receita Mensal</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <Receipt className="w-5 h-5 text-accent" />
            <span className="text-xs font-medium text-accent">+4.7%</span>
          </div>
          <p className="text-2xl font-black">R$ 939.6M</p>
          <p className="text-xs text-muted-foreground mt-1">Receita Anual (2026)</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-5 h-5 text-yellow-400" />
            <span className="text-xs font-medium text-accent">R$ 32,35</span>
          </div>
          <p className="text-2xl font-black">ARPU</p>
          <p className="text-xs text-muted-foreground mt-1">Receita por Usuário</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <TrendingDown className="w-5 h-5 text-destructive" />
            <span className="flex items-center gap-0.5 text-xs font-medium text-accent">
              <ArrowDownRight className="w-3 h-3" /> -{currentMonth.churn}%
            </span>
          </div>
          <p className="text-2xl font-black">{currentMonth.churn}%</p>
          <p className="text-xs text-muted-foreground mt-1">Taxa de Churn</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <h3 className="font-bold mb-4">Receita Mensal (Milhões R$)</h3>
          <div className="flex items-end gap-1.5 h-44">
            {monthlyRevenue.map((d) => (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-muted-foreground">{d.revenue}</span>
                <div
                  className="w-full bg-primary/80 rounded-t hover:bg-primary transition-colors cursor-pointer"
                  style={{ height: `${(d.revenue / maxRevenue) * 100}%` }}
                  title={`${d.month}: R$ ${d.revenue}M`}
                />
                <span className="text-[10px] text-muted-foreground">{d.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plan Breakdown */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-bold mb-4">Receita por Plano</h3>
          <div className="space-y-4">
            {planBreakdown.map((plan) => (
              <div key={plan.plan}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">{plan.plan}</span>
                  <span className="text-muted-foreground">{plan.revenue}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${plan.color} rounded-full`} style={{ width: `${plan.percentage}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{(plan.users / 1000000).toFixed(1)}M assinantes • {plan.percentage}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="font-bold mb-4">Métodos de Pagamento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {paymentMethodStats.map((pm) => (
            <div key={pm.method} className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border">
              <pm.icon className="w-8 h-8 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{pm.method}</p>
                <p className="text-xs text-muted-foreground">{pm.amount} • {pm.percentage}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold">Transações Recentes</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left p-3 font-medium">ID</th>
              <th className="text-left p-3 font-medium">Usuário</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">Plano</th>
              <th className="text-left p-3 font-medium">Valor</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Método</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Data</th>
              <th className="text-left p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {recentTransactions.map((tx) => (
              <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="p-3 font-mono text-xs text-muted-foreground">{tx.id}</td>
                <td className="p-3 font-medium">{tx.user}</td>
                <td className="p-3 text-muted-foreground hidden sm:table-cell">{tx.plan}</td>
                <td className="p-3 font-medium">{tx.amount}</td>
                <td className="p-3 text-muted-foreground hidden md:table-cell">{tx.method}</td>
                <td className="p-3 text-muted-foreground hidden md:table-cell">{tx.date}</td>
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
    </div>
  );
};

export default AdminBilling;
