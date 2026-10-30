/* Background removal by an AI: ISNet-anime (skytnt/anime-seg, Apache 2.0), a model trained only to cut drawn
   characters (anime, cartoons, game art) out of their background. It does not take a text prompt: it looks at the
   picture and returns, for every pixel, how sure it is that it belongs to the character. It is a light network
   (about 0.8 GB of memory at its 1024 px, against the 2.2 GB of BiRefNet) and it ignores what is not a character:
   grids, guide lines, shadows on the floor, texts. The model (~176 MB) is in public/modelos, with the app. */
import './silenciar.js';   // the AI library must not write to the console
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
// all the cores but one (the page keeps one for itself); several threads need the cross-origin isolated page.
// m.hilos = 1 when the page retries after the threaded start got stuck
const HILOS = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);

const LADO = 1024;   // the model looks at 1024×1024: the picture fits inside, the rest is padded with black
let sesion = null, actual = 0;   // actual: the id of the picture being worked on

/* an error outside the try below (a thread of the AI library, a rejected promise nobody waits for) must still
   reach the page: otherwise it waits forever */
const fallo = e => self.postMessage({ tipo: 'error', id: actual, mensaje: String(e?.message || e || 'error desconocido') });
self.addEventListener('error', e => fallo(e.error || e.message));
self.addEventListener('unhandledrejection', e => fallo(e.reason));

async function cargar(modelo, hilos) {
  if (sesion) return sesion;
  ort.env.wasm.numThreads = hilos || HILOS;
  self.postMessage({ tipo: 'progreso', texto: 'Cargando la IA que quita el fondo…' });
  const r = await fetch(modelo);
  if (!r.ok) throw new Error(`no se encuentra el modelo (${r.status})`);
  const total = +r.headers.get('content-length') || 0, partes = [];
  let hecho = 0;
  for (const lector = r.body.getReader(); ;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value); hecho += value.length;
    if (total) self.postMessage({ tipo: 'progreso', texto: `Cargando la IA que quita el fondo: ${(hecho / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB` });
  }
  const bytes = new Uint8Array(hecho);
  let o = 0; for (const p of partes) { bytes.set(p, o); o += p.length; }
  partes.length = 0;
  // the page watches this phase: if it never ends, it starts the worker again with one thread
  self.postMessage({ tipo: 'progreso', fase: 'preparando', texto: 'Preparando la IA que quita el fondo…' });
  sesion = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  return sesion;
}

/* the picture fitted into LADO×LADO (centred), as planar RGB 0..1 */
function entrada(data, w, h) {
  const k = LADO / Math.max(w, h), iw = Math.max(1, Math.round(w * k)), ih = Math.max(1, Math.round(h * k));
  const px = (LADO - iw) >> 1, py = (LADO - ih) >> 1;
  const src = new OffscreenCanvas(w, h);
  src.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
  const c = new OffscreenCanvas(LADO, LADO), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, LADO, LADO);
  x.imageSmoothingQuality = 'high'; x.drawImage(src, px, py, iw, ih);
  const d = x.getImageData(0, 0, LADO, LADO).data, n = LADO * LADO, t = new Float32Array(3 * n);
  for (let p = 0; p < n; p++) { t[p] = d[p * 4] / 255; t[n + p] = d[p * 4 + 1] / 255; t[2 * n + p] = d[p * 4 + 2] / 255; }
  return { t, px, py, iw, ih };
}

/* the model's answer (LADO×LADO, 0..1) back to the picture's size, as opacity 0..255 */
function salida(m, { px, py, iw, ih }, w, h) {
  const g = new ImageData(iw, ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const v = Math.max(0, Math.min(255, Math.round(m[(y + py) * LADO + x + px] * 255))), o = (y * iw + x) * 4;
    g.data[o] = g.data[o + 1] = g.data[o + 2] = v; g.data[o + 3] = 255;
  }
  const a = new OffscreenCanvas(iw, ih); a.getContext('2d').putImageData(g, 0, 0);
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high'; x.drawImage(a, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, alfa = new Uint8Array(w * h);
  for (let p = 0; p < alfa.length; p++) alfa[p] = d[p * 4];
  return alfa;
}

self.onmessage = async ({ data: m }) => {
  actual = m.id;
  try {
    const s = await cargar(m.modelo, m.hilos);
    self.postMessage({ tipo: 'progreso', fase: 'quitando', texto: 'La IA está quitando el fondo…' });
    const e = entrada(m.data, m.width, m.height);
    const r = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', e.t, [1, 3, LADO, LADO]) });
    const alfa = salida(r[s.outputNames[0]].data, e, m.width, m.height);
    self.postMessage({ tipo: 'hecho', id: m.id, alfa }, [alfa.buffer]);
  } catch (e) {
    self.postMessage({ tipo: 'error', id: m.id, mensaje: String(e?.message || e) });
  }
};
