import poster1 from "@/assets/poster-1.jpg";
import poster2 from "@/assets/poster-2.jpg";
import poster3 from "@/assets/poster-3.jpg";
import poster4 from "@/assets/poster-4.jpg";
import poster5 from "@/assets/poster-5.jpg";
import poster6 from "@/assets/poster-6.jpg";
import poster7 from "@/assets/poster-7.jpg";
import poster8 from "@/assets/poster-8.jpg";

export interface Movie {
  id: string;
  title: string;
  description: string;
  poster: string;
  year: number;
  duration: string;
  match: number;
  genre: string[];
  rating: string;
}

export const movies: Movie[] = [
  {
    id: "1",
    title: "Sombras do Passado",
    description: "Um detetive investiga uma série de crimes misteriosos ligados a seu próprio passado sombrio.",
    poster: poster1,
    year: 2024,
    duration: "2h 15min",
    match: 97,
    genre: ["Suspense", "Drama"],
    rating: "16+",
  },
  {
    id: "2",
    title: "Neon City",
    description: "Em uma metrópole futurista, um hacker descobre uma conspiração que ameaça toda a civilização.",
    poster: poster2,
    year: 2025,
    duration: "1h 58min",
    match: 93,
    genre: ["Ficção Científica", "Ação"],
    rating: "14+",
  },
  {
    id: "3",
    title: "Abismo Profundo",
    description: "Uma expedição submarina encontra ruínas de uma civilização antiga com segredos inimagináveis.",
    poster: poster3,
    year: 2024,
    duration: "2h 05min",
    match: 89,
    genre: ["Aventura", "Mistério"],
    rating: "12+",
  },
  {
    id: "4",
    title: "Tempestade de Areia",
    description: "Um grupo de sobreviventes enfrenta os desafios de um mundo pós-apocalíptico devastado por tempestades.",
    poster: poster4,
    year: 2025,
    duration: "2h 22min",
    match: 95,
    genre: ["Ação", "Drama"],
    rating: "16+",
  },
  {
    id: "5",
    title: "Maré Alta",
    description: "Uma família de pescadores luta contra a fúria do oceano enquanto segredos vêm à tona.",
    poster: poster5,
    year: 2024,
    duration: "1h 48min",
    match: 88,
    genre: ["Drama", "Aventura"],
    rating: "12+",
  },
  {
    id: "6",
    title: "O Castelo das Trevas",
    description: "Uma jovem herda um castelo misterioso e descobre que seus ancestrais escondiam poderes sobrenaturais.",
    poster: poster6,
    year: 2025,
    duration: "2h 10min",
    match: 91,
    genre: ["Terror", "Fantasia"],
    rating: "16+",
  },
  {
    id: "7",
    title: "Templo Perdido",
    description: "Uma arqueóloga destemida embarca em uma jornada pela selva em busca de um artefato lendário.",
    poster: poster7,
    year: 2024,
    duration: "2h 01min",
    match: 94,
    genre: ["Aventura", "Ação"],
    rating: "12+",
  },
  {
    id: "8",
    title: "Aurora Polar",
    description: "Cientistas isolados no Ártico fazem uma descoberta que pode mudar o destino da humanidade.",
    poster: poster8,
    year: 2025,
    duration: "1h 55min",
    match: 90,
    genre: ["Ficção Científica", "Suspense"],
    rating: "14+",
  },
];

export const featuredMovie = movies[0];

export const movieCategories = [
  { title: "Em Alta", movies: movies },
  { title: "Lançamentos", movies: [...movies].reverse() },
  { title: "Ação e Aventura", movies: movies.filter((m) => m.genre.some((g) => ["Ação", "Aventura"].includes(g))) },
  { title: "Suspense e Mistério", movies: movies.filter((m) => m.genre.some((g) => ["Suspense", "Mistério", "Terror"].includes(g))) },
  { title: "Ficção Científica", movies: movies.filter((m) => m.genre.includes("Ficção Científica")) },
];
