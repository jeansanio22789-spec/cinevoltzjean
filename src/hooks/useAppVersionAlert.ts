import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SEEN_KEY = "app_version_seen";
const DISMISSED_KEY = "app_version_dismissed";

export interface AppVersionInfo {
  /** Versão publicada no servidor (ex.: "1.4.2"). */
  version: string;
  /** Mensagem opcional do admin. */
  message: string;
  /** True se a versão do servidor é diferente da última que o usuário viu/aceitou. */
  hasUpdate: boolean;
}

/**
 * Lê `app_version` e `app_update_message` em platform_settings e compara com
 * a versão que este dispositivo viu por último. Quando o admin publica uma
 * nova versão (muda o valor no painel), todos os usuários veem o banner.
 */
export const useAppVersionAlert = () => {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);

  const check = async () => {
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["app_version", "app_update_message"]);

    const map: Record<string, string> = {};
    (data || []).forEach((row: { key: string; value: string | null }) => {
      map[row.key] = row.value || "";
    });

    const version = (map["app_version"] || "").trim();
    if (!version) {
      setInfo(null);
      return;
    }

    const seen = localStorage.getItem(SEEN_KEY);
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    const localBuild = (typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "").trim();

    // Compara com o que o cliente já viu E com o build local deste dispositivo.
    // Se a versão publicada é diferente do build atual, há atualização disponível.
    const differsFromSeen = seen ? seen !== version : true;
    const differsFromLocal = localBuild ? localBuild !== version : false;
    const notDismissed = dismissed !== version;

    const hasUpdate = (differsFromSeen || differsFromLocal) && notDismissed;

    setInfo({
      version,
      message: map["app_update_message"] || "",
      hasUpdate,
    });
  };

  useEffect(() => {
    void check();
    // Revalida quando volta foco / a cada 5 min
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, []);

  /** Recarrega o app forçando bypass de cache. */
  const applyUpdate = () => {
    if (info) localStorage.setItem(SEEN_KEY, info.version);
    // Limpa caches do service worker pra garantir bundle novo
    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
    window.location.reload();
  };

  /** Esconde até a próxima publicação (não força recarregar). */
  const dismiss = () => {
    if (info) {
      localStorage.setItem(DISMISSED_KEY, info.version);
      setInfo({ ...info, hasUpdate: false });
    }
  };

  return { info, applyUpdate, dismiss };
};
