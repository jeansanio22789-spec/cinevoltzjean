// Edge function: telegram-poll
// Roda a cada minuto via pg_cron. Faz long-polling no getUpdates do Telegram,
// processa vídeos enviados pro bot e cria filmes automaticamente no catálogo.
// Usa caption como título (primeira linha) e descrição (resto).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

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
    throw new Error(
      `Telegram ${method}: ${json.description || JSON.stringify(json)}`,
    );
  }
  return { result: json.result, status: res.status };
};

interface TgMedia {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  mime_type?: string;
  duration?: number;
  thumbnail?: { file_id: string };
}

const extractVideo = (msg: any): TgMedia | null => {
  if (msg.video) return msg.video;
  if (msg.animation) return msg.animation;
  if (msg.document?.mime_type?.startsWith("video/")) return msg.document;
  return null;
};

const extractPhoto = (msg: any): { file_id: string } | null => {
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    return msg.photo[msg.photo.length - 1];
  }
  return null;
};

// Detecta URL de vídeo na legenda/texto. Aceita .mp4, .m3u8, .mkv, .webm, .mov,
// e também links genéricos http(s) (drive, dropbox, etc — confia no usuário).
const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;
const extractVideoUrl = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const matches = text.match(URL_REGEX);
  if (!matches) return null;
  // Prioriza URLs com extensão de vídeo conhecida
  const videoExt = matches.find((u) =>
    /\.(mp4|m3u8|mkv|webm|mov|avi|ts)(\?|#|$)/i.test(u)
  );
  return videoExt || matches[0];
};

