import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import MovieCard from "./MovieCard";
import type { DbMovie } from "@/hooks/useMovies";

interface ContentRailProps {
  title: string;
  movies: DbMovie[];
}

const ContentRail = ({ title, movies }: ContentRailProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = dir === "left" ? -400 : 400;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  if (!movies.length) return null;

  return (
    <section className="relative px-4 md:px-12 mb-8">
      <h2 className="text-lg md:text-xl font-bold mb-3">{title}</h2>

      <div className="group relative">
        {/* Setas (aparecem só em telas com hover) */}
        <button
          onClick={() => scroll("left")}
          className="hidden md:flex absolute left-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-r from-background to-transparent opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center"
          aria-label="Anterior"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={() => scroll("right")}
          className="hidden md:flex absolute right-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-l from-background to-transparent opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center"
          aria-label="Próximo"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        <div
          ref={scrollRef}
          className="content-rail flex gap-2 md:gap-3 overflow-x-auto py-2 scroll-smooth snap-x"
        >
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ContentRail;
