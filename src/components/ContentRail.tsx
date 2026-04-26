import MovieCard from "./MovieCard";
import type { DbMovie } from "@/hooks/useMovies";

interface ContentRailProps {
  title: string;
  movies: DbMovie[];
}

const ContentRail = ({ title, movies }: ContentRailProps) => {
  return (
    <section className="px-4 md:px-12 mb-8">
      <h2 className="text-lg md:text-xl font-bold mb-3">{title}</h2>

      {/* Grid: 3 cards lado a lado no celular, mais em telas maiores */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 md:gap-3">
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
    </section>
  );
};

export default ContentRail;

