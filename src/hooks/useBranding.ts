import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Branding {
  name: string;
  logoUrl: string;
  primaryHsl: string;
  accentHsl: string;
}

const defaults: Branding = {
  name: "Streamflix",
  logoUrl: "",
  primaryHsl: "",
  accentHsl: "",
};

let cache: Branding | null = null;

export const useBranding = () => {
  const [brand, setBrand] = useState<Branding>(cache || defaults);

  useEffect(() => {
    if (cache) return;
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["brand_name", "brand_logo_url", "brand_primary_hsl", "brand_accent_hsl"]);
      const map = new Map(((data as any[]) || []).map((r) => [r.key, r.value]));
      const next: Branding = {
        name: map.get("brand_name") || defaults.name,
        logoUrl: map.get("brand_logo_url") || "",
        primaryHsl: map.get("brand_primary_hsl") || "",
        accentHsl: map.get("brand_accent_hsl") || "",
      };
      cache = next;
      setBrand(next);
      if (next.primaryHsl) document.documentElement.style.setProperty("--primary", next.primaryHsl);
      if (next.accentHsl) document.documentElement.style.setProperty("--accent", next.accentHsl);
    };
    load();
  }, []);

  return brand;
};
