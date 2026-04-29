// Migra vídeos do Google Drive para o Storage interno do app (bucket "videos").
// Após a migração, o app não depende mais do Drive — você pode apagar lá.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GDRIVE_GATEWAY =
  "https://connector-gateway.lovable.dev/google_drive/drive/v3";

function extractDriveId(url: string): string | null {
  const patterns = [
    /drive\.google\.com\/file\/d\/([\w-]{10,})/,
    /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]{10,})/,
    /drive\.usercontent\.google\.com\/(?:download|uc)\?(?:[^#]*&)?id=([\w-]{10,})/,
    /docs\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]{10,})/,
    /drive\.google\.com\/.*[?&]id=([\w-]{10,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

async function migrateOne(
  supabase: ReturnType<typeof createClient>,
  movieId: string,
  videoUrl: string,
): Promise<{ ok: boolean; movieId: string; reason?: string; newUrl?: string }> {
  const driveId = extractDriveId(videoUrl);
  if (!driveId) return { ok: false, movieId, reason: "not_drive_url" };

  // Baixa o arquivo do Drive via gateway autenticado
  const driveResp = await fetch(
    `${GDRIVE_GATEWAY}/files/${driveId}?alt=media&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "x-lovable-connector-key": Deno.env.get("GOOGLE_DRIVE_API_KEY") ?? "",
      },
    },
  );

  if (!driveResp.ok || !driveResp.body) {
    return {
      ok: false,
      movieId,
      reason: `drive_fetch_failed_${driveResp.status}`,
    };
  }

  const contentType = driveResp.headers.get("content-type") ?? "video/mp4";
  const ext = contentType.includes("webm") ? "webm" : "mp4";
  const path = `migrated/${movieId}-${driveId}.${ext}`;

  // Stream direto pro Storage
  const blob = await driveResp.blob();

  const { error: upErr } = await supabase.storage
    .from("videos")
    .upload(path, blob, { contentType, upsert: true });

  if (upErr) {
    return { ok: false, movieId, reason: `upload_failed:${upErr.message}` };
  }

  const { data: pub } = supabase.storage.from("videos").getPublicUrl(path);
  const newUrl = pub.publicUrl;

  const { error: updErr } = await supabase
    .from("movies")
    .update({ video_url: newUrl })
    .eq("id", movieId);

  if (updErr) {
    return { ok: false, movieId, reason: `db_update_failed:${updErr.message}` };
  }

  return { ok: true, movieId, newUrl };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const onlyId: string | undefined = body?.movieId;

    let query = supabase
      .from("movies")
      .select("id, video_url")
      .or("video_url.ilike.%drive.google.com%,video_url.ilike.%drive.usercontent%");

    if (onlyId) query = supabase.from("movies").select("id, video_url").eq("id", onlyId);

    const { data: movies, error } = await query;
    if (error) throw error;

    const results: any[] = [];
    for (const m of movies ?? []) {
      try {
        const r = await migrateOne(supabase, m.id as string, m.video_url as string);
        results.push(r);
      } catch (e: any) {
        results.push({ ok: false, movieId: m.id, reason: e?.message ?? "error" });
      }
    }

    const success = results.filter((r) => r.ok).length;
    return new Response(
      JSON.stringify({ ok: true, total: results.length, success, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
