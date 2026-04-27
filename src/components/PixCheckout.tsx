import { useState, useEffect, useRef } from "react";
import { X, QrCode, Copy, CheckCheck, Loader2, CheckCircle2, Play, User, Receipt } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Plan {
  name: string;
  priceValue?: string;
  price: string;
  period: string;
}

interface Props {
  /** Modo plano: passa um Plan completo */
  plan?: Plan;
  /** Modo título individual: passa o id e o título */
  movieId?: string;
  movieTitle?: string;
  moviePrice?: number;
  onClose: () => void;
}

interface PixData {
  purchase_id: string;
  qr_code: string;
  qr_code_base64?: string;
  ticket_url?: string;
  amount: number;
}

const PixCheckout = ({ plan, movieId, movieTitle, moviePrice, onClose }: Props) => {
  const [pix, setPix] = useState<PixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const pollRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const isMovie = !!movieId;
  const headerName = isMovie ? movieTitle ?? "Título" : plan?.name ?? "Plano";
  const headerPrice = isMovie
    ? `R$ ${(moviePrice ?? 10).toFixed(2).replace(".", ",")}`
    : plan?.price ?? "";
  const headerPeriod = isMovie ? " (acesso vitalício)" : plan?.period ?? "";

  const getFunctionErrorMessage = async (err: unknown) => {
    if (err instanceof FunctionsHttpError) {
      const payload = await err.context.json().catch(() => null);
      if (payload?.error) return payload.error as string;
    }

    if (err instanceof Error && err.message) {
      return err.message;
    }

    return "Erro ao gerar PIX";
  };

  useEffect(() => {
    const create = async () => {
      try {
        const body = isMovie
          ? { movie_id: movieId }
          : { plan: plan!.name };
        const { data, error } = await supabase.functions.invoke("mp-create-pix", {
          body,
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setPix(data);
      } catch (e) {
        console.error(e);
        setError(await getFunctionErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };
    create();
  }, [plan?.name, movieId, isMovie]);

  // Polling de pagamento a cada 4s
  useEffect(() => {
    if (!pix?.purchase_id || paid) return;
    const tick = async () => {
      const { data } = await supabase.functions.invoke("mp-check-payment", {
        body: { purchase_id: pix.purchase_id },
      });
      if (data?.status === "approved") {
        setPaid(true);
        toast.success("Pagamento confirmado!");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };
    pollRef.current = window.setInterval(tick, 4000) as unknown as number;
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pix?.purchase_id, paid, navigate, onClose, isMovie, movieId]);

  const handleGoToContent = () => {
    onClose();
    if (isMovie && movieId) {
      window.location.href = `/assistir/${movieId}`;
    } else {
      window.location.href = "/minha-conta";
    }
  };

  const paidAtLabel = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const handleCopy = () => {
    if (!pix?.qr_code) return;
    navigator.clipboard.writeText(pix.qr_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="flex items-center justify-center gap-2 mb-2">
            <QrCode className="w-6 h-6 text-primary" />
            <h3 className="text-lg font-bold">Pagamento PIX</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {isMovie ? "Título" : "Plano"}{" "}
            <span className="font-semibold text-foreground">{headerName}</span> —{" "}
            <span className="font-semibold text-foreground">{headerPrice}</span>
            {headerPeriod}
          </p>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando seu PIX seguro…</p>
          </div>
        )}

        {error && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
        )}

        {paid && (
          <div className="flex flex-col items-center gap-4 py-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="relative">
              <div className="absolute inset-0 bg-accent/30 blur-2xl rounded-full" />
              <CheckCircle2 className="w-16 h-16 text-accent relative" strokeWidth={2.5} />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">Pagamento aprovado!</p>
              <p className="text-xs text-muted-foreground mt-0.5">Comprovante de pagamento</p>
            </div>

            <div className="w-full bg-background border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Receipt className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Detalhes da compra
                </span>
              </div>

              <div className="flex justify-between items-start gap-3">
                <span className="text-xs text-muted-foreground">{isMovie ? "Título" : "Plano"}</span>
                <span className="text-xs font-semibold text-foreground text-right">{headerName}</span>
              </div>

              <div className="flex justify-between items-start gap-3">
                <span className="text-xs text-muted-foreground">Valor pago</span>
                <span className="text-sm font-bold text-accent">{headerPrice}</span>
              </div>

              <div className="flex justify-between items-start gap-3">
                <span className="text-xs text-muted-foreground">Método</span>
                <span className="text-xs font-semibold text-foreground">PIX</span>
              </div>

              <div className="flex justify-between items-start gap-3">
                <span className="text-xs text-muted-foreground">Data</span>
                <span className="text-xs font-semibold text-foreground">{paidAtLabel}</span>
              </div>

              <div className="flex justify-between items-start gap-3">
                <span className="text-xs text-muted-foreground">Status</span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                  <CheckCircle2 className="w-3 h-3" /> Aprovado
                </span>
              </div>

              {pix?.purchase_id && (
                <div className="flex justify-between items-start gap-3 pt-2 border-t border-border">
                  <span className="text-[10px] text-muted-foreground">ID</span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[180px]">
                    {pix.purchase_id}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={handleGoToContent}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              {isMovie ? (
                <><Play className="w-4 h-4" /> Assistir agora</>
              ) : (
                <><User className="w-4 h-4" /> Ir para Minha Conta</>
              )}
            </button>

            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Fechar
            </button>
          </div>
        )}

        {pix && !paid && (
          <>
            <div className="flex justify-center mb-5">
              <div className="bg-white p-4 rounded-xl">
                {pix.qr_code_base64 ? (
                  <img
                    src={`data:image/png;base64,${pix.qr_code_base64}`}
                    alt="QR Code PIX"
                    width={180}
                    height={180}
                  />
                ) : (
                  <QRCodeSVG value={pix.qr_code} size={180} level="M" />
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 text-center">PIX Copia e Cola:</p>
              <div className="bg-background border border-border rounded-lg p-3 mb-3">
                <code className="text-xs font-mono text-foreground break-all select-all leading-relaxed block max-h-20 overflow-y-auto">
                  {pix.qr_code}
                </code>
              </div>
              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                {copied ? <><CheckCheck className="w-4 h-4" /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar Código PIX</>}
              </button>
            </div>

            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground justify-center">
              <Loader2 className="w-3 h-3 animate-spin" /> Aguardando confirmação automática…
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PixCheckout;
