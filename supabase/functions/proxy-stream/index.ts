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
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-type",
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

const GDRIVE_GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

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

function extractDriveFileId(rawUrl: string): string | null {
  const patterns = [
    /drive\.google\.com\/file\/d\/([\w-]{10,})/,
    /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]{10,})/,
    /drive\.usercontent\.google\.com\/(?:download|uc)\?(?:[^#]*&)?id=([\w-]{10,})/,
    /docs\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]{10,})/,
    /drive\.google\.com\/.*[?&]id=([\w-]{10,})/,
  ];
  for (const re of patterns) {
    const match = rawUrl.match(re);
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseRange(range: string | null, size: number, chunkSize = 4 * 1024 * 1024): string {
  if (!size || !Number.isFinite(size)) return range || `bytes=0-${chunkSize - 1}`;
  const match = range?.match(/bytes=(\d*)-(\d*)/i);
  const rawStart = match?.[1] ? Number(match[1]) : 0;
  const start = Math.max(0, Number.isFinite(rawStart) ? rawStart : 0);
  const requestedEnd = match?.[2] ? Number(match[2]) : start + chunkSize - 1;
  const end = Math.min(size - 1, Number.isFinite(requestedEnd) ? requestedEnd : start + chunkSize - 1, start + chunkSize - 1);
  return `bytes=${start}-${Math.max(start, end)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);
  const split = url.searchParams.get("split");
  if (split) {
    try {
      const [base, totalRaw, extRaw] = split.split("|");
      const total = Number(totalRaw || 0);
      const ext = extRaw || "mp4";
      if (!base || !Number.isFinite(total) || total <= 0) throw new Error("invalid_split");

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const partUrls = Array.from({ length: total }, (_, i) =>
        `${SUPABASE_URL}/storage/v1/object/public/videos/${base}.part-${String(i).padStart(4, "0")}.${ext}`,
      );

      const body = new ReadableStream({
        async start(controller) {
          for (const partUrl of partUrls) {
            const part = await fetch(partUrl);
            if (!part.ok || !part.body) throw new Error(`part_fetch_${part.status}`);
            const reader = part.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          }
          controller.close();
        },
      });

      return new Response(body, {
        status: 200,
        headers: {
          ...CORS,
          "content-type": "video/mp4",
          "accept-ranges": "bytes",
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "split_failed", message: (e as Error).message }), {
        status: 502,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }
  }

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
    const isDrive = /(^|\.)google(usercontent)?\.com$/.test(remote.hostname) ||
      remote.hostname.endsWith("googleusercontent.com");

    const driveFileId = isDrive ? extractDriveFileId(remote.toString()) : null;
    if (driveFileId) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const GDRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
      if (!LOVABLE_API_KEY || !GDRIVE_KEY) {
        return new Response(JSON.stringify({ error: "drive_connector_missing" }), {
          status: 500,
          headers: { ...CORS, "content-type": "application/json" },
        });
      }

      const metaResp = await fetch(
        `${GDRIVE_GATEWAY_URL}/files/${driveFileId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
        {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GDRIVE_KEY,
          },
        },
      );
      const meta = metaResp.ok ? await metaResp.json() : null;
      const fileSize = Number(meta?.size || 0);
      const contentType = meta?.mimeType || "video/mp4";

      if (req.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: {
            ...CORS,
            "content-type": contentType,
            "content-length": fileSize ? String(fileSize) : "0",
            "accept-ranges": "bytes",
            "cache-control": "public, max-age=300",
          },
        });
      }

      const safeRange = parseRange(req.headers.get("range"), fileSize);
      const upstream = await fetch(
        `${GDRIVE_GATEWAY_URL}/files/${driveFileId}?alt=media&supportsAllDrives=true`,
        {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GDRIVE_KEY,
            Range: safeRange,
          },
          redirect: "follow",
        },
      );

      const respHeaders = new Headers();
      upstream.headers.forEach((value, key) => {
        if (!STRIP_HEADERS.includes(key.toLowerCase())) respHeaders.set(key, value);
      });
      Object.entries(CORS).forEach(([k, v]) => respHeaders.set(k, v));
      respHeaders.set("content-type", upstream.headers.get("content-type") || contentType);
      respHeaders.set("accept-ranges", "bytes");
      respHeaders.set("cache-control", "public, max-age=300");

      return new Response(upstream.body, {
        status: upstream.status === 200 ? 206 : upstream.status,
        headers: respHeaders,
      });
    }

    const fwdHeaders: Record<string, string> = {
      "User-Agent": BROWSER_UA,
      Accept: req.headers.get("accept") || "*/*",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    };
    // Repassa Range do cliente pra suportar seek/streaming parcial
    const range = req.headers.get("range");
    if (range) fwdHeaders["Range"] = range;

    // Pra Google Drive NÃO mandar Referer/Origin (gera "login required").
    if (!isDrive) {
      fwdHeaders["Referer"] = `${remote.protocol}//${remote.host}/`;
      fwdHeaders["Origin"] = `${remote.protocol}//${remote.host}`;
    }

    const upstream = await fetch(remote.toString(), {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: fwdHeaders,
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
