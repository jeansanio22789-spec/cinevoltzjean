import { useState, useEffect, useRef } from "react";
import { X, QrCode, Copy, CheckCheck, Loader2, CheckCircle2 } from "lucide-react";
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
        toast.success("Pagamento confirmado! Liberando acesso…");
        setTimeout(() => {
          onClose();
          if (isMovie && movieId) {
            // hard reload pra recarregar checagem de acesso
            window.location.href = `/assistir/${movieId}`;
          } else {
            window.location.href = "/minha-conta";
          }
        }, 800);
      }
    };
    pollRef.current = window.setInterval(tick, 4000) as unknown as number;
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pix?.purchase_id, paid, navigate, onClose, isMovie, movieId]);

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
          <div className="flex flex-col items-center gap-3 py-12">
            <CheckCircle2 className="w-14 h-14 text-accent" />
            <p className="text-base font-bold">Pagamento aprovado!</p>
            <p className="text-xs text-muted-foreground">Você já pode assistir.</p>
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
