import { Activity, X } from "lucide-react";

export interface LivePlayerStats {
  /** "hls.js" | "native" | "iframe" | "idle" */
  engine: "hls.js" | "native" | "iframe" | "idle";
  /** Estado do <video> */
  readyState: number;
  networkState: number;
  paused: boolean;
  currentTime: number;
  bufferAhead: number;       // segundos à frente
  buffered: number;          // segundos totais bufferizados (último range)
  /** HLS.js específico (quando aplicável) */
  bandwidth: number;         // bps estimados
  currentLevel: number;      // -1 se auto
  autoLevelCap: number;
  levelHeight: number | null;
  levelBitrate: number | null;
  liveLatency: number | null;
  droppedFrames: number;
  /** Última falha conhecida */
  lastError: string | null;
  lastErrorAt: number | null;
  errorCount: number;
  /** Origem detectada */
  signalKind: string;
  signalLabel: string;
  /** URL ativa (pode ser fallback) */
  activeSrc: string;
  usingFallback: boolean;
}

interface Props {
  stats: LivePlayerStats | null;
  onClose: () => void;
}

const fmtBitrate = (bps: number) => {
  if (!bps || bps <= 0) return "—";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
};

const fmtSec = (s: number | null) => {
  if (s === null || Number.isNaN(s)) return "—";
  return `${s.toFixed(2)}s`;
};

const Row = ({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) => (
  <div className="flex items-baseline justify-between gap-3 py-1 border-b border-border/40 last:border-b-0">
    <dt className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</dt>
    <dd
      className={`font-mono text-[11px] truncate text-right ${
        tone === "bad"
          ? "text-destructive"
          : tone === "warn"
          ? "text-amber-500"
          : tone === "ok"
          ? "text-emerald-500"
          : "text-foreground"
      }`}
      title={value}
    >
      {value}
    </dd>
  </div>
);

const LiveDiagnostics = ({ stats, onClose }: Props) => {
  if (!stats) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 mt-3 text-sm text-muted-foreground">
        Aguardando dados do player…
      </div>
    );
  }

  const bufferTone: "ok" | "warn" | "bad" =
    stats.bufferAhead > 8 ? "ok" : stats.bufferAhead > 2 ? "warn" : "bad";
  const latencyTone: "ok" | "warn" | "bad" | undefined =
    stats.liveLatency === null
      ? undefined
      : stats.liveLatency < 6
      ? "ok"
      : stats.liveLatency < 15
      ? "warn"
      : "bad";
  const errorTone: "ok" | "warn" | "bad" =
    stats.errorCount === 0 ? "ok" : stats.errorCount < 3 ? "warn" : "bad";

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-card/80 backdrop-blur-sm p-4 animate-in fade-in slide-in-from-top-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Activity className="w-4 h-4 text-primary" /> Diagnóstico do player
          <span className="text-[10px] font-normal text-muted-foreground">
            (atualiza a cada 1s)
          </span>
        </h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Fechar diagnóstico"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1">
        {/* Coluna 1 — Engine / origem */}
        <dl>
          <Row label="Engine" value={stats.engine.toUpperCase()} />
          <Row label="Origem" value={`${stats.signalLabel} (${stats.signalKind})`} />
          <Row
            label="Fallback"
            value={stats.usingFallback ? "SIM" : "não"}
            tone={stats.usingFallback ? "warn" : undefined}
          />
          <Row
            label="readyState"
            value={String(stats.readyState)}
            tone={stats.readyState >= 3 ? "ok" : stats.readyState >= 2 ? "warn" : "bad"}
          />
          <Row
            label="networkState"
            value={String(stats.networkState)}
            tone={stats.networkState === 2 ? "ok" : stats.networkState === 3 ? "bad" : undefined}
          />
          <Row
            label="Estado"
            value={stats.paused ? "PAUSADO" : "TOCANDO"}
            tone={stats.paused ? "warn" : "ok"}
          />
        </dl>

        {/* Coluna 2 — Buffer / qualidade */}
        <dl>
          <Row label="Buffer à frente" value={fmtSec(stats.bufferAhead)} tone={bufferTone} />
          <Row label="Buffer total" value={fmtSec(stats.buffered)} />
          <Row label="currentTime" value={fmtSec(stats.currentTime)} />
          <Row label="Latência live" value={fmtSec(stats.liveLatency)} tone={latencyTone} />
          <Row
            label="Qualidade"
            value={
              stats.levelHeight
                ? `${stats.levelHeight}p${stats.currentLevel === -1 ? " (auto)" : ""}`
                : stats.currentLevel === -1
                ? "auto"
                : String(stats.currentLevel)
            }
          />
          <Row label="Bitrate nível" value={fmtBitrate(stats.levelBitrate || 0)} />
        </dl>

        {/* Coluna 3 — Rede / erros */}
        <dl>
          <Row label="Banda estimada" value={fmtBitrate(stats.bandwidth)} />
          <Row label="Cap auto" value={stats.autoLevelCap < 0 ? "—" : String(stats.autoLevelCap)} />
          <Row
            label="Frames perdidos"
            value={String(stats.droppedFrames)}
            tone={stats.droppedFrames === 0 ? "ok" : stats.droppedFrames < 50 ? "warn" : "bad"}
          />
          <Row label="Erros" value={String(stats.errorCount)} tone={errorTone} />
          <Row
            label="Último erro"
            value={stats.lastError || "—"}
            tone={stats.lastError ? "bad" : undefined}
          />
          <Row
            label="Quando"
            value={
              stats.lastErrorAt
                ? new Date(stats.lastErrorAt).toLocaleTimeString("pt-BR")
                : "—"
            }
          />
        </dl>
      </div>

      <div className="mt-3 pt-3 border-t border-border/40">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          URL ativa
        </p>
        <p className="font-mono text-[10px] text-foreground/80 break-all">{stats.activeSrc}</p>
      </div>
    </div>
  );
};

export default LiveDiagnostics;
