/**
 * Relógio sincronizado com servidor.
 * Calcula o offset entre Date.now() local e a hora real do servidor,
 * para que TODOS os aparelhos compartilhem a mesma referência de tempo.
 *
 * Estratégia:
 *  - Usa o header HTTP `Date` de uma requisição leve ao próprio host (sempre disponível).
 *  - Compensa o RTT (round-trip) dividindo por 2.
 *  - Re-sincroniza a cada 5min e quando a aba volta a ficar visível.
 */

let offsetMs = 0;          // serverNow ≈ Date.now() + offsetMs
let lastSyncAt = 0;
let syncing: Promise<void> | null = null;

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 min

const fetchServerTime = async (): Promise<number | null> => {
  try {
    const t0 = Date.now();
    // HEAD na própria origem — header Date vem do servidor (CDN), sem CORS issues
    const res = await fetch(`${window.location.origin}/?_clock=${t0}`, {
      method: "HEAD",
      cache: "no-store",
    });
    const t1 = Date.now();
    const dateHeader = res.headers.get("date");
    if (!dateHeader) return null;
    const serverMs = new Date(dateHeader).getTime();
    if (!Number.isFinite(serverMs)) return null;
    // Compensa metade do RTT
    const rtt = t1 - t0;
    return serverMs + rtt / 2;
  } catch {
    return null;
  }
};

export const syncServerClock = async (force = false): Promise<void> => {
  if (syncing) return syncing;
  if (!force && Date.now() - lastSyncAt < SYNC_INTERVAL) return;

  syncing = (async () => {
    const serverNow = await fetchServerTime();
    if (serverNow !== null) {
      offsetMs = serverNow - Date.now();
      lastSyncAt = Date.now();
    }
    syncing = null;
  })();

  return syncing;
};

/** Hora atual sincronizada com o servidor (ms desde epoch). */
export const serverNow = (): number => Date.now() + offsetMs;

/** Garante que pelo menos uma sincronização aconteceu. */
let initialized = false;
export const ensureClockReady = () => {
  if (initialized) return;
  initialized = true;
  void syncServerClock(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncServerClock();
  });
  // Re-sync periódico
  setInterval(() => void syncServerClock(), SYNC_INTERVAL);
};