const TELEGRAM_DOWNLOAD_LIMIT = 20 * 1024 * 1024; // 20 MB

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const log: string[] = [];

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY ausente");
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase ausente");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Lê offset atual
    const { data: state, error: stateErr } = await supabase
      .from("telegram_bot_state")
      .select("update_offset")
      .eq("id", 1)
      .maybeSingle();

    if (stateErr) throw new Error(`State: ${stateErr.message}`);
    let currentOffset: number = state?.update_offset ?? 0;
    let totalProcessed = 0;
    let totalMovies = 0;

    // 2. Loop de polling
    while (true) {
      const elapsed = Date.now() - startTime;
      const remainingMs = MAX_RUNTIME_MS - elapsed;
      if (remainingMs < MIN_REMAINING_MS) break;
      const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
      if (timeout < 1) break;

      const { result: updates } = await tg(
        "getUpdates",
        {
          offset: currentOffset,
          timeout,
          allowed_updates: ["message", "channel_post"],
        },
        LOVABLE_API_KEY,
        TELEGRAM_API_KEY,
      );

      if (!Array.isArray(updates) || updates.length === 0) continue;

      for (const update of updates) {
        const msg = update.message || update.channel_post;
        if (!msg) continue;

        const video = extractVideo(msg);

        // Salva mensagem no audit trail
        const baseRow = {
          update_id: update.update_id,
          chat_id: msg.chat.id,
          message_id: msg.message_id,
          text: msg.text ?? null,
          caption: msg.caption ?? null,
          file_id: video?.file_id ?? null,
          file_unique_id: video?.file_unique_id ?? null,
          mime_type: video?.mime_type ?? null,
          duration: video?.duration ?? null,
          file_size: video?.file_size ?? null,
          thumb_file_id: video?.thumbnail?.file_id ?? null,
          raw_update: update,
          processing_status: video ? "processing" : "ignored",
        };

        await supabase
          .from("telegram_messages")
          .upsert(baseRow, { onConflict: "update_id" });

        totalProcessed++;

        if (!video) continue;

        // Processa vídeo: baixa do Telegram, sobe pro bucket, cria filme
        try {
          // a) getFile pro vídeo
          const { result: fileInfo } = await tg(
            "getFile",
            { file_id: video.file_id },
            LOVABLE_API_KEY,
            TELEGRAM_API_KEY,
          );

          const dl = await fetch(`${GATEWAY_URL}/file/${fileInfo.file_path}`, {
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": TELEGRAM_API_KEY,
            },
          });
          if (!dl.ok) throw new Error(`Download vídeo [${dl.status}]`);
          const videoBytes = new Uint8Array(await dl.arrayBuffer());
          const ext = (fileInfo.file_path.split(".").pop() || "mp4")
            .toLowerCase();
          const videoPath = `telegram/${Date.now()}-${crypto.randomUUID()}.${ext}`;

          const { error: vUpErr } = await supabase.storage
            .from("videos")
            .upload(videoPath, videoBytes, {
              contentType: video.mime_type || "video/mp4",
              upsert: false,
            });
          if (vUpErr) throw new Error(`Upload vídeo: ${vUpErr.message}`);

          const { data: vPub } = supabase.storage
            .from("videos")
            .getPublicUrl(videoPath);

          // b) Thumbnail: usa thumb do vídeo OU foto enviada na mesma msg
          let thumbnailUrl: string | null = null;
          const photo = extractPhoto(msg);
          const thumbSource = photo?.file_id || video.thumbnail?.file_id;

          if (thumbSource) {
            try {
              const { result: thumbInfo } = await tg(
                "getFile",
                { file_id: thumbSource },
                LOVABLE_API_KEY,
                TELEGRAM_API_KEY,
              );
              const tdl = await fetch(
                `${GATEWAY_URL}/file/${thumbInfo.file_path}`,
                {
                  headers: {
                    Authorization: `Bearer ${LOVABLE_API_KEY}`,
                    "X-Connection-Api-Key": TELEGRAM_API_KEY,
                  },
                },
              );
              if (tdl.ok) {
                const tBytes = new Uint8Array(await tdl.arrayBuffer());
                const tExt = (thumbInfo.file_path.split(".").pop() || "jpg")
                  .toLowerCase();
                const tPath = `telegram/${Date.now()}-${crypto.randomUUID()}.${tExt}`;
                const { error: tUpErr } = await supabase.storage
                  .from("thumbnails")
                  .upload(tPath, tBytes, {
                    contentType: tExt === "png" ? "image/png" : "image/jpeg",
                    upsert: false,
                  });
                if (!tUpErr) {
                  const { data: tPub } = supabase.storage
                    .from("thumbnails")
                    .getPublicUrl(tPath);
                  thumbnailUrl = tPub.publicUrl;
                }
              }
            } catch (e) {
              log.push(`thumb falhou: ${(e as Error).message}`);
            }
          }

          // c) Parse caption: 1ª linha = título, resto = descrição
          const caption = (msg.caption || "").trim();
          const lines = caption.split(/\r?\n/);
          const title = (lines[0] || `Vídeo Telegram ${update.update_id}`)
            .trim()
            .slice(0, 200);
          const description = lines.slice(1).join("\n").trim();

          // Formata duração mm:ss
          let durationStr = "";
          if (video.duration && video.duration > 0) {
            const m = Math.floor(video.duration / 60);
            const s = video.duration % 60;
            durationStr = `${m}min`;
            if (s > 0) durationStr += ` ${s}s`;
          }

          // d) Cria filme publicado
          const { data: movie, error: movieErr } = await supabase
            .from("movies")
            .insert({
              title,
              description,
              video_url: vPub.publicUrl,
              thumbnail_url: thumbnailUrl,
              duration: durationStr,
              status: "published",
              year: new Date().getFullYear(),
            })
            .select("id")
            .single();

          if (movieErr) throw new Error(`Filme: ${movieErr.message}`);

          await supabase
            .from("telegram_messages")
            .update({
              processing_status: "done",
              processed_at: new Date().toISOString(),
              movie_id: movie.id,
            })
            .eq("update_id", update.update_id);

          totalMovies++;

          // e) Notifica de volta no chat
          try {
            await tg(
              "sendMessage",
              {
                chat_id: msg.chat.id,
                reply_to_message_id: msg.message_id,
                text: `✅ Adicionado ao catálogo: ${title}`,
              },
              LOVABLE_API_KEY,
              TELEGRAM_API_KEY,
            );
          } catch (_) {
            // ignora falha de notificação
          }
        } catch (procErr) {
          const errMsg = (procErr as Error).message;
          console.error(`[update ${update.update_id}]`, errMsg);
          log.push(`update ${update.update_id}: ${errMsg}`);
          await supabase
            .from("telegram_messages")
            .update({
              processing_status: "error",
              processing_error: errMsg,
              processed_at: new Date().toISOString(),
            })
            .eq("update_id", update.update_id);

          // Tenta avisar no chat
          try {
            await tg(
              "sendMessage",
              {
                chat_id: msg.chat.id,
                reply_to_message_id: msg.message_id,
                text: `❌ Erro ao processar: ${errMsg.slice(0, 200)}`,
              },
              LOVABLE_API_KEY,
              TELEGRAM_API_KEY,
            );
          } catch (_) {
            // ignora
          }
        }
      }

      // Avança offset apenas após processamento bem-sucedido
      const maxId = Math.max(...updates.map((u: any) => u.update_id));
      const newOffset = maxId + 1;
      await supabase
        .from("telegram_bot_state")
        .update({
          update_offset: newOffset,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
      currentOffset = newOffset;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: totalProcessed,
        movies_created: totalMovies,
        offset: currentOffset,
        log,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[telegram-poll]", msg);
    return new Response(JSON.stringify({ error: msg, log }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
