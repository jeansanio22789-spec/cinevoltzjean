// Bulk import: process pending telegram_messages for the saved channel.
// For each video message: download (if ≤20MB), upload to storage, call AI for
// metadata, insert into movies, link back to telegram_messages.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';
const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
// Sem limite local de tamanho — tenta baixar qualquer arquivo. O Telegram pode
// recusar arquivos > 20MB via Bot API, e nesse caso o erro é registrado.
const DORAMAS_CHAT_KEY = 'telegram_doramas_chat_id';

interface ProcessResult {
  update_id: number;
  status: 'imported' | 'skipped' | 'error' | 'preview';
  reason?: string;
  movie_id?: string;
  title?: string;
  // Campos extras quando dryRun=true (preview):
  video_url?: string;
  thumbnail_url?: string | null;
  duration_min?: number | null;
  size_mb?: number | null;
  meta?: {
    title: string;
    year?: number;
    genre: string;
    kind: 'movie' | 'series';
    season?: number;
    episode?: number;
    synopsis: string;
  };
}

async function extractMetadata(
  caption: string,
  apiKey: string,
): Promise<{
  title: string;
  year?: number;
  genre: string;
  kind: 'movie' | 'series';
  season?: number;
  episode?: number;
  synopsis: string;
}> {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'extract_movie_metadata',
        description: 'Extract movie/series metadata from a Telegram caption.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            year: { type: 'number' },
            genre: { type: 'string' },
            kind: { type: 'string', enum: ['movie', 'series'] },
            season: { type: 'number' },
            episode: { type: 'number' },
            synopsis: { type: 'string' },
          },
          required: ['title', 'genre', 'kind', 'synopsis'],
          additionalProperties: false,
        },
      },
    },
  ];

  const res = await fetch(AI_GATEWAY, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content:
            'Extract Korean drama / movie metadata from a Telegram caption in Portuguese. Detect if it is a series (dorama) or movie. If series, find season/episode numbers. Return clean title without season/episode markers. Genre in Portuguese (Romance, Ação, Drama, Comédia, etc).',
        },
        { role: 'user', content: caption },
      ],
      tools,
      tool_choice: { type: 'function', function: { name: 'extract_movie_metadata' } },
    }),
  });

  if (!res.ok) {
    throw new Error(`AI ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('IA não retornou metadados');
  return JSON.parse(args);
}

async function downloadTelegramFileStream(
  fileId: string,
  lovableKey: string,
  tgKey: string,
): Promise<{ stream: ReadableStream<Uint8Array>; path: string } | { error: string }> {
  const fileRes = await fetch(`${GATEWAY_URL}/getFile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': tgKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_id: fileId }),
  });
  const fileData = await fileRes.json().catch(() => null);
  if (!fileRes.ok || !fileData?.ok) {
    const desc = fileData?.description || `getFile HTTP ${fileRes.status}`;
    return { error: desc };
  }

  const path = fileData.result.file_path;
  const dl = await fetch(`${GATEWAY_URL}/file/${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': tgKey,
    },
  });
  if (!dl.ok || !dl.body) {
    return { error: `download HTTP ${dl.status}` };
  }
  return { stream: dl.body, path };
}

// Thumbnails são pequenas — baixa em memória.
async function downloadTelegramFileBytes(
  fileId: string,
  lovableKey: string,
  tgKey: string,
): Promise<ArrayBuffer | null> {
  const r = await downloadTelegramFileStream(fileId, lovableKey, tgKey);
  if ('error' in r) return null;
  return await new Response(r.stream).arrayBuffer();
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
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Variáveis de ambiente faltando');
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit) || 5, 10);
    const dryRun = Boolean(body?.dryRun);

    // 1) Carrega o chat_id salvo
    const { data: settingRow } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', DORAMAS_CHAT_KEY)
      .maybeSingle();
    const chatIdStr = settingRow?.value;
    if (!chatIdStr) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Nenhum canal cadastrado. Salve o chat_id antes.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const chatId = Number(chatIdStr);

    // 2) Busca mensagens pendentes com vídeo
    const { data: pending, error: pendingErr } = await supabase
      .from('telegram_messages')
      .select('*')
      .eq('chat_id', chatId)
      .eq('processing_status', 'pending')
      .not('file_id', 'is', null)
      .like('mime_type', 'video/%')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (pendingErr) throw pendingErr;

    const results: ProcessResult[] = [];

    for (const row of pending ?? []) {
      try {
        // Sem mais bloqueio por tamanho — tenta baixar tudo. Se o Telegram
        // recusar (arquivo > limite da Bot API), o catch grava o erro real.

        const caption = row.caption || row.text || '';
        if (!caption.trim()) {
          await supabase
            .from('telegram_messages')
            .update({
              processing_status: 'no_caption',
              processed_at: new Date().toISOString(),
            })
            .eq('update_id', row.update_id);
          results.push({
            update_id: row.update_id,
            status: 'skipped',
            reason: 'Sem caption pra IA processar',
          });
          continue;
        }

        // Download vídeo
        const dl = await downloadTelegramFile(row.file_id, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        if (!dl) {
          await supabase
            .from('telegram_messages')
            .update({
              processing_status: 'download_failed',
              processing_error: 'getFile/download falhou',
              processed_at: new Date().toISOString(),
            })
            .eq('update_id', row.update_id);
          results.push({ update_id: row.update_id, status: 'error', reason: 'Download falhou' });
          continue;
        }

        // Upload pro storage
        const ext = (dl.path.split('.').pop() || 'mp4').toLowerCase();
        const storagePath = `telegram/${chatId}/${row.message_id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('videos')
          .upload(storagePath, dl.bytes, {
            contentType: row.mime_type || 'video/mp4',
            upsert: true,
          });
        if (upErr) throw new Error(`Upload: ${upErr.message}`);
        const { data: pub } = supabase.storage.from('videos').getPublicUrl(storagePath);

        // Thumbnail (se houver)
        let thumbUrl: string | null = null;
        if (row.thumb_file_id) {
          const thumbDl = await downloadTelegramFile(row.thumb_file_id, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          if (thumbDl) {
            const thumbPath = `telegram/${chatId}/${row.message_id}_thumb.jpg`;
            await supabase.storage.from('thumbnails').upload(thumbPath, thumbDl.bytes, {
              contentType: 'image/jpeg',
              upsert: true,
            });
            thumbUrl = supabase.storage.from('thumbnails').getPublicUrl(thumbPath).data.publicUrl;
          }
        }

        // IA: extrai metadados
        const meta = await extractMetadata(caption, LOVABLE_API_KEY);
        const fullTitle =
          meta.kind === 'series' && meta.season && meta.episode
            ? `${meta.title} — T${meta.season}E${meta.episode}`
            : meta.title;

        if (dryRun) {
          // Modo preview: NÃO publica em movies, NÃO altera processing_status.
          // Retorna URLs já carregadas no storage + metadados sugeridos.
          results.push({
            update_id: row.update_id,
            status: 'preview',
            title: fullTitle,
            video_url: pub.publicUrl,
            thumbnail_url: thumbUrl,
            duration_min: row.duration ? Math.round(row.duration / 60) : null,
            size_mb: row.file_size ? Math.round((row.file_size / 1024 / 1024) * 10) / 10 : null,
            meta,
          });
          continue;
        }

        // Modo publish direto (legado): cria movie e marca como imported.
        const { data: movie, error: movieErr } = await supabase
          .from('movies')
          .insert({
            title: fullTitle,
            video_url: pub.publicUrl,
            thumbnail_url: thumbUrl,
            genre: meta.genre,
            year: meta.year || null,
            duration: row.duration ? `${Math.round(row.duration / 60)}min` : null,
            status: 'published',
            description: meta.synopsis,
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
          .eq('update_id', row.update_id);

        results.push({
          update_id: row.update_id,
          status: 'imported',
          movie_id: movie.id,
          title: fullTitle,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Em dryRun também não persistimos erro permanente — só reportamos.
        if (!dryRun) {
          await supabase
            .from('telegram_messages')
            .update({
              processing_status: 'error',
              processing_error: msg.slice(0, 500),
              processed_at: new Date().toISOString(),
            })
            .eq('update_id', row.update_id);
        }
        results.push({ update_id: row.update_id, status: 'error', reason: msg });
      }
    }

    // Conta o que ainda falta
    const { count: stillPending } = await supabase
      .from('telegram_messages')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', chatId)
      .eq('processing_status', 'pending')
      .not('file_id', 'is', null)
      .like('mime_type', 'video/%');

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun,
        processed: results.length,
        previews: results.filter((r) => r.status === 'preview').length,
        imported: results.filter((r) => r.status === 'imported').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        errors: results.filter((r) => r.status === 'error').length,
        still_pending: stillPending ?? 0,
        results,
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
