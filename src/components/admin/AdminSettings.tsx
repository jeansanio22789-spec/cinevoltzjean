import { useEffect, useState } from "react";
import { Globe, Bell, Shield, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AdminSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("platform_settings").select("key, value");
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.key] = s.value; });
      setSettings(map);
      setLoading(false);
    };
    fetch();
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const entries = Object.entries(settings);
    for (const [key, value] of entries) {
      await supabase
        .from("platform_settings")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", key);
    }
    setSaving(false);
    toast.success("Configurações salvas!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Configurações</h2>
          <p className="text-sm text-muted-foreground mt-1">Configurações gerais da plataforma</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-5 h-5 text-primary" />
            <h3 className="font-bold">Plataforma</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Nome da Plataforma</p>
                <p className="text-xs text-muted-foreground">Nome exibido para os usuários</p>
              </div>
              <input
                className="px-3 py-1.5 bg-background border border-border rounded text-sm w-40 focus:outline-none focus:ring-1 focus:ring-ring"
                value={settings.platform_name || ""}
                onChange={(e) => updateSetting("platform_name", e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Modo Manutenção</p>
                <p className="text-xs text-muted-foreground">Desativa o site temporariamente</p>
              </div>
              <button
                onClick={() => updateSetting("maintenance_mode", settings.maintenance_mode === "true" ? "false" : "true")}
                className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
                  settings.maintenance_mode === "true"
                    ? "bg-destructive/20 text-destructive"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {settings.maintenance_mode === "true" ? "Ativado" : "Desativado"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-5 h-5 text-yellow-400" />
            <h3 className="font-bold">Notificações</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Alertas por Email</p>
                <p className="text-xs text-muted-foreground">Novos assinantes e cancelamentos</p>
              </div>
              <button
                onClick={() => updateSetting("email_alerts", settings.email_alerts === "true" ? "false" : "true")}
                className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
                  settings.email_alerts === "true"
                    ? "bg-accent/20 text-accent"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {settings.email_alerts === "true" ? "Ativado" : "Desativado"}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Relatórios Semanais</p>
                <p className="text-xs text-muted-foreground">Resumo de métricas por email</p>
              </div>
              <button
                onClick={() => updateSetting("weekly_reports", settings.weekly_reports === "true" ? "false" : "true")}
                className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
                  settings.weekly_reports === "true"
                    ? "bg-accent/20 text-accent"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {settings.weekly_reports === "true" ? "Ativado" : "Desativado"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-accent" />
            <h3 className="font-bold">Segurança</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Autenticação Biométrica</p>
                <p className="text-xs text-muted-foreground">Ativa no app nativo via Capacitor</p>
              </div>
              <span className="px-3 py-1.5 bg-accent/20 text-accent text-sm rounded font-medium">Ativo</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Admin Restrito</p>
                <p className="text-xs text-muted-foreground">Apenas email autorizado</p>
              </div>
              <span className="px-3 py-1.5 bg-accent/20 text-accent text-sm rounded font-medium">Ativo</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
