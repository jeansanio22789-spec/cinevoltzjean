import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, RefreshCcw, Film, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChannelVideosDialog from "./ChannelVideosDialog";

interface FeaturedChannel {
  id: number;
  title: string;
}

interface TgRow {
  update_id: number;
  chat_id: number;
  message_id: number | null;
  caption: string | null;
  text: string | null;
  mime_type: string | null;
  duration: number | null;
  file_size: number | null;
  processing_status: string;
  processing_error: string | null;
  created_at: string;
  movie_id: string | null;
  raw_update: any;
}

const extractChatTitle = (raw: any): string | null => {
  const msg = raw?.message ?? raw?.channel_post ?? raw?.edited_message ?? raw?.my_chat_member;
  const chat = msg?.chat;
  if (!chat) return null;
  return chat.title ?? chat.username ?? (chat.first_name ? `${chat.first_name}${chat.last_name ? " " + chat.last_name : ""}` : null);
};

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  processing: "secondary",
  published: "default",
  done: "default",
  error: "destructive",
  failed: "destructive",
  skipped: "outline",
};

const formatBytes = (n: number | null) => {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
};

const formatDuration = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

const AdminVideoLibrary = () => {
  const [rows, setRows] = useState<TgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [chatFilter, setChatFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all"); // YYYY-MM
  const [openChat, setOpenChat] = useState<{ id: number; title: string } | null>(null);
  const [featured, setFeatured] = useState<FeaturedChannel[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: settings }] = await Promise.all([
      supabase
        .from("telegram_messages")
        .select(
          "update_id,chat_id,message_id,caption,text,mime_type,duration,file_size,processing_status,processing_error,created_at,movie_id,raw_update",
        )
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("platform_settings")
        .select("key,value")
        .like("key", "telegram_%_chat_id"),
    ]);
    if (!error) setRows((data as TgRow[]) || []);

    // Build featured channels list from platform_settings keys like
    // telegram_doramas_chat_id + telegram_doramas_chat_title
    if (settings) {
      const idRows = settings as { key: string; value: string | null }[];
      const titleKeys = idRows.map((r) => r.key.replace("_chat_id", "_chat_title"));
      const { data: titles } = await supabase
        .from("platform_settings")
        .select("key,value")
        .in("key", titleKeys);
      const titleMap = new Map<string, string>();
      (titles ?? []).forEach((t: any) => titleMap.set(t.key, t.value ?? ""));
      const list: FeaturedChannel[] = idRows
        .filter((r) => r.value && /^-?\d+$/.test(r.value))
        .map((r) => ({
          id: Number(r.value),
          title:
            titleMap.get(r.key.replace("_chat_id", "_chat_title")) ||
            `Canal ${r.value}`,
        }));
      setFeatured(list);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const chatTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      const id = String(r.chat_id);
      if (map.has(id)) return;
      const title = extractChatTitle(r.raw_update);
      if (title) map.set(id, title);
    });
    return map;
  }, [rows]);

  const chatLabel = (id: string) => chatTitleMap.get(id) ?? id;

  const chats = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(String(r.chat_id)));
    return Array.from(set).sort((a, b) => chatLabel(a).localeCompare(chatLabel(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, chatTitleMap]);

  const months = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      set.add(key);
    });
    return Array.from(set).sort().reverse();
  }, [rows]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.processing_status));
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.processing_status !== statusFilter) return false;
      if (chatFilter !== "all" && String(r.chat_id) !== chatFilter) return false;
      if (monthFilter !== "all") {
        const d = new Date(r.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key !== monthFilter) return false;
      }
      if (term) {
        const hay = `${r.caption ?? ""} ${r.text ?? ""} ${r.message_id ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, chatFilter, monthFilter]);

  // Group by month for display
  const grouped = useMemo(() => {
    const map = new Map<string, TgRow[]>();
    filtered.forEach((r) => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const monthLabel = (key: string) => {
    const [y, m] = key.split("-");
    return `${MONTHS_PT[parseInt(m, 10) - 1]} de ${y}`;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar legenda, texto ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={chatFilter} onValueChange={setChatFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {chats.map((c) => (
              <SelectItem key={c} value={c}>
                {chatLabel(c)}
                {chatTitleMap.has(c) && (
                  <span className="text-muted-foreground ml-2 text-xs">({c})</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} de {rows.length} vídeos
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Film className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum vídeo encontrado.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([month, items]) => (
            <section key={month}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {monthLabel(month)}
                </h3>
                <span className="text-xs text-muted-foreground">{items.length} item(s)</span>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Data</TableHead>
                      <TableHead>Título / Legenda</TableHead>
                      <TableHead className="w-[140px]">Canal</TableHead>
                      <TableHead className="w-[90px]">Duração</TableHead>
                      <TableHead className="w-[100px]">Tamanho</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r) => {
                      const title =
                        (r.caption || r.text || "").split("\n")[0]?.slice(0, 80) || `Mensagem #${r.message_id}`;
                      return (
                        <TableRow key={`${r.chat_id}-${r.update_id}`}>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm truncate max-w-md">{title}</div>
                            {r.processing_error && (
                              <div className="text-xs text-destructive mt-0.5 truncate max-w-md">
                                {r.processing_error}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenChat({ id: r.chat_id, title: chatLabel(String(r.chat_id)) })
                              }
                              className="text-left hover:text-primary transition-colors"
                              title="Abrir todos os vídeos deste grupo"
                            >
                              <div className="font-medium truncate max-w-[140px] underline-offset-2 hover:underline">
                                {chatLabel(String(r.chat_id))}
                              </div>
                              <div className="text-[10px] font-mono text-muted-foreground truncate">
                                {r.chat_id}
                              </div>
                            </button>
                          </TableCell>
                          <TableCell className="text-xs">{formatDuration(r.duration)}</TableCell>
                          <TableCell className="text-xs">{formatBytes(r.file_size)}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[r.processing_status] ?? "outline"}>
                              {r.processing_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      <ChannelVideosDialog
        open={!!openChat}
        onOpenChange={(v) => !v && setOpenChat(null)}
        chatId={openChat?.id ?? null}
        chatTitle={openChat?.title ?? ""}
      />
    </div>
  );
};

export default AdminVideoLibrary;
