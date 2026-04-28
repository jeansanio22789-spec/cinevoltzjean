import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Rocket, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const LOCAL_BUILD = __BUILD_VERSION__;

const formatBuild = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

/**
 * Mostra o status entre a versão que ESTE dispositivo está rodando
 * (carimbo do build) e a versão que o admin marcou como "publicada"
 * em platform_settings.app_version.
 */
const BuildStatusCard = () => {
  const [publishedVersion, setPublishedVersion] = useState<string>("");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const localVersion = LOCAL_BUILD;

  const publishCurrent = async () => {
    setPublishing(true);
    const { error } = await supabase
      .from("platform_settings")
      .upsert({ key: "app_version", value: localVersion }, { onConflict: "key" });
    setPublishing(false);
    if (error) {
      toast.error("Falha ao publicar versão", { description: error.message });
      return;
    }
    toast.success("Versão publicada para os usuários");
    await fetchPublished();
  };

  const fetchPublished = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value, updated_at")
      .eq("key", "app_version")
      .maybeSingle();
    setPublishedVersion(((data?.value as string) || "").trim());
    setPublishedAt((data?.updated_at as string) || null);
    setLoading(false);
  };

  useEffect(() => {
    void fetchPublished();
  }, []);

  const hasPublished = publishedVersion.length > 0;
  const isUpToDate = hasPublished && publishedVersion === localVersion;

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4 text-primary" />
          Status da publicação
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchPublished()}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-background/40 p-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Build deste dispositivo
          </span>
          <span className="font-medium">{formatBuild(LOCAL_BUILD)}</span>
        </div>

        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-background/40 p-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Versão publicada para os usuários
          </span>
          {loading && !hasPublished ? (
            <span className="text-muted-foreground">Consultando...</span>
          ) : hasPublished ? (
            <>
              <span className="font-medium">{publishedVersion}</span>
              {publishedAt && (
                <span className="text-xs text-muted-foreground">
                  Atualizado em {formatBuild(publishedAt)}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              Nenhuma versão publicada ainda
            </span>
          )}
        </div>

        {hasPublished ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Aviso de atualização ativo</p>
              <p className="text-xs opacity-80">
                Os usuários veem o banner "Atualizar" sempre que a versão
                publicada mudar. Para anunciar nova versão, vá em{" "}
                <strong>Configurações → Atualização do App</strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Nenhuma versão publicada</p>
              <p className="text-xs opacity-90">
                Vá em <strong>Configurações → Atualização do App</strong>,
                informe um número (ex.: 1.0.0) e clique em "Publicar nova
                versão" para que o aviso apareça para os usuários.
              </p>
            </div>
            <Badge variant="outline" className="ml-auto border-amber-400/40 text-amber-200">
              Pendente
            </Badge>
          </div>
        )}

        <Button
          className="w-full"
          onClick={() => void publishCurrent()}
          disabled={publishing || isUpToDate}
        >
          <Send className={`mr-2 h-4 w-4 ${publishing ? "animate-pulse" : ""}`} />
          {isUpToDate
            ? "Esta versão já é a publicada"
            : publishing
            ? "Publicando..."
            : "Publicar esta versão para os usuários"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default BuildStatusCard;
