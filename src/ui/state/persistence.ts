/**
 * Keeps the library's SQLite file in the browser's IndexedDB between visits.
 * Storage can be unavailable (private windows, blocked site data), so every
 * call fails soft: the app keeps working, it just won't remember.
 */

const DB_NAME = 'kutup';
const STORE = 'saves';
const KEY = 'library.sqlite';
/** Some browsers leave an IndexedDB request hanging instead of failing; don't wait forever. */
const TIMEOUT_MS = 2000;

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const work = (async () => {
    const db = await openStore();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  })();
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IndexedDB timed out')), TIMEOUT_MS));
  return Promise.race([work, timeout]);
}

export async function loadSavedLibrary(): Promise<Uint8Array | null> {
  try {
    const value = await withStore<unknown>('readonly', (s) => s.get(KEY));
    return value instanceof Uint8Array ? value : null;
  } catch {
    return null;
  }
}

export async function saveLibrary(bytes: Uint8Array): Promise<boolean> {
  try {
    await withStore('readwrite', (s) => s.put(bytes, KEY));
    return true;
  } catch {
    return false;
  }
}

export async function forgetSavedLibrary(): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete(KEY));
  } catch {
    // Nothing stored, or storage unavailable: either way there is nothing to forget.
  }
}

/** Offers the bytes to the user as a file download. */
export function downloadFile(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.sqlite3' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
