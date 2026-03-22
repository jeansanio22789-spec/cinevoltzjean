import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ContentRail from "@/components/ContentRail";
import Footer from "@/components/Footer";
import { useMovies } from "@/hooks/useMovies";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { movies, loading } = useMovies();

  const categories = [
    { title: "Em Alta", items: movies },
    { title: "Lançamentos", items: [...movies].reverse() },
    {
      title: "Ação e Aventura",
      items: movies.filter((m) =>
        m.genre?.toLowerCase().includes("ação") || m.genre?.toLowerCase().includes("aventura")
      ),
    },
    {
      title: "Suspense e Mistério",
      items: movies.filter((m) =>
        m.genre?.toLowerCase().includes("suspense") ||
        m.genre?.toLowerCase().includes("mistério") ||
        m.genre?.toLowerCase().includes("terror")
      ),
    },
  ].filter((c) => c.items.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection movie={movies[0] ?? null} />
      <div className="-mt-16 relative z-10">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : categories.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">Nenhum conteúdo disponível ainda.</p>
        ) : (
          categories.map((cat) => (
            <ContentRail key={cat.title} title={cat.title} movies={cat.items} />
          ))
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Index;
