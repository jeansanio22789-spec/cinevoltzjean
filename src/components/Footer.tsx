const Footer = () => {
  return (
    <footer className="px-4 md:px-12 py-12 mt-8 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <p className="text-primary font-black text-xl mb-6">STREAMFLIX</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-muted-foreground mb-8">
          <div className="flex flex-col gap-2">
            <a href="#" className="hover:text-foreground transition-colors">Perguntas frequentes</a>
            <a href="#" className="hover:text-foreground transition-colors">Central de ajuda</a>
            <a href="#" className="hover:text-foreground transition-colors">Conta</a>
          </div>
          <div className="flex flex-col gap-2">
            <a href="#" className="hover:text-foreground transition-colors">Imprensa</a>
            <a href="#" className="hover:text-foreground transition-colors">Relações com investidores</a>
            <a href="#" className="hover:text-foreground transition-colors">Carreiras</a>
          </div>
          <div className="flex flex-col gap-2">
            <a href="#" className="hover:text-foreground transition-colors">Formas de assistir</a>
            <a href="#" className="hover:text-foreground transition-colors">Termos de uso</a>
            <a href="#" className="hover:text-foreground transition-colors">Privacidade</a>
          </div>
          <div className="flex flex-col gap-2">
            <a href="#" className="hover:text-foreground transition-colors">Preferências de cookies</a>
            <a href="#" className="hover:text-foreground transition-colors">Informações corporativas</a>
            <a href="#" className="hover:text-foreground transition-colors">Fale conosco</a>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">© 2025 StreamFlix. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
};

export default Footer;
