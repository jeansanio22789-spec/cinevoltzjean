import { useEffect, useState } from "react";
import { Loader2, Send, Bell, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Notif {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  is_read: boolean;
  user_id: string;
}

const AdminNotifications = () => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setHistory((data as Notif[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sendBroadcast = async () => {
    if (!title.trim()) { toast.error("Informe o título"); return; }
    setSending(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, status");
    const targets = ((profiles as any[]) || [])
      .filter((p) => p.status !== "Banido")
      .map((p) => ({
        user_id: p.id,
        title,
        message,
        link,
        type: "broadcast",
      }));
    if (targets.length === 0) { toast.error("Nenhum usuário"); setSending(false); return; }
    const { error } = await supabase.from("notifications").insert(targets);
    if (error) toast.error(error.message);
    else toast.success(`Notificação enviada para ${targets.length} usuário(s)`);
    setTitle(""); setMessage(""); setLink("");
    setSending(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Apagar esta notificação?")) return;
    await supabase.from("notifications").delete().eq("id", id);
    load();
  };

  // Agrupa por título+criado_at (broadcasts geram N rows)
  const grouped = history.reduce<Record<string, Notif[]>>((acc, n) => {
    const key = `${n.title}|${n.created_at.slice(0, 16)}`;
    (acc[key] ||= []).push(n);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold">Notificações</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Envie avisos para todos os usuários ou veja avisos automáticos.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="font-bold flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Novo aviso</h3>
        <input
          className="w-full px-3 py-2 bg-background border border-border rounded text-sm"
          placeholder="Título (ex: Manutenção programada)"
          value={title} onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full px-3 py-2 bg-background border border-border rounded text-sm"
          rows={3} placeholder="Mensagem"
          value={message} onChange={(e) => setMessage(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 bg-background border border-border rounded text-sm"
          placeholder="Link (opcional, ex: /assistir/123)"
          value={link} onChange={(e) => setLink(e.target.value)}
        />
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>Avisos de novos vídeos são enviados automaticamente.</span>
          <button
            onClick={sendBroadcast}
            disabled={sending}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar para todos
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold">Histórico</h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma notificação.</div>
        ) : (
          <ul className="divide-y divide-border">
            {Object.entries(grouped).map(([key, group]) => {
              const first = group[0];
              const readCount = group.filter((g) => g.is_read).length;
              return (
                <li key={key} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                        first.type === "new_movie" ? "bg-primary/20 text-primary" :
                        first.type === "broadcast" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                      }`}>{first.type}</span>
                      <p className="font-semibold text-sm truncate">{first.title}</p>
                    </div>
                    {first.message && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{first.message}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(first.created_at).toLocaleString("pt-BR")} • {group.length} destinatário(s) • {readCount} leu
                    </p>
                  </div>
                  <button
                    onClick={() => group.forEach((g) => remove(g.id))}
                    className="p-1.5 hover:bg-destructive/10 text-destructive rounded shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminNotifications;
