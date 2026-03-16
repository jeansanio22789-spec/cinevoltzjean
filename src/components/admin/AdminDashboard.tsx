import { useEffect, useState } from "react";
import { Users, DollarSign, Eye, TrendingUp, BarChart3, Crown, Loader2, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalMovies: 0,
    publishedMovies: 0,
    totalTransactions: 0,
    totalRevenue: 0,
  });
  const [topMovies, setTopMovies] = useState<{ title: string; genre: string | null; status: string | null }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [usersRes, moviesRes, transRes, topRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("movies").select("id, status", { count: "exact" }),
        supabase.from("transactions").select("amount"),
        supabase.from("movies").select("title, genre, status").order("created_at", { ascending: false }).limit(5),
      ]);

      const publishedCount = (moviesRes.data || []).filter((m: any) => m.status === "published").length;
      const totalRev = (transRes.data || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

      setStats({
        totalUsers: usersRes.count || 0,
        totalMovies: moviesRes.count || 0,
        publishedMovies: publishedCount,
        totalTransactions: (transRes.data || []).length,
        totalRevenue: totalRev,
      });
      setTopMovies((topRes.data as any[]) || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statCards = [
    { label: "Usuários Cadastrados", value: stats.totalUsers.toString(), icon: Users, color: "text-accent" },
    { label: "Receita Total", value: `R$ ${stats.totalRevenue.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
    { label: "Filmes Cadastrados", value: stats.totalMovies.toString(), icon: Film, color: "text-blue-400" },
    { label: "Filmes Publicados", value: stats.publishedMovies.toString(), icon: TrendingUp, color: "text-yellow-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-black">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="font-bold">Resumo</h2>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-background rounded-lg">
              <span className="text-sm">Total de Transações</span>
              <span className="font-bold">{stats.totalTransactions}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-background rounded-lg">
              <span className="text-sm">Filmes Publicados</span>
              <span className="font-bold">{stats.publishedMovies}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-background rounded-lg">
              <span className="text-sm">Rascunhos</span>
              <span className="font-bold">{stats.totalMovies - stats.publishedMovies}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Crown className="w-4 h-4 text-yellow-400" />
            <h2 className="font-bold">Filmes Recentes</h2>
          </div>
          <div className="space-y-3">
            {topMovies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum filme cadastrado</p>
            ) : (
              topMovies.map((movie, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-black text-muted-foreground w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{movie.title}</p>
                    <p className="text-xs text-muted-foreground">{movie.genre}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    movie.status === "published" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                  }`}>
                    {movie.status === "published" ? "Pub" : "Rasc"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
