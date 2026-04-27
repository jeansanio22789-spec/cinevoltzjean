import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Public Key do Mercado Pago (segura para frontend)
const MP_PUBLIC_KEY = "APP_USR-e7a68a00-8356-49ce-a660-0835eda6d61f";

interface Props {
  amount: number;
  label: string;
  plan?: string;
  movieId?: string;
  onApproved: () => void;
  onClose: () => void;
}

declare global {
  interface Window {
    MercadoPago?: any;
  }
}

const loadMpSdk = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.MercadoPago) return resolve();
    const s = document.createElement("script");
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar SDK do Mercado Pago"));
    document.head.appendChild(s);
  });

const CardCheckout = ({ amount, label, plan, movieId, onApproved, onClose }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const brickRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "processing" | "approved" | "rejected">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    let bricksController: any = null;

    (async () => {
      try {
        await loadMpSdk();
        if (cancelled || !window.MercadoPago) return;

        const mp = new window.MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
        bricksController = await mp.bricks().create("cardPayment", "mp-card-brick", {
          initialization: {
            amount,
            payer: { email: user?.email ?? "" },
          },
          customization: {
            visual: {
              style: { theme: "dark" },
              hideFormTitle: true,
              hidePaymentButton: false,
            },
            paymentMethods: { maxInstallments: 12 },
          },
          callbacks: {
            onReady: () => {
              if (!cancelled) setStatus("ready");
            },
            onSubmit: async (cardFormData: any) => {
              setStatus("processing");
              setErrorMsg(null);
              try {
                const { data, error } = await supabase.functions.invoke("mp-process-card", {
                  body: {
                    ...cardFormData.formData,
                    plan,
                    movie_id: movieId,
                  },
                });
                if (error) throw error;
                if (data?.error) throw new Error(data.error);

                if (data.status === "approved") {
                  setStatus("approved");
                  toast.success("Pagamento aprovado!");
                  setTimeout(onApproved, 1500);
                } else if (data.status === "in_process" || data.status === "pending") {
                  setStatus("approved");
                  toast.info("Pagamento em análise — você receberá a confirmação em instantes.");
                  setTimeout(onApproved, 2000);
                } else {
                  setStatus("rejected");
                  setErrorMsg(data.status_detail || "Pagamento recusado");
                }
              } catch (e: any) {
                setStatus("rejected");
                const msg = e?.message || "Erro ao processar pagamento";
                setErrorMsg(msg);
                toast.error(msg);
              }
            },
            onError: (err: any) => {
              console.error("Brick error", err);
              if (err?.message) setErrorMsg(err.message);
            },
          },
        });
        brickRef.current = bricksController;
      } catch (e: any) {
        if (!cancelled) {
          setStatus("rejected");
          setErrorMsg(e?.message || "Erro ao carregar formulário");
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        bricksController?.unmount?.();
      } catch (e) {
        /* ignore */
      }
    };
  }, [amount, plan, movieId, user?.email, onApproved]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        <span className="flex items-center gap-1.5">
          <Lock className="w-3 h-3" /> Pagamento seguro processado pelo Mercado Pago
        </span>
      </div>

      {status === "loading" && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando formulário…</p>
        </div>
      )}

      <div
        id="mp-card-brick"
        ref={containerRef}
        className={status === "loading" ? "hidden" : ""}
      />

      {status === "processing" && (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Processando pagamento…
        </div>
      )}

      {status === "approved" && (
        <div className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-accent">
          <CheckCircle2 className="w-5 h-5" /> Pagamento aprovado!
        </div>
      )}

      {status === "rejected" && errorMsg && (
        <div className="flex items-start gap-2 py-3 px-3 text-xs text-destructive bg-destructive/10 rounded-lg">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Pagamento não concluído</p>
            <p className="opacity-80">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardCheckout;
