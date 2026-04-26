// Publica 1 item revisado: cria movie + marca telegram_message como imported.
// Recebe URLs já carregadas (pelo bulk-import dryRun) + metadados editados pelo admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface Body {
  update_id: number;
  title: string;
  video_url: string;
  thumbnail_url?: string | null;
  genre?: string;
  year?: number | null;
  duration_min?: number | null;
  description?: string;
  kind?: 'movie' | 'series';
  season?: number | null;
  episode?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Variáveis de ambiente faltando');
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = (await req.json()) as Body;
    if (!body?.update_id || !body?.title?.trim() || !body?.video_url) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Campos obrigatórios: update_id, title, video_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Verifica se a mensagem ainda existe e está pendente
    const { data: msg, error: msgErr } = await supabase
      .from('telegram_messages')
      .select('update_id, processing_status')
      .eq('update_id', body.update_id)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!msg) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Mensagem não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (msg.processing_status === 'imported') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Esse vídeo já foi publicado' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const fullTitle =
      body.kind === 'series' && body.season && body.episode
        ? `${body.title.trim()} — T${body.season}E${body.episode}`
        : body.title.trim();

    // Quando o video_url é um link público do Telegram (t.me/c/...), grava
    // também em telegram_url pra que o player use TelegramPlayer.
    const isTelegramLink = /^https?:\/\/(t\.me|telegram\.me)\//i.test(body.video_url);

    const { data: movie, error: movieErr } = await supabase
      .from('movies')
      .insert({
        title: fullTitle,
        video_url: body.video_url,
        telegram_url: isTelegramLink ? body.video_url : null,
        thumbnail_url: body.thumbnail_url || null,
        genre: body.genre || 'Drama',
        year: body.year || null,
        duration: body.duration_min ? `${body.duration_min}min` : null,
        status: 'published',
        description: body.description || '',
      })
      .select('id')
      .single();
    if (movieErr) throw new Error(`Insert movie: ${movieErr.message}`);

    await supabase
      .from('telegram_messages')
      .update({
        processing_status: 'imported',
        movie_id: movie.id,
        processed_at: new Date().toISOString(),
      })
      .eq('update_id', body.update_id);

    return new Response(
      JSON.stringify({ ok: true, movie_id: movie.id, title: fullTitle }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
