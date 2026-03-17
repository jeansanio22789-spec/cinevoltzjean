import { useState } from "react";

const SecurityPopup = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("https://chat.whatsapp.com/IWXJNQnsLj089fbjzf7796").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="w-[420px] max-w-[95vw] rounded-[14px] p-7 relative"
        style={{
          background: "linear-gradient(180deg,#021f15,#01130d)",
          border: "1px solid #00ff9c",
          boxShadow: "0 0 25px rgba(0,255,150,0.4)",
          color: "#b9ffd9",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <img
          src="https://leigosacademy.site/logo.png"
          alt="Leigos Academy"
          className="block mx-auto mb-4"
          style={{ maxWidth: 140 }}
        />

        <div className="text-[22px] font-bold mb-3" style={{ color: "#00ffa2" }}>
          ⚠️ Aviso de Segurança
        </div>

        <div
          className="p-3 rounded-lg mb-4"
          style={{
            background: "rgba(0,255,160,0.05)",
            border: "1px solid rgba(0,255,160,0.3)",
          }}
        >
          Detectamos que você está utilizando uma <b>extensão não oficial / pirata</b>.<br />
          A extensão oficial é da <b>Leigos Academy</b>.
        </div>

        <div className="text-sm leading-relaxed mb-5">
          Extensões piratas podem conter <span className="font-bold" style={{ color: "#ff9a9a" }}>códigos maliciosos</span> capazes de:
          <br /><br />
          • Roubar seus dados e acessos<br />
          • Vazamento de projetos<br />
          • Comprometer sua conta<br />
          • Fazer sua conta na plataforma ser <span className="font-bold" style={{ color: "#ff9a9a" }}>banida permanentemente</span>
          <br /><br />
          Para evitar riscos, utilize apenas a <b>versão oficial da Leigos Academy</b>.<br />
          Acesse: <a href="https://leigosacademy.site" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff9c" }}>leigosacademy.site</a>
        </div>

        <a
          href="https://chat.whatsapp.com/IWXJNQnsLj089fbjzf7796"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center font-bold py-3.5 rounded-lg mb-3 no-underline transition-colors"
          style={{ background: "#00ff9c", color: "#002b1b" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#00cc7d")}
          onMouseLeave={e => (e.currentTarget.style.background = "#00ff9c")}
        >
          Entrar no Grupo Oficial
        </a>

        <button
          onClick={handleCopy}
          className="block w-full text-center font-bold py-3.5 rounded-lg mb-3 cursor-pointer border-none transition-colors"
          style={{ background: "#00ff9c", color: "#002b1b" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#00cc7d")}
          onMouseLeave={e => (e.currentTarget.style.background = "#00ff9c")}
        >
          {copied ? "✅ Link copiado!" : "📋 Copiar link do grupo"}
        </button>

        <div className="text-center text-[13px]" style={{ color: "#7dffc6" }}>
          🎁 Adquira a versão oficial com <b>50% de desconto</b> dentro do grupo.
        </div>

        <div className="text-center text-[13px] mt-2.5" style={{ color: "#7dffc6" }}>
          📞 Ou entre em contato: <b>21 95949-6703</b>
        </div>
      </div>
    </div>
  );
};

export default SecurityPopup;
