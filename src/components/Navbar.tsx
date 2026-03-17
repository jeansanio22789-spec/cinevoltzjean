import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Bell, User, Menu, X } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";

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
      <Link to="/" className="text-primary font-black text-2xl md:text-3xl tracking-tight mr-8">
        STREAMFLIX
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
          className="hidden md:inline-flex items-center px-4 py-1.5 bg-primary text-primary-foreground text-sm font-semibold rounded hover:bg-primary/90 transition-colors"
        >
          Assinar
        </Link>
        {isAdmin && (
          <Link
            to="/admin"
            className="hidden md:inline-flex items-center px-3 py-1.5 border border-border text-sm font-medium rounded hover:bg-muted transition-colors"
          >
            Painel Admin
          </Link>
        )}
        <Link to="/login" className="text-muted-foreground hover:text-foreground transition-colors">
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
