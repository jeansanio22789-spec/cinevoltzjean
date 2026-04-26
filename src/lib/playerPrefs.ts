// Preferências persistentes do player de vídeo.
// Ficam salvas no dispositivo (localStorage) e são aplicadas em todos os filmes.

const KEY = "streamflix_player_prefs_v1";

export interface PlayerPrefs {
  // Qualidade preferida em altura de pixels (ex.: 2160 = 4K, 1080, 720).
  // 0 ou ausente = "Auto".
  qualityHeight?: number;

  // Idioma preferido da faixa de áudio (ex.: "pt", "pt-BR", "en").
  // Se não houver, tentamos casar pelo nome.
  audioLang?: string;
  audioName?: string;

  // Idioma preferido das legendas. "off" = desligadas.
  subLang?: string | "off";
  subName?: string;

  // Velocidade de reprodução (0.5 .. 2).
  speed?: number;

  // Volume (0..1) e mudo.
  volume?: number;
  muted?: boolean;
}

const read = (): PlayerPrefs => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PlayerPrefs;
  } catch {
    return {};
  }
};

const write = (prefs: PlayerPrefs) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // ignora (modo privado / cota cheia)
  }
};

export const getPlayerPrefs = (): PlayerPrefs => read();

export const updatePlayerPrefs = (patch: Partial<PlayerPrefs>) => {
  const cur = read();
  write({ ...cur, ...patch });
};

// ---------- Helpers de "match" ----------

// Encontra o índice da qualidade mais próxima da altura preferida.
// `levels` deve estar com `height` em px. Retorna -1 se não houver match
// (cliente deve cair em Auto).
export const pickQualityIndex = (
  levels: { index: number; height: number }[],
  preferredHeight: number | undefined,
): number => {
  if (!preferredHeight || preferredHeight <= 0) return -1;
  if (levels.length === 0) return -1;
  // Match exato
  const exact = levels.find((l) => l.height === preferredHeight);
  if (exact) return exact.index;
  // Maior altura <= preferida (ex.: prefere 2160, só tem 1080 → 1080)
  const lowerOrEqual = levels
    .filter((l) => l.height > 0 && l.height <= preferredHeight)
    .sort((a, b) => b.height - a.height);
  if (lowerOrEqual[0]) return lowerOrEqual[0].index;
  // Senão, a menor disponível
  const sortedAsc = [...levels]
    .filter((l) => l.height > 0)
    .sort((a, b) => a.height - b.height);
  return sortedAsc[0]?.index ?? -1;
};

const normLang = (v?: string | null) =>
  (v || "").toLowerCase().split(/[-_]/)[0];

// Encontra a faixa cujo idioma/nome bate com o salvo.
export const pickTrackId = <T extends { id: number; name: string; lang?: string }>(
  tracks: T[],
  preferredLang?: string,
  preferredName?: string,
): number => {
  if (tracks.length === 0) return -1;
  if (preferredLang) {
    const want = normLang(preferredLang);
    const byLangExact = tracks.find((t) => (t.lang || "").toLowerCase() === preferredLang.toLowerCase());
    if (byLangExact) return byLangExact.id;
    const byLangBase = tracks.find((t) => normLang(t.lang) === want);
    if (byLangBase) return byLangBase.id;
  }
  if (preferredName) {
    const byName = tracks.find(
      (t) => t.name.toLowerCase() === preferredName.toLowerCase(),
    );
    if (byName) return byName.id;
  }
  return -1;
};
