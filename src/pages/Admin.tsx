import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Film, Users, TrendingUp, DollarSign,
  Eye, Plus, Pencil, Trash2, Search, ArrowLeft, LogOut,
  BarChart3, UserCheck, UserX, Crown
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AdminSidebar from "@/components/AdminSidebar";

// Mock data
const stats = [
  { label: "Assinantes Ativos", value: "2.4M", change: "+12.5%", icon: Users, color: "text-accent" },
  { label: "Receita Mensal", value: "R$ 78.3M", change: "+8.2%", icon: DollarSign, color: "text-primary" },
  { label: "Visualizações Hoje", value: "5.1M", change: "+23.1%", icon: Eye, color: "text-blue-400" },
  { label: "Novos Assinantes", value: "32.4K", change: "+4.7%", icon: TrendingUp, color: "text-yellow-400" },
];

const topMovies = [
  { title: "O Último Horizonte", views: "1.2M", rating: 9.2 },
  { title: "Sombras do Passado", views: "980K", rating: 8.8 },
  { title: "Além das Estrelas", views: "875K", rating: 8.5 },
  { title: "A Fúria do Dragão", views: "720K", rating: 8.3 },
  { title: "Código Secreto", views: "650K", rating: 8.1 },
];

const mockContent = [
  { id: 1, title: "O Último Horizonte", type: "Filme", genre: "Ficção Científica", status: "Publicado", views: "1.2M" },
  { id: 2, title: "Sombras do Passado", type: "Filme", genre: "Suspense", status: "Publicado", views: "980K" },
  { id: 3, title: "A Casa dos Segredos", type: "Série", genre: "Drama", status: "Rascunho", views: "—" },
  { id: 4, title: "Além das Estrelas", type: "Filme", genre: "Aventura", status: "Publicado", views: "875K" },
  { id: 5, title: "Revolução Digital", type: "Série", genre: "Documentário", status: "Agendado", views: "—" },
];

const mockUsers = [
  { id: 1, name: "Ana Silva", email: "ana@email.com", plan: "Premium", status: "Ativo", since: "Jan 2024" },
  { id: 2, name: "Carlos Santos", email: "carlos@email.com", plan: "Padrão", status: "Ativo", since: "Mar 2024" },
  { id: 3, name: "Maria Oliveira", email: "maria@email.com", plan: "Básico", status: "Inativo", since: "Jul 2023" },
  { id: 4, name: "João Pereira", email: "joao@email.com", plan: "Premium", status: "Ativo", since: "Nov 2024" },
  { id: 5, name: "Lucia Costa", email: "lucia@email.com", plan: "Padrão", status: "Ativo", since: "Fev 2025" },
];

const revenueData = [
  { month: "Jan", value: 62 },
  { month: "Fev", value: 65 },
  { month: "Mar", value: 68 },
  { month: "Abr", value: 64 },
  { month: "Mai", value: 70 },
  { month: "Jun", value: 73 },
  { month: "Jul", value: 75 },
  { month: "Ago", value: 72 },
  { month: "Set", value: 74 },
  { month: "Out", value: 76 },
  { month: "Nov", value: 78 },
  { month: "Dez", value: 78 },
];

type Tab = "dashboard" | "content" | "users";

const Admin = () => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const maxRevenue = Math.max(...revenueData.map((d) => d.value));

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-14 flex items-center justify-between border-b border-border px-4 md:px-6 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <h1 className="text-lg font-bold hidden sm:block">Painel Administrativo</h1>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Voltar ao site
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* Dashboard Tab */}
            {activeTab === "dashboard" && (
              <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {stats.map((stat) => (
                    <div key={stat.label} className="bg-card border border-border rounded-lg p-5">
                      <div className="flex items-center justify-between mb-3">
                        <stat.icon className={`w-5 h-5 ${stat.color}`} />
                        <span className="text-xs font-medium text-accent">{stat.change}</span>
                      </div>
                      <p className="text-2xl font-black">{stat.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Revenue Chart */}
                  <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      <h2 className="font-bold">Receita Mensal (Milhões R$)</h2>
                    </div>
                    <div className="flex items-end gap-1.5 h-40">
                      {revenueData.map((d) => (
                        <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-primary/80 rounded-t hover:bg-primary transition-colors"
                            style={{ height: `${(d.value / maxRevenue) * 100}%` }}
                            title={`R$ ${d.value}M`}
                          />
                          <span className="text-[10px] text-muted-foreground">{d.month}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Movies */}
                  <div className="bg-card border border-border rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Crown className="w-4 h-4 text-yellow-400" />
                      <h2 className="font-bold">Top 5 Filmes</h2>
                    </div>
                    <div className="space-y-3">
                      {topMovies.map((movie, i) => (
                        <div key={movie.title} className="flex items-center gap-3">
                          <span className="text-xs font-black text-muted-foreground w-4">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{movie.title}</p>
                            <p className="text-xs text-muted-foreground">{movie.views} views</p>
                          </div>
                          <span className="text-xs font-bold text-accent">★ {movie.rating}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Content Tab */}
            {activeTab === "content" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Gestão de Conteúdo</h2>
                  <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90 transition-colors">
                    <Plus className="w-4 h-4" /> Adicionar Conteúdo
                  </button>
                </div>

                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar conteúdo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="bg-card border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left p-3 font-medium">Título</th>
                        <th className="text-left p-3 font-medium hidden sm:table-cell">Tipo</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Gênero</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium hidden sm:table-cell">Views</th>
                        <th className="text-right p-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockContent
                        .filter((c) => c.title.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((item) => (
                          <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-medium">{item.title}</td>
                            <td className="p-3 text-muted-foreground hidden sm:table-cell">{item.type}</td>
                            <td className="p-3 text-muted-foreground hidden md:table-cell">{item.genre}</td>
                            <td className="p-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                item.status === "Publicado"
                                  ? "bg-accent/20 text-accent"
                                  : item.status === "Rascunho"
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-yellow-500/20 text-yellow-400"
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground hidden sm:table-cell">{item.views}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button className="p-1.5 hover:bg-muted rounded transition-colors">
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                                <button className="p-1.5 hover:bg-destructive/20 rounded transition-colors">
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === "users" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Gestão de Usuários</h2>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1 text-accent"><UserCheck className="w-4 h-4" /> 2.4M ativos</span>
                    <span className="flex items-center gap-1 text-muted-foreground"><UserX className="w-4 h-4" /> 180K inativos</span>
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
                      {mockUsers
                        .filter((u) => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((user) => (
                          <tr key={user.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-medium">{user.name}</td>
                            <td className="p-3 text-muted-foreground hidden sm:table-cell">{user.email}</td>
                            <td className="p-3">
                              <span className={`text-xs font-semibold ${
                                user.plan === "Premium" ? "text-yellow-400" : user.plan === "Padrão" ? "text-primary" : "text-muted-foreground"
                              }`}>
                                {user.plan}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                user.status === "Ativo" ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"
                              }`}>
                                {user.status}
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground hidden md:table-cell">{user.since}</td>
                            <td className="p-3 text-right">
                              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                Gerenciar
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
