import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useEffect, useState } from "react";
import { Fingerprint, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && isAdmin && !checked) {
      checkAvailability().then(() => setChecked(true));
    }
  }, [user, isAdmin, checked, checkAvailability]);

  if (authLoading || roleLoading || !checked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Dispositivo não suporta biometria → bloqueia
  if (!isAvailable) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-bold">Biometria indisponível</h2>
          <p className="text-sm text-muted-foreground">
            Este dispositivo não tem digital configurada. Acesse pelo seu celular com digital cadastrada
            no sistema (ou ative o Touch ID / Windows Hello no navegador).
          </p>
        </div>
      </div>
    );
  }

  // Primeiro acesso → cadastrar digital
  if (!isEnrolled) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Fingerprint className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <h2 className="text-xl font-bold">Cadastrar Digital</h2>
          <p className="text-sm text-muted-foreground">
            Para sua segurança, cadastre sua digital neste dispositivo. Ela ficará vinculada ao seu acesso
            de admin.
          </p>
        </div>
        {error && <p className="text-destructive text-xs font-medium">{error}</p>}
        <button
          onClick={async () => {
            setError(null);
            const ok = await enroll(user.id, user.email || "admin");
            if (!ok) setError("Não foi possível cadastrar. Tente novamente.");
          }}
          disabled={bioLoading}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Fingerprint className="w-5 h-5" />
          {bioLoading ? "Aguardando digital..." : "Cadastrar minha digital"}
        </button>
      </div>
    );
  }

  // Já cadastrado → pedir digital
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
