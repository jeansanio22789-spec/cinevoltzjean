import { useState, useCallback, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

// Dynamic import to avoid errors on web
let NativeBiometric: any = null;

if (Capacitor.isNativePlatform()) {
  import("@capgo/capacitor-native-biometric").then((mod) => {
    NativeBiometric = mod.NativeBiometric;
  });
}

const CRED_KEY = "biometric_credential_id";
const ENROLLED_KEY = "biometric_enrolled";

// ---------- WebAuthn helpers (browser fingerprint / Touch ID / Windows Hello) ----------
const b64ToBuf = (b64: string) => {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
};
const bufToB64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const webAuthnAvailable = async () => {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

const webAuthnEnroll = async (userId: string, userName: string) => {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBuf = new TextEncoder().encode(userId);
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "StreamFlix Admin", id: window.location.hostname },
      user: { id: userIdBuf, name: userName, displayName: userName },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Falha ao criar credencial biométrica");
  const id = bufToB64(cred.rawId);
  localStorage.setItem(CRED_KEY, id);
  localStorage.setItem(ENROLLED_KEY, "1");
  return id;
};

const webAuthnVerify = async () => {
  const id = localStorage.getItem(CRED_KEY);
  if (!id) throw new Error("Nenhuma digital cadastrada");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      timeout: 60000,
      userVerification: "required",
      allowCredentials: [{ id: b64ToBuf(id), type: "public-key" }],
      rpId: window.location.hostname,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("Verificação biométrica cancelada");
  return true;
};

export const useBiometricAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    setIsEnrolled(localStorage.getItem(ENROLLED_KEY) === "1");
  }, []);

  const checkAvailability = useCallback(async () => {
    if (isNative && NativeBiometric) {
      try {
        const result = await NativeBiometric.isAvailable();
        setIsAvailable(result.isAvailable);
        return result.isAvailable;
      } catch {
        setIsAvailable(false);
        return false;
      }
    }
    const ok = await webAuthnAvailable();
    setIsAvailable(ok);
    return ok;
  }, [isNative]);

  const enroll = useCallback(async (userId: string, userName: string) => {
    setLoading(true);
    try {
      if (isNative && NativeBiometric) {
        // No nativo, basta verificar uma vez para "registrar" a digital local
        await NativeBiometric.verifyIdentity({
          reason: "Cadastre sua digital para liberar o acesso ao painel",
          title: "Cadastrar Digital",
          subtitle: "StreamFlix Admin",
          description: "Toque o sensor de digital para confirmar",
        });
        localStorage.setItem(ENROLLED_KEY, "1");
      } else {
        await webAuthnEnroll(userId, userName);
      }
      setIsEnrolled(true);
      setIsAuthenticated(true);
      return true;
    } catch (e) {
      return false;
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  const authenticate = useCallback(async () => {
    setLoading(true);
    try {
      if (isNative && NativeBiometric) {
        await NativeBiometric.verifyIdentity({
          reason: "Confirme sua identidade para acessar o painel admin",
          title: "Autenticação Biométrica",
          subtitle: "StreamFlix Admin",
          description: "Use sua digital para continuar",
        });
      } else {
        await webAuthnVerify();
      }
      setIsAuthenticated(true);
      return true;
    } catch {
      setIsAuthenticated(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  const reset = useCallback(() => {
    localStorage.removeItem(CRED_KEY);
    localStorage.removeItem(ENROLLED_KEY);
    setIsEnrolled(false);
    setIsAuthenticated(false);
  }, []);

  return {
    isAuthenticated,
    isAvailable,
    isEnrolled,
    isNative,
    loading,
    checkAvailability,
    authenticate,
    enroll,
    reset,
  };
};
