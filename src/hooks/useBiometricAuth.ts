import { useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

// Dynamic import to avoid errors on web
let NativeBiometric: any = null;
let BiometryType: any = null;

if (Capacitor.isNativePlatform()) {
  import("@capgo/capacitor-native-biometric").then((mod) => {
    NativeBiometric = mod.NativeBiometric;
    BiometryType = mod.BiometryType;
  });
}

export const useBiometricAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  const checkAvailability = useCallback(async () => {
    if (!isNative || !NativeBiometric) {
      // On web, skip biometric — already authenticated via email
      setIsAuthenticated(true);
      return false;
    }

    try {
      const result = await NativeBiometric.isAvailable();
      setIsAvailable(result.isAvailable);
      return result.isAvailable;
    } catch {
      setIsAvailable(false);
      return false;
    }
  }, [isNative]);

  const authenticate = useCallback(async () => {
    if (!isNative || !NativeBiometric) {
      setIsAuthenticated(true);
      return true;
    }

    setLoading(true);
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Confirme sua identidade para acessar o painel admin",
        title: "Autenticação Biométrica",
        subtitle: "StreamFlix Admin",
        description: "Use sua biometria para continuar",
      });
      setIsAuthenticated(true);
      setLoading(false);
      return true;
    } catch {
      setIsAuthenticated(false);
      setLoading(false);
      return false;
    }
  }, [isNative]);

  return {
    isAuthenticated,
    isAvailable,
    isNative,
    loading,
    checkAvailability,
    authenticate,
  };
};
