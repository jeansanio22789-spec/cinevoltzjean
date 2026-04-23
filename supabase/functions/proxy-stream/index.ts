// Reverse proxy edge function — remove X-Frame-Options/CSP que impedem
// embedar sites externos (Globoplay, etc) num iframe do app.
//
// Uso: GET /functions/v1/proxy-stream?url=https://globoplay.globo.com/...
//
// - Faz fetch do recurso remoto com User-Agent de browser real.
// - Remove headers de bloqueio (X-Frame-Options, CSP frame-ancestors).
// - Reescreve URLs relativas em HTML para apontar pro próprio proxy,
//   garantindo que CSS/JS/imagens carreguem dentro do iframe.
// - Para playlists HLS (.m3u8), reescreve URLs de chunks pra também
//   passar pelo proxy (CORS livre).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

const STRIP_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
  "referrer-policy",
];

function getProxyBase(req: Request): string {
  const u = new URL(req.url);
  // ex: https://<ref>.functions.supabase.co/proxy-stream
  return `${u.origin}${u.pathname}`;
}

function rewriteUrl(raw: string, baseRemote: string, proxyBase: string): string {
  try {
    const abs = new URL(raw, baseRemote).toString();
    return `${proxyBase}?url=${encodeURIComponent(abs)}`;
  } catch {
    return raw;
  }
}

function rewriteHtml(html: string, baseRemote: string, proxyBase: string): string {
  // Reescreve atributos src/href/action que apontem para URLs absolutas/relativas.
  return html
    .replace(/(<base\b[^>]*>)/gi, "")
    .replace(
      /(src|href|action|poster|data-src)\s*=\s*"([^"]+)"/gi,
      (_m, attr, val) => `${attr}="${rewriteUrl(val, baseRemote, proxyBase)}"`,
    )
    .replace(
      /(src|href|action|poster|data-src)\s*=\s*'([^']+)'/gi,
      (_m, attr, val) => `${attr}='${rewriteUrl(val, baseRemote, proxyBase)}'`,
    );
}

function rewriteM3u8(text: string, baseRemote: string, proxyBase: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        // Reescreve URI dentro de tags como #EXT-X-KEY:URI="..."
        return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${rewriteUrl(u, baseRemote, proxyBase)}"`);
      }
      return rewriteUrl(trimmed, baseRemote, proxyBase);
    })
    .join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return new Response(JSON.stringify({ error: "missing_url" }), {
      status: 400,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }

  let remote: URL;
  try {
    remote = new URL(target);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_url" }), {
      status: 400,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }

  try {
    const upstream = await fetch(remote.toString(), {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: req.headers.get("accept") || "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        Referer: `${remote.protocol}//${remote.host}/`,
        Origin: `${remote.protocol}//${remote.host}`,
      },
      redirect: "follow",
    });

    const respHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!STRIP_HEADERS.includes(key.toLowerCase())) {
        respHeaders.set(key, value);
      }
    });
    Object.entries(CORS).forEach(([k, v]) => respHeaders.set(k, v));

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    const proxyBase = getProxyBase(req);
    const baseRemote = `${remote.protocol}//${remote.host}${remote.pathname}`;

    // HTML — reescreve URLs e injeta <base>
    if (contentType.includes("text/html")) {
      const text = await upstream.text();
      const rewritten = rewriteHtml(text, baseRemote, proxyBase);
      respHeaders.set("content-type", "text/html; charset=utf-8");
      respHeaders.delete("content-length");
      return new Response(rewritten, { status: upstream.status, headers: respHeaders });
    }

    // HLS playlist — reescreve segmentos
    if (
      contentType.includes("mpegurl") ||
      contentType.includes("application/vnd.apple.mpegurl") ||
      remote.pathname.endsWith(".m3u8")
    ) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, baseRemote, proxyBase);
      respHeaders.set("content-type", "application/vnd.apple.mpegurl");
      respHeaders.delete("content-length");
      return new Response(rewritten, { status: upstream.status, headers: respHeaders });
    }

    // Demais (vídeo, css, js, imagens) — passa direto sem mexer
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "proxy_failed", message: (e as Error).message }),
      { status: 502, headers: { ...CORS, "content-type": "application/json" } },
    );
  }
});
