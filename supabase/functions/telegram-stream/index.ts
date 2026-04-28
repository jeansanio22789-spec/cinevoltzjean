// Edge function: telegram-stream
// Proxy de streaming: recebe um file_id do Telegram e devolve o conteúdo do
// vídeo direto, com suporte a Range (necessário pro <video> seek/skip).
// O vídeo NUNCA é copiado pro bucket — vai direto do CDN do Telegram pro player.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges",
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

    const url = new URL(req.url);
    const fileId = url.searchParams.get("id");
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

    // 2. Stream do CDN do Telegram com suporte a Range
    const range = req.headers.get("range");
    const upstream = await fetch(`${GATEWAY_URL}/file/${filePath}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        ...(range ? { Range: range } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      const txt = await upstream.text().catch(() => "");
      throw new Error(`Stream upstream falhou [${upstream.status}]: ${txt.slice(0, 200)}`);
    }

    // Repassa o body como stream + headers úteis pro player
    const passHeaders: Record<string, string> = { ...corsHeaders };
    const ct = upstream.headers.get("content-type");
    if (ct) passHeaders["Content-Type"] = ct;
    else {
      const ext = (filePath.split(".").pop() || "mp4").toLowerCase();
      passHeaders["Content-Type"] =
        ext === "webm" ? "video/webm" :
        ext === "mkv" ? "video/x-matroska" :
        "video/mp4";
    }
    const cl = upstream.headers.get("content-length");
    if (cl) passHeaders["Content-Length"] = cl;
    const cr = upstream.headers.get("content-range");
    if (cr) passHeaders["Content-Range"] = cr;
    passHeaders["Accept-Ranges"] = "bytes";
    passHeaders["Cache-Control"] = "private, max-age=300";

    return new Response(upstream.body, {
      status: upstream.status,
      headers: passHeaders,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[telegram-stream]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
