// Edge function: telegram-stream
// Recebe um file_id do Telegram e devolve a URL temporária do CDN (válida ~1h).
// O player toca direto do CDN do Telegram — NADA passa pelo bucket Supabase.
// Esta é a função usada pra todos os vídeos armazenados como "tg://<file_id>".

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      throw new Error("Telegram não conectado.");
    }

    // Aceita file_id via querystring (?id=...) ou body JSON
    const url = new URL(req.url);
    let fileId = url.searchParams.get("id");
    if (!fileId && req.method !== "GET") {
      try {
        const body = await req.json();
        fileId = body?.file_id ?? body?.id ?? null;
      } catch (_) { /* sem body */ }
    }
    if (!fileId) throw new Error("Parâmetro 'id' (file_id) ausente.");

    // 1. getFile → file_path
    const fileRes = await fetch(`${GATEWAY_URL}/getFile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file_id: fileId }),
    });
    const fileData = await fileRes.json();
    if (!fileRes.ok || fileData.ok === false) {
      throw new Error(
        `getFile: ${fileData.description || JSON.stringify(fileData)}`,
      );
    }

    const filePath = fileData.result?.file_path;
    if (!filePath) throw new Error("file_path ausente");

    // 2. Faz HEAD pra confirmar tamanho/tipo (opcional, mas ajuda no player)
    const downloadUrl = `${GATEWAY_URL}/file/${filePath}`;

    // Modo redirect: o cliente aponta o <video src> direto pra cá e a função
    // redireciona pro download proxy do gateway. O player streama de lá.
    if (url.searchParams.get("redirect") === "1") {
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          Location: downloadUrl,
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        url: downloadUrl,
        file_path: filePath,
        // Token deve ser anexado pelo backend porque o gateway exige header.
        // Por isso o player usa a rota desta function como src do vídeo.
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[telegram-stream]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
