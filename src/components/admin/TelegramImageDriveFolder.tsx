import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderOpen, Loader2, Save, ImageIcon } from "lucide-react";

const KEY = "telegram_image_drive_folder";

export default function TelegramImageDriveFolder() {
  const { toast } = useToast();
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      setFolder(data?.value ?? "");
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("platform_settings")
        .upsert({ key: KEY, value: folder.trim() }, { onConflict: "key" });
      if (error) throw error;
      toast({
        title: folder.trim() ? "Pasta configurada" : "Auto-save desligado",
        description: folder.trim()
          ? "Imagens enviadas ao bot serão salvas no Drive automaticamente."
          : "Sem pasta, as imagens serão ignoradas.",
      });
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-panel))] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary" />
        <h2 className="font-bold text-sm">Imagens do Telegram → Google Drive</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Toda imagem postada no grupo/canal monitorado pelo bot será enviada
        automaticamente para a pasta do Drive abaixo. Cole o link da pasta.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <FolderOpen className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="https://drive.google.com/drive/folders/..."
            value={folder}
            disabled={loading}
            onChange={(e) => setFolder(e.target.value)}
          />
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">Salvar</span>
        </Button>
      </div>
      {!folder.trim() && !loading && (
        <p className="text-[11px] text-amber-500">
          ⚠️ Sem pasta configurada, imagens não serão salvas.
        </p>
      )}
    </div>
  );
}
