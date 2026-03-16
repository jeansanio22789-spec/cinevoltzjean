import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, LogOut, Plus, Pencil, Trash2, Search } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AdminSidebar, { type AdminTab } from "@/components/AdminSidebar";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminMovies from "@/components/admin/AdminMovies";
import AdminVideos from "@/components/admin/AdminVideos";
import AdminBilling from "@/components/admin/AdminBilling";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminSettings from "@/components/admin/AdminSettings";

const Admin = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 md:px-6 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <h1 className="text-lg font-bold hidden sm:block">Painel Administrativo</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground hidden md:block">{user?.email}</span>
              <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Voltar ao site</span>
              </Link>
              <button onClick={handleSignOut} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {activeTab === "dashboard" && <AdminDashboard />}
            {activeTab === "movies" && <AdminMovies />}
            {activeTab === "content" && <AdminMovies />}
            {activeTab === "videos" && <AdminVideos />}
            {activeTab === "billing" && <AdminBilling />}
            {activeTab === "users" && <AdminUsers />}
            {activeTab === "settings" && <AdminSettings />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
