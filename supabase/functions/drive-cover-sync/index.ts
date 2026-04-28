// drive-cover-sync
// Monitora uma pasta do Google Drive (config em platform_settings.key='drive_cover_folder').
// Para cada imagem nova: baixa, sobe pro bucket thumbnails e atualiza o filme
// cujo title casa EXATAMENTE com o nome do arquivo (sem extensão).
// Match: case-insensitive, ignora extensão. Sempre sobrescreve a capa.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log: string[] = [];
  let updated = 0;
  let scanned = 0;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GDRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    if (!GDRIVE_KEY) throw new Error("Google Drive não conectado");
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase ausente");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: setting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "drive_cover_folder")
      .maybeSingle();

    const raw = setting?.value?.trim();
    if (!raw) throw new Error("Pasta de capas não configurada");

    const folderMatch = raw.match(/\/folders\/([\w-]+)/);
    const folderId = folderMatch ? folderMatch[1] : raw;

    // Lista imagens da pasta
    const listUrl = `${GATEWAY_BASE}/drive/v3/files?` + new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
      fields: "files(id,name,mimeType,modifiedTime)",
      pageSize: "200",
      orderBy: "modifiedTime desc",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });

    const listResp = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GDRIVE_KEY,
      },
    });
    const listData = await listResp.json();
    if (!listResp.ok) {
      throw new Error(`Drive list ${listResp.status}: ${JSON.stringify(listData)}`);
    }
    const files: any[] = listData.files ?? [];
    scanned = files.length;

    for (const f of files) {
      try {
        // Nome sem extensão
        const dot = f.name.lastIndexOf(".");
        const baseName = (dot > 0 ? f.name.slice(0, dot) : f.name).trim();
        if (!baseName) continue;

        // Procura filme com título casando exatamente (case-insensitive)
        const { data: movie } = await supabase
          .from("movies")
          .select("id, title, thumbnail_url")
          .ilike("title", baseName)
          .maybeSingle();

        if (!movie) {
          log.push(`sem match: ${f.name}`);
          continue;
        }

        // Baixa o arquivo
        const dl = await fetch(
          `${GATEWAY_BASE}/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`,
          {
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": GDRIVE_KEY,
            },
          },
        );
        if (!dl.ok) {
          log.push(`download falhou ${f.name}: ${dl.status}`);
          continue;
        }
        const bytes = new Uint8Array(await dl.arrayBuffer());
        const ext = (dot > 0 ? f.name.slice(dot + 1) : "jpg").toLowerCase();
        const contentType = f.mimeType || (ext === "png" ? "image/png" : "image/jpeg");

        const path = `drive-covers/${movie.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("thumbnails")
          .upload(path, bytes, { contentType, upsert: true });
        if (upErr) {
          log.push(`upload bucket ${f.name}: ${upErr.message}`);
          continue;
        }

        const { data: pub } = supabase.storage
          .from("thumbnails")
          .getPublicUrl(path);

        const { error: updErr } = await supabase
          .from("movies")
          .update({ thumbnail_url: pub.publicUrl })
          .eq("id", movie.id);

        if (updErr) {
          log.push(`update filme ${movie.title}: ${updErr.message}`);
          continue;
        }

        updated++;
        log.push(`✅ ${movie.title} ← ${f.name}`);
      } catch (e) {
        log.push(`erro ${f.name}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, scanned, updated, log }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return new Response(
      JSON.stringify({ ok: false, error: msg, scanned, updated, log }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
