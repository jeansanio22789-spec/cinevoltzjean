import { useEffect, useState } from "react";
import { Radio, Plus, Trash2, Save, Loader2, Tv, Pencil, X, Check, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Channel {
  id: string;
  name: string;
  stream_url: string;
  fallback_url: string | null;
  logo_url: string | null;
  category: string | null;
  sort_order: number;
  is_active: boolean;
}

const empty: Omit<Channel, "id"> = {
  name: "",
  stream_url: "",
  fallback_url: "",
  logo_url: "",
  category: "TV Aberta",
  sort_order: 0,
  is_active: true,
};

const AdminChannels = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<Channel, "id">>(empty);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("live_channels")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) toast.error("Erro ao carregar canais: " + error.message);
    setChannels((data as Channel[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => {
    setDraft({ ...empty, sort_order: (channels[channels.length - 1]?.sort_order ?? 0) + 1 });
    setCreating(true);
    setEditing(null);
  };

  const startEdit = (c: Channel) => {
    setDraft({
      name: c.name,
      stream_url: c.stream_url,
      fallback_url: c.fallback_url || "",
      logo_url: c.logo_url || "",
      category: c.category || "TV Aberta",
      sort_order: c.sort_order,
      is_active: c.is_active,
    });
    setEditing(c.id);
    setCreating(false);
  };

  const cancel = () => { setEditing(null); setCreating(false); setDraft(empty); };

  const save = async () => {
    if (!draft.name.trim()) return toast.error("Informe o nome da emissora");
    if (!draft.stream_url.trim()) return toast.error("Informe a URL do stream");
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      stream_url: draft.stream_url.trim(),
      fallback_url: draft.fallback_url?.trim() || null,
      logo_url: draft.logo_url?.trim() || null,
      category: draft.category?.trim() || "Outros",
      sort_order: Number(draft.sort_order) || 0,
      is_active: !!draft.is_active,
    };
    if (editing) {
      const { error } = await supabase.from("live_channels").update(payload).eq("id", editing);
      if (error) { setSaving(false); return toast.error("Erro: " + error.message); }
      toast.success("Canal atualizado");
    } else {
      const { error } = await supabase.from("live_channels").insert(payload);
      if (error) { setSaving(false); return toast.error("Erro: " + error.message); }
      toast.success("Canal adicionado");
    }
    setSaving(false);
    cancel();
    load();
  };

  const remove = async (c: Channel) => {
    if (!confirm(`Remover o canal "${c.name}"?`)) return;
    const { error } = await supabase.from("live_channels").delete().eq("id", c.id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Canal removido");
    load();
  };

  const toggleActive = async (c: Channel) => {
    const { error } = await supabase
      .from("live_channels")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);
    if (error) return toast.error("Erro: " + error.message);
    load();
  };

  const filtered = channels.filter((c) =>
    !search.trim() ? true :
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const Form = (
    <div className="bg-card border border-primary/40 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          {editing ? "Editar canal" : "Novo canal"}
        </h3>
        <button onClick={cancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Nome da emissora *</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Ex: SBT Interior"
            className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Categoria</label>
          <input
            value={draft.category || ""}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            placeholder="TV Aberta, Esportes, Notícias..."
            className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">URL do stream (.m3u8 ou link iframe) *</label>
          <input
            value={draft.stream_url}
            onChange={(e) => setDraft({ ...draft, stream_url: e.target.value })}
            placeholder="https://exemplo.com/stream.m3u8"
            className="w-full px-3 py-2 bg-background border border-border rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">URL de fallback (opcional)</label>
          <input
            value={draft.fallback_url || ""}
            onChange={(e) => setDraft({ ...draft, fallback_url: e.target.value })}
            placeholder="Stream alternativo se o principal falhar"
            className="w-full px-3 py-2 bg-background border border-border rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">URL do logo (opcional)</label>
          <input
            value={draft.logo_url || ""}
            onChange={(e) => setDraft({ ...draft, logo_url: e.target.value })}
            placeholder="https://exemplo.com/logo.png"
            className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Ordem</label>
          <input
            type="number"
            value={draft.sort_order}
            onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
            className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">Canal ativo (visível no /ao-vivo)</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <button
          onClick={cancel}
          className="px-4 py-2 text-sm rounded border border-border text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Canais Ao Vivo</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre emissoras (nome, logo, stream) que aparecerão na página /ao-vivo
          </p>
        </div>
        {!creating && !editing && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo canal
          </button>
        )}
      </div>

      {(creating || editing) && Form}

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou categoria..."
          className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {filtered.length} de {channels.length}
        </span>
      </div>

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Tv className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {channels.length === 0 ? 'Nenhum canal cadastrado. Clique em "Novo canal" para começar.' : "Nenhum canal encontrado."}
            </p>
          </div>
        ) : (
          filtered.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              <div className="w-12 h-12 rounded bg-background border border-border flex items-center justify-center overflow-hidden shrink-0">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <Tv className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {c.category || "Outros"}
                  </span>
                  {!c.is_active && (
                    <span className="text-[10px] uppercase tracking-wider bg-destructive/20 text-destructive px-1.5 py-0.5 rounded">
                      Inativo
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">#{c.sort_order}</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate font-mono">{c.stream_url}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleActive(c)}
                  title={c.is_active ? "Desativar" : "Ativar"}
                  className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {c.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => startEdit(c)}
                  title="Editar"
                  className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => remove(c)}
                  title="Remover"
                  className="p-2 rounded hover:bg-destructive/10 text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminChannels;
