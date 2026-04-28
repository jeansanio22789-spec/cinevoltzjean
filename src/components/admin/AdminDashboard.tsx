import { useEffect, useMemo, useState } from "react";
import {
  Users, DollarSign, TrendingUp, Loader2, Film, Crown,
  ArrowUpRight, Activity, PlayCircle, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import LivePreview from "./LivePreview";
import BuildStatusCard from "./BuildStatusCard";

interface Transaction {
  amount: number;
  created_at: string;
  status: string | null;
  plan: string;
  user_email: string | null;
  user_name: string | null;
}

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalMovies: 0,
    publishedMovies: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    revenueLast7: 0,
  });
  const [topMovies, setTopMovies] = useState<
    { title: string; genre: string | null; status: string | null; thumbnail_url: string | null }[]
  >([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [usersRes, moviesRes, transRes, topRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("movies").select("id, status", { count: "exact" }),
        supabase.from("transactions").select("amount, created_at, status, plan, user_email, user_name").order("created_at", { ascending: false }),
        supabase.from("movies").select("title, genre, status, thumbnail_url").order("created_at", { ascending: false }).limit(5),
      ]);

      const publishedCount = (moviesRes.data || []).filter((m: any) => m.status === "published").length;
      const txs = (transRes.data || []) as Transaction[];
      const totalRev = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const revenueLast7 = txs
        .filter((t) => new Date(t.created_at).getTime() >= sevenDaysAgo)
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      setStats({
        totalUsers: usersRes.count || 0,
        totalMovies: moviesRes.count || 0,
        publishedMovies: publishedCount,
        totalTransactions: txs.length,
        totalRevenue: totalRev,
        revenueLast7,
      });
      setTransactions(txs);
      setTopMovies((topRes.data as any[]) || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Build last 7 day buckets for the bar chart
  const dailyRevenue = useMemo(() => {
    const days: { label: string; value: number; date: Date }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push({
        label: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        value: 0,
        date: d,
      });
    }
    transactions.forEach((tx) => {
      const tDate = new Date(tx.created_at);
      tDate.setHours(0, 0, 0, 0);
      const idx = days.findIndex((d) => d.date.getTime() === tDate.getTime());
      if (idx >= 0) days[idx].value += Number(tx.amount || 0);
    });
    return days;
  }, [transactions]);

  const maxDaily = Math.max(...dailyRevenue.map((d) => d.value), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const kpis = [
    {
      label: "Receita Total",
      value: `R$ ${stats.totalRevenue.toFixed(2)}`,
      hint: `+R$ ${stats.revenueLast7.toFixed(2)} nos últimos 7 dias`,
      icon: DollarSign,
      tint: "from-primary/30 to-primary/0",
      iconColor: "text-primary",
    },
    {
      label: "Assinantes",
      value: stats.totalUsers.toLocaleString("pt-BR"),
      hint: "Total de contas ativas",
      icon: Users,
      tint: "from-blue-500/25 to-blue-500/0",
      iconColor: "text-blue-400",
    },
    {
      label: "Catálogo",
      value: stats.totalMovies.toString(),
      hint: `${stats.publishedMovies} publicados`,
      icon: Film,
      tint: "from-yellow-500/25 to-yellow-500/0",
      iconColor: "text-yellow-400",
    },
    {
      label: "Transações",
      value: stats.totalTransactions.toString(),
      hint: "Volume total processado",
      icon: Activity,
      tint: "from-accent/30 to-accent/0",
      iconColor: "text-accent",
    },
  ];

  const recentTx = transactions.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Hero KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="admin-card admin-kpi p-5 relative">
            <div className={`absolute inset-0 bg-gradient-to-br ${kpi.tint} pointer-events-none rounded-[inherit]`} />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="w-9 h-9 rounded-lg bg-background/40 border border-[hsl(var(--admin-border))] flex items-center justify-center">
                  <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <p className="text-3xl font-black tracking-tight">{kpi.value}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 mt-1">
                {kpi.label}
              </p>
              <p className="text-xs text-muted-foreground mt-2">{kpi.hint}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Live preview do app */}
      <LivePreview />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 admin-card p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
                <TrendingUp className="w-3.5 h-3.5" /> Receita semanal
              </div>
              <h3 className="text-lg font-bold">Últimos 7 dias</h3>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black">R$ {stats.revenueLast7.toFixed(2)}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">total da semana</p>
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 h-40">
            {dailyRevenue.map((d, i) => {
              const heightPct = (d.value / maxDaily) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary/40 transition-all hover:from-primary hover:to-primary/70 relative group"
                      style={{ height: `${Math.max(heightPct, 4)}%`, minHeight: d.value > 0 ? "8px" : "2px" }}
                    >
                      {d.value > 0 && (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap bg-card border border-[hsl(var(--admin-border))] px-2 py-0.5 rounded">
                          R$ {d.value.toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Crown className="w-4 h-4 text-yellow-400" />
            <h3 className="font-bold">Top do Catálogo</h3>
          </div>
          <div className="space-y-3">
            {topMovies.length === 0 ? (
              <div className="text-center py-8">
                <Film className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Nenhum filme cadastrado</p>
              </div>
            ) : (
              topMovies.map((movie, i) => (
                <div key={i} className="flex items-center gap-3 group">
                  <span className="text-2xl font-black text-muted-foreground/30 w-6 leading-none">
                    {i + 1}
                  </span>
                  <div className="w-10 h-14 rounded bg-muted shrink-0 overflow-hidden border border-[hsl(var(--admin-border))]">
                    {movie.thumbnail_url ? (
                      <img src={movie.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                      {movie.title}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {movie.genre}
                    </p>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      movie.status === "published"
                        ? "bg-accent/20 text-accent"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {movie.status === "published" ? "ON" : "OFF"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent transactions table */}
      <div className="admin-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[hsl(var(--admin-border))]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-bold">Atividade recente</h3>
          </div>
          <span className="text-xs text-muted-foreground">Últimas {recentTx.length} transações</span>
        </div>

        {recentTx.length === 0 ? (
          <div className="p-12 text-center">
            <PlayCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma atividade ainda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-[hsl(var(--admin-border))]">
                  <th className="text-left p-4 font-semibold">Cliente</th>
                  <th className="text-left p-4 font-semibold hidden sm:table-cell">Plano</th>
                  <th className="text-left p-4 font-semibold">Valor</th>
                  <th className="text-left p-4 font-semibold hidden md:table-cell">Quando</th>
                  <th className="text-right p-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map((tx, i) => (
                  <tr key={i} className="border-b border-[hsl(var(--admin-border))]/50 last:border-0 hover:bg-[hsl(var(--admin-panel-hover))]/40 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {(tx.user_name || tx.user_email || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[180px]">{tx.user_name || "—"}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{tx.user_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground hidden sm:table-cell">{tx.plan}</td>
                    <td className="p-4 font-bold">R$ {Number(tx.amount).toFixed(2)}</td>
                    <td className="p-4 text-muted-foreground hidden md:table-cell">
                      {new Date(tx.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-4 text-right">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          tx.status === "Aprovado"
                            ? "bg-accent/20 text-accent"
                            : tx.status === "Pendente"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-destructive/20 text-destructive"
                        }`}
                      >
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
    </div>
  );
};

export default AdminDashboard;
