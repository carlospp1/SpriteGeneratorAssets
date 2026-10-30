/* Click-to-select with SlimSAM (Segment Anything, Apache-2.0, ~14 MB) off the main thread.
   The picture is "understood" once (image embeddings, a few seconds); each click then takes about a second. */
import './silenciar.js';   // the AI library must not write to the console
import { SamModel, AutoProcessor, RawImage, Tensor, env } from '@huggingface/transformers';
import './modelosDelProyecto.js';

// all the cores but one (the page keeps one for itself); several threads need the cross-origin isolated page
const HILOS = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
env.backends.onnx.wasm.numThreads = HILOS;
import { leerIA, guardarIA, huella } from './cacheIA.js';
import { regionesSam } from '../../engine/materiales.js';

const MODELO = 'Xenova/slimsam-77-uniform';
let modelo = null, procesador = null;
let actual = null;   // { key, raw, emb } the picture being worked on

async function cargar() {
  if (modelo) return;
  const descargas = new Map();
  const progress_callback = p => {
    if (p.status !== 'progress' || !p.total) return;
    descargas.set(p.file, p);
    let hecho = 0, total = 0;
    for (const d of descargas.values()) { hecho += d.loaded; total += d.total; }
    self.postMessage({ tipo: 'progreso', texto: `Descargando la IA (solo la primera vez): ${(hecho / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB…` });
  };
  [modelo, procesador] = await Promise.all([
    SamModel.from_pretrained(MODELO, { dtype: 'q8', progress_callback }),
    AutoProcessor.from_pretrained(MODELO, { progress_callback })
  ]);
}

/* what the AI understood of the picture (image embeddings): worked out once and remembered in the browser,
   also after reloading the page */
async function embeddings() {
  if (actual.emb) return actual.emb;
  const guardada = 'sam|slimsam-77|' + actual.huella, previa = await leerIA(guardada);
  if (previa && previa.ie && previa.pe) {
    actual.emb = {
      image_embeddings: new Tensor('float32', previa.ie.data, previa.ie.dims),
      image_positional_embeddings: new Tensor('float32', previa.pe.data, previa.pe.dims)
    };
  } else {
    self.postMessage({ tipo: 'progreso', texto: 'La IA está mirando la imagen… (solo la primera vez, unos segundos)' });
    actual.emb = await modelo.get_image_embeddings(await procesador(actual.raw));
    const { image_embeddings: ie, image_positional_embeddings: pe } = actual.emb;
    guardarIA(guardada, { ie: { data: ie.data, dims: ie.dims }, pe: { data: pe.data, dims: pe.dims } });
  }
  return actual.emb;
}

self.onmessage = async ({ data: m }) => {
  try {
    if (m.tipo === 'imagen') {   // a new picture: its pixels (RGBA), understood on the first click
      actual = { key: m.key, raw: new RawImage(m.data, m.width, m.height, 4).rgb(), emb: null, huella: huella(m.data, m.width, m.height) };
      return;
    }
    // m.tipo === 'segmentar': points [[x, y]…] with labels (1 inside, 0 outside), in picture pixels;
    // m.tipo === 'regiones': points [[x, y]…] spread over the character and its mask (1 / 0 per pixel)
    await cargar();
    if (!actual || actual.key !== m.key) throw new Error('la imagen ha cambiado');
    if (m.tipo === 'regiones') {
      const emb = await embeddings();
      const lista = await regionesSam({ modelo, procesador, raw: actual.raw, emb, puntos: m.puntos, mascara: m.mascara,
        progreso: texto => self.postMessage({ tipo: 'progreso', texto }) });
      self.postMessage({ tipo: 'hecho', id: m.id, regiones: lista });
      return;
    }
    const emb = await embeddings();
    const entrada = await procesador(actual.raw, { input_points: [m.puntos], input_labels: [m.etiquetas] });
    const salida = await modelo({ ...emb, input_points: entrada.input_points, input_labels: entrada.input_labels });
    const mascaras = await procesador.post_process_masks(salida.pred_masks, entrada.original_sizes, entrada.reshaped_input_sizes);
    const md = mascaras[0].data, n = actual.raw.width * actual.raw.height, k = mascaras[0].dims[1];
    // one point: the biggest proposal (the whole thing, not a part of it); more points: the one the model trusts most
    let elegida = 0;
    if (m.puntos.length === 1) {
      let mejor = -1;
      for (let j = 0; j < k; j++) { let a = 0; for (let p = 0; p < n; p++) if (md[j * n + p]) a++; if (a > mejor) { mejor = a; elegida = j; } }
    } else {
      const s = salida.iou_scores.data; for (let j = 1; j < k; j++) if (s[j] > s[elegida]) elegida = j;
    }
    const mascara = new Uint8Array(n);
    for (let p = 0; p < n; p++) mascara[p] = md[elegida * n + p] ? 1 : 0;
    self.postMessage({ tipo: 'hecho', id: m.id, mascara }, [mascara.buffer]);
  } catch (e) {
    self.postMessage({ tipo: 'error', id: m.id, mensaje: String(e?.message || e) });
  }
};
