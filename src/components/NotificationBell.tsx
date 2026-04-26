import { useEffect, useState } from "react";
import { Bell, X, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Notif {
  id: string;
  title: string;
  message: string;
  link: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

const NotificationBell = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const unread = items.filter((n) => !n.is_read).length;

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as Notif[]) || []);
  };

  useEffect(() => {
    if (!user) { setItems([]); return; }
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase.from("notifications").update({ is_read: true })
      .eq("user_id", user.id).eq("is_read", false);
    load();
  };

  const removeOne = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    load();
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative text-muted-foreground hover:text-foreground transition-colors hidden md:block"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] bg-card border border-border rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <p className="font-bold text-sm">Notificações</p>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Check className="w-3 h-3" /> Marcar lidas
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Sem novidades.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((n) => {
                    const Wrap: any = n.link ? Link : "div";
                    const wrapProps = n.link ? { to: n.link, onClick: () => setOpen(false) } : {};
                    return (
                      <li key={n.id} className={`group ${!n.is_read ? "bg-primary/5" : ""}`}>
                        <Wrap {...wrapProps} className="flex items-start gap-2 p-3 hover:bg-muted/50">
                          {!n.is_read && <span className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{n.title}</p>
                            {n.message && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {new Date(n.created_at).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeOne(n.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 text-destructive rounded shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Wrap>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
