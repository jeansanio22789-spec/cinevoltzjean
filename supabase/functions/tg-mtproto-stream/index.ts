// Edge function: proxia stream MTProto com Range requests, retry e cache
// Otimizado pra vídeos grandes (2-3GB) sem estourar timeout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { TelegramClient, Api } from "https://deno.land/x/grm@0.8.2/mod.ts";
import { StringSession } from "https://deno.land/x/grm@0.8.2/sessions/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers":
    "content-length, content-range, accept-ranges, content-type",
};

// Cache de cliente MTProto reaproveitado entre requests no mesmo isolate
let cachedClient: TelegramClient | null = null;
let cachedSession = "";

async function getClient(stringSession: string, apiId: number, apiHash: string) {
  if (cachedClient && cachedSession === stringSession) {
    try {
      // ping pra ver se ainda tá vivo
      if (!cachedClient.connected) await cachedClient.connect();
      return cachedClient;
    } catch {
      cachedClient = null;
    }
  }
  const client = new TelegramClient(
    new StringSession(stringSession),
    apiId,
    apiHash,
    { connectionRetries: 5, retryDelay: 1000, timeout: 15 },
  );
  await client.connect();
  cachedClient = client;
  cachedSession = stringSession;
  return client;
}

// Cache de metadados de mídia (size, mimeType, document) por URL
const mediaCache = new Map<string, { size: number; mimeType: string; document: any; ts: number }>();
const META_TTL = 5 * 60 * 1000; // 5 min

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
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // reseta cliente em caso de erro de conexão
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

    const client = await getClient(sess.string_session, apiId, apiHash);

    // Resolve metadados (com cache)
    let meta = mediaCache.get(tgUrl);
    if (!meta || Date.now() - meta.ts > META_TTL) {
      meta = await withRetry(async () => {
        let entity: any;
        if (parsed.username) {
          entity = await client.getEntity(parsed.username);
        } else {
          entity = await client.getEntity(BigInt(`-100${parsed.channelId}`));
        }
        const messages = await client.getMessages(entity, { ids: [parsed.messageId] });
        const msg = messages[0];
        if (!msg || !msg.media) throw new Error("Mídia não encontrada");
        const document: any = (msg.media as any).document;
        if (!document) throw new Error("Mensagem não é vídeo");
        return {
          size: Number(document.size),
          mimeType: document.mimeType || "video/mp4",
          document,
          ts: Date.now(),
        };
      });
      mediaCache.set(tgUrl, meta);
    }

    const { size: fileSize, mimeType, document } = meta;

    // HEAD request: só metadados, sem corpo
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

    // Range parsing
    const rangeHeader = req.headers.get("range") || req.headers.get("Range");
    let start = 0;
    let end = fileSize - 1;
    let isPartial = false;

    // Chunk grande (8MB) — equilíbrio entre throughput e timeout
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

    // Garante que start está alinhado em 4KB (requisito MTProto)
    const alignedStart = Math.floor(start / 4096) * 4096;
    const skip = start - alignedStart;
    const length = end - start + 1;

    // Stream chunks MTProto (1MB cada) com retry
    const CHUNK_LIMIT = 1024 * 1024;
    const chunks: Uint8Array[] = [];
    let offset = alignedStart;
    let collected = 0;
    const targetLen = length + skip;

    while (collected < targetLen) {
      const remaining = targetLen - collected;
      const limit = Math.min(CHUNK_LIMIT, Math.ceil(remaining / 4096) * 4096);

      const result: any = await withRetry(() =>
        client.invoke(
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
        ),
      );

      const bytes: Uint8Array = result.bytes;
      if (!bytes || bytes.length === 0) break;
      chunks.push(bytes);
      offset += bytes.length;
      collected += bytes.length;
    }

    // Junta chunks e remove o "skip" inicial
    const totalLen = chunks.reduce((a, c) => a + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) {
      merged.set(c, pos);
      pos += c.length;
    }
    const body = merged.subarray(skip, skip + length);

    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": mimeType,
      "Content-Length": String(body.length),
      "Accept-Ranges": "bytes",
      // Cache CDN por 1h — mesmo range pedido de novo vem do cache
      "Cache-Control": "public, max-age=3600, immutable",
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
