import { useEffect, useRef } from "react";
import MovieCard from "./MovieCard";
import type { DbMovie } from "@/hooks/useMovies";

interface AutoScrollRailProps {
  title: string;
  movies: DbMovie[];
  speed?: number; // pixels per frame
}

const AutoScrollRail = ({ title, movies, speed = 0.5 }: AutoScrollRailProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  // Duplicate the list so the loop feels seamless
  const items = movies.length > 0 ? [...movies, ...movies] : [];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;

    let raf = 0;
    const tick = () => {
      if (!pausedRef.current && el) {
        el.scrollLeft += speed;
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half) {
          el.scrollLeft -= half;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items.length, speed]);

  if (movies.length === 0) return null;

  return (
    <section className="relative px-4 md:px-12 mb-8">
      <h2 className="text-lg md:text-xl font-bold mb-3">{title}</h2>
      <div
        ref={scrollRef}
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
        onTouchStart={() => (pausedRef.current = true)}
        onTouchEnd={() => (pausedRef.current = false)}
        className="content-rail flex gap-2 md:gap-3 overflow-x-auto py-2 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((movie, i) => (
          <MovieCard key={`${movie.id}-${i}`} movie={movie} />
        ))}
      </div>
    </section>
  );
};

export default AutoScrollRail;
