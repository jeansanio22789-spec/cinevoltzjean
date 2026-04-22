import { forwardRef, useEffect, useState } from "react";
import { Clock, Signal } from "lucide-react";

/** Detecta a qualidade da conexão do usuário (1 a 4 barras). */
const useConnectionQuality = () => {
  const [quality, setQuality] = useState<{ bars: 1 | 2 | 3 | 4; label: string }>({
    bars: 4,
    label: "ótima",
  });

  useEffect(() => {
    const conn: any =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    const compute = () => {
      // Sem internet: zera as barras
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setQuality((prev) =>
          prev.bars === 1 && prev.label === "offline" ? prev : { bars: 1, label: "offline" }
        );
        return;
      }

      let bars: 1 | 2 | 3 | 4 = 4;
      let label = "ótima";

      if (conn) {
        const eff: string = conn.effectiveType || "4g";
        const downlink: number = typeof conn.downlink === "number" ? conn.downlink : 10;
        if (eff === "slow-2g" || downlink < 0.5) {
          bars = 1;
          label = "ruim";
        } else if (eff === "2g" || downlink < 1.5) {
          bars = 2;
          label = "fraca";
        } else if (eff === "3g" || downlink < 5) {
          bars = 3;
          label = "boa";
        } else {
          bars = 4;
          label = "ótima";
        }
      }

      // Só atualiza se algo mudou (evita re-render desnecessário)
      setQuality((prev) => (prev.bars === bars && prev.label === label ? prev : { bars, label }));
    };

    compute();

    // 1) Evento nativo do Network Information API
    conn?.addEventListener?.("change", compute);

    // 2) Online/offline do navegador
    window.addEventListener("online", compute);
    window.addEventListener("offline", compute);

    // 3) Recalcula ao voltar para a aba
    const onVisibility = () => {
      if (document.visibilityState === "visible") compute();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // 4) Polling de fallback (alguns navegadores não disparam "change")
    const pollId = window.setInterval(compute, 4000);

    return () => {
      conn?.removeEventListener?.("change", compute);
      window.removeEventListener("online", compute);
      window.removeEventListener("offline", compute);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(pollId);
    };
  }, []);

  return quality;
};

interface Props {
  /** tamanho compacto (default) ou ainda menor (mini) */
  size?: "sm" | "mini";
}

/** Relógio ao vivo + indicador de qualidade do sinal, bem compacto. */
const LiveClockSignal = forwardRef<HTMLDivElement, Props>(({ size = "sm" }, ref) => {
  const [now, setNow] = useState(() => new Date());
  const { bars, label } = useConnectionQuality();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const color =
    bars === 4
      ? "text-emerald-400"
      : bars === 3
      ? "text-lime-400"
      : bars === 2
      ? "text-amber-400"
      : "text-destructive";

  const padding = size === "mini" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  const iconSize = size === "mini" ? "w-2.5 h-2.5" : "w-3 h-3";

  return (
    <div ref={ref} className="flex items-center gap-1">
      <span
        className={`flex items-center gap-1 ${padding} rounded-full bg-card border border-border text-foreground font-bold tabular-nums`}
        title="Hora ao vivo"
      >
        <Clock className={`${iconSize} text-accent`} />
        {time}
      </span>
      <span
        className={`flex items-center gap-0.5 ${padding} rounded-full bg-card border border-border ${color} font-bold`}
        title={`Qualidade do sinal: ${label}`}
        aria-label={`Qualidade do sinal: ${label}`}
      >
        <Signal className={iconSize} />
        <span className="flex items-end gap-[1px] h-2.5">
          {[1, 2, 3, 4].map((b) => (
            <span
              key={b}
              className={`w-[2px] rounded-sm ${b <= bars ? "bg-current" : "bg-current/25"}`}
              style={{ height: `${b * 25}%` }}
            />
          ))}
        </span>
      </span>
    </div>
  );
});

LiveClockSignal.displayName = "LiveClockSignal";

export default LiveClockSignal;
