// CLIP (Xenova/clip-vit-base-patch32, MIT) in the browser: for each thing found on the sheet, how much it looks like
// each label of vistas.js: front, back, side, or not a full creature (texts, swatches, close-ups).
// The model (~90 MB) downloads the first time and the browser keeps it.
import '../source/silenciar.js';   // the AI library must not write to the console
import { pipeline, RawImage, env } from '@huggingface/transformers';
import '../source/modelosDelProyecto.js';
import { ETIQUETAS } from './vistas.js';

// all the cores but one (the page keeps one for itself); several threads need the cross-origin isolated page
const HILOS = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
env.backends.onnx.wasm.numThreads = HILOS;

const MODELO = 'Xenova/clip-vit-base-patch32';
let clasificador = null;

async function cargar() {
  if (clasificador) return clasificador;
  const descargas = new Map();
  clasificador = await pipeline('zero-shot-image-classification', MODELO, {
    dtype: 'q8',
    progress_callback: p => {
      if (p.status !== 'progress' || !p.total) return;
      descargas.set(p.file, p);
      let hecho = 0, total = 0;
      for (const d of descargas.values()) { hecho += d.loaded; total += d.total; }
      self.postMessage({ tipo: 'progreso', hecho, total });
    }
  }).catch(e => { clasificador = null; throw e; });
  return clasificador;
}

self.onmessage = async ({ data: { id, figuras } }) => {
  try {
    const clf = await cargar();
    const puntos = [];
    for (const f of figuras) {
      const r = await clf(new RawImage(f.data, f.width, f.height, 4), ETIQUETAS);
      puntos.push(ETIQUETAS.map(e => r.find(x => x.label === e).score));
    }
    self.postMessage({ tipo: 'hecho', id, puntos });
  } catch (e) {
    self.postMessage({ tipo: 'error', id, mensaje: String(e?.message || e) });
  }
};
