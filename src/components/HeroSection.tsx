import { Play, Check, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DbMovie } from "@/hooks/useMovies";

interface HeroSectionProps {
  movie: DbMovie | null;
}

const benefits = [
  "Sem Anúncios",
  "HD & 4K",
  "80% DOS FILMES DUBLADOS",
  "Sem Telegram",
  "Sem Travamentos",
];

const HeroSection = ({ movie }: HeroSectionProps) => {
  const navigate = useNavigate();
  const goToWatch = () => movie && navigate(`/assistir/${movie.id}`);
  const goToPlans = () => navigate("/planos");

  return (
    <section className="relative w-full pt-24 pb-6 px-4 md:px-12 overflow-hidden">
      {/* Backdrop */}
      {movie?.thumbnail_url && (
        <div className="absolute inset-0 -z-10 opacity-30">
          <img src={movie.thumbnail_url} alt="" className="w-full h-full object-cover blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
        </div>
      )}

      {/* Premium CTA card */}
      <button
        onClick={goToPlans}
        className="w-full max-w-md mx-auto block rounded-2xl border border-primary/40 bg-background/40 backdrop-blur-sm py-3 px-5 mb-5 hover:border-primary transition-colors group"
      >
        <span className="flex items-center justify-center gap-2 text-primary font-bold text-base">
          Ver Benefícios
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </span>
      </button>

      {/* Benefits grid */}
      <ul className="max-w-md mx-auto grid grid-cols-2 gap-x-4 gap-y-2 mb-6">
        {benefits.map((b, i) => (
          <li
            key={b}
            className={`flex items-center gap-2 text-foreground text-sm font-medium ${
              i === 2 ? "col-span-2 justify-center" : ""
            }`}
          >
            <Check className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={3} />
            <span className={i === 2 ? "uppercase font-bold tracking-wide" : ""}>{b}</span>
          </li>
        ))}
      </ul>

      {/* Tagline */}
      <h1 className="text-center text-2xl md:text-4xl font-black leading-tight mb-5 brand-wordmark px-2">
        Maratone Filmes Sem Limites, Sem Anúncios e Sem Mensalidades!
      </h1>

      {/* Destaques pill */}
      <div className="flex justify-center mb-2">
        <button
          onClick={goToWatch}
          className="btn-premium px-8 py-2.5 rounded-full font-extrabold tracking-wider text-sm uppercase hover:scale-105 transition-transform inline-flex items-center gap-2"
        >
          <Play className="w-4 h-4 fill-current" />
          Destaques
        </button>
      </div>
    </section>
  );
};

export default HeroSection;
