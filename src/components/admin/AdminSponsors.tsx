import { useEffect, useState } from "react";
import {
  Megaphone, Plus, Trash2, Edit3, ExternalLink, Eye, MousePointerClick,
  DollarSign, Loader2, X, CheckCircle2, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  target_url: string;
  monthly_amount: number;
  placement: string;
  is_active: boolean;
  sort_order: number;
  clicks: number;
  impressions: number;
  starts_at: string;
  expires_at: string | null;
}

const emptyForm: Partial<Sponsor> = {
  name: "",
  logo_url: "",
  target_url: "",
  monthly_amount: 0,
  placement: "both",
  is_active: true,
  sort_order: 0,
};

const AdminSponsors = () => {
  const [list, setList] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Sponsor> | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sponsors")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setList((data || []) as Sponsor[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name || !editing?.target_url) {
      toast.error("Preencha nome e link de destino.");
      return;
    }
    const payload = {
      name: editing.name,
      logo_url: editing.logo_url || null,
      target_url: editing.target_url,
      monthly_amount: Number(editing.monthly_amount || 0),
      placement: editing.placement || "both",
      is_active: editing.is_active ?? true,
      sort_order: Number(editing.sort_order || 0),
    };
    const res = editing.id
      ? await supabase.from("sponsors").update(payload).eq("id", editing.id)
      : await supabase.from("sponsors").insert(payload);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(editing.id ? "Patrocinador atualizado" : "Patrocinador adicionado");
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este patrocinador?")) return;
    const { error } = await supabase.from("sponsors").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removido"); load(); }
  };

  const toggleActive = async (s: Sponsor) => {
    const { error } = await supabase
      .from("sponsors")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) toast.error(error.message);
    else load();
  };

  const totalMonthly = list.filter(s => s.is_active).reduce((sum, s) => sum + Number(s.monthly_amount || 0), 0);
  const totalClicks = list.reduce((sum, s) => sum + (s.clicks || 0), 0);
  const totalImpressions = list.reduce((sum, s) => sum + (s.impressions || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-accent" /> Patrocinadores
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Anunciantes pagos exibidos na página Ao Vivo e dentro do player.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...emptyForm })}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo patrocinador
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <DollarSign className="w-5 h-5 text-accent mb-3" />
          <p className="text-2xl font-black">R$ {totalMonthly.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">Receita mensal contratada</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <Eye className="w-5 h-5 text-primary mb-3" />
          <p className="text-2xl font-black">{totalImpressions.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground mt-1">Impressões totais</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <MousePointerClick className="w-5 h-5 text-yellow-400 mb-3" />
          <p className="text-2xl font-black">{totalClicks.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cliques ({totalImpressions ? ((totalClicks / totalImpressions) * 100).toFixed(1) : 0}% CTR)
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhum patrocinador cadastrado</p>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre o primeiro anunciante e comece a faturar.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left p-3 font-medium">Patrocinador</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Posição</th>
                <th className="text-left p-3 font-medium">R$/mês</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Impr / Clq</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {s.logo_url ? (
                        <img src={s.logo_url} alt={s.name} className="h-8 w-12 object-contain bg-background rounded shrink-0" />
                      ) : (
                        <div className="h-8 w-12 bg-muted rounded flex items-center justify-center shrink-0">
                          <Megaphone className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.name}</p>
                        <a
                          href={s.target_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary truncate flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" /> link
                        </a>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell capitalize">{s.placement}</td>
                  <td className="p-3 font-bold">R$ {Number(s.monthly_amount).toFixed(2)}</td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell text-xs">
                    {s.impressions.toLocaleString("pt-BR")} / {s.clicks.toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => toggleActive(s)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                        s.is_active ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {s.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {s.is_active ? "Ativo" : "Pausado"}
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(s)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(s.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 relative">
            <button
              onClick={() => setEditing(null)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold mb-4">
              {editing.id ? "Editar patrocinador" : "Novo patrocinador"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                <input
                  type="text"
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="Ex: Loja do João"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">URL do logo</label>
                <input
                  type="url"
                  value={editing.logo_url || ""}
                  onChange={(e) => setEditing({ ...editing, logo_url: e.target.value })}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Link de destino *</label>
                <input
                  type="url"
                  value={editing.target_url || ""}
                  onChange={(e) => setEditing({ ...editing, target_url: e.target.value })}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="https://site-do-anunciante.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">R$ por mês</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editing.monthly_amount || 0}
                    onChange={(e) => setEditing({ ...editing, monthly_amount: Number(e.target.value) })}
                    className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Posição</label>
                  <select
                    value={editing.placement || "both"}
                    onChange={(e) => setEditing({ ...editing, placement: e.target.value })}
                    className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="banner">Banner topo</option>
                    <option value="overlay">Overlay no player</option>
                    <option value="both">Ambos</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Ordem</label>
                  <input
                    type="number"
                    value={editing.sort_order || 0}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                    className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.is_active ?? true}
                      onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                    />
                    Ativo
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSponsors;
