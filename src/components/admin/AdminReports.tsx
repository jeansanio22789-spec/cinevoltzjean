import { useEffect, useState } from "react";
import { Loader2, Eye, DollarSign, Users, Film, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TopMovie {
  movie_id: string;
  title: string;
  thumbnail_url: string | null;
  views: number;
}

const AdminReports = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSubs: 0,
    totalRevenue: 0,
    last30Revenue: 0,
    totalViews: 0,
    last30Views: 0,
  });
  const [topMovies, setTopMovies] = useState<TopMovie[]>([]);

  useEffect(() => {
    const load = async () => {
      const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
      const [usersRes, subsRes, txAll, txRecent, viewsAll, viewsRecent, viewsAggReq, moviesRes] =
        await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
          supabase.from("transactions").select("amount"),
          supabase.from("transactions").select("amount").gte("created_at", since30),
          supabase.from("video_views").select("id", { count: "exact", head: true }),
          supabase.from("video_views").select("id", { count: "exact", head: true }).gte("created_at", since30),
          supabase.from("video_views").select("movie_id"),
          supabase.from("movies").select("id, title, thumbnail_url"),
        ]);

      const totalRevenue = (txAll.data || []).reduce((s, t: any) => s + Number(t.amount || 0), 0);
      const last30Revenue = (txRecent.data || []).reduce((s, t: any) => s + Number(t.amount || 0), 0);

      // top movies por contagem
      const counts = new Map<string, number>();
      ((viewsAggReq.data as any[]) || []).forEach((v) => {
        counts.set(v.movie_id, (counts.get(v.movie_id) || 0) + 1);
      });
      const movieMap = new Map<string, any>();
      ((moviesRes.data as any[]) || []).forEach((m) => movieMap.set(m.id, m));

      const top: TopMovie[] = Array.from(counts.entries())
        .map(([movie_id, views]) => ({
          movie_id,
          views,
          title: movieMap.get(movie_id)?.title || "—",
          thumbnail_url: movieMap.get(movie_id)?.thumbnail_url || null,
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      setStats({
        totalUsers: usersRes.count || 0,
        activeSubs: subsRes.count || 0,
        totalRevenue,
        last30Revenue,
        totalViews: viewsAll.count || 0,
        last30Views: viewsRecent.count || 0,
      });
      setTopMovies(top);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const cards = [
    { label: "Usuários", value: stats.totalUsers.toLocaleString("pt-BR"), hint: `${stats.activeSubs} assinaturas ativas`, icon: Users },
    { label: "Receita total", value: `R$ ${stats.totalRevenue.toFixed(2)}`, hint: `R$ ${stats.last30Revenue.toFixed(2)} nos últimos 30 dias`, icon: DollarSign },
    { label: "Visualizações", value: stats.totalViews.toLocaleString("pt-BR"), hint: `${stats.last30Views} nos últimos 30 dias`, icon: Eye },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Relatórios</h2>
        <p className="text-sm text-muted-foreground mt-1">Visão geral de usuários, receita e engajamento.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <c.icon className="w-5 h-5 text-primary" />
              <TrendingUp className="w-4 h-4 text-muted-foreground/40" />
            </div>
            <p className="text-3xl font-black">{c.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{c.label}</p>
            <p className="text-xs text-muted-foreground mt-2">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Film className="w-4 h-4 text-primary" />
          <h3 className="font-bold">Vídeos mais assistidos</h3>
        </div>
        {topMovies.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhuma visualização registrada ainda.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {topMovies.map((m, i) => (
              <li key={m.movie_id} className="flex items-center gap-3 p-4">
                <span className="text-2xl font-black text-muted-foreground/30 w-6">{i + 1}</span>
                <div className="w-10 h-14 rounded bg-muted overflow-hidden shrink-0">
                  {m.thumbnail_url && <img src={m.thumbnail_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <p className="flex-1 text-sm font-semibold truncate">{m.title}</p>
                <div className="flex items-center gap-1.5 text-sm">
                  <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-bold">{m.views.toLocaleString("pt-BR")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminReports;
