import { useEffect, useState } from "react";

/**
 * Detecta o tipo de conexão do usuário usando a Network Information API.
 * Usado para ativar o "Modo SAT" — buffer maior + qualidade reduzida — em
 * canais via satélite quando o usuário não está em Wi-Fi.
 *
 * Suporte: Chrome/Edge/Android. Safari/Firefox caem no padrão "unknown" (sem otimização extra).
 */

export type NetworkType = "wifi" | "cellular" | "ethernet" | "unknown" | "offline";
export type EffectiveType = "slow-2g" | "2g" | "3g" | "4g" | "unknown";

export interface NetworkProfile {
  /** Tipo físico da conexão (wifi/cellular/...) */
  type: NetworkType;
  /** Velocidade efetiva estimada (slow-2g, 2g, 3g, 4g) */
  effectiveType: EffectiveType;
  /** Banda estimada em Mbps (0 se desconhecido) */
  downlink: number;
  /** Usuário está em rede móvel (sem Wi-Fi)? */
  isMobile: boolean;
  /** Conexão lenta (<= 3g ou downlink < 1.5 Mbps)? */
  isSlow: boolean;
  /** Está online? */
  online: boolean;
  /** Modo economia de dados (Save-Data header)? */
  saveData: boolean;
}

const readProfile = (): NetworkProfile => {
  if (typeof navigator === "undefined") {
    return {
      type: "unknown",
      effectiveType: "unknown",
      downlink: 0,
      isMobile: false,
      isSlow: false,
      online: true,
      saveData: false,
    };
  }

  const online = navigator.onLine;
  // Network Information API (não-padrão, mas amplamente suportada em mobile)
  const conn =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  let type: NetworkType = "unknown";
  let effectiveType: EffectiveType = "unknown";
  let downlink = 0;
  let saveData = false;

  if (conn) {
    const rawType: string = (conn.type || "").toLowerCase();
    if (rawType === "wifi") type = "wifi";
    else if (rawType === "cellular") type = "cellular";
    else if (rawType === "ethernet") type = "ethernet";
    else if (rawType === "none") type = "offline";

    const rawEff: string = (conn.effectiveType || "").toLowerCase();
    if (["slow-2g", "2g", "3g", "4g"].includes(rawEff)) {
      effectiveType = rawEff as EffectiveType;
    }
    downlink = typeof conn.downlink === "number" ? conn.downlink : 0;
    saveData = !!conn.saveData;
  }

  // Heurística: se não temos `type` mas a effectiveType é 2g/3g/slow-2g, é provável cellular.
  if (type === "unknown" && ["slow-2g", "2g", "3g"].includes(effectiveType)) {
    type = "cellular";
  }

  const isMobile = type === "cellular";
  const isSlow =
    saveData ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    effectiveType === "3g" ||
    (downlink > 0 && downlink < 1.5);

  return {
    type,
    effectiveType,
    downlink,
    isMobile,
    isSlow,
    online: online && type !== "offline",
    saveData,
  };
};

export const useNetworkProfile = (): NetworkProfile => {
  const [profile, setProfile] = useState<NetworkProfile>(() => readProfile());

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const update = () => setProfile(readProfile());

    const conn =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    conn?.addEventListener?.("change", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    // Reavalia ao voltar a aba (Android pode trocar Wi-Fi ↔ 4G em background)
    const onVisible = () => { if (document.visibilityState === "visible") update(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      conn?.removeEventListener?.("change", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return profile;
};
