import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useEffect, useState } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";

const ADMIN_EMAIL = "jeansanio22789@gmail.com";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { isAuthenticated, isNative, authenticate, checkAvailability, loading: bioLoading } = useBiometricAuth();
  const [bioChecked, setBioChecked] = useState(false);

  useEffect(() => {
    if (user && user.email === ADMIN_EMAIL && !bioChecked) {
      checkAvailability().then((available) => {
        if (available) {
          authenticate().then(() => setBioChecked(true));
        } else {
          setBioChecked(true);
        }
      });
    }
  }, [user, bioChecked, checkAvailability, authenticate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  if (!user || user.email !== ADMIN_EMAIL) {
    return <Navigate to="/" replace />;
  }

  if (isNative && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Fingerprint className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">Autenticação Biométrica</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Use sua biometria para acessar o painel administrativo
          </p>
        </div>
        <button
          onClick={() => authenticate()}
          disabled={bioLoading}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <ShieldCheck className="w-5 h-5" />
          {bioLoading ? "Verificando..." : "Autenticar"}
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
