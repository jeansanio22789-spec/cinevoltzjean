import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderOpen, Loader2, Save, ImageIcon, RefreshCw } from "lucide-react";

const KEY = "drive_cover_folder";

export default function DriveCoverSync() {
  const { toast } = useToast();
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

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
        title: folder.trim() ? "Pasta de capas configurada" : "Sync desligado",
        description: folder.trim()
          ? "O sistema vai ler imagens dessa pasta e casar com filmes pelo nome."
          : "Sem pasta, nenhuma capa será atualizada.",
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

  const runSync = async () => {
    setSyncing(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("drive-cover-sync");
      if (error) throw error;
      const r = data as { scanned: number; updated: number; log: string[] };
      setLastResult(
        `📂 ${r.scanned} imagem(ns) na pasta · ✅ ${r.updated} capa(s) atualizada(s)`,
      );
      toast({
        title: "Sincronização concluída",
        description: `${r.updated} capa(s) atualizada(s) de ${r.scanned} imagem(ns).`,
      });
    } catch (e) {
      toast({
        title: "Erro na sincronização",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-panel))] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary" />
        <h2 className="font-bold text-sm">Pasta de Capas (Drive → Filmes)</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Cole o link da pasta do Drive onde você guarda as capas. Quando o nome
        do arquivo (sem extensão) bater <strong>exatamente</strong> com o título de
        um filme, a capa é atualizada automaticamente. Ex: <code>Vingadores Ultimato.jpg</code> →
        atualiza o filme "Vingadores Ultimato".
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
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={runSync}
          disabled={syncing || !folder.trim()}
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Sincronizar agora</span>
        </Button>
        {lastResult && (
          <span className="text-xs text-muted-foreground">{lastResult}</span>
        )}
      </div>
      {!folder.trim() && !loading && (
        <p className="text-[11px] text-amber-500">
          ⚠️ Sem pasta configurada, nada será sincronizado.
        </p>
      )}
    </div>
  );
}
