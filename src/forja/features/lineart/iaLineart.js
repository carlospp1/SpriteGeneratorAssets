/* The AI's lines for the line art: the cropped picture goes to the model (in a worker) letterboxed to 768×768
   over white, and its grey answer comes back as line opacity (0..1) at the line art's computing size. Each
   picture / crop / style / size is drawn once and kept. */
import { empezarTarea, cancelado } from '../source/tareasIA.js';
import { leerIA, guardarIA, huella } from '../source/cacheIA.js';

const LADO = 768;
export const ESTILOS_IA = [['contour', 'Contorno (trazo grueso y limpio)'], ['anime', 'Anime (trazo fino y detallado)']];
const modeloDe = estilo => new URL(`modelos/lineart-${estilo}-768.onnx`, document.baseURI).href;

let worker = null, siguiente = 0, mem = [], pendiente = null;
function parar() {
  if (worker) { worker.terminate(); worker = null; }
  if (pendiente) { pendiente.reject(cancelado()); pendiente = null; }
}
export { parar as pararLineas };
const memDe = (img, key) => mem.find(c => c.img === img && c.key === key)?.alpha;
function memSet(img, key, alpha) {
  mem = mem.filter(c => !(c.img === img && c.key === key));
  mem.push({ img, key, alpha });
  if (mem.length > 8) mem.shift();
}

function preparar(img, f) {
  const k = LADO / Math.max(f.w, f.h), dw = Math.round(f.w * k), dh = Math.round(f.h * k);
  const ox = Math.floor((LADO - dw) / 2), oy = Math.floor((LADO - dh) / 2);
  const c = document.createElement('canvas'); c.width = LADO; c.height = LADO;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, LADO, LADO);
  x.imageSmoothingQuality = 'high'; x.drawImage(img, f.x, f.y, f.w, f.h, ox, oy, dw, dh);
  const px = x.getImageData(0, 0, LADO, LADO).data, n = LADO * LADO, entrada = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) entrada[ch * n + i] = px[i * 4 + ch] / 255;
  return { entrada, ox, oy, dw, dh };
}

/* grey of the model (768², dark = line) → opacity at w×h, only the part where the picture is */
function aOpacidad(gris, { ox, oy, dw, dh }, w, h) {
  const g = new ImageData(LADO, LADO);
  for (let i = 0; i < LADO * LADO; i++) {
    // the model's paper is not pure white: what is almost white is no line
    const a = Math.max(0, Math.min(1, (0.94 - gris[i]) / 0.7));
    g.data[i * 4 + 3] = Math.round(a * 255);
  }
  const a = document.createElement('canvas'); a.width = LADO; a.height = LADO; a.getContext('2d').putImageData(g, 0, 0);
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const bx = b.getContext('2d', { willReadFrequently: true });
  bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high';
  bx.drawImage(a, ox, oy, dw, dh, 0, 0, w, h);
  const d = bx.getImageData(0, 0, w, h).data, alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3] / 255;
  return alpha;
}

/**
 * Line opacity drawn by the AI for the crop f of img, at w×h.
 * @returns {Promise<Float32Array>}
 */
export async function lineasIA(img, f, estilo, w, h, opts = {}) {
  const key = [f.x, f.y, f.w, f.h, estilo, w, h].join('|');
  const ya = memDe(img, key); if (ya) return ya;
  worker ??= new Worker(new URL('./iaLineart.worker.js', import.meta.url), { type: 'module' });
  const prep = preparar(img, f), id = ++siguiente;
  // the same picture in the same style was already drawn (also before reloading the page)
  const guardada = `lineart|${estilo}|${huella(new Uint8Array(prep.entrada.buffer), LADO, LADO)}`;
  const previa = await leerIA(guardada);
  if (previa instanceof Float32Array && previa.length === LADO * LADO) {
    const alpha = aOpacidad(previa, prep, w, h);
    memSet(img, key, alpha);
    return alpha;
  }
  const tarea = opts.sinTarea ? null : empezarTarea('La IA está dibujando las líneas…', parar);
  const gris = await new Promise((resolve, reject) => {
    pendiente = { reject };
    worker.onmessage = ({ data: m }) => { if (m.id !== id) return; if (m.error) reject(new Error(m.error)); else resolve(m.gris); };
    worker.onerror = e => reject(new Error(e.message || 'no se pudo arrancar la IA'));
    worker.postMessage({ id, modelo: modeloDe(estilo), entrada: prep.entrada, lado: LADO }, [prep.entrada.buffer]);
  }).finally(() => { pendiente = null; tarea?.fin(); });
  guardarIA(guardada, gris);
  const alpha = aOpacidad(gris, prep, w, h);
  memSet(img, key, alpha);
  return alpha;
}

/* the AI lines already drawn for this picture / crop / style / size, or null */
export function lineasIAGuardadas(img, f, estilo, w, h) {
  return memDe(img, [f.x, f.y, f.w, f.h, estilo, w, h].join('|'));
}
