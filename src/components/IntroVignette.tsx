import { useEffect, useState } from "react";
import { getAudioContext, primeAudio } from "@/lib/audioUnlock";

interface IntroVignetteProps {
  /** Chamado quando a vinheta termina (fade-out completo). */
  onFinish: () => void;
  /** Nome do app exibido. Padrão: STREAMFLIX. */
  brand?: string;
  /** Duração total da vinheta em ms. Padrão: 3200. */
  duration?: number;
}

/**
 * Vinheta de abertura estilo Netflix com som "tudum" sintetizado.
 * - Letras aparecem uma a uma com glow vermelho
 * - Linha vermelha varre a tela
 * - Som de impacto grave (Web Audio, sem arquivo externo)
 * - Fade-out e callback para iniciar o filme
 */
const IntroVignette = ({
  onFinish,
  brand = "STREAMFLIX",
  duration = 3200,
}: IntroVignetteProps) => {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    // 🔊 Som "tudum" cinematográfico — sintetizado em tempo real
    // (sem precisar de arquivo .mp3). Funciona em mobile porque o
    // AudioContext já foi destravado pelo gesto inicial do usuário
    // (installAudioUnlock no App.tsx).
    try {
      primeAudio();
      const ctx = getAudioContext();
      if (!ctx) return;

      const master = ctx.createGain();
      master.gain.value = 1.1;
      // Compressor para ficar mais "punchy" (estilo Netflix)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 10;
      comp.attack.value = 0.002;
      comp.release.value = 0.22;
      // Reverb longo pra dar "sala grande" estilo cinema
      const convolver = ctx.createConvolver();
      const sr = ctx.sampleRate;
      const irLen = Math.floor(sr * 2.4);
      const ir = ctx.createBuffer(2, irLen, sr);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          // Decaimento exponencial mais suave, cauda longa grave
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
        }
      }
      convolver.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      const dry = ctx.createGain();
      dry.gain.value = 1.0;
      // Filtro pra "abafar" levemente o reverb (mais cinematográfico)
      const wetLp = ctx.createBiquadFilter();
      wetLp.type = "lowpass";
      wetLp.frequency.value = 1800;
      master.connect(comp);
      comp.connect(dry).connect(ctx.destination);
      comp.connect(convolver).connect(wetLp).connect(wet).connect(ctx.destination);

      const t0 = ctx.currentTime + 0.15;

      // 🥁 Thump percussivo (membrana grave): dá o "soco" característico
      const playThump = (start: number, gain: number, isHeavy = false) => {
        // Camada 1: senoide grave com pitch envelope
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(isHeavy ? 220 : 200, t0 + start);
        osc.frequency.exponentialRampToValueAtTime(
          isHeavy ? 32 : 42,
          t0 + start + (isHeavy ? 0.14 : 0.12),
        );
        g.gain.setValueAtTime(0, t0 + start);
        g.gain.linearRampToValueAtTime(gain, t0 + start + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + (isHeavy ? 0.95 : 0.5));
        osc.connect(g).connect(master);
        osc.start(t0 + start);
        osc.stop(t0 + start + (isHeavy ? 1.0 : 0.55));

        // Camada 2: ruído curto pra simular a batida da membrana (transiente)
        const noiseLen = Math.floor(ctx.sampleRate * 0.06);
        const buf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLen, 2.5);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = isHeavy ? 600 : 850;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0, t0 + start);
        ng.gain.linearRampToValueAtTime(gain * 0.6, t0 + start + 0.002);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 0.1);
        src.connect(lp).connect(ng).connect(master);
        src.start(t0 + start);
        src.stop(t0 + start + 0.12);

        // Camada 3 (só DUM): sub-rumble bem grave pra "tremor"
        if (isHeavy) {
          const sub = ctx.createOscillator();
          const sg = ctx.createGain();
          sub.type = "sine";
          sub.frequency.setValueAtTime(60, t0 + start);
          sub.frequency.exponentialRampToValueAtTime(28, t0 + start + 0.6);
          sg.gain.setValueAtTime(0, t0 + start);
          sg.gain.linearRampToValueAtTime(gain * 0.55, t0 + start + 0.01);
          sg.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 1.4);
          sub.connect(sg).connect(master);
          sub.start(t0 + start);
          sub.stop(t0 + start + 1.5);
        }
      };

      const playLayer = (
        type: OscillatorType,
        startFreq: number,
        endFreq: number,
        start: number,
        dur: number,
        gain: number,
      ) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, t0 + start);
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, endFreq),
          t0 + start + dur,
        );
        g.gain.setValueAtTime(0, t0 + start);
        g.gain.linearRampToValueAtTime(gain, t0 + start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        osc.connect(g).connect(master);
        osc.start(t0 + start);
        osc.stop(t0 + start + dur + 0.05);
      };

      // 🎵 "TU" — batida curta, mais aguda, ataque rápido (~120ms)
      playThump(0, 0.75, false);
      playLayer("sine", 145, 70, 0, 0.26, 0.5);
      playLayer("triangle", 210, 100, 0, 0.22, 0.25);
      playLayer("sine", 55, 40, 0, 0.32, 0.4);

      // ⏱️ Gap curto (silêncio de ~150ms, igual à Netflix)

      // 🎵 "DUM" — batida grave, sustentada, com cauda reverberada longa
      playThump(0.32, 1.0, true);
      playLayer("sine", 95, 42, 0.32, 1.3, 0.95);
      playLayer("triangle", 145, 65, 0.32, 1.1, 0.4);
      playLayer("sine", 40, 28, 0.32, 1.6, 0.75); // sub-bass profundo
      playLayer("sawtooth", 70, 32, 0.32, 0.5, 0.1); // grão/textura
    } catch {
      /* navegador sem áudio — segue silencioso */
    }

    // Fases da animação
    const enterMs = 1400;
    const holdMs = Math.max(0, duration - enterMs - 700);
    const exitMs = 700;

    const t1 = window.setTimeout(() => setPhase("hold"), enterMs);
    const t2 = window.setTimeout(() => setPhase("exit"), enterMs + holdMs);
    const t3 = window.setTimeout(() => onFinish(), enterMs + holdMs + exitMs);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [duration, onFinish]);

  const letters = brand.split("");

  return (
    <div
      className={`fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden transition-opacity duration-700 ${
        phase === "exit" ? "opacity-0" : "opacity-100"
      }`}
      onClick={() => {
        // Permite pular tocando na tela
        setPhase("exit");
        window.setTimeout(onFinish, 400);
      }}
    >
      {/* Vinheta radial escura nas bordas */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.95) 80%)",
        }}
      />

      {/* Linha varrendo a tela */}
      <div
        className={`absolute left-0 right-0 h-px bg-primary shadow-[0_0_20px_hsl(var(--primary))] transition-all ease-out ${
          phase === "enter"
            ? "top-1/2 opacity-100 duration-[1200ms]"
            : "top-full opacity-0 duration-500"
        }`}
        style={{ transform: "translateY(-50%)" }}
      />

      {/* Brilho central pulsante */}
      <div
        className={`absolute w-[140%] h-[140%] rounded-full pointer-events-none transition-opacity duration-700 ${
          phase === "hold" ? "opacity-30" : "opacity-0"
        }`}
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 50%)",
          filter: "blur(60px)",
        }}
      />

      {/* Texto da marca */}
      <div className="relative z-10 flex items-center gap-1 sm:gap-2">
        {letters.map((ch, i) => (
          <span
            key={i}
            className="inline-block text-5xl sm:text-7xl md:text-8xl font-black tracking-[0.15em] text-white"
            style={{
              textShadow:
                phase === "hold"
                  ? "0 0 40px hsl(var(--primary)), 0 0 80px hsl(var(--primary) / 0.6)"
                  : "0 0 20px hsl(var(--primary) / 0.5)",
              opacity: phase === "exit" ? 0 : 1,
              transform:
                phase === "enter"
                  ? "translateY(20px) scale(0.85)"
                  : phase === "hold"
                    ? "translateY(0) scale(1)"
                    : "translateY(-10px) scale(1.1)",
              transition: `opacity 600ms ease-out, transform 800ms cubic-bezier(0.2, 0.8, 0.2, 1), text-shadow 700ms ease-out`,
              transitionDelay: `${i * 80}ms`,
              animationDelay: `${i * 80}ms`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>

      {/* Subtítulo discreto */}
      <div
        className={`absolute bottom-[20%] text-[10px] sm:text-xs tracking-[0.5em] text-white/40 font-semibold transition-opacity duration-700 ${
          phase === "hold" ? "opacity-100" : "opacity-0"
        }`}
      >
        APRESENTA
      </div>

      {/* Hint para pular */}
      <div className="absolute bottom-6 right-6 text-[10px] text-white/30 font-medium pointer-events-none">
        toque para pular
      </div>
    </div>
  );
};

export default IntroVignette;
