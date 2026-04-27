import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, LogOut, Bell, Search } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AdminSidebar, { type AdminTab } from "@/components/AdminSidebar";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminMovies from "@/components/admin/AdminMovies";
import AdminChannels from "@/components/admin/AdminChannels";
import AdminVideos from "@/components/admin/AdminVideos";
import AdminBilling from "@/components/admin/AdminBilling";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminAuditLog from "@/components/admin/AdminAuditLog";
import AdminPurchases from "@/components/admin/AdminPurchases";
import AdminAccessLinks from "@/components/admin/AdminAccessLinks";
import AdminSponsors from "@/components/admin/AdminSponsors";
import AdminTelegramImport from "@/components/admin/AdminTelegramImport";
import AdminVideoLibrary from "@/components/admin/AdminVideoLibrary";
import AdminPlans from "@/components/admin/AdminPlans";
import AdminReports from "@/components/admin/AdminReports";
import AdminBranding from "@/components/admin/AdminBranding";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminNfcTagsPage from "@/components/admin/AdminNfcTagsPage";


const tabTitles: Record<AdminTab, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Visão geral da plataforma em tempo real" },
  reports: { title: "Relatórios", subtitle: "Usuários, receita e vídeos mais assistidos" },
  movies: { title: "Catálogo", subtitle: "Gerencie filmes, séries e conteúdos" },
  content: { title: "Catálogo", subtitle: "Gerencie filmes, séries e conteúdos" },
  plans: { title: "Planos", subtitle: "Cadastre planos, defina preços e vincule conteúdos" },
  channels: { title: "Canais Ao Vivo", subtitle: "Cadastre emissoras com nome, logo e stream" },
  videos: { title: "Envio de Vídeos", subtitle: "Faça upload e publique novos conteúdos" },
  library: { title: "Biblioteca de Vídeos", subtitle: "Pesquise e filtre vídeos por mês, canal e status" },
  telegram: { title: "Importar Telegram", subtitle: "Conectado ao worker MTProto externo" },
  billing: { title: "Faturamento", subtitle: "Receita, transações e métricas financeiras" },
  sponsors: { title: "Patrocinadores", subtitle: "Anunciantes pagos no player e na página Ao Vivo" },
  purchases: { title: "Compras PIX", subtitle: "Pagamentos Mercado Pago e liberação automática" },
  links: { title: "Links de Acesso", subtitle: "Gere links mágicos para clientes assistirem sem login" },
  users: { title: "Usuários", subtitle: "Assinantes, planos e permissões" },
  notifications: { title: "Notificações", subtitle: "Envie avisos para os usuários" },
  branding: { title: "Identidade Visual", subtitle: "Nome, logo e cores do app" },
  nfc: { title: "Crachás NFC", subtitle: "Cadastre e gerencie crachás para login do admin" },
  audit: { title: "Log de Auditoria", subtitle: "Histórico completo de ações na plataforma" },
  settings: { title: "Configurações", subtitle: "Ajustes da plataforma e segurança" },
};

const Admin = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Aba inicial vem da URL (ex.: /admin?tab=videos). Se F5 acontecer,
  // continuamos exatamente onde o admin estava.
  const initialTab = (() => {
    const t = searchParams.get("tab") as AdminTab | null;
    return t && t in tabTitles ? t : "dashboard";
  })();
  const [activeTab, setActiveTabState] = useState<AdminTab>(initialTab);

  // Sincroniza a URL sempre que a aba muda (sem empurrar histórico).
  const setActiveTab = (tab: AdminTab) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  // Mantém o state em sincronia se a URL mudar por outro caminho (link externo)
  useEffect(() => {
    const tab = searchParams.get("tab") as AdminTab | null;
    if (tab && tab in tabTitles && tab !== activeTab) setActiveTabState(tab);
  }, [searchParams, activeTab]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const meta = tabTitles[activeTab];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full admin-shell">
        <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="admin-header sticky top-0 z-20">
            <div className="flex items-center justify-between px-4 md:px-8 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">
                    Streamflix Studio
                  </p>
                  <h1 className="text-xl md:text-2xl font-black truncate">{meta.title}</h1>
                </div>
              </div>

              <div className="flex items-center gap-2 md:gap-4">
                <button
                  className="hidden md:flex items-center justify-center w-9 h-9 rounded-full hover:bg-[hsl(var(--admin-panel-hover))] text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Buscar"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  className="hidden md:flex items-center justify-center w-9 h-9 rounded-full hover:bg-[hsl(var(--admin-panel-hover))] text-muted-foreground hover:text-foreground transition-colors relative"
                  aria-label="Notificações"
                >
                  <Bell className="w-4 h-4" />
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-primary rounded-full" />
                </button>

                <div className="hidden md:flex items-center gap-2 pl-3 border-l border-[hsl(var(--admin-border))]">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-xs font-black text-primary-foreground">
                    {(user?.email || "A").charAt(0).toUpperCase()}
                  </div>
                  <div className="leading-tight max-w-[160px]">
                    <p className="text-xs font-semibold truncate">{user?.email}</p>
                    <p className="text-[10px] text-muted-foreground">Administrador</p>
                  </div>
                </div>

                <Link
                  to="/"
                  className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Site
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
            </div>
            <div className="px-4 md:px-8 pb-4">
              <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-8">
            {activeTab === "dashboard" && <AdminDashboard />}
            {activeTab === "reports" && <AdminReports />}
            {activeTab === "movies" && <AdminMovies />}
            {activeTab === "content" && <AdminMovies />}
            {activeTab === "plans" && <AdminPlans />}
            {activeTab === "channels" && <AdminChannels />}
            {activeTab === "videos" && <AdminVideos />}
            {activeTab === "library" && <AdminVideoLibrary />}
            {activeTab === "telegram" && <AdminTelegramImport />}
            {activeTab === "billing" && <AdminBilling />}
            {activeTab === "sponsors" && <AdminSponsors />}
            {activeTab === "purchases" && <AdminPurchases />}
            {activeTab === "links" && <AdminAccessLinks />}
            {activeTab === "users" && <AdminUsers />}
            {activeTab === "notifications" && <AdminNotifications />}
            {activeTab === "branding" && <AdminBranding />}
            {activeTab === "audit" && <AdminAuditLog />}
            {activeTab === "settings" && <AdminSettings />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
