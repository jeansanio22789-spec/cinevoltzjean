import {
  LayoutDashboard, Film, Users, Upload, DollarSign, Settings, Tv2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type AdminTab =
  | "dashboard"
  | "content"
  | "movies"
  | "users"
  | "videos"
  | "billing"
  | "settings";

const sections = [
  {
    label: "Visão Geral",
    items: [{ title: "Dashboard", tab: "dashboard" as AdminTab, icon: LayoutDashboard }],
  },
  {
    label: "Conteúdo",
    items: [
      { title: "Catálogo", tab: "movies" as AdminTab, icon: Film },
      { title: "Envio de Vídeos", tab: "videos" as AdminTab, icon: Upload },
    ],
  },
  {
    label: "Negócio",
    items: [
      { title: "Faturamento", tab: "billing" as AdminTab, icon: DollarSign },
      { title: "Usuários", tab: "users" as AdminTab, icon: Users },
    ],
  },
  {
    label: "Sistema",
    items: [{ title: "Configurações", tab: "settings" as AdminTab, icon: Settings }],
  },
];

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
}

const AdminSidebar = ({ activeTab, setActiveTab }: AdminSidebarProps) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-[hsl(var(--admin-border))]">
      <SidebarContent className="bg-[hsl(var(--admin-bg))]">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-[hsl(var(--admin-border))]">
          {collapsed ? (
            <div className="flex justify-center">
              <Tv2 className="w-5 h-5 text-primary" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shrink-0">
                <Tv2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="leading-tight">
                <p className="text-primary font-black text-sm tracking-wider">STREAMFLIX</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
              </div>
            </div>
          )}
        </div>

        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 px-3 mt-2">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive = activeTab === item.tab;
                  return (
                    <SidebarMenuItem key={item.tab}>
                      <SidebarMenuButton
                        onClick={() => setActiveTab(item.tab)}
                        className={`cursor-pointer rounded-none my-0.5 transition-all ${
                          isActive
                            ? "admin-sidebar-item-active"
                            : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--admin-panel-hover))]"
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        {!collapsed && <span className="text-sm">{item.title}</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
};

export default AdminSidebar;
