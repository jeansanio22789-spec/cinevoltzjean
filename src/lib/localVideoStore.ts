// Armazena vídeos pesados direto no IndexedDB do navegador.
// Vantagem: "upload" instantâneo (não vai pra nuvem).
// Limite: o vídeo só toca no aparelho que importou.

const DB_NAME = "streamflix_local_videos_v1";
const STORE = "videos";
const DB_VERSION = 1;
export const LOCAL_URL_PREFIX = "local://";

export interface LocalVideoMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  createdAt: number;
}

interface StoredRecord extends LocalVideoMeta {
  blob: Blob;
}

const canUseIdb = () =>
  typeof window !== "undefined" && typeof indexedDB !== "undefined";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!canUseIdb()) {
      reject(new Error("IndexedDB indisponível neste navegador"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txStore = async (mode: IDBTransactionMode) => {
  const db = await openDb();
  const tx = db.transaction(STORE, mode);
  return { db, tx, store: tx.objectStore(STORE) };
};

const waitTx = (tx: IDBTransaction, db: IDBDatabase) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });

const randomId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const saveLocalVideo = async (file: File): Promise<string> => {
  const id = randomId();
  const record: StoredRecord = {
    id,
    name: file.name,
    size: file.size,
    type: file.type || "video/mp4",
    createdAt: Date.now(),
    blob: file,
  };
  const { db, tx, store } = await txStore("readwrite");
  store.put(record);
  await waitTx(tx, db);
  return `${LOCAL_URL_PREFIX}${id}`;
};

export const isLocalVideoUrl = (url: string | null | undefined): boolean =>
  !!url && url.startsWith(LOCAL_URL_PREFIX);

export const parseLocalVideoId = (url: string): string | null => {
  if (!isLocalVideoUrl(url)) return null;
  return url.slice(LOCAL_URL_PREFIX.length);
};

export const getLocalVideoBlob = async (id: string): Promise<Blob | null> => {
  try {
    const { db, store } = await txStore("readonly");
    return await new Promise<Blob | null>((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => {
        db.close();
        const rec = req.result as StoredRecord | undefined;
        resolve(rec?.blob ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
};

export const deleteLocalVideo = async (id: string): Promise<void> => {
  try {
    const { db, tx, store } = await txStore("readwrite");
    store.delete(id);
    await waitTx(tx, db);
  } catch {
    /* ignora */
  }
};

export const listLocalVideos = async (): Promise<LocalVideoMeta[]> => {
  try {
    const { db, store } = await txStore("readonly");
    return await new Promise<LocalVideoMeta[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const recs = (req.result as StoredRecord[]) || [];
        resolve(
          recs.map(({ blob: _b, ...meta }) => meta).sort((a, b) => b.createdAt - a.createdAt),
        );
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
};

// Estima espaço usado/disponível pelo navegador (Storage API)
export const getStorageEstimate = async (): Promise<{
  usageMB: number;
  quotaMB: number;
} | null> => {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return {
      usageMB: (est.usage ?? 0) / 1024 / 1024,
      quotaMB: (est.quota ?? 0) / 1024 / 1024,
    };
  } catch {
    return null;
  }
};
