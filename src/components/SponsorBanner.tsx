import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  target_url: string;
  placement: string;
}

interface Props {
  /** "banner" → topo da página /ao-vivo. "overlay" → canto do player */
  placement: "banner" | "overlay";
  className?: string;
}

const SponsorBanner = ({ placement, className = "" }: Props) => {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("sponsors")
        .select("id, name, logo_url, target_url, placement")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      const list = (data || []).filter((s: Sponsor) =>
        s.placement === placement || s.placement === "both"
      );
      setSponsors(list);
    };
    load();
  }, [placement]);

  // Rotaciona a cada 12s
  useEffect(() => {
    if (sponsors.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % sponsors.length), 12000);
    return () => clearInterval(t);
  }, [sponsors.length]);

  const current = useMemo(() => sponsors[idx] || null, [sponsors, idx]);

  // Conta impressão quando aparece
  useEffect(() => {
    if (!current) return;
    supabase.rpc("track_sponsor_event", {
      _sponsor_id: current.id,
      _event: "impression",
    });
  }, [current?.id]);

  if (!current) return null;

  const handleClick = () => {
    supabase.rpc("track_sponsor_event", {
      _sponsor_id: current.id,
      _event: "click",
    });
    window.open(current.target_url, "_blank", "noopener,noreferrer");
  };

  if (placement === "overlay") {
    return (
      <button
        onClick={handleClick}
        className={`absolute top-3 right-3 z-20 flex items-center gap-2 bg-black/70 backdrop-blur-md border border-white/20 rounded-lg px-3 py-2 text-white text-xs font-bold hover:bg-black/90 transition-all shadow-lg ${className}`}
        title={`Patrocinado por ${current.name}`}
      >
        {current.logo_url ? (
          <img src={current.logo_url} alt={current.name} className="h-5 w-auto max-w-[60px] object-contain" />
        ) : (
          <Megaphone className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">{current.name}</span>
        <ExternalLink className="w-3 h-3 opacity-60" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`group w-full flex items-center gap-3 bg-gradient-to-r from-accent/15 via-primary/10 to-accent/15 border border-accent/30 rounded-xl px-4 py-3 hover:border-accent/60 transition-all ${className}`}
    >
      <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-accent shrink-0">
        Patrocínio
      </span>
      <div className="flex-1 flex items-center gap-3 min-w-0">
        {current.logo_url && (
          <img
            src={current.logo_url}
            alt={current.name}
            className="h-8 w-auto max-w-[120px] object-contain shrink-0"
          />
        )}
        <span className="text-sm font-bold text-foreground truncate">{current.name}</span>
      </div>
      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
    </button>
  );
};

export default SponsorBanner;
