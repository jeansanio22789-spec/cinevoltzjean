import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RemoteUploadJob {
  id: string;
  user_id: string;
  device_label: string | null;
  file_name: string;
  file_size: number;
  title: string;
  genre: string | null;
  description: string | null;
  status: string;
  progress: number;
  speed_mbs: number;
  eta_sec: number;
  upload_path: string | null;
  error_msg: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Lê em tempo real todos os jobs de upload da tabela `upload_jobs`.
 * Usado pelo painel admin pra mostrar o que está sendo enviado de
 * outros aparelhos (ex.: você no celular, parceiro no notebook).
 */
export const useRemoteUploadJobs = () => {
  const [jobs, setJobs] = useState<RemoteUploadJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchAll = async () => {
      const { data } = await supabase
        .from("upload_jobs")
        .select("*")
        .order("updated_at", { ascending: false });
      if (!active) return;
      setJobs((data as RemoteUploadJob[]) ?? []);
      setLoading(false);
    };

    void fetchAll();

    const channel = supabase
      .channel("upload-jobs-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "upload_jobs" },
        (payload) => {
          setJobs((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string }).id;
              return prev.filter((j) => j.id !== oldId);
            }
            const next = payload.new as RemoteUploadJob;
            const idx = prev.findIndex((j) => j.id === next.id);
            if (idx === -1) return [next, ...prev];
            const copy = [...prev];
            copy[idx] = next;
            return copy;
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return { jobs, loading };
};
