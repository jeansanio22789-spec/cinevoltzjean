// Edge function: telegram-fetch
// Recebe um link público t.me/c/<channel>/<message> ou t.me/<canal>/<message>,
// busca o vídeo via Telegram Bot API (connector gateway) e faz upload no
// bucket "videos" do Supabase Storage. Retorna a URL pública.
//
// IMPORTANTE: o bot precisa ser membro/admin do canal para conseguir ler.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

interface ParsedLink {
  chatId: string; // -100<id> para canais privados, @username para públicos
  messageId: number;
}

const parseTelegramLink = (raw: string): ParsedLink | null => {
  try {
    const url = new URL(raw.trim());
    if (!/t\.me$/i.test(url.hostname) && url.hostname !== "telegram.me") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    // Privado: /c/<channel>/<msg>
    if (parts[0] === "c" && parts.length >= 3) {
      const chan = parts[1];
      const msg = parseInt(parts[2], 10);
      if (!chan || isNaN(msg)) return null;
      return { chatId: `-100${chan}`, messageId: msg };
    }
    // Público: /<username>/<msg>
    if (parts.length >= 2) {
      const username = parts[0];
      const msg = parseInt(parts[1], 10);
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
      `Telegram ${method} falhou [${res.status}]: ${
        json.description || JSON.stringify(json)
      }`,
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "Telegram não está conectado. Conecte o Telegram em Conectores.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(
        JSON.stringify({ error: "Backend não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "Parâmetro `url` ausente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = parseTelegramLink(url);
    if (!parsed) {
      return new Response(
        JSON.stringify({
          error:
            "Link inválido. Use o formato t.me/c/<canal>/<msg> ou t.me/<canal>/<msg>",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Telegram Bot API NÃO permite getMessageById diretamente. Precisamos usar
    // forwardMessage para um chat onde o bot tem permissão (no caso, ele mesmo
    // — mas bots não podem mandar pra si próprios). A solução é usar
    // copyMessage para um "chat de armazenamento" — se não houver, retornamos
    // erro pedindo configuração.
    //
    // Workaround: fazemos forwardMessage de volta pro próprio canal seria
    // estranho. A abordagem real é assinar updates via getUpdates e capturar
    // o file_id quando a mensagem chegar. Para extração sob demanda
    // por link, só funciona se o admin reencaminhar a mensagem para o bot
    // em chat privado primeiro.

    // Tentativa: copyMessage para o próprio canal de origem com disable_notification.
    // Isso retorna message_id mas não dá file_id. Então usamos getChat/getUpdates fallback.

    // Estratégia recomendada do Bot API:
    //  → Pedir ao admin para encaminhar a mensagem para o bot.
    // Mas o usuário quer só colar o link. Vamos usar messageLink->
    // forwardMessage para um STORAGE_CHAT_ID configurável.

    const STORAGE_CHAT_ID = Deno.env.get("TELEGRAM_STORAGE_CHAT_ID");
    if (!STORAGE_CHAT_ID) {
      return new Response(
        JSON.stringify({
          error:
            "Para extrair vídeos do Telegram via link, configure o secret TELEGRAM_STORAGE_CHAT_ID com o ID de um chat onde o bot é admin (pode ser um grupo só seu com o bot).",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // forwardMessage encaminha a mensagem original para o chat de armazenamento
    // e retorna o objeto Message completo (com video.file_id)
    const forwarded = await tg(
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

    const video = forwarded.video || forwarded.document || forwarded.animation;
    if (!video?.file_id) {
      return new Response(
        JSON.stringify({
          error: "A mensagem não contém vídeo.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pega file_path
    const fileInfo = await tg(
      "getFile",
      { file_id: video.file_id },
      LOVABLE_API_KEY,
      TELEGRAM_API_KEY,
    );

    // Baixa arquivo via gateway
    const dl = await fetch(`${GATEWAY_URL}/file/${fileInfo.file_path}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
      },
    });
    if (!dl.ok) {
      throw new Error(`Download falhou [${dl.status}]`);
    }
    const bytes = new Uint8Array(await dl.arrayBuffer());

    // Upload pro bucket videos
    const ext = (fileInfo.file_path.split(".").pop() || "mp4").toLowerCase();
    const path = `telegram/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error: upErr } = await supabase.storage
      .from("videos")
      .upload(path, bytes, {
        contentType: video.mime_type || "video/mp4",
        upsert: false,
      });
    if (upErr) {
      throw new Error(`Upload falhou: ${upErr.message}`);
    }
    const { data: pub } = supabase.storage.from("videos").getPublicUrl(path);

    return new Response(
      JSON.stringify({
        ok: true,
        video_url: pub.publicUrl,
        size: video.file_size,
        duration: video.duration,
        mime: video.mime_type,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
