import { useEffect, useState } from "react";
import { Loader2, Save, Upload, Palette } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AdminBranding = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brandName, setBrandName] = useState("Streamflix");
  const [brandLogo, setBrandLogo] = useState("");
  const [primary, setPrimary] = useState("0 100% 50%");
  const [accent, setAccent] = useState("0 100% 50%");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["brand_name", "brand_logo_url", "brand_primary_hsl", "brand_accent_hsl"]);
      const map = new Map(((data as any[]) || []).map((r) => [r.key, r.value]));
      setBrandName(map.get("brand_name") || "Streamflix");
      setBrandLogo(map.get("brand_logo_url") || "");
      setPrimary(map.get("brand_primary_hsl") || "0 100% 50%");
      setAccent(map.get("brand_accent_hsl") || "0 100% 50%");
      setLoading(false);
    };
    load();
  }, []);

  const upsert = async (key: string, value: string) => {
    const { data: exists } = await supabase.from("platform_settings").select("id").eq("key", key).maybeSingle();
    if (exists) {
      await supabase.from("platform_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    } else {
      await supabase.from("platform_settings").insert({ key, value });
    }
  };

  const save = async () => {
    setSaving(true);
    await Promise.all([
      upsert("brand_name", brandName),
      upsert("brand_logo_url", brandLogo),
      upsert("brand_primary_hsl", primary),
      upsert("brand_accent_hsl", accent),
    ]);
    // aplica imediatamente
    document.documentElement.style.setProperty("--primary", primary);
    document.documentElement.style.setProperty("--accent", accent);
    setSaving(false);
    toast.success("Marca atualizada");
  };

  const onLogoUpload = async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `branding/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("thumbnails").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
    setBrandLogo(data.publicUrl);
    toast.success("Logo enviada");
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Identidade Visual</h2>
          <p className="text-sm text-muted-foreground mt-1">Nome, logo e cores do app.</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Nome do app</label>
          <input
            className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Logo</label>
          <div className="flex items-center gap-3 mt-1">
            <div className="w-16 h-16 rounded bg-background border border-border flex items-center justify-center overflow-hidden">
              {brandLogo
                ? <img src={brandLogo} alt="logo" className="w-full h-full object-contain" />
                : <Palette className="w-6 h-6 text-muted-foreground" />}
            </div>
            <label className="flex items-center gap-2 px-3 py-2 bg-muted rounded text-sm cursor-pointer hover:bg-muted/80">
              <Upload className="w-4 h-4" /> Enviar arquivo
              <input
                type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogoUpload(f); }}
              />
            </label>
            {brandLogo && (
              <button onClick={() => setBrandLogo("")} className="text-xs text-destructive hover:underline">
                Remover
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Cor primária (HSL)</label>
            <input
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm font-mono"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              placeholder="357 83% 47%"
            />
            <div className="mt-2 h-8 rounded border border-border" style={{ background: `hsl(${primary})` }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cor de destaque (HSL)</label>
            <input
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm font-mono"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              placeholder="142 71% 45%"
            />
            <div className="mt-2 h-8 rounded border border-border" style={{ background: `hsl(${accent})` }} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Formato: <code className="bg-muted px-1 rounded">H S% L%</code>. Ex: <code className="bg-muted px-1 rounded">357 83% 47%</code>.
          As cores são aplicadas em todo o app após salvar e recarregar.
        </p>
      </div>
    </div>
  );
};

export default AdminBranding;
