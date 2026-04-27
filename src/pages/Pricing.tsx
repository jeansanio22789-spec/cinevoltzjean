import { useState } from "react";
import { Check, CreditCard, Smartphone, QrCode, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PixCheckout from "@/components/PixCheckout";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const plans = [
  {
    name: "Básico",
    price: "R$ 18,90",
    priceValue: "18.90",
    period: "/mês",
    features: [
      "1 tela simultânea",
      "Resolução 720p",
      "Assista no celular e tablet",
    ],
    highlight: false,
  },
  {
    name: "Padrão",
    price: "R$ 39,90",
    priceValue: "39.90",
    period: "/mês",
    features: [
      "2 telas simultâneas",
      "Resolução Full HD 1080p",
      "Assista em qualquer dispositivo",
      "Sem anúncios",
    ],
    highlight: true,
  },
  {
    name: "Premium",
    price: "R$ 55,90",
    priceValue: "55.90",
    period: "/mês",
    features: [
      "4 telas simultâneas",
      "Resolução Ultra HD 4K + HDR",
      "Áudio espacial Dolby Atmos",
      "Sem anúncios",
      "Conteúdo exclusivo",
    ],
    highlight: false,
  },
  {
    name: "Série",
    price: "R$ 10,00",
    priceValue: "10.00",
    period: "/série",
    features: [
      "Acesso a 1 série completa",
      "Pagamento único",
      "Assista quando quiser",
      "Qualidade Full HD",
    ],
    highlight: false,
  },
  {
    name: "Teste",
    price: "R$ 0,10",
    priceValue: "0.10",
    period: "/teste",
    features: [
      "Modo de teste R$ 0,10",
      "Valida fluxo completo PIX/Cartão",
      "Acesso de 1 dia",
    ],
    highlight: false,
  },
];

type PaymentMode = "pix" | "card" | "wallet";

const Pricing = () => {
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("pix");
  const [redirectingMode, setRedirectingMode] = useState<PaymentMode | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleChoose = (plan: typeof plans[0], mode: PaymentMode = "pix") => {
    if (!user) {
      toast.info("Faça login para assinar");
      navigate("/login?redirect=/planos");
      return;
    }
    setPaymentMode(mode);
    setSelectedPlan(plan);
  };

  // Para os botões "Cartão" / "Carteiras" abaixo (sem plano selecionado),
  // mostra um seletor de plano via toast simples (manda pro Padrão por padrão).
  const handlePaymentMethod = async (mode: PaymentMode) => {
    if (!user) {
      toast.info("Faça login para assinar");
      navigate("/login?redirect=/planos");
      return;
    }
    if (mode === "pix") {
      // Abre PIX no plano Padrão por padrão
      setPaymentMode("pix");
      setSelectedPlan(plans[1]);
      return;
    }
    // Cartão ou Carteira → cria checkout pro plano Padrão e redireciona
    setRedirectingMode(mode);
    try {
      const { data, error } = await supabase.functions.invoke("mp-create-checkout", {
        body: {
          plan: "Padrão",
          methods: mode,
          origin: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const url = data?.init_point || data?.sandbox_init_point;
      if (!url) throw new Error("Link de pagamento não retornado");
      window.location.href = url;
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "Erro ao abrir o checkout");
      setRedirectingMode(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16 px-4 md:px-12">
        <div className="max-w-5xl mx-auto text-center mb-12">
          <h1 className="text-3xl md:text-5xl font-black mb-4">Escolha seu plano</h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto">
            Pague com PIX, cartão ou carteira digital. Liberação automática.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-16">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-lg p-6 md:p-8 flex flex-col transition-all duration-300 ${
                plan.highlight
                  ? "bg-card border-2 border-primary shadow-[0_0_30px_-5px_hsl(357_83%_47%_/_0.3)] scale-[1.02]"
                  : "bg-card border border-border hover:border-muted-foreground/30"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full">
                  Mais Popular
                </span>
              )}

              <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl md:text-4xl font-black">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>

              <ul className="flex flex-col gap-3 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                <button
                  onClick={() => handleChoose(plan, "pix")}
                  className={`w-full py-3 rounded font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-foreground hover:bg-muted/80"
                  }`}
                >
                  <QrCode className="w-4 h-4 inline mr-2" />
                  Pagar com PIX
                </button>
                <button
                  onClick={() => handleChoose(plan, "card")}
                  className="w-full py-2.5 rounded font-semibold text-xs transition-colors bg-card border border-border text-foreground hover:border-primary/50"
                >
                  <CreditCard className="w-4 h-4 inline mr-2" />
                  Cartão / Carteira
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-xl font-bold mb-6">Formas de Pagamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => handlePaymentMethod("pix")}
              disabled={!!redirectingMode}
              className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <QrCode className="w-6 h-6 text-primary flex-shrink-0" />
              <span className="text-sm font-medium">PIX automático</span>
            </button>

            <button
              onClick={() => handlePaymentMethod("card")}
              disabled={!!redirectingMode}
              className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {redirectingMode === "card" ? (
                <Loader2 className="w-6 h-6 text-primary flex-shrink-0 animate-spin" />
              ) : (
                <CreditCard className="w-6 h-6 text-primary flex-shrink-0" />
              )}
              <span className="text-sm font-medium">
                {redirectingMode === "card" ? "Abrindo…" : "Cartão de Crédito/Débito"}
              </span>
            </button>

            <button
              onClick={() => handlePaymentMethod("wallet")}
              disabled={!!redirectingMode}
              className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {redirectingMode === "wallet" ? (
                <Loader2 className="w-6 h-6 text-primary flex-shrink-0 animate-spin" />
              ) : (
                <Smartphone className="w-6 h-6 text-primary flex-shrink-0" />
              )}
              <span className="text-sm font-medium">
                {redirectingMode === "wallet" ? "Abrindo…" : "Carteira Mercado Pago"}
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            Pagamento seguro processado pelo Mercado Pago. Liberação automática ao confirmar.
          </p>
        </div>
      </div>

      {selectedPlan && (
        <PixCheckout
          plan={selectedPlan}
          paymentMode={paymentMode}
          onClose={() => setSelectedPlan(null)}
        />
      )}

      <Footer />
    </div>
  );
};

export default Pricing;
