import { Sparkles, RefreshCw, X } from "lucide-react";
import { useAppVersionAlert } from "@/hooks/useAppVersionAlert";

/**
 * Faixa fixa no topo avisando quando o admin publicou uma nova versão.
 * Aparece apenas quando a versão salva em platform_settings.app_version
 * é diferente da última que este dispositivo viu/aceitou.
 */
const AppUpdateBanner = () => {
  const { info, applyUpdate, dismiss } = useAppVersionAlert();

  if (!info?.hasUpdate) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg animate-fade-in">
      <div className="max-w-6xl mx-auto px-3 py-2 flex items-center gap-2 md:gap-3">
        <Sparkles className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs md:text-sm font-bold leading-tight truncate">
            Nova versão disponível ({info.version})
          </p>
          {info.message && (
            <p className="text-[11px] md:text-xs opacity-90 truncate">
              {info.message}
            </p>
          )}
        </div>
        <button
          onClick={applyUpdate}
          className="flex items-center gap-1.5 bg-background text-foreground px-3 py-1.5 rounded-full text-xs md:text-sm font-bold hover:bg-background/90 transition-colors shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>
        <button
          onClick={dismiss}
          aria-label="Dispensar"
          className="p-1.5 rounded-full hover:bg-background/20 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default AppUpdateBanner;
