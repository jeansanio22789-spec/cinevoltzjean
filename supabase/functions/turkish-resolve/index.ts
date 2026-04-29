// Resolve a URL real do vídeo de um episódio turco, escondendo a origem.
// Acessa o player_url do droidtechmundo, extrai o id, faz POST em gerar_token.php
// e retorna a URL final do MP4 (video.php?token=...).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function resolveVideoUrl(playerUrl: string): Promise<string | null> {
  try {
    const u = new URL(playerUrl);
    const id = u.searchParams.get("p");
    if (!id) return null;
    const base = `${u.protocol}//${u.host}`;

    // POST no gerar_token.php
    const form = new URLSearchParams();
    form.set("id", id);
    form.set("nome", "ep");
    form.set("img", "x");
    form.set("nomecapitulo", "EP");

    const r = await fetch(`${base}/p/gerar_token.php`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": playerUrl,
        "Origin": base,
      },
      body: form.toString(),
      redirect: "follow",
    });
    const html = await r.text();

    // Procura src="video.php?token=..."
    const m = html.match(/src=["']([^"']*video\.php\?token=[^"']+)["']/i);
    if (!m) return null;
    const rel = m[1];
    const videoPhpUrl = rel.startsWith("http") ? rel : `${base}/p/${rel.replace(/^\.?\//, "")}`;

    // video.php (sem referer) faz 302 para o MP4 final no acplay.live
    const r2 = await fetch(videoPhpUrl, {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    const loc = r2.headers.get("location");
    if (loc && /\.mp4(\?|$)/i.test(loc)) {
      return loc.startsWith("http") ? loc : new URL(loc, videoPhpUrl).toString();
    }
    // Fallback: se não houver redirect, devolve o video.php (vai funcionar mas servidor pode bloquear)
    return videoPhpUrl;
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth: precisa estar logado E ter assinatura ativa OU ser admin
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: userData } = await supabase.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica acesso (admin ou assinatura ativa)
    const { data: hasAccess } = await supabase.rpc("has_active_access", { _user_id: userId });
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "no_subscription" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const episodeId: string | undefined = body.episode_id;
    if (!episodeId) {
      return new Response(JSON.stringify({ error: "missing_episode_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca episódio
    const { data: ep } = await supabase
      .from("turkish_episodes")
      .select("id, player_url, resolved_url, resolved_at")
      .eq("id", episodeId)
      .maybeSingle();
    if (!ep) {
      return new Response(JSON.stringify({ error: "episode_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache válido (24h)
    if (ep.resolved_url && ep.resolved_at) {
      const age = Date.now() - new Date(ep.resolved_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return new Response(JSON.stringify({ url: ep.resolved_url, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!ep.player_url) {
      return new Response(JSON.stringify({ error: "no_player_url" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolved = await resolveVideoUrl(ep.player_url);
    if (!resolved) {
      return new Response(JSON.stringify({ error: "resolve_failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("turkish_episodes")
      .update({ resolved_url: resolved, resolved_at: new Date().toISOString() })
      .eq("id", episodeId);

    return new Response(JSON.stringify({ url: resolved, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
