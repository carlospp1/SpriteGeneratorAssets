/* Designs in IndexedDB (fits the source image, unlike localStorage), and portable .json backups. */
const DB_NAME = 'forja-sprites', STORE = 'designs';
let dbp = null;
function db() {
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req && req.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
export const store = {
  all: () => tx('readonly', s => s.getAll()),
  get: id => tx('readonly', s => s.get(id)),
  put: rec => tx('readwrite', s => s.put(rec)),
  del: id => tx('readwrite', s => s.delete(id))
};

/* ---------- portable backups: blobs and byte arrays as base64 inside the JSON ---------- */
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBytes(b64) { const s = atob(b64), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }
async function toPortable(v) {
  if (v instanceof Blob) return { $blob: await blobToDataURL(v) };
  if (v instanceof Uint8Array || v instanceof Uint8ClampedArray) return { $bytes: bytesToB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)), clamped: v instanceof Uint8ClampedArray };
  if (Array.isArray(v)) return Promise.all(v.map(toPortable));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await toPortable(v[k]); return o; }
  return v;
}
function fromPortable(v) {
  if (Array.isArray(v)) return v.map(fromPortable);
  if (v && typeof v === 'object') {
    if (typeof v.$blob === 'string') {
      const [head, data] = v.$blob.split(','), type = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
      return new Blob([b64ToBytes(data)], { type });
    }
    if (typeof v.$bytes === 'string') { const u8 = b64ToBytes(v.$bytes); return v.clamped ? new Uint8ClampedArray(u8.buffer) : u8; }
    const o = {}; for (const k of Object.keys(v)) o[k] = fromPortable(v[k]); return o;
  }
  return v;
}
/* a design as a .forja.json file */
export const designFile = async rec => new Blob([JSON.stringify({ format: 'forja-sprites', version: 1, design: await toPortable(rec) })], { type: 'application/json' });
/* read a .forja.json file: the design record, or throws with the reason */
export async function readDesignFile(file, what = 'un diseño') {
  const j = JSON.parse(await file.text());
  if (j.format !== 'forja-sprites' || !j.design) throw new Error(`no es ${what} de Forja de sprites`);
  return fromPortable(j.design);
}
export const fileBase = n => (n || 'diseño').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim() || 'diseño';
