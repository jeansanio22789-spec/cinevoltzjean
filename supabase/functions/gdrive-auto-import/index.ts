// Detecta vídeos + imagens (capas) no Google Drive e cria automaticamente como filmes publicados.
// Capas e vídeos são pareados pelo nome base (sem extensão). Imagem com mesmo nome do vídeo vira a capa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

const baseName = (n: string) =>
  n.replace(/\.[^.]+$/, "").trim().toLowerCase().replace(/\s+/g, " ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GDRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !GDRIVE_KEY || !SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Variáveis de ambiente ausentes");
    }

    const auth = req.headers.get("authorization");
    if (!auth) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: corsHeaders });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "invalid auth" }), { status: 401, headers: corsHeaders });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "not admin" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    let folderId = String(body.folderId || "").trim();
    const genre = String(body.genre || "Estreias").trim();
    const m = folderId.match(/\/folders\/([\w-]+)/);
    if (m) folderId = m[1];

    // 1. Lista vídeos E imagens (juntos) – tudo da pasta informada
    const mimeFilter = "(mimeType contains 'video/' or mimeType contains 'image/')";
    const qParts = [mimeFilter, "trashed = false"];
    if (folderId) qParts.push(`'${folderId.replace(/'/g, "\\'")}' in parents`);
    const params = new URLSearchParams({
      q: qParts.join(" and "),
      fields: "files(id,name,mimeType,size,thumbnailLink,videoMediaMetadata,createdTime)",
      pageSize: "1000",
      orderBy: "createdTime desc",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    const listResp = await fetch(`${GATEWAY_URL}/files?${params}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GDRIVE_KEY,
      },
    });
    const listData = await listResp.json();
    if (!listResp.ok) throw new Error(`Drive list: ${JSON.stringify(listData)}`);
    const all: any[] = listData.files || [];

    const videos = all.filter((f) => String(f.mimeType || "").startsWith("video/"));
    const images = all.filter((f) => String(f.mimeType || "").startsWith("image/"));

    // Indexa imagens por nome base
    const coverByName = new Map<string, any>();
    for (const img of images) coverByName.set(baseName(img.name || ""), img);

    if (videos.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0, imported: 0, items: [], covers: images.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Filmes existentes (dedup por fileId no video_url)
    const { data: existing } = await supabase.from("movies").select("id, video_url");
    const existingIds = new Set<string>();
    (existing || []).forEach((mv: any) => {
      const match = String(mv.video_url || "").match(/\/file\/d\/([\w-]+)/);
      if (match) existingIds.add(match[1]);
    });

    const created: any[] = [];
    for (const file of videos) {
      if (existingIds.has(file.id)) continue;

      const nameKey = baseName(file.name || "");
      const cover = coverByName.get(nameKey);

      // Marca vídeo como público
      try {
        await fetch(`${GATEWAY_URL}/files/${file.id}/permissions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GDRIVE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "reader", type: "anyone" }),
        });
      } catch (_) { /* ignora */ }

      // Capa custom: deixa pública e usa link direto
      let thumbUrl: string | null = file.thumbnailLink || null;
      if (cover) {
        try {
          await fetch(`${GATEWAY_URL}/files/${cover.id}/permissions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": GDRIVE_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ role: "reader", type: "anyone" }),
          });
        } catch (_) { /* ignora */ }
        // URL pública direta da imagem no Drive
        thumbUrl = `https://drive.google.com/thumbnail?id=${cover.id}&sz=w800`;
      }

      const finalTitle = (file.name || `Filme ${file.id}`)
        .replace(/\.(mp4|mkv|webm|mov|avi)$/i, "")
        .slice(0, 200);
      const videoUrl = `https://drive.google.com/file/d/${file.id}/view`;

      let durationStr = "";
      const durMs = file.videoMediaMetadata?.durationMillis;
      if (durMs) {
        const sec = Math.floor(Number(durMs) / 1000);
        const mn = Math.floor(sec / 60);
        durationStr = `${mn}min`;
      }

      const { data: movie, error } = await supabase
        .from("movies")
        .insert({
          title: finalTitle,
          description: "",
          genre,
          video_url: videoUrl,
          thumbnail_url: thumbUrl,
          duration: durationStr,
          status: "published",
          year: new Date().getFullYear(),
        })
        .select("id, title, thumbnail_url")
        .single();

      if (!error && movie) created.push({ ...movie, has_custom_cover: !!cover });
    }

    return new Response(JSON.stringify({
      ok: true,
      scanned: videos.length,
      covers_found: images.length,
      imported: created.length,
      items: created,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
