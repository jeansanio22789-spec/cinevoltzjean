// Sistema de rascunhos de vídeos persistidos no IndexedDB.
// Permite que o admin selecione vídeo+capa+metadados, salve como rascunho,
// e dispare o upload quando quiser — sem perder nada se fechar a aba.

const DB_NAME = "streamflix_video_drafts_v1";
const STORE_NAME = "drafts";
const DB_VERSION = 1;

export interface VideoDraft {
  id: string;
  /** Lista de vídeos do mesmo lote (todos compartilham capa+metadados) */
  files: File[];
  thumbnail?: File | null;
  meta: {
    title: string;
    genre: string;
    description: string;
  };
  createdAt: number;
  updatedAt: number;
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

export const loadDrafts = async (): Promise<VideoDraft[]> => {
  try {
    const { db, store } = await txStore("readonly");
    return await new Promise<VideoDraft[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const list = (req.result as VideoDraft[]) || [];
        // Ordena do mais recente pro mais antigo
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
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

export const saveDraft = async (draft: VideoDraft) => {
  try {
    const { db, tx, store } = await txStore("readwrite");
    store.put(draft);
    await waitTx(tx, db);
  } catch {
    // ignora
  }
};

export const deleteDraft = async (id: string) => {
  try {
    const { db, tx, store } = await txStore("readwrite");
    store.delete(id);
    await waitTx(tx, db);
  } catch {
    // ignora
  }
};

export const newDraftId = () =>
  `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
