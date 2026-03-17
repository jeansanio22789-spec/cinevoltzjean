import { useState } from "react";

const GROUP_LINK = "https://chat.whatsapp.com/IWXJNQnsLj089fbjzf7796";

const SecurityPopup = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(GROUP_LINK);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "hsl(var(--security-overlay) / 0.7)" }}
    >
      <div
        className="relative w-[420px] max-w-[95vw] rounded-[14px] p-7 text-[hsl(var(--security-text))]"
        style={{
          background: "linear-gradient(180deg, hsl(var(--security-popup-start)), hsl(var(--security-popup-end)))",
          border: "1px solid hsl(var(--security-border))",
          boxShadow: "0 0 25px hsl(var(--security-border) / 0.4)",
        }}
      >
        <img
          src="https://leigosacademy.site/logo.png"
          alt="Leigos Academy"
          className="mx-auto mb-4 block w-[140px] max-w-full"
        />

        <div className="mb-3 text-[22px] font-bold text-[hsl(var(--security-title))]">
          ⚠️ Aviso de Segurança
        </div>

        <div
          className="mb-4 rounded-lg p-3"
          style={{
            backgroundColor: "hsl(var(--security-warning-bg) / 0.05)",
            border: "1px solid hsl(var(--security-warning-border) / 0.3)",
          }}
        >
          Detectamos que você está utilizando uma <b>extensão não oficial / pirata</b>.<br />
          A extensão oficial é da <b>Leigos Academy</b>.
        </div>

        <div className="mb-5 text-sm leading-relaxed">
          Extensões piratas podem conter <span className="font-bold text-[hsl(var(--security-risk))]">códigos maliciosos</span> capazes de:
          <br />
          <br />• Roubar seus dados e acessos
          <br />• Vazamento de projetos
          <br />• Comprometer sua conta
          <br />• Fazer sua conta na plataforma ser <span className="font-bold text-[hsl(var(--security-risk))]">banida permanentemente</span>
          <br />
          <br />Para evitar riscos, utilize apenas a <b>versão oficial da Leigos Academy</b>.
          <br />Acesse: {" "}
          <a
            href="https://leigosacademy.site"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[hsl(var(--security-link))]"
          >
            leigosacademy.site
          </a>
        </div>

        <a
          href={GROUP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 block rounded-lg bg-[hsl(var(--security-btn-bg))] py-3.5 text-center font-bold text-[hsl(var(--security-btn-text))] no-underline transition-colors hover:bg-[hsl(var(--security-btn-hover))]"
        >
          Entrar no Grupo Oficial
        </a>

        <button
          onClick={handleCopy}
          className="mb-3 block w-full cursor-pointer rounded-lg border-none bg-[hsl(var(--security-btn-bg))] py-3.5 text-center font-bold text-[hsl(var(--security-btn-text))] transition-colors hover:bg-[hsl(var(--security-btn-hover))]"
        >
          {copied ? "✅ Link copiado!" : "📋 Copiar link do grupo"}
        </button>

        <div className="text-center text-[13px] text-[hsl(var(--security-discount))]">
          🎁 Adquira a versão oficial com <b>50% de desconto</b> dentro do grupo.
        </div>

        <div className="mt-2.5 text-center text-[13px] text-[hsl(var(--security-discount))]">
          📞 Ou entre em contato: <b>21 95949-6703</b>
        </div>
      </div>
    </div>
  );
};

export default SecurityPopup;
