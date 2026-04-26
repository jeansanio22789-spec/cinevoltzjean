// Reprocessa UMA mensagem do Telegram já capturada em telegram_messages.
// Baixa o vídeo + capa do Telegram, sobe pro Storage e cria/atualiza o filme.
// Body: { update_id: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const TELEGRAM_DOWNLOAD_LIMIT = 20 * 1024 * 1024; // 20 MB
const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

const tg = async (
  method: string,
  body: Record<string, unknown>,
  lovableKey: string,
  tgKey: string,
) => {
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": tgKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(`Telegram ${method}: ${json.description || JSON.stringify(json)}`);
  }
  return json.result;
};

const extractVideo = (msg: any) => {
  if (msg?.video) return msg.video;
  if (msg?.animation) return msg.animation;
  if (msg?.document?.mime_type?.startsWith("video/")) return msg.document;
  return null;
};

const extractPhoto = (msg: any) => {
  if (Array.isArray(msg?.photo) && msg.photo.length > 0) {
    return msg.photo[msg.photo.length - 1];
  }
  return null;
};

const extractVideoUrl = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const matches = text.match(URL_REGEX);
  if (!matches) return null;
  const videoExt = matches.find((u) =>
    /\.(mp4|m3u8|mkv|webm|mov|avi|ts)(\?|#|$)/i.test(u),
  );
  return videoExt || matches[0];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Variáveis de ambiente faltando");
    }

    const body = await req.json().catch(() => ({}));
    const updateId = Number(body?.update_id);
    if (!Number.isFinite(updateId)) {
      return new Response(
        JSON.stringify({ ok: false, error: "update_id obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: row, error: rowErr } = await supabase
      .from("telegram_messages")
      .select("update_id, raw_update, movie_id")
      .eq("update_id", updateId)
      .maybeSingle();

    if (rowErr) throw new Error(`Leitura: ${rowErr.message}`);
    if (!row) {
      return new Response(
        JSON.stringify({ ok: false, error: "Mensagem não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase
      .from("telegram_messages")
      .update({ processing_status: "processing", processing_error: null })
      .eq("update_id", updateId);

    const update: any = row.raw_update;
    const msg = update.message ?? update.channel_post;
    if (!msg) throw new Error("raw_update sem mensagem");

    const video = extractVideo(msg);
    const photo = extractPhoto(msg);
    const captionOrText = (msg.caption ?? msg.text ?? "").trim();
    const externalUrl = extractVideoUrl(captionOrText);
    const isTelegramInternal = externalUrl && /^https?:\/\/t\.me\//i.test(externalUrl);

    if (!video && (!externalUrl || isTelegramInternal)) {
      const errMsg = isTelegramInternal
        ? "Link interno do Telegram não funciona como vídeo. Use link direto .mp4/.m3u8."
        : "Mensagem não tem vídeo nem link direto.";
      await supabase
        .from("telegram_messages")
        .update({ processing_status: "error", processing_error: errMsg, processed_at: new Date().toISOString() })
        .eq("update_id", updateId);
      return new Response(
        JSON.stringify({ ok: false, error: errMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Vídeo > 20 MB: não dá para baixar via Bot API. Usamos o link público do Telegram
    // como video_url e seguimos criando/atualizando o filme.
    let useTelegramPublicLink = false;
    if (video && !externalUrl && (video.file_size ?? 0) > TELEGRAM_DOWNLOAD_LIMIT) {
      useTelegramPublicLink = true;
    }

    // 1. Vídeo
    let videoUrl: string;
    if (externalUrl && !isTelegramInternal) {
      videoUrl = externalUrl;
    } else {
      const fileInfo = await tg("getFile", { file_id: video.file_id }, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      const dl = await fetch(`${GATEWAY_URL}/file/${fileInfo.file_path}`, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
        },
      });
      if (!dl.ok) throw new Error(`Download vídeo [${dl.status}]`);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const ext = (fileInfo.file_path.split(".").pop() || "mp4").toLowerCase();
      const path = `telegram/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("videos")
        .upload(path, bytes, { contentType: video.mime_type || "video/mp4", upsert: false });
      if (upErr) throw new Error(`Upload vídeo: ${upErr.message}`);
      videoUrl = supabase.storage.from("videos").getPublicUrl(path).data.publicUrl;
    }

    // 2. Capa
    let thumbnailUrl: string | null = null;
    const thumbSource = photo?.file_id || video?.thumbnail?.file_id;
    if (thumbSource) {
      try {
        const thumbInfo = await tg("getFile", { file_id: thumbSource }, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        const tdl = await fetch(`${GATEWAY_URL}/file/${thumbInfo.file_path}`, {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TELEGRAM_API_KEY,
          },
        });
        if (tdl.ok) {
          const tBytes = new Uint8Array(await tdl.arrayBuffer());
          const tExt = (thumbInfo.file_path.split(".").pop() || "jpg").toLowerCase();
          const tPath = `telegram/${Date.now()}-${crypto.randomUUID()}.${tExt}`;
          const { error: tErr } = await supabase.storage
            .from("thumbnails")
            .upload(tPath, tBytes, {
              contentType: tExt === "png" ? "image/png" : "image/jpeg",
              upsert: false,
            });
          if (!tErr) {
            thumbnailUrl = supabase.storage.from("thumbnails").getPublicUrl(tPath).data.publicUrl;
          }
        }
      } catch (e) {
        console.warn("thumb falhou:", (e as Error).message);
      }
    }

    // 3. Metadados
    const lines = captionOrText.split(/\r?\n/);
    const title = (lines[0] || `Vídeo Telegram ${updateId}`)
      .trim()
      .replace(URL_REGEX, "")
      .trim()
      .slice(0, 200) || `Vídeo Telegram ${updateId}`;
    const description = lines.slice(1).join("\n").replace(URL_REGEX, "").trim();

    let durationStr = "";
    if (video?.duration && video.duration > 0) {
      const m = Math.floor(video.duration / 60);
      const s = video.duration % 60;
      durationStr = `${m}min`;
      if (s > 0) durationStr += ` ${s}s`;
    }

    // 4. Cria ou atualiza filme
    let movieId = row.movie_id;
    if (movieId) {
      const { error: updErr } = await supabase
        .from("movies")
        .update({
          title,
          description,
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl ?? undefined,
          duration: durationStr,
          status: "published",
        })
        .eq("id", movieId);
      if (updErr) throw new Error(`Atualizar filme: ${updErr.message}`);
    } else {
      const { data: movie, error: insErr } = await supabase
        .from("movies")
        .insert({
          title,
          description,
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl,
          duration: durationStr,
          status: "published",
          year: new Date().getFullYear(),
        })
        .select("id")
        .single();
      if (insErr) throw new Error(`Criar filme: ${insErr.message}`);
      movieId = movie.id;
    }

    await supabase
      .from("telegram_messages")
      .update({
        processing_status: "done",
        processed_at: new Date().toISOString(),
        movie_id: movieId,
        processing_error: null,
      })
      .eq("update_id", updateId);

    return new Response(
      JSON.stringify({ ok: true, movie_id: movieId, video_url: videoUrl, thumbnail_url: thumbnailUrl, title }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("reprocess error:", msg);
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const body = await req.clone().json().catch(() => ({}));
      const updateId = Number(body?.update_id);
      if (SUPABASE_URL && SERVICE_KEY && Number.isFinite(updateId)) {
        const sb = createClient(SUPABASE_URL, SERVICE_KEY);
        await sb
          .from("telegram_messages")
          .update({
            processing_status: "error",
            processing_error: msg.slice(0, 500),
            processed_at: new Date().toISOString(),
          })
          .eq("update_id", updateId);
      }
    } catch (_) { /* ignore */ }
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
