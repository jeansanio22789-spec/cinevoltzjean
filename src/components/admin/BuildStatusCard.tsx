import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const LOCAL_VERSION = __BUILD_VERSION__;

// URL pública do app (definida no projeto Lovable). Mantemos hardcoded
// porque é o domínio público fixo do CineVoltz.
const PUBLISHED_URL = "https://cinevoltzjean.lovable.app";

const formatDate = (iso: string) => {
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

const BuildStatusCard = () => {
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPublished = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${PUBLISHED_URL}/version.json?ts=${Date.now()}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { version?: string };
      setPublishedVersion(data.version ?? null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível consultar o app público.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPublished();
  }, []);

  const isSameVersion =
    publishedVersion !== null && publishedVersion === LOCAL_VERSION;
  const isOutdated =
    publishedVersion !== null && publishedVersion !== LOCAL_VERSION;

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
          <RefreshCw
            className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-background/40 p-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Versão do preview (esta tela)
          </span>
          <span className="font-medium">{formatDate(LOCAL_VERSION)}</span>
        </div>

        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-background/40 p-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Versão do app público
          </span>
          {loading && !publishedVersion ? (
            <span className="text-muted-foreground">Consultando...</span>
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : publishedVersion ? (
            <span className="font-medium">{formatDate(publishedVersion)}</span>
          ) : (
            <span className="text-muted-foreground">Sem dados</span>
          )}
        </div>

        {isSameVersion && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Tudo sincronizado</p>
              <p className="text-xs opacity-80">
                O app público está rodando exatamente a mesma versão deste
                preview.
              </p>
            </div>
          </div>
        )}

        {isOutdated && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">App público desatualizado</p>
              <p className="text-xs opacity-90">
                Existem alterações que ainda não foram publicadas. Clique em{" "}
                <strong>Publicar → Atualizar</strong> no canto superior direito
                do editor para enviar a nova versão para{" "}
                <span className="font-mono">{PUBLISHED_URL.replace(/^https?:\/\//, "")}</span>.
              </p>
              <p className="text-xs opacity-75">
                Dica PWA: depois de publicar, feche e reabra o app no celular
                para forçar o novo cache.
              </p>
            </div>
            <Badge variant="outline" className="ml-auto border-amber-400/40 text-amber-200">
              Pendente
            </Badge>
          </div>
        )}

        {error && (
          <p className="text-xs text-muted-foreground">
            Não foi possível ler <span className="font-mono">/version.json</span>{" "}
            do app público — pode ser que ele ainda esteja na versão antiga
            (sem este recurso). Publique uma vez para começar a comparar.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default BuildStatusCard;
