// Discover Telegram chats by reading recent messages stored in `telegram_messages`
// (which is populated by the `telegram-poll` cron) AND by calling getUpdates as a
// fallback. This is robust against the cron consuming updates before us.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

interface DiscoveredChat {
  chat_id: number;
  title: string;
  type: string;
  username?: string;
  last_message_preview?: string;
  last_message_date?: number;
}

function extractChatFromUpdate(update: any): {
  chat_id: number;
  title: string;
  type: string;
  username?: string;
  preview?: string;
  date?: number;
} | null {
  const msg = update?.message ?? update?.channel_post ?? update?.my_chat_member;
  const chat = msg?.chat;
  if (!chat?.id) return null;

  const preview =
    msg.text ??
    msg.caption ??
    (msg.video ? '[vídeo]' : msg.photo ? '[foto]' : msg.document ? '[arquivo]' : '');

  return {
    chat_id: chat.id,
    title: chat.title ?? chat.username ?? `Chat ${chat.id}`,
    type: chat.type,
    username: chat.username,
    preview: preview ? String(preview).slice(0, 80) : undefined,
    date: msg.date ?? 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Supabase não está configurado');
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const chatsMap = new Map<number, DiscoveredChat>();

    // 1) Lê do banco — tudo que o cron já capturou
    const { data: stored, error: storedErr } = await supabase
      .from('telegram_messages')
      .select('chat_id, raw_update, caption, text, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (storedErr) {
      console.error('Erro lendo telegram_messages:', storedErr.message);
    } else {
      for (const row of stored ?? []) {
        const info = extractChatFromUpdate(row.raw_update);
        if (!info) continue;
        const existing = chatsMap.get(info.chat_id);
        if (!existing || (info.date ?? 0) > (existing.last_message_date ?? 0)) {
          chatsMap.set(info.chat_id, {
            chat_id: info.chat_id,
            title: info.title,
            type: info.type,
            username: info.username,
            last_message_preview: info.preview,
            last_message_date: info.date,
          });
        }
      }
    }

    // 2) Tenta getUpdates direto pra pegar o que ainda não foi processado
    let gatewayHint: string | undefined;
    if (LOVABLE_API_KEY && TELEGRAM_API_KEY) {
      try {
        const response = await fetch(`${GATEWAY_URL}/getUpdates`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': TELEGRAM_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeout: 0,
            limit: 100,
            allowed_updates: ['message', 'channel_post', 'my_chat_member'],
          }),
        });

        const rawText = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {
          gatewayHint = `Gateway respondeu sem JSON (status ${response.status}).`;
        }

        if (data?.ok && Array.isArray(data.result)) {
          for (const u of data.result) {
            const info = extractChatFromUpdate(u);
            if (!info) continue;
            const existing = chatsMap.get(info.chat_id);
            if (!existing || (info.date ?? 0) > (existing.last_message_date ?? 0)) {
              chatsMap.set(info.chat_id, {
                chat_id: info.chat_id,
                title: info.title,
                type: info.type,
                username: info.username,
                last_message_preview: info.preview,
                last_message_date: info.date,
              });
            }
          }
        }
      } catch (e) {
        gatewayHint = `getUpdates falhou: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    const chats = Array.from(chatsMap.values()).sort(
      (a, b) => (b.last_message_date ?? 0) - (a.last_message_date ?? 0),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        chats,
        source: stored && stored.length > 0 ? 'database+gateway' : 'gateway',
        hint:
          chats.length === 0
            ? `Nenhum chat detectado ainda. Mande uma mensagem nova no canal/grupo (com o bot como admin) e tente de novo em ~1 minuto. ${gatewayHint ?? ''}`.trim()
            : gatewayHint,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
