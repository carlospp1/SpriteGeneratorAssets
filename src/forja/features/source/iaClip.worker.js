/* CLIP (Xenova/clip-vit-base-patch32, MIT): the visual fingerprint of a picture, or of a text, normalised. Both
   live in the same space (512 numbers), so a picture can be compared with another picture or with a prompt. */
import './silenciar.js';   // the AI library must not write to the console
import { AutoProcessor, AutoTokenizer, CLIPVisionModelWithProjection, CLIPTextModelWithProjection, RawImage, env } from '@huggingface/transformers';
import './modelosDelProyecto.js';

// all the cores but one (the page keeps one for itself); several threads need the cross-origin isolated page
env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);

const MODELO = 'Xenova/clip-vit-base-patch32';
let modelos = null;

function cargar() {
  if (modelos) return modelos;
  const descargas = new Map();
  const progress_callback = p => {
    if (p.status !== 'progress' || !p.total) return;
    descargas.set(p.file, p);
    let hecho = 0, total = 0;
    for (const d of descargas.values()) { hecho += d.loaded; total += d.total; }
    self.postMessage({ tipo: 'progreso', texto: `Descargando la IA que compara imágenes (solo la primera vez): ${(hecho / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB` });
  };
  modelos = Promise.all([
    AutoProcessor.from_pretrained(MODELO, { progress_callback }),
    CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8', progress_callback }),
    AutoTokenizer.from_pretrained(MODELO, { progress_callback }),
    CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: 'q8', progress_callback })
  ]).catch(e => { modelos = null; throw e; });
  return modelos;
}

/* rows of a [n, 512] tensor, each scaled to length 1 (then the dot product is the similarity) */
function filas(t) {
  const [n, d] = t.dims, out = [];
  for (let i = 0; i < n; i++) {
    const v = new Float32Array(t.data.subarray(i * d, (i + 1) * d));
    let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1;
    for (let j = 0; j < d; j++) v[j] /= s;
    out.push(v);
  }
  return out;
}

/* { id, data, width, height }: one picture → { vector }; { id, textos }: prompts → { vectores } */
self.onmessage = async ({ data: m }) => {
  try {
    const [procesador, vision, tokenizador, texto] = await cargar();
    if (m.textos) {
      const { text_embeds } = await texto(tokenizador(m.textos, { padding: true, truncation: true }));
      const vectores = filas(text_embeds);
      self.postMessage({ tipo: 'hecho', id: m.id, vectores }, vectores.map(v => v.buffer));
    } else {
      const { image_embeds } = await vision(await procesador(new RawImage(m.data, m.width, m.height, 4).rgb()));
      const [vector] = filas(image_embeds);
      self.postMessage({ tipo: 'hecho', id: m.id, vector }, [vector.buffer]);
    }
  } catch (e) {
    self.postMessage({ tipo: 'error', id: m.id, mensaje: String(e?.message || e) });
  }
};
