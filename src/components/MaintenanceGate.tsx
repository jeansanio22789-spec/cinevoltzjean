import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface Props {
  children: React.ReactNode;
}

const MaintenanceGate = ({ children }: Props) => {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("Estamos em manutenção. Voltamos já! 🛠️");
  const [checked, setChecked] = useState(false);
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const location = useLocation();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["maintenance_mode", "maintenance_message"]);
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.key] = s.value; });
      setEnabled(map.maintenance_mode === "true");
      if (map.maintenance_message) setMessage(map.maintenance_message);
      setChecked(true);
    };
    load();

    // Realtime: reage à mudança de modo manutenção
    const channel = supabase
      .channel("maintenance-mode")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_settings" },
        () => load()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Admins, login e admin sempre passam
  const bypass =
    isAdmin ||
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/login");

  if (!checked) return <>{children}</>;
  if (!enabled || bypass) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
          <Wrench className="w-10 h-10 text-primary animate-pulse" />
        </div>
        <h1 className="text-3xl font-black">Modo Manutenção</h1>
        <p className="text-muted-foreground whitespace-pre-line">{message}</p>
        <p className="text-xs text-muted-foreground/70">
          Estamos trabalhando para melhorar sua experiência. Tente novamente em instantes.
        </p>
        <a
          href="/login"
          className="inline-block text-xs text-primary hover:underline"
        >
          Acesso administrativo
        </a>
      </div>
    </div>
  );
};

export default MaintenanceGate;
