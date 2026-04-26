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
      master.gain.value = 1.0;
      // Compressor para ficar mais "punchy" (estilo Netflix)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      // Reverb curto pra dar "sala grande"
      const convolver = ctx.createConvolver();
      const sr = ctx.sampleRate;
      const irLen = Math.floor(sr * 1.6);
      const ir = ctx.createBuffer(2, irLen, sr);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          // decaimento exponencial com ruído colorido
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
        }
      }
      convolver.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.18;
      const dry = ctx.createGain();
      dry.gain.value = 1.0;
      master.connect(comp);
      comp.connect(dry).connect(ctx.destination);
      comp.connect(convolver).connect(wet).connect(ctx.destination);

      const t0 = ctx.currentTime + 0.15;

      // 🥁 Thump percussivo (membrana grave): dá o "soco" característico
      const playThump = (start: number, gain: number) => {
        // Camada 1: senoide grave com pitch envelope
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(180, t0 + start);
        osc.frequency.exponentialRampToValueAtTime(38, t0 + start + 0.18);
        g.gain.setValueAtTime(0, t0 + start);
        g.gain.linearRampToValueAtTime(gain, t0 + start + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 0.55);
        osc.connect(g).connect(master);
        osc.start(t0 + start);
        osc.stop(t0 + start + 0.6);

        // Camada 2: ruído curto pra simular a batida da membrana (transiente)
        const noiseLen = Math.floor(ctx.sampleRate * 0.08);
        const buf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLen, 2);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 700;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0, t0 + start);
        ng.gain.linearRampToValueAtTime(gain * 0.5, t0 + start + 0.002);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 0.12);
        src.connect(lp).connect(ng).connect(master);
        src.start(t0 + start);
        src.stop(t0 + start + 0.15);
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

      // 🎵 "TU" — batida curta e punchy
      playThump(0, 0.85);
      playLayer("sine", 130, 65, 0, 0.32, 0.55);
      playLayer("triangle", 200, 95, 0, 0.28, 0.28);
      playLayer("sine", 50, 38, 0, 0.38, 0.45); // sub-bass

      // 🎵 "DUM" — batida mais grave, mais longa e com cauda reverberada
      playThump(0.38, 1.0);
      playLayer("sine", 100, 45, 0.38, 1.1, 0.9);
      playLayer("triangle", 150, 70, 0.38, 0.95, 0.35);
      playLayer("sine", 42, 30, 0.38, 1.3, 0.7); // sub-bass profundo
      playLayer("sawtooth", 75, 35, 0.38, 0.55, 0.12); // grão/textura
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
