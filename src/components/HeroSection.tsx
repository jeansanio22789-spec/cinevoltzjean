import { Play, Info } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
import { featuredMovie } from "@/data/movies";

const HeroSection = () => {
  return (
    <section className="relative w-full h-[85vh] min-h-[500px] overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={heroBg}
          alt={featuredMovie.title}
          className="w-full h-full object-cover"
          loading="eager"
        />
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-end h-full px-4 md:px-12 pb-16 md:pb-24 max-w-2xl">
        <span className="inline-flex items-center gap-2 text-accent text-sm font-semibold mb-3 opacity-0 animate-fade-in-up">
          <span className="w-2 h-2 rounded-full bg-accent" />
          {featuredMovie.match}% relevante para você
        </span>

        <h1 className="text-4xl md:text-6xl font-black leading-tight mb-4 opacity-0 animate-fade-in-up animate-delay-100">
          {featuredMovie.title}
        </h1>

        <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-6 line-clamp-3 opacity-0 animate-fade-in-up animate-delay-200">
          {featuredMovie.description}
        </p>

        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6 opacity-0 animate-fade-in-up animate-delay-200">
          <span className="border border-muted-foreground/40 px-1.5 py-0.5 rounded text-[10px]">
            {featuredMovie.rating}
          </span>
          <span>{featuredMovie.year}</span>
          <span>•</span>
          <span>{featuredMovie.duration}</span>
          <span>•</span>
          <span>{featuredMovie.genre.join(", ")}</span>
        </div>

        <div className="flex items-center gap-3 opacity-0 animate-fade-in-up animate-delay-300">
          <button className="inline-flex items-center gap-2 px-6 md:px-8 py-3 bg-foreground text-background font-bold text-sm rounded hover:bg-foreground/90 transition-colors">
            <Play className="w-5 h-5 fill-current" />
            Assistir
          </button>
          <button className="inline-flex items-center gap-2 px-6 md:px-8 py-3 bg-muted/60 text-foreground font-semibold text-sm rounded hover:bg-muted/80 transition-colors backdrop-blur-sm">
            <Info className="w-5 h-5" />
            Mais Informações
          </button>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
