// Discover Telegram chats (groups) the bot is a member of by calling getUpdates.
// Returns a deduplicated list of chats so the admin can pick one and save its chat_id.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      throw new Error('Telegram não está configurado nas variáveis de ambiente');
    }

    // Call getUpdates WITHOUT advancing offset — we just want to inspect what's pending.
    // Short timeout because this is interactive.
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

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Telegram API: ${JSON.stringify(data)}`,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const updates: any[] = data.result ?? [];
    const chatsMap = new Map<number, DiscoveredChat>();

    for (const update of updates) {
      const msg = update.message ?? update.channel_post ?? update.my_chat_member;
      const chat = msg?.chat;
      if (!chat?.id) continue;

      const existing = chatsMap.get(chat.id);
      const date = msg.date ?? 0;
      const preview =
        msg.text ?? msg.caption ?? (msg.video ? '[vídeo]' : msg.photo ? '[foto]' : '');

      if (!existing || date > (existing.last_message_date ?? 0)) {
        chatsMap.set(chat.id, {
          chat_id: chat.id,
          title: chat.title ?? chat.username ?? `Chat ${chat.id}`,
          type: chat.type,
          username: chat.username,
          last_message_preview: preview ? String(preview).slice(0, 80) : undefined,
          last_message_date: date,
        });
      }
    }

    const chats = Array.from(chatsMap.values()).sort(
      (a, b) => (b.last_message_date ?? 0) - (a.last_message_date ?? 0),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        chats,
        total_updates: updates.length,
        hint:
          chats.length === 0
            ? 'Nenhuma mensagem detectada. Mande qualquer mensagem no grupo (com o bot dentro) e tente de novo.'
            : undefined,
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
