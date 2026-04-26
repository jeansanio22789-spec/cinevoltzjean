// Edge function: telegram-fetch
// Recebe um link t.me/c/<channel>/<message> (canal privado) ou t.me/<canal>/<msg>,
// usa forwardMessage pra um chat de armazenamento onde o bot é admin,
// pega o file_id do vídeo, baixa via Bot API e sobe pro bucket "videos".
// Retorna a URL pública pra reproduzir no player.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

interface ParsedLink {
  chatId: string;
  messageId: number;
}

const parseTelegramLink = (raw: string): ParsedLink | null => {
  const input = (raw || "").trim();
  if (!input) return null;

  // Aceita formatos colados sem protocolo: t.me/..., @canal/123, canal/123
  const withProto = /^https?:\/\//i.test(input)
    ? input
    : input.startsWith("t.me/") || input.startsWith("telegram.me/")
      ? `https://${input}`
      : input.startsWith("@")
        ? `https://t.me/${input.slice(1)}`
        : `https://t.me/${input}`;

  try {
    const url = new URL(withProto);
    if (url.hostname !== "t.me" && url.hostname !== "telegram.me") return null;
    // Filtra parâmetros e fragmentos (?single, ?thread=, #...)
    const parts = url.pathname.split("/").filter(Boolean);

    // t.me/c/<channel>/<thread?>/<message>
    if (parts[0] === "c" && parts.length >= 3) {
      const chan = parts[1];
      // Pega o ÚLTIMO segmento numérico como messageId (suporta tópicos)
      const last = parts[parts.length - 1];
      const msg = parseInt(last, 10);
      if (!chan || isNaN(msg)) return null;
      return { chatId: `-100${chan}`, messageId: msg };
    }
    // t.me/<username>/<thread?>/<message>
    if (parts.length >= 2) {
      const username = parts[0];
      const last = parts[parts.length - 1];
      const msg = parseInt(last, 10);
      if (!username || isNaN(msg)) return null;
      return { chatId: `@${username}`, messageId: msg };
    }
    return null;
  } catch {
    return null;
  }
};

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
  return json.result;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    const STORAGE_CHAT_ID = Deno.env.get("TELEGRAM_STORAGE_CHAT_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      throw new Error("Telegram não conectado.");
    }
    if (!STORAGE_CHAT_ID) {
      throw new Error(
        "Configure o secret TELEGRAM_STORAGE_CHAT_ID com o ID de um grupo onde o bot é admin.",
      );
    }
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Backend não configurado");

    const { url } = await req.json();
    if (!url) throw new Error("Parâmetro `url` ausente");

    const parsed = parseTelegramLink(url);
    if (!parsed) {
      throw new Error(
        `Link inválido: "${String(url).slice(0, 120)}". Use https://t.me/c/<canal>/<msg> (canal privado) ou https://t.me/<username>/<msg>.`,
      );
    }

    // 0. Valida que o bot consegue enxergar o chat de armazenamento e tem
    // permissão de postar/encaminhar mensagens nele. Falha cedo com erro claro.
    try {
      const chat = await tg(
        "getChat",
        { chat_id: STORAGE_CHAT_ID },
        LOVABLE_API_KEY,
        TELEGRAM_API_KEY,
      );
      // Confirma que o bot é membro (e idealmente admin) do chat
      const me = await tg("getMe", {}, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      const member = await tg(
        "getChatMember",
        { chat_id: STORAGE_CHAT_ID, user_id: me.id },
        LOVABLE_API_KEY,
        TELEGRAM_API_KEY,
      );
      const status = member?.status;
      if (status === "left" || status === "kicked") {
        throw new Error(
          `O bot não é membro do chat de armazenamento "${chat.title || STORAGE_CHAT_ID}". Adicione o bot ao grupo como administrador.`,
        );
      }
      if (chat.type === "channel" && status !== "administrator" && status !== "creator") {
        throw new Error(
          `O bot precisa ser administrador no canal "${chat.title || STORAGE_CHAT_ID}" pra encaminhar vídeos.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Mensagens típicas do Telegram quando o bot não tem acesso
      if (/chat not found/i.test(msg)) {
        throw new Error(
          `TELEGRAM_STORAGE_CHAT_ID inválido ou inacessível (${STORAGE_CHAT_ID}). Crie um grupo, adicione o bot como administrador e atualize o secret com o chat_id correto (ex: -1001234567890).`,
        );
      }
      if (/bot is not a member|user not found|PEER_ID_INVALID/i.test(msg)) {
        throw new Error(
          `O bot não foi adicionado ao chat de armazenamento (${STORAGE_CHAT_ID}). Adicione-o como administrador antes de importar.`,
        );
      }
      throw e;
    }

    // 1. forwardMessage → bot encaminha pro grupo de armazenamento e recebe o objeto Message
    const fwd = await tg(
      "forwardMessage",
      {
        chat_id: STORAGE_CHAT_ID,
        from_chat_id: parsed.chatId,
        message_id: parsed.messageId,
        disable_notification: true,
      },
      LOVABLE_API_KEY,
      TELEGRAM_API_KEY,
    );

    const media = fwd.video || fwd.document || fwd.animation;
    if (!media?.file_id) throw new Error("A mensagem não contém vídeo");

    // 2. getFile → file_path pra download
    const info = await tg(
      "getFile",
      { file_id: media.file_id },
      LOVABLE_API_KEY,
      TELEGRAM_API_KEY,
    );

    // 3. baixa via gateway /file/<path>
    const dl = await fetch(`${GATEWAY_URL}/file/${info.file_path}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
      },
    });
    if (!dl.ok) throw new Error(`Download falhou [${dl.status}]`);
    const bytes = new Uint8Array(await dl.arrayBuffer());

    // 4. upload pro bucket videos
    const ext = (info.file_path.split(".").pop() || "mp4").toLowerCase();
    const path = `telegram/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error: upErr } = await supabase.storage
      .from("videos")
      .upload(path, bytes, {
        contentType: media.mime_type || "video/mp4",
        upsert: false,
      });
    if (upErr) throw new Error(`Upload: ${upErr.message}`);

    const { data: pub } = supabase.storage.from("videos").getPublicUrl(path);

    // 5. limpa: apaga a mensagem encaminhada do grupo de depósito
    try {
      await tg(
        "deleteMessage",
        { chat_id: STORAGE_CHAT_ID, message_id: fwd.message_id },
        LOVABLE_API_KEY,
        TELEGRAM_API_KEY,
      );
    } catch (_) {
      // ignore
    }

    return new Response(
      JSON.stringify({
        ok: true,
        video_url: pub.publicUrl,
        size: media.file_size,
        duration: media.duration,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[telegram-fetch]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
