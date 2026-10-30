/* What the AI already did, kept in this browser (IndexedDB: it holds the masks and lines, which do not fit in
   localStorage) so the same picture never goes through the AI twice — not even after reloading the page.
   A result is found by a fingerprint of the picture's pixels (the same picture uploaded again is recognised)
   plus what was asked (model, style, points…). Works in the page and in the AI workers. Old results are
   dropped when there are too many. If the browser does not allow storage, everything still works (just
   without remembering). */
const DB = 'forja-ia', STORE = 'resultados', MAX = 60;
let dbp = null;

function abrir() {
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
}
function tx(modo, fn) {
  return abrir().then(d => new Promise((res, rej) => {
    const t = d.transaction(STORE, modo), req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req && req.result);
    t.onerror = t.onabort = () => rej(t.error);
  }));
}

/* the result kept under key, or null */
export async function leerIA(key) {
  try { const r = await tx('readonly', s => s.get(key)); return r ? r.valor : null; } catch { return null; }
}

/* keeps a result (typed arrays, blobs and plain objects are fine) */
export async function guardarIA(key, valor) {
  try {
    await tx('readwrite', s => s.put({ key, valor, fecha: Date.now() }));
    const todas = await tx('readonly', s => s.getAllKeys());
    if (todas.length > MAX) {
      const viejas = (await tx('readonly', s => s.getAll())).sort((a, b) => a.fecha - b.fecha).slice(0, todas.length - MAX);
      await tx('readwrite', s => { for (const v of viejas) s.delete(v.key); });
    }
  } catch { /* storage full or not allowed: the result is simply not remembered */ }
}

/* fingerprint of pixels (FNV-1a over every byte, plus the size): the same picture gives the same text */
export function huella(data, w, h) {
  let a = 0x811c9dc5, b = 0x01000193 ^ (w * 73856093) ^ (h * 19349663);
  for (let i = 0; i < data.length; i++) {
    a ^= data[i]; a = Math.imul(a, 0x01000193);
    if ((i & 3) === 0) { b ^= data[i]; b = Math.imul(b, 0x01000193); }
  }
  return `${w}x${h}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
