// IndexedDB-based drawing cache — replaces localStorage for large base64 images
// localStorage has ~5MB limit; IndexedDB has virtually unlimited storage

const DB_NAME = 'neevv-drawings';
const DB_VERSION = 1;
const STORE_NAME = 'drawings';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedDrawing(key: string): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB read failed, falling back:', e);
    // Fallback to localStorage for backward compat
    try { return localStorage.getItem(key); } catch { return null; }
  }
}

export async function setCachedDrawing(key: string, value: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB write failed:', e);
    // Best-effort localStorage fallback
    try { localStorage.setItem(key, value); } catch { /* quota exceeded — silently skip */ }
  }
}

export async function removeCachedDrawing(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB delete failed:', e);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

export async function clearCachedDrawings(prefix: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB clear failed:', e);
  }
}

export async function getAllCachedDrawings(prefix: string): Promise<Record<string, string>> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const result: Record<string, string> = {};
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
            result[cursor.key] = cursor.value;
          }
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB getAll failed:', e);
    return {};
  }
}

// Migrate existing localStorage drawings to IndexedDB (one-time)
export async function migrateFromLocalStorage(prefix: string): Promise<void> {
  try {
    const keysToMigrate: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToMigrate.push(key);
      }
    }
    if (keysToMigrate.length === 0) return;
    
    for (const key of keysToMigrate) {
      const value = localStorage.getItem(key);
      if (value) {
        await setCachedDrawing(key, value);
        localStorage.removeItem(key); // Free up localStorage space
      }
    }
    console.log(`Migrated ${keysToMigrate.length} drawings from localStorage to IndexedDB`);
  } catch (e) {
    console.warn('Migration from localStorage failed:', e);
  }
}
