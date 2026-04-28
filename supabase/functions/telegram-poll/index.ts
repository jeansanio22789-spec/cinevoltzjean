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

// Não há mais limite de tamanho: o vídeo NÃO é baixado nem copiado pro bucket.
// Apenas o file_id é salvo, e o stream é feito sob demanda pela função telegram-stream.
const TELEGRAM_DOWNLOAD_LIMIT = Number.MAX_SAFE_INTEGER;

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
    const STORAGE_CHAT_ID = Deno.env.get("TELEGRAM_STORAGE_CHAT_ID");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY ausente");
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase ausente");

    // Aceita "-1002261842036" ou "@meucanal". Se vazio, processa tudo (legado).
    const allowedChatId = STORAGE_CHAT_ID?.trim() || null;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 0. Garante que NÃO existe webhook ativo (webhook bloqueia getUpdates)
    try {
      await tg(
        "deleteWebhook",
        { drop_pending_updates: false },
        LOVABLE_API_KEY,
        TELEGRAM_API_KEY,
      );
    } catch (e) {
      log.push(`deleteWebhook: ${(e as Error).message}`);
    }

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
      // Gateway costuma cortar requests longos, mantém timeout curto
      const timeout = Math.min(20, Math.max(1, Math.floor(remainingMs / 1000) - 5));
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

        // Filtra apenas o canal configurado como nuvem de armazenamento
        if (allowedChatId) {
          const chatIdStr = String(msg.chat.id);
          const chatUsername = msg.chat.username ? `@${msg.chat.username}` : null;
          const matches = chatIdStr === allowedChatId ||
            chatUsername === allowedChatId;
          if (!matches) {
            log.push(`ignorado chat ${chatIdStr} (esperado ${allowedChatId})`);
            continue;
          }
        }

        const video = extractVideo(msg);
        const photo = extractPhoto(msg);
        const captionOrText = (msg.caption ?? msg.text ?? "").trim();
        const externalUrl = extractVideoUrl(captionOrText);

        // Bloqueia links internos do Telegram (t.me/c/... ou t.me/+...) — não são streamáveis
        const isTelegramInternal = externalUrl &&
          /^https?:\/\/t\.me\//i.test(externalUrl);

        const hasContent = !!(video || (externalUrl && !isTelegramInternal));
        const tooBig =
          !!video && !externalUrl &&
          (video.file_size ?? 0) > TELEGRAM_DOWNLOAD_LIMIT;

        let initialStatus = "ignored";
        if (externalUrl) initialStatus = "processing";
        else if (video && !tooBig) initialStatus = "processing";
        else if (tooBig) initialStatus = "error";

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
          processing_status: initialStatus,
          processing_error: tooBig
            ? `Vídeo excede 20 MB (${Math.round((video!.file_size ?? 0) / 1024 / 1024)} MB). Cole o link direto na legenda.`
            : null,
        };

        await supabase
          .from("telegram_messages")
          .upsert(baseRow, { onConflict: "update_id" });

        totalProcessed++;

        if (tooBig) {
          try {
            await tg(
              "sendMessage",
              {
                chat_id: msg.chat.id,
                reply_to_message_id: msg.message_id,
                text:
                  `⚠️ Vídeo muito grande (${Math.round((video!.file_size ?? 0) / 1024 / 1024)} MB). ` +
                  `O Telegram só permite baixar até 20 MB pelo bot.\n\n` +
                  `📝 Para vídeos maiores, hospede em Drive/Bunny/R2 e mande:\n` +
                  `Título do filme\nDescrição\nhttps://link-direto-do-video.mp4\n\n` +
                  `Pode mandar a CAPA junto na mesma mensagem.`,
              },
              LOVABLE_API_KEY,
              TELEGRAM_API_KEY,
            );
          } catch (_) { /* ignora */ }
          continue;
        }

        // Avisa que link interno do Telegram não funciona
        if (isTelegramInternal) {
          try {
            await tg(
              "sendMessage",
              {
                chat_id: msg.chat.id,
                reply_to_message_id: msg.message_id,
                text:
                  `⚠️ Link do Telegram (t.me/...) não funciona como vídeo.\n\n` +
                  `Esse link só abre o app do Telegram, não toca como filme.\n\n` +
                  `📝 Use um link DIRETO do arquivo, terminando em .mp4 / .m3u8 / .mkv:\n` +
                  `• Bunny.net Storage\n` +
                  `• Cloudflare R2 (público)\n` +
                  `• Google Drive: \`https://drive.google.com/uc?export=download&id=ID_DO_ARQUIVO\`\n\n` +
                  `Mande assim:\n` +
                  `Título do filme\nDescrição\nhttps://meusite.com/filme.mp4`,
              },
              LOVABLE_API_KEY,
              TELEGRAM_API_KEY,
            );
          } catch (_) { /* ignora */ }
          continue;
        }

        // 📸 Foto solta (sem vídeo nem URL): tenta enviar pro Drive na pasta configurada
        if (!hasContent && photo) {
          try {
            const { data: setting } = await supabase
              .from("platform_settings")
              .select("value")
              .eq("key", "telegram_image_drive_folder")
              .maybeSingle();
            const driveFolder = setting?.value?.trim();
            const GDRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");

            if (!driveFolder || !GDRIVE_KEY) {
              await supabase.from("telegram_messages").update({
                processing_status: "ignored",
                processing_error: !driveFolder
                  ? "Pasta Drive não configurada"
                  : "Google Drive não conectado",
                processed_at: new Date().toISOString(),
              }).eq("update_id", update.update_id);
              continue;
            }

            // Extrai folderId de URL ou usa direto
            const folderMatch = driveFolder.match(/\/folders\/([\w-]+)/);
            const folderId = folderMatch ? folderMatch[1] : driveFolder;

            // Baixa a foto do Telegram
            const { result: photoInfo } = await tg(
              "getFile",
              { file_id: photo.file_id },
              LOVABLE_API_KEY,
              TELEGRAM_API_KEY,
            );
            const pdl = await fetch(`${GATEWAY_URL}/file/${photoInfo.file_path}`, {
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "X-Connection-Api-Key": TELEGRAM_API_KEY,
              },
            });
            if (!pdl.ok) throw new Error(`download foto falhou ${pdl.status}`);
            const photoBytes = new Uint8Array(await pdl.arrayBuffer());
            const ext = (photoInfo.file_path.split(".").pop() || "jpg").toLowerCase();
            const mime = ext === "png" ? "image/png" : "image/jpeg";

            // Nome do arquivo: caption (se houver) ou timestamp
            const safeName = (captionOrText || `tg-${update.update_id}`)
              .split(/\r?\n/)[0]
              .replace(/[^\w\s-]/g, "")
              .trim()
              .slice(0, 80) || `tg-${update.update_id}`;
            const fileName = `${safeName}.${ext}`;

            // Multipart upload pro Drive via gateway
            const boundary = `----lovable-${crypto.randomUUID()}`;
            const metadata = JSON.stringify({
              name: fileName,
              parents: [folderId],
            });
            const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
            const tail = `\r\n--${boundary}--`;
            const headBytes = new TextEncoder().encode(head);
            const tailBytes = new TextEncoder().encode(tail);
            const body = new Uint8Array(headBytes.length + photoBytes.length + tailBytes.length);
            body.set(headBytes, 0);
            body.set(photoBytes, headBytes.length);
            body.set(tailBytes, headBytes.length + photoBytes.length);

            const upResp = await fetch(
              `https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "X-Connection-Api-Key": GDRIVE_KEY,
                  "Content-Type": `multipart/related; boundary=${boundary}`,
                },
                body,
              },
            );
            const upData = await upResp.json();
            if (!upResp.ok) throw new Error(`Drive upload: ${JSON.stringify(upData)}`);

            await supabase.from("telegram_messages").update({
              processing_status: "done",
              processing_error: `Imagem salva no Drive: ${fileName}`,
              processed_at: new Date().toISOString(),
            }).eq("update_id", update.update_id);

            try {
              await tg("sendMessage", {
                chat_id: msg.chat.id,
                reply_to_message_id: msg.message_id,
                text: `📸 Imagem salva no Drive: ${fileName}`,
              }, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } catch (_) { /* ignora */ }
          } catch (imgErr) {
            const em = (imgErr as Error).message;
            log.push(`foto-drive ${update.update_id}: ${em}`);
            await supabase.from("telegram_messages").update({
              processing_status: "error",
              processing_error: em,
              processed_at: new Date().toISOString(),
            }).eq("update_id", update.update_id);
          }
          continue;
        }

        if (!hasContent) continue;

        try {
          let videoUrl: string;

          if (externalUrl) {
            videoUrl = externalUrl;
          } else {
            // ✅ Storage do Telegram: NÃO baixa, NÃO copia pro bucket.
            // Salva apenas o file_id como "tg://<file_id>". O player resolve via
            // edge function `telegram-stream` em tempo real (CDN do Telegram).
            videoUrl = `tg://${video!.file_id}`;
          }

          let thumbnailUrl: string | null = null;
          const thumbSource = photo?.file_id || video?.thumbnail?.file_id;

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

          const lines = captionOrText.split(/\r?\n/);
          const title = (lines[0] || `Vídeo Telegram ${update.update_id}`)
            .trim()
            .replace(URL_REGEX, "")
            .trim()
            .slice(0, 200);
          const description = lines
            .slice(1)
            .join("\n")
            .replace(URL_REGEX, "")
            .trim();

          let durationStr = "";
          if (video?.duration && video.duration > 0) {
            const m = Math.floor(video.duration / 60);
            const s = video.duration % 60;
            durationStr = `${m}min`;
            if (s > 0) durationStr += ` ${s}s`;
          }

          const { data: movie, error: movieErr } = await supabase
            .from("movies")
            .insert({
              title: title || `Vídeo Telegram ${update.update_id}`,
              description,
              video_url: videoUrl,
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

          try {
            await tg(
              "sendMessage",
              {
                chat_id: msg.chat.id,
                reply_to_message_id: msg.message_id,
                text: `✅ Adicionado ao catálogo: ${title}${
                  externalUrl ? "\n🔗 Usando link externo" : ""
                }`,
              },
              LOVABLE_API_KEY,
              TELEGRAM_API_KEY,
            );
          } catch (_) { /* ignora */ }
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
          } catch (_) { /* ignora */ }
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
