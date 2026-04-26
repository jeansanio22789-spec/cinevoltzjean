import { useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import Footer from "@/components/Footer";
import ContentRail from "@/components/ContentRail";
import UpcomingPremieres from "@/components/UpcomingPremieres";
import AdminUploadsRail from "@/components/AdminUploadsRail";
import { useMovies } from "@/hooks/useMovies";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

const Index = () => {
  const { movies, loading } = useMovies();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return movies;
    return movies.filter((m) => m.title.toLowerCase().includes(q));
  }, [movies, query]);

  // Fileira "Adicionados recentemente" — vem na ordem que veio do banco (created_at desc)
  const recent = useMemo(() => filtered.slice(0, 20), [filtered]);

  // Agrupa por gênero pra criar uma fileira por categoria (estilo Netflix)
  const byGenre = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const m of filtered) {
      const g = (m.genre || "Outros").trim() || "Outros";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection movie={movies[0] ?? null} />

      <div className="relative z-10 py-6">
        <AdminUploadsRail />
        <UpcomingPremieres />

        <div className="px-4 md:px-12 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className="text-2xl font-bold">Catálogo</h1>
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
          <div className="space-y-2">
            {recent.length > 0 && <ContentRail title="Adicionados recentemente" movies={recent} />}
            {byGenre.map(([genre, items]) => (
              <ContentRail key={genre} title={genre} movies={items} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Index;

