// Edge function: streaming MTProto com Range requests, retry e cache CDN
// Otimizado pra vídeos grandes (2-3GB) sem estourar timeout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BaseTelegramClient } from "npm:@mtcute/core@0.29.6";
import { MemoryStorage } from "npm:@mtcute/core@0.29.6/storage/memory.js";
import { resolvePeer, getMessages, downloadAsBuffer } from "npm:@mtcute/core@0.29.6/methods.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers":
    "content-length, content-range, accept-ranges, content-type",
};

// Cache de cliente MTProto entre requests no mesmo isolate
let cachedClient: BaseTelegramClient | null = null;
let cachedSession = "";

async function getClient(stringSession: string, apiId: number, apiHash: string) {
  if (cachedClient && cachedSession === stringSession) {
    return cachedClient;
  }
  const storage = new MemoryStorage();
  const client = new BaseTelegramClient({ apiId, apiHash, storage });
  await client.importSession(stringSession);
  await client.connect();
  cachedClient = client;
  cachedSession = stringSession;
  return client;
}

// Cache de metadados por URL
const mediaCache = new Map<string, { size: number; mimeType: string; document: any; ts: number }>();
const META_TTL = 5 * 60 * 1000;

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

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        cachedClient = null;
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw lastErr;
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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = parseTelegramUrl(tgUrl);
    if (!parsed) {
      return new Response(JSON.stringify({ error: "URL Telegram inválida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiId = parseInt(Deno.env.get("TELEGRAM_API_ID") || "0");
    const apiHash = Deno.env.get("TELEGRAM_API_HASH") || "";

    const admin = createClient(supabaseUrl, supabaseService);
    const { data: sess } = await admin
      .from("mtproto_sessions").select("string_session").eq("id", 1).maybeSingle();

    if (!sess?.string_session) {
      return new Response(JSON.stringify({ error: "MTProto não configurado" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = await getClient(sess.string_session, apiId, apiHash);

    let meta = mediaCache.get(tgUrl);
    if (!meta || Date.now() - meta.ts > META_TTL) {
      meta = await withRetry(async () => {
        const peer = parsed.username
          ? await resolvePeer(client, parsed.username)
          : await resolvePeer(client, Number(`-100${parsed.channelId}`));
        const messages = await getMessages(client, peer, [parsed.messageId]);
        const msg: any = messages[0];
        if (!msg || !msg.media) throw new Error("Mídia não encontrada");
        const document = msg.media.document || msg.media.video || msg.media;
        if (!document) throw new Error("Mensagem não é vídeo");
        return {
          size: Number(document.fileSize || document.size),
          mimeType: document.mimeType || "video/mp4",
          document: msg.media,
          ts: Date.now(),
        };
      });
      mediaCache.set(tgUrl, meta);
    }

    const { size: fileSize, mimeType, document } = meta;

    if (req.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": mimeType,
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes",
        },
      });
    }

    const rangeHeader = req.headers.get("range") || req.headers.get("Range");
    let start = 0;
    let end = fileSize - 1;
    let isPartial = false;
    const MAX_CHUNK = 8 * 1024 * 1024;

    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        start = parseInt(m[1]);
        end = m[2] ? parseInt(m[2]) : fileSize - 1;
        if (end - start + 1 > MAX_CHUNK) end = start + MAX_CHUNK - 1;
        isPartial = true;
      }
    } else {
      end = Math.min(fileSize - 1, MAX_CHUNK - 1);
      isPartial = true;
    }

    const length = end - start + 1;

    // Download chunk usando downloadAsBuffer com offset/limit
    const buffer: Uint8Array = await withRetry(() =>
      downloadAsBuffer(client, document, { offset: start, limit: length }),
    );

    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600, immutable",
    };

    if (isPartial) {
      headers["Content-Range"] = `bytes ${start}-${start + buffer.length - 1}/${fileSize}`;
      return new Response(buffer, { status: 206, headers });
    }

    return new Response(buffer, { status: 200, headers });
  } catch (err) {
    console.error("stream error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
