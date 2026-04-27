// Leitura de crachá NFC no Android.
// - No app nativo (Capacitor) usa o plugin @exxili/capacitor-nfc.
// - No navegador (Chrome Android) usa a Web NFC API quando disponível.
// Retorna o UID do crachá em string (hex sem separador) ou lança erro.

import { Capacitor } from "@capacitor/core";

export type NfcStopHandle = () => Promise<void> | void;

export interface NfcSession {
  /** Promise que resolve com o UID quando uma tag for lida. */
  uid: Promise<string>;
  /** Para cancelar a leitura antes da tag chegar. */
  cancel: NfcStopHandle;
}

const bytesToHex = (bytes: ArrayBuffer | number[] | Uint8Array): string => {
  const arr =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

export const isNfcSupported = async (): Promise<boolean> => {
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === "android";
  return typeof (globalThis as any).NDEFReader !== "undefined";
};

/** Inicia uma leitura única. Resolve no primeiro crachá detectado. */
export const readNfcOnce = (): NfcSession => {
  if (Capacitor.isNativePlatform()) {
    return readNative();
  }
  return readWeb();
};

const readNative = (): NfcSession => {
  let cancelled = false;
  let removeListener: (() => void) | null = null;
  const uid = new Promise<string>(async (resolve, reject) => {
    try {
      const mod = await import("@exxili/capacitor-nfc");
      const NFC: any = (mod as any).NFC ?? (mod as any).Nfc ?? (mod as any).default;
      if (!NFC) throw new Error("Plugin NFC indisponível");
      const handler = (event: any) => {
        if (cancelled) return;
        // O plugin entrega { messages: [{ records: [...] }], serialNumber? }.
        const serial: string | undefined =
          event?.serialNumber || event?.id || event?.tagId;
        let value = "";
        if (serial) {
          value = String(serial).replace(/[^0-9a-fA-F]/g, "").toUpperCase();
        }
        if (!value && event?.messages?.[0]?.records?.[0]?.payload) {
          value = bytesToHex(event.messages[0].records[0].payload);
        }
        if (!value) {
          reject(new Error("Crachá lido, mas sem identificador"));
          return;
        }
        resolve(value);
      };
      const listener = await NFC.addListener("nfcTag", handler);
      removeListener = () => listener?.remove?.();
      await NFC.startScan?.();
    } catch (err: any) {
      reject(err);
    }
  });
  return {
    uid,
    cancel: async () => {
      cancelled = true;
      try {
        const mod = await import("@exxili/capacitor-nfc");
        const NFC: any = (mod as any).NFC ?? (mod as any).Nfc ?? (mod as any).default;
        await NFC?.stopScan?.();
      } catch { /* ignore */ }
      removeListener?.();
    },
  };
};

const readWeb = (): NfcSession => {
  const ctrl = new AbortController();
  const uid = new Promise<string>(async (resolve, reject) => {
    try {
      const Reader = (globalThis as any).NDEFReader;
      if (!Reader) {
        reject(new Error("Este aparelho/navegador não suporta NFC."));
        return;
      }
      const reader = new Reader();
      await reader.scan({ signal: ctrl.signal });
      reader.onreading = (event: any) => {
        const id: string | undefined = event?.serialNumber;
        if (!id) {
          reject(new Error("Crachá lido, mas sem identificador"));
          return;
        }
        resolve(id.replace(/[^0-9a-fA-F]/g, "").toUpperCase());
      };
      reader.onreadingerror = () => reject(new Error("Falha ao ler o crachá"));
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      reject(err);
    }
  });
  return { uid, cancel: () => ctrl.abort() };
};
