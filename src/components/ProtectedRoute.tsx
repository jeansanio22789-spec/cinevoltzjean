import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useEffect, useState } from "react";
import { Fingerprint, ShieldCheck, Loader2, AlertTriangle, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const {
    isAuthenticated,
    isEnrolled,
    isAvailable,
    authenticate,
    enroll,
    checkAvailability,
    loading: bioLoading,
  } = useBiometricAuth();
  const [checked, setChecked] = useState(false);
  const [deviceState, setDeviceState] = useState<"checking" | "authorized" | "locked" | "needs_register">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && isAdmin && !checked) {
      checkAvailability().then(() => setChecked(true));
    }
  }, [user, isAdmin, checked, checkAvailability]);

  // Verificar autorização do dispositivo
  useEffect(() => {
    if (!user || !isAdmin) return;
    const deviceId = getDeviceId();
    supabase.rpc("is_device_authorized", { _device_id: deviceId }).then(({ data }) => {
      if (data === true) setDeviceState("authorized");
      else setDeviceState("needs_register");
    });
  }, [user, isAdmin]);

  if (authLoading || roleLoading || !checked || deviceState === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Dispositivo bloqueado — outro celular já é o dono
  if (deviceState === "locked") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-destructive" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-bold">Dispositivo não autorizado</h2>
          <p className="text-sm text-muted-foreground">
            O painel administrativo está travado em outro celular. Acesse pelo seu aparelho principal
            ou autorize este dispositivo a partir dele em <b>Configurações → Dispositivos</b>.
          </p>
        </div>
        <button onClick={async () => { await signOut(); }} className="text-xs text-muted-foreground underline">
          Sair da conta
        </button>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-bold">Biometria indisponível</h2>
          <p className="text-sm text-muted-foreground">
            Este dispositivo não tem digital configurada. Configure a digital do aparelho (ou Touch ID /
            Windows Hello) e tente novamente.
          </p>
        </div>
      </div>
    );
  }

  // Precisa registrar este device como o "device do admin"
  if (deviceState === "needs_register" || !isEnrolled) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Fingerprint className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <h2 className="text-xl font-bold">Cadastrar este aparelho</h2>
          <p className="text-sm text-muted-foreground">
            Sua digital ficará vinculada SOMENTE a este celular. Outros aparelhos serão bloqueados
            automaticamente.
          </p>
        </div>
        {error && <p className="text-destructive text-xs font-medium text-center max-w-sm">{error}</p>}
        <button
          onClick={async () => {
            setError(null);
            // 1. Tenta registrar o device no servidor
            const deviceId = getDeviceId();
            const { data, error: rpcErr } = await supabase.rpc("register_admin_device", {
              _device_id: deviceId,
              _label: getDeviceLabel(),
              _ua: navigator.userAgent,
            });
            if (rpcErr) {
              setError("Erro ao registrar dispositivo.");
              return;
            }
            const result = data as { ok: boolean; reason?: string };
            if (!result.ok) {
              if (result.reason === "device_locked") {
                setError("Outro aparelho já é o dono. Acesse pelo celular original para autorizar este.");
                setDeviceState("locked");
              } else {
                setError("Não autorizado.");
              }
              return;
            }
            // 2. Cadastra biometria local
            const ok = await enroll(user.id, user.email || "admin");
            if (!ok) {
              setError("Não foi possível cadastrar a digital. Tente novamente.");
              return;
            }
            setDeviceState("authorized");
          }}
          disabled={bioLoading}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Fingerprint className="w-5 h-5" />
          {bioLoading ? "Aguardando digital..." : "Cadastrar este aparelho"}
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Fingerprint className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <h2 className="text-xl font-bold">Confirme sua digital</h2>
          <p className="text-sm text-muted-foreground">
            Toque o sensor de digital para liberar o painel administrativo.
          </p>
        </div>
        {error && <p className="text-destructive text-xs font-medium">{error}</p>}
        <button
          onClick={async () => {
            setError(null);
            const ok = await authenticate();
            if (!ok) setError("Digital não reconhecida. Tente novamente.");
          }}
          disabled={bioLoading}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <ShieldCheck className="w-5 h-5" />
          {bioLoading ? "Verificando..." : "Autenticar com digital"}
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
