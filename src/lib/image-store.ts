/**
 * Stockage des images d'archives dans IndexedDB.
 *
 * Le localStorage est limité à ~5 Mo par site : une ou deux photos suffisaient à le saturer, l'écriture
 * échouait silencieusement et les photos disparaissaient au rechargement (nouvelle version, F5…).
 * IndexedDB accepte des centaines de Mo et survit aux mises à jour de l'application.
 * Les images sont indexées par identifiant d'archive (identifiants uniques entre arbres).
 */

const DB_NAME = 'genealogor_images';
const STORE = 'images';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function isImageStoreAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (!isImageStoreAvailable()) return Promise.reject(new Error('IndexedDB indisponible'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Base d\'images bloquée par un autre onglet'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(db => new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
  }));
}

export async function putImages(entries: Array<{ id: string; data: string }>): Promise<void> {
  if (entries.length === 0) return;
  await run('readwrite', store => {
    for (const { id, data } of entries) store.put(data, id);
  });
}

export async function getImages(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (ids.length === 0) return result;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        if (typeof req.result === 'string') result.set(id, req.result);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return result;
}

export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await run('readwrite', store => {
    for (const id of ids) store.delete(id);
  });
}

/** Demande au navigateur de ne pas évincer ce stockage en cas de manque d'espace (sans effet si refusé) */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
