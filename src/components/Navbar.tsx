import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Bell, User, Menu, X, Play, Star } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/contexts/AuthContext";

const navLinks = [
  { label: "Início", path: "/" },
  { label: "Ao Vivo", path: "/ao-vivo" },
  { label: "Filmes", path: "/" },
  { label: "Séries", path: "/" },
  { label: "Minha Lista", path: "/" },
  { label: "Trabalhe Conosco", path: "/carreiras" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin } = useIsAdmin();
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 px-4 md:px-12 py-3 flex items-center justify-between transition-all duration-300 ${
        scrolled ? "navbar-solid" : "navbar-transparent"
      }`}
    >
      <Link to="/" className="flex items-center gap-2 mr-6 shrink-0">
        <span className="w-8 h-8 rounded-md bg-gradient-to-br from-primary to-fuchsia-600 flex items-center justify-center shadow-[0_0_16px_hsl(var(--primary)/0.5)]">
          <Play className="w-4 h-4 text-primary-foreground fill-current ml-0.5" />
        </span>
        <span className="font-black text-xl md:text-2xl tracking-tight brand-wordmark">
          STREAMFLIX
        </span>
      </Link>

      <div className="hidden md:flex items-center gap-6 flex-1">
        {navLinks.map((link) => (
          <Link
            key={link.label}
            to={link.path}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Search className="w-5 h-5" />
        </button>
        <button className="text-muted-foreground hover:text-foreground transition-colors hidden md:block">
          <Bell className="w-5 h-5" />
        </button>
        <Link
          to="/planos"
          className="inline-flex items-center gap-1.5 px-4 py-1.5 btn-premium text-sm font-bold rounded-full hover:scale-105 transition-transform"
        >
          <Star className="w-4 h-4 fill-current" />
          Premium
        </Link>
        {isAdmin && (
          <Link
            to="/admin"
            className="hidden md:inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded hover:bg-muted transition-colors"
          >
            Painel Admin
          </Link>
        )}
        <Link
          to={user ? "/minha-conta" : "/login"}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={user ? "Minha conta" : "Entrar"}
        >
          <User className="w-5 h-5" />
        </Link>
        <button
          className="md:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="absolute top-full left-0 right-0 bg-background/95 backdrop-blur-lg border-b border-border md:hidden">
          <div className="flex flex-col p-4 gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.path}
                className="text-sm font-medium text-muted-foreground hover:text-foreground py-2"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/planos"
              className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded mt-2"
              onClick={() => setMobileOpen(false)}
            >
              Assinar Agora
            </Link>
            {user && (
              <Link
                to="/minha-conta"
                className="inline-flex items-center justify-center px-4 py-2 border border-border text-sm font-medium rounded"
                onClick={() => setMobileOpen(false)}
              >
                Minha Conta
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                className="inline-flex items-center justify-center px-4 py-2 border border-border text-sm font-medium rounded"
                onClick={() => setMobileOpen(false)}
              >
                Painel Admin
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
