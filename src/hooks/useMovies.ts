import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DbMovie {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  year: number | null;
  duration: string | null;
  genre: string | null;
  rating: string | null;
  status: string | null;
  video_url: string | null;
  telegram_url: string | null;
  price?: number | null;
  is_premiere?: boolean | null;
}

export const useMovies = () => {
  const [movies, setMovies] = useState<DbMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("movies")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      setMovies((data as DbMovie[]) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  return { movies, loading };
};
