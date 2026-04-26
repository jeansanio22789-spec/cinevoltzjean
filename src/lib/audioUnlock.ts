/**
 * Pré-aquece o AudioContext no primeiro gesto do usuário.
 * Navegadores móveis bloqueiam áudio até haver um clique/toque, então
 * registramos um handler global que cria e desbloqueia o contexto na
 * primeira interação. Depois disso, qualquer som (ex.: vinheta de
 * abertura) consegue tocar mesmo em páginas que carregam sozinhas.
 */
let primedCtx: AudioContext | null = null;
let primed = false;

export const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!primedCtx) primedCtx = new Ctx();
  // Em alguns navegadores o ctx começa "suspended"
  if (primedCtx.state === "suspended") {
    primedCtx.resume().catch(() => {
      /* silencioso */
    });
  }
  return primedCtx;
};

export const primeAudio = () => {
  if (primed) return;
  primed = true;
  const ctx = getAudioContext();
  if (!ctx) return;
  // Toca um pulso silencioso para destravar o canal de áudio
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.02);
  } catch {
    /* noop */
  }
};

export const installAudioUnlock = () => {
  if (typeof window === "undefined") return;
  const onFirst = () => {
    primeAudio();
    window.removeEventListener("pointerdown", onFirst);
    window.removeEventListener("touchstart", onFirst);
    window.removeEventListener("keydown", onFirst);
  };
  window.addEventListener("pointerdown", onFirst, { once: true });
  window.addEventListener("touchstart", onFirst, { once: true, passive: true });
  window.addEventListener("keydown", onFirst, { once: true });
};
