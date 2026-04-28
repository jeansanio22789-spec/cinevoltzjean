import { useEffect, useState } from "react";
import { Globe, Bell, Shield, Save, Loader2, Smartphone, Trash2, Plus, Radio, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";
import AdminNfcTags from "@/components/admin/AdminNfcTags";

interface Device {
  id: string;
  device_id: string;
  device_label: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
}

const AdminSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentId, setCurrentId] = useState<string>("");

  const loadDevices = async () => {
    const { data } = await supabase.from("admin_devices").select("*").order("created_at", { ascending: false });
    setDevices((data as Device[]) || []);
  };

  useEffect(() => {
    setCurrentId(getDeviceId());
    const fetch = async () => {
      const { data } = await supabase.from("platform_settings").select("key, value");
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.key] = s.value; });
      setSettings(map);
      await loadDevices();
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

  /**
   * Publica nova versão do app: grava em platform_settings e dispara
   * o banner de "Atualizar" para todos os dispositivos.
   */
  const publishAppVersion = async () => {
    const version = (settings.app_version || "").trim();
    if (!version) {
      toast.error("Defina um número de versão (ex.: 1.0.1)");
      return;
    }
    setSaving(true);
    const rows = [
      { key: "app_version", value: version },
      { key: "app_update_message", value: settings.app_update_message || "" },
    ];
    for (const row of rows) {
      await supabase
        .from("platform_settings")
        .upsert(
          { ...row, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
    }
    setSaving(false);
    toast.success(`Versão ${version} publicada! Usuários verão o aviso de atualização.`);
  };

  const removeDevice = async (id: string, deviceId: string) => {
    if (deviceId === currentId) {
      if (!confirm("Remover ESTE aparelho? Você precisará cadastrar a digital novamente.")) return;
    } else {
      if (!confirm("Remover este aparelho da lista de autorizados?")) return;
    }
    const { error } = await supabase.from("admin_devices").delete().eq("id", id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Dispositivo removido");
    if (deviceId === currentId) {
      localStorage.removeItem("biometric_credential_id");
      localStorage.removeItem("biometric_enrolled");
      window.location.href = "/admin";
    }
    loadDevices();
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
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Nome da Plataforma</p>
                <p className="text-xs text-muted-foreground">Nome exibido para os usuários</p>
              </div>
              <input
                className="px-3 py-1.5 bg-background border border-border rounded text-sm w-40 focus:outline-none focus:ring-1 focus:ring-ring"
                value={settings.platform_name || ""}
                onChange={(e) => updateSetting("platform_name", e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
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

        {/* Atualização do App — publica nova versão e mostra banner pra todos */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-1">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-bold">Atualização do App</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Ao publicar uma nova versão, todos os usuários verão um banner no topo
            do app com botão "Atualizar". Use sempre que subir uma versão importante.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Número da versão (ex.: 1.0.1, 2.3.0)
              </label>
              <input
                className="mt-1 w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="1.0.0"
                value={settings.app_version || ""}
                onChange={(e) => updateSetting("app_version", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Mensagem (opcional)
              </label>
              <input
                className="mt-1 w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Novidades: novos filmes e correções"
                value={settings.app_update_message || ""}
                onChange={(e) => updateSetting("app_update_message", e.target.value)}
              />
            </div>
            <button
              onClick={publishAppVersion}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Publicar nova versão
            </button>
          </div>
        </div>

        {/* Dispositivos autorizados */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-1">
            <Smartphone className="w-5 h-5 text-primary" />
            <h3 className="font-bold">Dispositivos autorizados</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Apenas aparelhos listados aqui podem acessar o painel admin com sua digital.
          </p>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dispositivo cadastrado.</p>
          ) : (
            <ul className="space-y-2">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 p-3 bg-background border border-border rounded">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2">
                      {d.device_label || "Dispositivo"}
                      {d.device_id === currentId && (
                        <span className="text-[10px] uppercase tracking-wider text-accent bg-accent/20 px-1.5 py-0.5 rounded">
                          Este aparelho
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Cadastrado em {new Date(d.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <button
                    onClick={() => removeDevice(d.id, d.device_id)}
                    className="p-2 rounded hover:bg-destructive/10 text-destructive transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={async () => {
              const { error } = await supabase.from("admin_devices").insert({
                user_id: (await supabase.auth.getUser()).data.user?.id,
                device_id: currentId,
                device_label: getDeviceLabel(),
                user_agent: navigator.userAgent,
              });
              if (error) toast.error("Erro: " + error.message);
              else { toast.success("Dispositivo autorizado"); loadDevices(); }
            }}
            className="mt-3 flex items-center gap-2 text-xs text-primary hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Autorizar este aparelho
          </button>
        </div>

        <AdminNfcTags />

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
                <p className="text-sm font-medium">Biometria + dispositivo travado</p>
                <p className="text-xs text-muted-foreground">Painel só abre nos aparelhos autorizados</p>
              </div>
              <span className="px-3 py-1.5 bg-accent/20 text-accent text-sm rounded font-medium">Ativo</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Banimento bloqueia conteúdo</p>
                <p className="text-xs text-muted-foreground">Usuários banidos não acessam filmes</p>
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
