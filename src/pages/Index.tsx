import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import Footer from "@/components/Footer";
import { useMovies } from "@/hooks/useMovies";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

const Index = () => {
  const { movies, loading } = useMovies();
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () =>
      [...movies].sort((a, b) =>
        a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" })
      ),
    [movies]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((m) => m.title.toLowerCase().includes(q));
  }, [sorted, query]);

  // Agrupa por letra inicial
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const m of filtered) {
      const letter = (m.title[0] || "#").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const key = /[A-Z]/.test(letter) ? letter : "#";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection movie={sorted[0] ?? null} />
      <div className="relative z-10 container mx-auto px-4 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold">Catálogo de séries</h1>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título..."
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">
            {query ? "Nada encontrado pra essa busca." : "Nenhum conteúdo disponível ainda."}
          </p>
        ) : (
          <div className="space-y-10">
            {grouped.map(([letter, items]) => (
              <section key={letter}>
                <h2 className="text-lg font-semibold text-muted-foreground mb-3 border-b border-border pb-2">
                  {letter}
                </h2>
                <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 md:gap-3">
                  {items.map((m) => (
                    <li key={m.id}>
                      <Link
                        to={`/assistir/${m.id}`}
                        className="group block rounded-lg overflow-hidden bg-card border border-border hover:border-primary transition"
                      >
                        <div className="aspect-[2/3] bg-muted overflow-hidden">
                          {m.thumbnail_url ? (
                            <img
                              src={m.thumbnail_url}
                              alt={m.title}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                              sem capa
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-sm font-medium line-clamp-2">{m.title}</p>
                          {m.genre && (
                            <p className="text-xs text-muted-foreground mt-1">{m.genre}</p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Index;
