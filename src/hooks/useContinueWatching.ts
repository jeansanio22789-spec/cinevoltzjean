import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { DbMovie } from "./useMovies";

/**
 * Retorna os últimos filmes que o usuário começou a assistir,
 * mais recentes primeiro, sem duplicar (uma entrada por filme).
 */
export const useContinueWatching = (allMovies: DbMovie[]) => {
  const { user } = useAuth();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) {
      setIds([]);
      return;
    }
    const fetch = async () => {
      const { data } = await supabase
        .from("video_views")
        .select("movie_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const row of (data ?? []) as { movie_id: string }[]) {
        if (!seen.has(row.movie_id)) {
          seen.add(row.movie_id);
          ordered.push(row.movie_id);
        }
        if (ordered.length >= 12) break;
      }
      setIds(ordered);
    };
    fetch();
  }, [user]);

  const byId = new Map(allMovies.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as DbMovie[];
};
