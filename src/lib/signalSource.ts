// Identifica a origem do sinal de uma URL de stream pela assinatura do host/path.
// Usado para mostrar um selo (Satélite / IPTV / CDN / Web) no player.

export type SignalKind = "satellite" | "iptv" | "cdn" | "web" | "unknown";

export interface SignalSource {
  kind: SignalKind;
  label: string;        // texto curto pra badge (ex.: "SAT")
  fullLabel: string;    // texto longo (ex.: "Via Satélite (JMVStream)")
  provider?: string;    // nome do provedor detectado
}

/**
 * Heurística baseada no host/path da URL ativa.
 * Cobre os principais provedores de retransmissão de TV aberta usados no Brasil.
 */
export const detectSignalSource = (url: string | null | undefined): SignalSource => {
  if (!url) return { kind: "unknown", label: "—", fullLabel: "Origem desconhecida" };

  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }

  // 🛰️ JMVStream — retransmissão por satélite (LVW-XXXX = Live View)
  if (
    /jmvstream\.com/.test(host) ||
    /\/lvw[-_]?\d+/i.test(path) ||
    /lvw[-_]?\d+/i.test(url)
  ) {
    return {
      kind: "satellite",
      label: "SAT",
      fullLabel: "Via Satélite (JMVStream)",
      provider: "JMVStream",
    };
  }

  // 🛰️ Vivensis / RTV — retransmissão por satélite
  if (/vivensis|rtv\.com\.br|tvsat/.test(host)) {
    return {
      kind: "satellite",
      label: "SAT",
      fullLabel: "Via Satélite (Vivensis)",
      provider: "Vivensis",
    };
  }

  // 🛰️ Outros padrões clássicos de uplink/satélite
  if (/sat\.|satellite|uplink|teleport/.test(host)) {
    return { kind: "satellite", label: "SAT", fullLabel: "Via Satélite" };
  }

  // 📡 IPTV (provedores comuns de listas IPTV)
  if (/iptv|m3u-server|playtv|tvbrasil|brasiltv/.test(host)) {
    return { kind: "iptv", label: "IPTV", fullLabel: "Via IPTV", provider: host };
  }

  // ☁️ CDNs grandes
  if (/cloudfront\.net/.test(host)) {
    return { kind: "cdn", label: "CDN", fullLabel: "Via CDN (CloudFront)", provider: "CloudFront" };
  }
  if (/akamai|akamaized/.test(host)) {
    return { kind: "cdn", label: "CDN", fullLabel: "Via CDN (Akamai)", provider: "Akamai" };
  }
  if (/fastly|fastlylb/.test(host)) {
    return { kind: "cdn", label: "CDN", fullLabel: "Via CDN (Fastly)", provider: "Fastly" };
  }
  if (/cloudflare|cloudflarestream/.test(host)) {
    return { kind: "cdn", label: "CDN", fullLabel: "Via CDN (Cloudflare)", provider: "Cloudflare" };
  }

  // 🌐 Web genérico (qualquer m3u8 sem assinatura conhecida)
  if (/\.m3u8/.test(url)) {
    return { kind: "web", label: "WEB", fullLabel: "Stream Web (HLS)", provider: host };
  }

  return { kind: "unknown", label: "—", fullLabel: "Origem desconhecida", provider: host };
};

// Cores semânticas (mapeadas para tokens do design system)
export const signalSourceClass = (kind: SignalKind): string => {
  switch (kind) {
    case "satellite":
      return "bg-accent/15 text-accent border-accent/40";
    case "iptv":
      return "bg-primary/15 text-primary border-primary/40";
    case "cdn":
      return "bg-secondary text-secondary-foreground border-border";
    case "web":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};
