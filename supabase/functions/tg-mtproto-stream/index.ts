// Edge function: proxia o stream de vídeo do Telegram via MTProto
// Suporta Range requests (HTTP 206) pra player tocar sem baixar tudo
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { TelegramClient, Api } from "https://deno.land/x/grm@0.8.2/mod.ts";
import { StringSession } from "https://deno.land/x/grm@0.8.2/sessions/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges",
};

// Parse https://t.me/c/123456/789  ou  https://t.me/canal_publico/789
function parseTelegramUrl(url: string): { username?: string; channelId?: number; messageId: number } | null {
  try {
    const u = new URL(url.replace(/^https?:\/\/telegram\.me\//i, "https://t.me/"));
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "c" && parts.length >= 3) {
      const channelId = parseInt(parts[1]);
      const messageId = parseInt(parts[2]);
      if (channelId && messageId) return { channelId, messageId };
    } else if (parts.length >= 2) {
      const messageId = parseInt(parts[1]);
      if (messageId) return { username: parts[0], messageId };
    }
  } catch {}
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tgUrl = url.searchParams.get("url");
    if (!tgUrl) {
      return new Response(JSON.stringify({ error: "url é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = parseTelegramUrl(tgUrl);
    if (!parsed) {
      return new Response(JSON.stringify({ error: "URL Telegram inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiId = parseInt(Deno.env.get("TELEGRAM_API_ID") || "0");
    const apiHash = Deno.env.get("TELEGRAM_API_HASH") || "";

    const admin = createClient(supabaseUrl, supabaseService);
    const { data: sess } = await admin
      .from("mtproto_sessions")
      .select("string_session")
      .eq("id", 1)
      .maybeSingle();

    if (!sess?.string_session) {
      return new Response(
        JSON.stringify({ error: "MTProto não configurado. Faça login no admin." }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const client = new TelegramClient(
      new StringSession(sess.string_session),
      apiId,
      apiHash,
      { connectionRetries: 2 },
    );
    await client.connect();

    // Resolve a entidade (canal/usuário)
    let entity: any;
    if (parsed.username) {
      entity = await client.getEntity(parsed.username);
    } else {
      // canal privado: precisa do peer com -100 prefix
      entity = await client.getEntity(BigInt(`-100${parsed.channelId}`));
    }

    // Pega a mensagem
    const messages = await client.getMessages(entity, { ids: [parsed.messageId] });
    const msg = messages[0];
    if (!msg || !msg.media) {
      await client.disconnect();
      return new Response(JSON.stringify({ error: "Mídia não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const document: any = (msg.media as any).document;
    if (!document) {
      await client.disconnect();
      return new Response(JSON.stringify({ error: "Mensagem não é vídeo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileSize = Number(document.size);
    const mimeType = document.mimeType || "video/mp4";

    // Range parsing
    const rangeHeader = req.headers.get("range") || req.headers.get("Range");
    let start = 0;
    let end = fileSize - 1;
    let isPartial = false;

    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        start = parseInt(m[1]);
        end = m[2] ? parseInt(m[2]) : fileSize - 1;
        // Limita chunk pra evitar timeout: máx 4MB por request
        const maxChunk = 4 * 1024 * 1024;
        if (end - start + 1 > maxChunk) end = start + maxChunk - 1;
        isPartial = true;
      }
    } else {
      // Sem range: retorna primeiros 4MB
      end = Math.min(fileSize - 1, 4 * 1024 * 1024 - 1);
      isPartial = true;
    }

    const length = end - start + 1;

    // Stream via MTProto - downloadFile com offset/limit
    // limit precisa ser múltiplo de 4096 e <= 1MB por chunk
    const chunks: Uint8Array[] = [];
    const CHUNK_LIMIT = 1024 * 1024; // 1MB chunks MTProto
    let offset = start;
    let remaining = length;

    while (remaining > 0) {
      const limit = Math.min(CHUNK_LIMIT, Math.ceil(remaining / 4096) * 4096);
      const result: any = await client.invoke(
        new Api.upload.GetFile({
          location: new Api.InputDocumentFileLocation({
            id: document.id,
            accessHash: document.accessHash,
            fileReference: document.fileReference,
            thumbSize: "",
          }),
          offset: BigInt(offset),
          limit,
        }),
      );
      const bytes: Uint8Array = result.bytes;
      // Pode ter retornado mais que pediu (alinhado em 4096); cortar
      const usable = bytes.subarray(0, Math.min(bytes.length, remaining));
      chunks.push(usable);
      offset += usable.length;
      remaining -= usable.length;
      if (bytes.length === 0) break;
    }

    await client.disconnect();

    const totalLen = chunks.reduce((a, c) => a + c.length, 0);
    const body = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) {
      body.set(c, pos);
      pos += c.length;
    }

    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": mimeType,
      "Content-Length": String(body.length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    };

    if (isPartial) {
      headers["Content-Range"] = `bytes ${start}-${start + body.length - 1}/${fileSize}`;
      return new Response(body, { status: 206, headers });
    }

    return new Response(body, { status: 200, headers });
  } catch (err) {
    console.error("stream error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
