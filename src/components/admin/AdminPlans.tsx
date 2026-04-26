import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Save, X, Crown, Film, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_days: number;
  is_active: boolean;
  sort_order: number;
  features: string[];
}

interface MovieRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

const emptyPlan: Omit<Plan, "id"> = {
  name: "",
  description: "",
  price: 0,
  duration_days: 30,
  is_active: true,
  sort_order: 0,
  features: [],
};

const AdminPlans = () => {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<Plan, "id">>(emptyPlan);
  const [featureInput, setFeatureInput] = useState("");

  // Vínculo de filmes
  const [linkPlan, setLinkPlan] = useState<Plan | null>(null);
  const [movies, setMovies] = useState<MovieRow[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [movieSearch, setMovieSearch] = useState("");
  const [savingLinks, setSavingLinks] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("plans")
      .select("*")
      .order("sort_order", { ascending: true });
    setPlans(((data as any[]) || []).map((p) => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : [],
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => {
    setDraft({ ...emptyPlan, sort_order: plans.length + 1 });
    setEditing(null);
    setCreating(true);
  };

  const startEdit = (p: Plan) => {
    setDraft({
      name: p.name,
      description: p.description || "",
      price: p.price,
      duration_days: p.duration_days,
      is_active: p.is_active,
      sort_order: p.sort_order,
      features: p.features || [],
    });
    setEditing(p);
    setCreating(false);
  };

  const cancel = () => {
    setEditing(null);
    setCreating(false);
    setDraft(emptyPlan);
    setFeatureInput("");
  };

  const save = async () => {
    if (!draft.name.trim()) { toast.error("Informe o nome"); return; }
    if (editing) {
      const { error } = await supabase.from("plans").update(draft).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Plano atualizado");
    } else {
      const { error } = await supabase.from("plans").insert(draft);
      if (error) { toast.error(error.message); return; }
      toast.success("Plano criado");
    }
    cancel();
    load();
  };

  const remove = async (p: Plan) => {
    if (!confirm(`Apagar plano "${p.name}"?`)) return;
    const { error } = await supabase.from("plans").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Plano removido");
    load();
  };

  const toggleActive = async (p: Plan) => {
    await supabase.from("plans").update({ is_active: !p.is_active }).eq("id", p.id);
    load();
  };

  const addFeature = () => {
    if (!featureInput.trim()) return;
    setDraft({ ...draft, features: [...draft.features, featureInput.trim()] });
    setFeatureInput("");
  };
  const removeFeature = (i: number) => {
    setDraft({ ...draft, features: draft.features.filter((_, idx) => idx !== i) });
  };

  // ===== Vínculo filmes =====
  const openLink = async (p: Plan) => {
    setLinkPlan(p);
    const [m, pm] = await Promise.all([
      supabase.from("movies").select("id, title, thumbnail_url").order("title"),
      supabase.from("plan_movies").select("movie_id").eq("plan_id", p.id),
    ]);
    setMovies((m.data as MovieRow[]) || []);
    setLinkedIds(new Set(((pm.data as any[]) || []).map((x) => x.movie_id)));
  };

  const toggleLink = (movieId: string) => {
    const next = new Set(linkedIds);
    if (next.has(movieId)) next.delete(movieId); else next.add(movieId);
    setLinkedIds(next);
  };

  const saveLinks = async () => {
    if (!linkPlan) return;
    setSavingLinks(true);
    // Remove tudo e re-insere (mais simples)
    await supabase.from("plan_movies").delete().eq("plan_id", linkPlan.id);
    if (linkedIds.size > 0) {
      const rows = Array.from(linkedIds).map((movie_id) => ({
        plan_id: linkPlan.id, movie_id,
      }));
      const { error } = await supabase.from("plan_movies").insert(rows);
      if (error) { toast.error(error.message); setSavingLinks(false); return; }
    }
    toast.success("Vínculos salvos");
    setSavingLinks(false);
    setLinkPlan(null);
  };

  const filteredMovies = movies.filter((m) =>
    m.title.toLowerCase().includes(movieSearch.toLowerCase())
  );

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Planos e Assinaturas</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crie planos, defina preços e vincule conteúdos.
          </p>
        </div>
        {!creating && !editing && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Novo plano
          </button>
        )}
      </div>

      {(creating || editing) && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{editing ? `Editar: ${editing.name}` : "Novo plano"}</h3>
            <button onClick={cancel} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Nome</label>
              <input
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex: Mensal"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Preço (R$)</label>
              <input
                type="number" step="0.01" min="0"
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Duração (dias)</label>
              <input
                type="number" min="1"
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
                value={draft.duration_days}
                onChange={(e) => setDraft({ ...draft, duration_days: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ordem</label>
              <input
                type="number"
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Descrição</label>
              <textarea
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Benefícios</label>
            <div className="flex gap-2 mt-1">
              <input
                className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm"
                placeholder="Ex: Sem anúncios"
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFeature(); }}}
              />
              <button onClick={addFeature} className="px-3 py-2 bg-muted rounded text-sm hover:bg-muted/80">
                Adicionar
              </button>
            </div>
            {draft.features.length > 0 && (
              <ul className="mt-2 space-y-1">
                {draft.features.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-background border border-border rounded px-3 py-1.5">
                    <span className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-accent" /> {f}</span>
                    <button onClick={() => removeFeature(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              />
              Ativo
            </label>
            <button
              onClick={save}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold"
            >
              <Save className="w-4 h-4" /> Salvar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-lg p-5 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-400" />
                  <h3 className="font-bold">{p.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.duration_days} dias</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                p.is_active ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
              }`}>
                {p.is_active ? "Ativo" : "Inativo"}
              </span>
            </div>
            <p className="text-3xl font-black mb-1">R$ {Number(p.price).toFixed(2)}</p>
            {p.description && <p className="text-xs text-muted-foreground mb-3">{p.description}</p>}
            {p.features.length > 0 && (
              <ul className="space-y-1 mb-4 flex-1">
                {p.features.slice(0, 4).map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Check className="w-3 h-3 text-accent shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2 mt-auto pt-3 border-t border-border">
              <button onClick={() => openLink(p)} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-background border border-border rounded text-xs hover:bg-muted">
                <Film className="w-3.5 h-3.5" /> Conteúdo
              </button>
              <button onClick={() => startEdit(p)} className="p-1.5 hover:bg-muted rounded" title="Editar">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => toggleActive(p)} className="p-1.5 hover:bg-muted rounded text-xs">
                {p.is_active ? "Pausar" : "Ativar"}
              </button>
              <button onClick={() => remove(p)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de vínculo */}
      {linkPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-bold">Conteúdos do plano: {linkPlan.name}</h3>
                <p className="text-xs text-muted-foreground">{linkedIds.size} vinculado(s)</p>
              </div>
              <button onClick={() => setLinkPlan(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-b border-border">
              <input
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm"
                placeholder="Buscar filme..."
                value={movieSearch}
                onChange={(e) => setMovieSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {filteredMovies.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum filme.</p>
              ) : (
                filteredMovies.map((m) => {
                  const checked = linkedIds.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer border transition-colors ${
                        checked ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleLink(m.id)} />
                      <div className="w-10 h-14 rounded bg-muted overflow-hidden shrink-0">
                        {m.thumbnail_url && <img src={m.thumbnail_url} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <span className="text-sm flex-1">{m.title}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setLinkPlan(null)} className="px-4 py-2 bg-muted rounded text-sm">Cancelar</button>
              <button
                onClick={saveLinks}
                disabled={savingLinks}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold flex items-center gap-2"
              >
                {savingLinks ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar vínculos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPlans;
