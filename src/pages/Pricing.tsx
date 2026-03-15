import { useState } from "react";
import { Check, CreditCard, Smartphone, QrCode, X, Copy, CheckCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const PIX_KEY = "jeansanio22789@gmail.com";
const PIX_NAME = "CINEVOLT";
const PIX_CITY = "SAO PAULO";

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
      "Download para 1 dispositivo",
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
      "Download para 2 dispositivos",
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

// Generate PIX EMV QR Code payload (BR Code)
function generatePixPayload(amount: string, name: string, city: string, key: string, txId: string) {
  const formatField = (id: string, value: string) => {
    const len = value.length.toString().padStart(2, "0");
    return `${id}${len}${value}`;
  };

  // Merchant Account Information (field 26)
  const gui = formatField("00", "br.gov.bcb.pix");
  const pixKey = formatField("01", key);
  const merchantAccount = formatField("26", gui + pixKey);

  const payloadFormat = formatField("00", "01");
  const merchantCategoryCode = formatField("52", "0000");
  const transactionCurrency = formatField("53", "986");
  const transactionAmount = formatField("54", amount);
  const countryCode = formatField("58", "BR");
  const merchantName = formatField("59", name);
  const merchantCity = formatField("60", city);

  const txIdField = formatField("05", txId);
  const additionalData = formatField("62", txIdField);

  const payloadWithoutCRC =
    payloadFormat +
    merchantAccount +
    merchantCategoryCode +
    transactionCurrency +
    transactionAmount +
    countryCode +
    merchantName +
    merchantCity +
    additionalData +
    "6304";

  const crc = crc16CCITT(payloadWithoutCRC);
  return payloadWithoutCRC + crc;
}

function crc16CCITT(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const Pricing = () => {
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null);
  const [copied, setCopied] = useState(false);

  const pixPayload = selectedPlan
    ? generatePixPayload(
        selectedPlan.priceValue,
        PIX_NAME,
        PIX_CITY,
        PIX_KEY,
        `CV${selectedPlan.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6)}${Date.now().toString().slice(-6)}`
      )
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16 px-4 md:px-12">
        <div className="max-w-5xl mx-auto text-center mb-12">
          <h1 className="text-3xl md:text-5xl font-black mb-4">Escolha seu plano</h1>
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
                onClick={() => { setSelectedPlan(plan); setCopied(false); }}
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
            Pagamento 100% seguro via PIX, cartão ou carteiras digitais.
          </p>
        </div>
      </div>

      {/* PIX Payment Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedPlan(null)}
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
                Plano <span className="font-semibold text-foreground">{selectedPlan.name}</span> — <span className="font-semibold text-foreground">{selectedPlan.price}</span>{selectedPlan.period}
              </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-5">
              <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG
                  value={pixPayload}
                  size={180}
                  level="M"
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
              </div>
            </div>

            {/* PIX Copia e Cola */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 text-center">PIX Copia e Cola:</p>
              <div className="bg-background border border-border rounded-lg p-3 mb-3">
                <code className="text-xs font-mono text-foreground break-all select-all leading-relaxed block max-h-20 overflow-y-auto">
                  {pixPayload}
                </code>
              </div>
              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                {copied ? (
                  <>
                    <CheckCheck className="w-4 h-4" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copiar Código PIX
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              Abra o app do seu banco, escolha pagar com PIX e escaneie o QR Code ou cole o código acima.
            </p>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default Pricing;
