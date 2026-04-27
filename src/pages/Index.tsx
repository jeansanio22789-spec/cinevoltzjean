import { useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import Footer from "@/components/Footer";
import ContentRail from "@/components/ContentRail";
import AdminUploadsRail from "@/components/AdminUploadsRail";
import { useMovies, type DbMovie } from "@/hooks/useMovies";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import type { RailMovie } from "@/components/MovieCard";

const Index = () => {
  const { movies, loading } = useMovies();
  const { jobs } = useUploadQueue();
  const [query, setQuery] = useState("");

  // Transforma uploads ativos em "pseudo-filmes" para misturar no catálogo
  const pendingMovies: RailMovie[] = useMemo(() => {
    return jobs
      .filter((j) =>
        ["uploading", "warning", "queued", "saving"].includes(j.status),
      )
      .map((j) => {
        const fake: RailMovie = {
          id: `pending-${j.id}`,
          title: j.meta.title,
          description: j.meta.description || null,
          thumbnail_url: j.thumbPreviewUrl || null,
          year: new Date().getFullYear(),
          duration: null,
          genre: j.meta.genre || "Outros",
          rating: null,
          status: "pending",
          video_url: null,
          telegram_url: null,
          _pending: j,
        };
        return fake;
      });
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all: RailMovie[] = [...pendingMovies, ...(movies as DbMovie[])];
    if (!q) return all;
    return all.filter((m) => m.title.toLowerCase().includes(q));
  }, [movies, pendingMovies, query]);

  // Fileira "Adicionados recentemente" — pendentes vêm primeiro, depois recentes
  const recent = useMemo(() => filtered.slice(0, 20), [filtered]);

  // Agrupa por gênero pra criar uma fileira por categoria (estilo Netflix)
  const byGenre = useMemo(() => {
    const map = new Map<string, RailMovie[]>();
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
