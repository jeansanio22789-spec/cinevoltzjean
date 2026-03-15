import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ContentRail from "@/components/ContentRail";
import Footer from "@/components/Footer";
import { movieCategories } from "@/data/movies";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <div className="-mt-16 relative z-10">
        {movieCategories.map((category) => (
          <ContentRail
            key={category.title}
            title={category.title}
            movies={category.movies}
          />
        ))}
      </div>
      <Footer />
    </div>
  );
};

export default Index;
