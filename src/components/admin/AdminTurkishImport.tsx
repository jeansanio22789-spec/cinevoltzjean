import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AdminTurkishImport = () => {
  const [loading, setLoading] = useState(false);
  const [maxPages, setMaxPages] = useState(12);
  const [maxEpisodesPerSeries, setMaxEpisodesPerSeries] = useState(60);
  const [fetchPlayers, setFetchPlayers] = useState(true);
  const [result, setResult] = useState<string>("");

  const run = async () => {
    setLoading(true);
    setResult("");
    try {
      const { data, error } = await supabase.functions.invoke("cplay-import-turkish", {
        body: { maxPages, maxEpisodesPerSeries, fetchPlayers },
      });
      if (error) throw error;
      const r = data as { series_imported: number; episodes_imported: number; errors?: string[] };
      setResult(`✅ ${r.series_imported} novelas e ${r.episodes_imported} episódios importados.${r.errors?.length ? `\n\nAvisos:\n- ${r.errors.join("\n- ")}` : ""}`);
      toast.success(`Importação concluída: ${r.series_imported} novelas`);
    } catch (e) {
      const msg = (e as Error).message;
      setResult(`❌ Erro: ${msg}`);
      toast.error(`Falha: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="font-bold flex items-center gap-2">
          <Download className="w-4 h-4" /> Importar Novelas Turcas
        </h3>
        <p className="text-xs text-muted-foreground">
          Extrai novelas, episódios e links de player do site cplay2.live para o catálogo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Páginas (máx 12)</Label>
          <Input type="number" min={1} max={12} value={maxPages}
            onChange={(e) => setMaxPages(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Eps. por novela (máx)</Label>
          <Input type="number" min={1} max={500} value={maxEpisodesPerSeries}
            onChange={(e) => setMaxEpisodesPerSeries(Math.max(1, parseInt(e.target.value) || 1))} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Switch checked={fetchPlayers} onCheckedChange={setFetchPlayers} />
        Buscar links de player de cada episódio (mais lento)
      </label>

      <Button onClick={run} disabled={loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
        {loading ? "Importando... (pode levar minutos)" : "Iniciar importação"}
      </Button>

      {result && (
        <pre className="text-xs whitespace-pre-wrap bg-muted p-3 rounded max-h-60 overflow-y-auto">{result}</pre>
      )}
    </div>
  );
};

export default AdminTurkishImport;
