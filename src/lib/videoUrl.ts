/**
 * Converte qualquer URL de vídeo (YouTube, Vimeo, Google Drive, link direto)
 * em um formato pronto para reprodução automática (embed ou player HTML5).
 */
export type VideoSource =
  | { kind: "iframe"; url: string }
  | { kind: "video"; url: string }
  | { kind: "local"; url: string } // local://<id> guardado no IndexedDB
  | { kind: "unknown"; url: string };

export const resolveVideoSource = (rawUrl: string | null | undefined): VideoSource | null => {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  if (!url) return null;

  // Vídeo armazenado localmente no dispositivo (IndexedDB)
  if (url.startsWith("local://")) {
    return { kind: "local", url };
  }

  if (url.startsWith("split://")) {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    return {
      kind: "video",
      url: `${baseUrl}/functions/v1/proxy-stream?split=${encodeURIComponent(url.slice("split://".length))}`,
    };
  }

  // Vídeo armazenado no Telegram (nuvem do Telegram). Não passa pelo bucket:
  // o player streama direto via edge function telegram-stream que faz proxy
  // do CDN do Telegram com suporte a Range.
  if (url.startsWith("tg://")) {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const fileId = url.slice("tg://".length);
    return {
      kind: "video",
      url: `${baseUrl}/functions/v1/telegram-stream?id=${encodeURIComponent(fileId)}`,
    };
  }

  // YouTube
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );
  if (yt) {
    return {
      kind: "iframe",
      url: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    };
  }

  // Vimeo
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) {
    return {
      kind: "iframe",
      url: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&playsinline=1`,
    };
  }

  // Google Drive — cobre todas as variantes de link compartilhado:
  //  • https://drive.google.com/file/d/<ID>/view?usp=sharing
  //  • https://drive.google.com/open?id=<ID>
  //  • https://drive.google.com/uc?export=download&id=<ID>
  //  • https://drive.google.com/uc?id=<ID>
  //  • https://drive.usercontent.google.com/download?id=<ID>
  //  • https://docs.google.com/uc?id=<ID>
  const gdPatterns = [
    /drive\.google\.com\/file\/d\/([\w-]{10,})/,
    /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]{10,})/,
    /drive\.usercontent\.google\.com\/(?:download|uc)\?(?:[^#]*&)?id=([\w-]{10,})/,
    /docs\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]{10,})/,
    /drive\.google\.com\/.*[?&]id=([\w-]{10,})/,
  ];
  for (const re of gdPatterns) {
    const m = url.match(re);
    if (m) {
      return {
        kind: "iframe",
        url: `https://drive.google.com/file/d/${m[1]}/preview`,
      };
    }
  }

  // Link direto de vídeo (mp4, webm, mov, m3u8)
  if (/\.(mp4|webm|mov|m4v|ogg|m3u8)(\?.*)?$/i.test(url)) {
    return { kind: "video", url };
  }

  // Storage do Supabase (geralmente .mp4) — tenta como vídeo
  if (url.includes("supabase.co/storage")) {
    return { kind: "video", url };
  }

  return { kind: "unknown", url };
};

export const buildShareLink = (movieId: string): string => {
  return `${window.location.origin}/assistir/${movieId}`;
};
