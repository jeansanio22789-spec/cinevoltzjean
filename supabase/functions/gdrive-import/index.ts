// Importa um arquivo do Google Drive como filme no catálogo.
// Marca o arquivo como público (anyone with link can view) pra que o iframe do Drive funcione.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GDRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    if (!GDRIVE_KEY) throw new Error("GOOGLE_DRIVE_API_KEY ausente");
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase ausente");

    const auth = req.headers.get("authorization");
    if (!auth) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: corsHeaders });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "invalid auth" }), { status: 401, headers: corsHeaders });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "not admin" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const fileId = String(body.fileId || "").trim();
    if (!fileId) throw new Error("fileId obrigatório");

    const title = String(body.title || "").trim() || null;
    const description = String(body.description || "").trim() || "";
    const genre = String(body.genre || "Ação").trim();
    const customThumbnail = String(body.thumbnailUrl || "").trim() || null;

    // 1. Pega metadados
    const metaResp = await fetch(
      `${GATEWAY_URL}/files/${fileId}?fields=id,name,mimeType,size,thumbnailLink,videoMediaMetadata`,
      {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GDRIVE_KEY,
        },
      },
    );
    const meta = await metaResp.json();
    if (!metaResp.ok) throw new Error(`Drive meta: ${JSON.stringify(meta)}`);

    // 2. Marca arquivo como público (anyone with link)
    try {
      await fetch(`${GATEWAY_URL}/files/${fileId}/permissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GDRIVE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });
    } catch (_) { /* ignora se já público */ }

    // 3. Monta dados do filme
    const videoUrl = `https://drive.google.com/file/d/${fileId}/view`;
    const finalTitle = title || meta.name?.replace(/\.(mp4|mkv|webm|mov|avi)$/i, "") || `Filme ${fileId}`;

    let durationStr = "";
    const durMs = meta.videoMediaMetadata?.durationMillis;
    if (durMs) {
      const sec = Math.floor(Number(durMs) / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      durationStr = `${m}min`;
      if (s > 0) durationStr += ` ${s}s`;
    }

    const { data: movie, error: movErr } = await supabase
      .from("movies")
      .insert({
        title: finalTitle.slice(0, 200),
        description,
        genre,
        video_url: videoUrl,
        thumbnail_url: customThumbnail || meta.thumbnailLink || null,
        duration: durationStr,
        status: "published",
        year: new Date().getFullYear(),
      })
      .select("id, title")
      .single();

    if (movErr) throw new Error(`Insert: ${movErr.message}`);

    return new Response(JSON.stringify({ ok: true, movie }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
