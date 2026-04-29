// Edge function: importa novelas turcas do site cplay2.live
// Faz scraping da listagem paginada e de cada série (capa + episódios + iframes).
// Apenas admins podem invocar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE = "https://cplay2.live";
const LIST_PATH = "/cat/series-turcas/";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const fetchHtml = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return await res.text();
};

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"');

const cleanTitle = (raw: string) =>
  decode(raw)
    .replace(/^Assista\s+/i, "")
    .replace(/\s+(DUBLADO|LEGENDADO)\s+em\s+Portugu[eê]s\s+online\s+Gr[áa]tis\s*$/i, "")
    .replace(/\s+em\s+Portugu[eê]s.*$/i, "")
    .trim();

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
   .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

interface SeriesCard {
  url: string;
  title: string;
  thumbnail: string | null;
  language: string;
}

const parseListing = (html: string): SeriesCard[] => {
  const items: SeriesCard[] = [];
  const articleRe = /<article[^>]*class="([^"]*)"[\s\S]*?<\/article>/g;
  let m: RegExpExecArray | null;
  while ((m = articleRe.exec(html))) {
    const block = m[0];
    const classes = m[1];
    const linkMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*rel="bookmark"[^>]*title="([^"]+)"/);
    if (!linkMatch) continue;
    const url = linkMatch[1];
    const rawTitle = linkMatch[2];
    const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*wp-post-image/);
    const thumb = imgMatch ? imgMatch[1] : null;
    const language = /legendado/i.test(classes) || /LEGENDADO/i.test(rawTitle) ? "Legendado" : "Dublado";
    items.push({ url, title: cleanTitle(rawTitle), thumbnail: thumb, language });
  }
  return items;
};

interface EpisodeData {
  number: number;
  title: string;
  source_url: string | null;
  player_url: string | null;
}

const parseEpisodes = (html: string, seriesUrl: string): { description: string; episodes: EpisodeData[] } => {
  // Extrai descrição: pega o primeiro <p> longo dentro de entry-content
  const contentMatch = html.match(/<div[^>]+class="[^"]*entry-content[^"]*"[\s\S]*?(?=<\/article>|<footer)/);
  const content = contentMatch ? contentMatch[0] : html;

  let description = "";
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(content))) {
    const txt = decode(pm[1].replace(/<[^>]+>/g, "")).trim();
    if (txt.length > 80) { description = txt; break; }
  }

  const episodes: EpisodeData[] = [];
  const seen = new Set<string>();

  // Padrão real do site: <select> com <option value="URL_DO_PLAYER">CAPITULO XX</option>
  // O primeiro option costuma ser placeholder ("ASSISTIR AGORA" com value="#"), pulamos.
  const optRe = /<option[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>/g;
  let om: RegExpExecArray | null;
  while ((om = optRe.exec(html))) {
    const value = om[1].trim();
    const text = decode(om[2]).trim();
    if (!value || value === "#" || !value.startsWith("http")) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    const numMatch = text.match(/(\d{1,4})/);
    const number = numMatch ? parseInt(numMatch[1], 10) : episodes.length + 1;
    episodes.push({
      number,
      title: text.replace(/^[^\w\d]+/, "").trim() || `Capítulo ${number}`,
      source_url: seriesUrl,
      player_url: value, // já é o iframe direto
    });
  }

  // Fallback: iframes embutidos
  if (episodes.length === 0) {
    const iframeRe = /<iframe[^>]+src="([^"]+)"/g;
    let im: RegExpExecArray | null;
    let i = 0;
    while ((im = iframeRe.exec(content))) {
      const src = im[1];
      // ignora iframes de anúncio / redes sociais
      if (/googletag|doubleclick|facebook|twitter|disqus|adsystem/i.test(src)) continue;
      i += 1;
      episodes.push({
        number: i,
        title: `Episódio ${i}`,
        source_url: seriesUrl,
        player_url: src,
      });
    }
  }

  // Ordena por número
  episodes.sort((a, b) => a.number - b.number);
  return { description, episodes };
};

const extractPlayerFromEpisode = async (url: string): Promise<string | null> => {
  try {
    const html = await fetchHtml(url);
    const m = html.match(/<iframe[^>]+src="([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verifica admin
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: userData } = await supabase.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "not_admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const maxPages: number = Math.min(Number(body.maxPages ?? 12), 12);
    const fetchPlayers: boolean = body.fetchPlayers !== false; // default true
    const maxEpisodesPerSeries: number = Number(body.maxEpisodesPerSeries ?? 60);

    let totalSeries = 0;
    let totalEpisodes = 0;
    const errors: string[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const listUrl = page === 1 ? `${BASE}${LIST_PATH}` : `${BASE}${LIST_PATH}page/${page}/`;
      let cards: SeriesCard[] = [];
      try {
        cards = parseListing(await fetchHtml(listUrl));
      } catch (e) {
        errors.push(`page ${page}: ${(e as Error).message}`);
        continue;
      }
      if (!cards.length) break;

      for (const card of cards) {
        try {
          const html = await fetchHtml(card.url);
          const { description, episodes } = parseEpisodes(html, card.url);
          const slug = slugify(card.title) || slugify(card.url);

          // Upsert série
          const { data: serie, error: upErr } = await supabase
            .from("turkish_series")
            .upsert({
              source_url: card.url,
              slug,
              title: card.title,
              description,
              thumbnail_url: card.thumbnail,
              language: card.language,
              genre: "Novela Turca",
              episodes_count: episodes.length,
              sort_order: totalSeries,
            }, { onConflict: "source_url" })
            .select("id")
            .single();
          if (upErr || !serie) { errors.push(`${card.title}: ${upErr?.message}`); continue; }

          totalSeries += 1;

          // player_url já vem direto do <option> da página da série — não precisa buscar mais nada
          const limited = episodes.slice(0, maxEpisodesPerSeries);

          if (limited.length) {
            const rows = limited.map((ep) => ({
              series_id: serie.id,
              episode_number: ep.number,
              title: ep.title.slice(0, 200),
              source_url: ep.source_url,
              player_url: ep.player_url,
            }));
            const { error: epErr } = await supabase
              .from("turkish_episodes")
              .upsert(rows, { onConflict: "series_id,episode_number,title" });
            if (epErr) errors.push(`${card.title} eps: ${epErr.message}`);
            else totalEpisodes += rows.length;
          }
        } catch (e) {
          errors.push(`${card.title}: ${(e as Error).message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      series_imported: totalSeries,
      episodes_imported: totalEpisodes,
      errors: errors.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
