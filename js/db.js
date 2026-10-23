// Tiny IndexedDB key/value wrapper. Stores: docs, kinds, lessons, templates, meta.

const NAME = 'orim-replica', VERSION = 1, STORES = ['docs', 'kinds', 'lessons', 'templates', 'meta'];
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
export const get = (store, key) => tx(store, 'readonly', s => s.get(key)).catch(() => undefined);
export const put = (store, key, val) => tx(store, 'readwrite', s => s.put(val, key));
export const del = (store, key) => tx(store, 'readwrite', s => s.delete(key));
export const all = (store) => tx(store, 'readonly', s => s.getAll()).catch(() => []);
