/**
 * Relógio sincronizado com servidor.
 * Calcula o offset entre Date.now() local e a hora real do servidor,
 * para que TODOS os aparelhos compartilhem a mesma referência de tempo.
 *
 * Estratégia:
 *  - Usa o header HTTP `Date` de uma requisição leve ao próprio host (sempre disponível).
 *  - Compensa o RTT (round-trip) dividindo por 2.
 *  - Coleta MÚLTIPLAS amostras e usa a de menor RTT (mais precisa).
 *  - Re-sincroniza a cada 60s e quando a aba volta a ficar visível.
 *  - Permite forçar sync na hora (botão / troca de stream).
 */

let offsetMs = 0;          // serverNow ≈ Date.now() + offsetMs
let lastSyncAt = 0;
let lastRtt = 0;
let syncing: Promise<void> | null = null;
const listeners = new Set<() => void>();

const SYNC_INTERVAL = 60 * 1000; // 60s — mais frequente
const SAMPLE_COUNT = 5;          // 5 amostras por sync para escolher a de menor RTT

interface Sample { offset: number; rtt: number; }

const fetchOnce = async (): Promise<Sample | null> => {
  try {
    const t0 = Date.now();
    const res = await fetch(`${window.location.origin}/?_clock=${t0}-${Math.random()}`, {
      method: "HEAD",
      cache: "no-store",
    });
    const t1 = Date.now();
    const dateHeader = res.headers.get("date");
    if (!dateHeader) return null;
    const serverMs = new Date(dateHeader).getTime();
    if (!Number.isFinite(serverMs)) return null;
    const rtt = t1 - t0;
    // Estima a hora do servidor no instante t1 e calcula offset relativo a Date.now()
    const serverAtT1 = serverMs + rtt / 2;
    return { offset: serverAtT1 - t1, rtt };
  } catch {
    return null;
  }
};

export const syncServerClock = async (force = false): Promise<void> => {
  if (syncing) return syncing;
  if (!force && Date.now() - lastSyncAt < SYNC_INTERVAL) return;

  syncing = (async () => {
    const samples: Sample[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const s = await fetchOnce();
      if (s) samples.push(s);
      // pequeno espaçamento entre amostras
      if (i < SAMPLE_COUNT - 1) await new Promise((r) => setTimeout(r, 80));
    }
    if (samples.length > 0) {
      // Pega a amostra de menor RTT (mais confiável)
      samples.sort((a, b) => a.rtt - b.rtt);
      const best = samples[0];
      offsetMs = best.offset;
      lastRtt = best.rtt;
      lastSyncAt = Date.now();
      listeners.forEach((fn) => { try { fn(); } catch { /* noop */ } });
    }
    syncing = null;
  })();

  return syncing;
};

/** Força sincronização imediata, ignorando o intervalo. */
export const forceSyncServerClock = () => syncServerClock(true);

/** Hora atual sincronizada com o servidor (ms desde epoch). */
export const serverNow = (): number => Date.now() + offsetMs;

/** Info de diagnóstico. */
export const getClockInfo = () => ({
  offsetMs,
  lastSyncAt,
  lastRtt,
  syncedAgo: lastSyncAt ? Date.now() - lastSyncAt : null,
});

/** Inscreve callback para quando o relógio re-sincroniza. */
export const onClockSync = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

let initialized = false;
export const ensureClockReady = () => {
  if (initialized) return;
  initialized = true;
  void syncServerClock(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncServerClock(true);
  });
  window.addEventListener("online", () => void syncServerClock(true));
  setInterval(() => void syncServerClock(), SYNC_INTERVAL);
};
