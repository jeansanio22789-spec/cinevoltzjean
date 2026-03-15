import { Check, CreditCard, Smartphone, QrCode } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const plans = [
  {
    name: "Básico",
    price: "R$ 18,90",
    period: "/mês",
    features: [
      "1 tela simultânea",
      "Resolução 720p",
      "Assista no celular e tablet",
      "Download para 1 dispositivo",
    ],
    highlight: false,
  },
  {
    name: "Padrão",
    price: "R$ 39,90",
    period: "/mês",
    features: [
      "2 telas simultâneas",
      "Resolução Full HD 1080p",
      "Assista em qualquer dispositivo",
      "Download para 2 dispositivos",
      "Sem anúncios",
    ],
    highlight: true,
  },
  {
    name: "Premium",
    price: "R$ 55,90",
    period: "/mês",
    features: [
      "4 telas simultâneas",
      "Resolução Ultra HD 4K + HDR",
      "Áudio espacial Dolby Atmos",
      "Download para 6 dispositivos",
      "Sem anúncios",
      "Conteúdo exclusivo",
    ],
    highlight: false,
  },
];

const paymentMethods = [
  { icon: CreditCard, label: "Cartão de Crédito / Débito" },
  { icon: QrCode, label: "PIX" },
  { icon: Smartphone, label: "Google Pay / Apple Pay" },
];

const Pricing = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16 px-4 md:px-12">
        <div className="max-w-5xl mx-auto text-center mb-12">
          <h1 className="text-3xl md:text-5xl font-black mb-4">
            Escolha seu plano
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto">
            Assista onde quiser. Cancele quando quiser. Sem compromisso e sem multa.
          </p>
        </div>

        {/* Plans */}
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-16">
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

              <ul className="flex flex-col gap-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-3 rounded font-semibold text-sm transition-colors ${
                  plan.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-foreground hover:bg-muted/80"
                }`}
              >
                Começar Agora
              </button>
            </div>
          ))}
        </div>

        {/* Payment Methods */}
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-xl font-bold mb-6">Formas de Pagamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {paymentMethods.map((method) => (
              <div
                key={method.label}
                className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-muted-foreground/30 transition-colors"
              >
                <method.icon className="w-6 h-6 text-primary flex-shrink-0" />
                <span className="text-sm font-medium">{method.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            Também aceitamos PayPal, Boleto Bancário e carteiras digitais. Pagamento 100% seguro.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Pricing;
