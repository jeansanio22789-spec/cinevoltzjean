import type { UploadStatus } from "@/hooks/useUploadQueue";

const DB_NAME = "streamflix_upload_queue_v1";
const STORE_NAME = "jobs";
const DB_VERSION = 1;

export interface PersistedUploadJob {
  id: string;
  file: File;
  thumbnail?: File | null;
  meta: {
    title: string;
    genre: string;
    description: string;
  };
  status: UploadStatus;
  progress: number;
  speedMBs: number;
  etaSec: number;
  errorMsg?: string;
  startedAt?: number;
  timedOut: boolean;
  /** Caminho do arquivo no Storage — persistido para retomar com TUS. */
  uploadPath?: string;
}

const canUseIndexedDb = () =>
  typeof window !== "undefined" && typeof indexedDB !== "undefined";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB indisponível"));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txStore = async (mode: IDBTransactionMode) => {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, mode);
  return { db, tx, store: tx.objectStore(STORE_NAME) };
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

export const loadPersistedUploadJobs = async (): Promise<PersistedUploadJob[]> => {
  try {
    const { db, store } = await txStore("readonly");
    return await new Promise<PersistedUploadJob[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as PersistedUploadJob[]) || []);
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

export const persistUploadJob = async (job: PersistedUploadJob) => {
  try {
    const { db, tx, store } = await txStore("readwrite");
    store.put(job);
    await waitTx(tx, db);
  } catch {
    // Sem persistência: o upload em memória continua.
  }
};

export const deletePersistedUploadJob = async (id: string) => {
  try {
    const { db, tx, store } = await txStore("readwrite");
    store.delete(id);
    await waitTx(tx, db);
  } catch {
    // ignora
  }
};

export const deletePersistedUploadJobs = async (ids: string[]) => {
  try {
    const { db, tx, store } = await txStore("readwrite");
    ids.forEach((id) => store.delete(id));
    await waitTx(tx, db);
  } catch {
    // ignora
  }
};
