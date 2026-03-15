import { LayoutDashboard, Film, Users, Upload, DollarSign, Settings } from "lucide-react";
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

export type AdminTab = "dashboard" | "content" | "users" | "videos" | "billing" | "settings";

const menuItems = [
  { title: "Dashboard", tab: "dashboard" as AdminTab, icon: LayoutDashboard },
  { title: "Conteúdo", tab: "content" as AdminTab, icon: Film },
  { title: "Envio de Vídeos", tab: "videos" as AdminTab, icon: Upload },
  { title: "Faturamento", tab: "billing" as AdminTab, icon: DollarSign },
  { title: "Usuários", tab: "users" as AdminTab, icon: Users },
  { title: "Configurações", tab: "settings" as AdminTab, icon: Settings },
];

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
}

const AdminSidebar = ({ activeTab, setActiveTab }: AdminSidebarProps) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && (
              <span className="text-primary font-black text-lg tracking-tight">STREAMFLIX</span>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.tab}>
                  <SidebarMenuButton
                    onClick={() => setActiveTab(item.tab)}
                    className={`cursor-pointer ${
                      activeTab === item.tab ? "bg-muted text-primary font-medium" : ""
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {!collapsed && <span>{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

export default AdminSidebar;
