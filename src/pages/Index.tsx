import { useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import Footer from "@/components/Footer";
import ContentRail from "@/components/ContentRail";
import AdminUploadsRail from "@/components/AdminUploadsRail";
import UpcomingPremieres from "@/components/UpcomingPremieres";

import { useMovies } from "@/hooks/useMovies";
import { useContinueWatching } from "@/hooks/useContinueWatching";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import type { RailMovie } from "@/components/MovieCard";

const Index = () => {
  const { movies, loading } = useMovies();
  const continueWatching = useContinueWatching(movies);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all: RailMovie[] = movies;
    if (!q) return all;
    return all.filter((m) => m.title.toLowerCase().includes(q));
  }, [movies, query]);

  // "Em alta" — pega os 12 mais recentes (proxy de tendência por enquanto)
  const trending = useMemo(() => filtered.slice(0, 12), [filtered]);

  // Estreias — marcadas manualmente pelo admin
  const premieres = useMemo(() => filtered.filter((m) => m.is_premiere), [filtered]);

  // "Para você" — embaralhamento determinístico baseado no id pra dar
  // sensação de recomendação personalizada sem chamar IA.
  const forYou = useMemo(() => {
    const pool = [...filtered];
    return pool
      .map((m) => ({ m, k: (m.id.charCodeAt(0) + m.id.charCodeAt(m.id.length - 1)) % 97 }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.m)
      .slice(0, 14);
  }, [filtered]);

  // Adicionados recentemente
  const recent = useMemo(() => filtered.slice(0, 20), [filtered]);

  // Agrupa por gênero
  const byGenre = useMemo(() => {
    const map = new Map<string, RailMovie[]>();
    for (const m of filtered) {
      const g = (m.genre || "Outros").trim() || "Outros";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [filtered]);

  const isSearching = query.trim().length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection movie={movies[0] ?? null} />

      <div className="relative z-10 py-6">
        <UpcomingPremieres />
        <div className="px-4 md:px-12 mb-6">
          <AdminUploadsRail />
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
        ) : isSearching ? (
          <div className="space-y-2">
            <ContentRail title={`Resultados para "${query}"`} movies={filtered} />
          </div>
        ) : (
          <div className="space-y-2">
            {continueWatching.length > 0 && (
              <ContentRail title="Continuar assistindo" movies={continueWatching} />
            )}
            {trending.length > 0 && <ContentRail title="🔥 Em alta" movies={trending} />}
            {forYou.length > 0 && <ContentRail title="Para você" movies={forYou} />}
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
