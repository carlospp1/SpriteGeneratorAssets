// Cinco IAs locales (ONNX, gratis, en este ordenador). Cada una saca un vector de la imagen; el analizador
// promedia el parecido. Se cargan de una en una para no llenar la memoria.
import '../source/silenciar.js';
import {
  AutoProcessor, AutoTokenizer, AutoModel,
  CLIPVisionModelWithProjection, CLIPTextModelWithProjection,
  SiglipVisionModel, SiglipTextModel,
  RawImage, env
} from '@huggingface/transformers';
import '../source/modelosDelProyecto.js';
import { MODELOS } from './modelos.js';

env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);

const LOTE = 4;

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
/* CLS del último hidden state [n, seq, dim] */
function filasCLS(t) {
  const [n, seq, d] = t.dims, out = [];
  for (let i = 0; i < n; i++) {
    const v = new Float32Array(t.data.subarray(i * seq * d, i * seq * d + d));
    let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1;
    for (let j = 0; j < d; j++) v[j] /= s;
    out.push(v);
  }
  return out;
}
function vectoresDe(out) {
  if (out.image_embeds) return filas(out.image_embeds);
  if (out.text_embeds) return filas(out.text_embeds);
  if (out.pooler_output) return filas(out.pooler_output);
  if (out.last_hidden_state) return filasCLS(out.last_hidden_state);
  throw new Error('este modelo no ha devuelto un vector');
}

function progresoDescarga(cb) {
  const descargas = new Map();
  return p => {
    if (p.status !== 'progress' || !p.total) return;
    descargas.set(p.file, p);
    let hecho = 0, total = 0;
    for (const d of descargas.values()) { hecho += d.loaded; total += d.total; }
    cb(hecho, total);
  };
}

async function embedir(modelo, imagenes, textos, avisar) {
  const progresion = progresoDescarga((hecho, total) => {
    self.postMessage({ tipo: 'progreso', texto: `Cargando ${modelo.nombre}: ${(hecho / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`, hecho, total });
  });
  const opts = { dtype: 'q8', progress_callback: progresion };
  const piezas = [];
  const soltar = () => { for (const p of piezas) { try { p.dispose?.(); } catch { /* */ } } piezas.length = 0; };

  try {
    avisar(`Cargando ${modelo.nombre}…`);
    const procesador = await AutoProcessor.from_pretrained(modelo.hf, { progress_callback: progresion });
    piezas.push(procesador);
    let vision, textoMod, tokenizador;
    if (modelo.tipo === 'clip') {
      vision = await CLIPVisionModelWithProjection.from_pretrained(modelo.hf, opts);
      if (textos) {
        tokenizador = await AutoTokenizer.from_pretrained(modelo.hf, { progress_callback: progresion });
        textoMod = await CLIPTextModelWithProjection.from_pretrained(modelo.hf, opts);
        piezas.push(tokenizador, textoMod);
      }
    } else if (modelo.tipo === 'siglip') {
      vision = await SiglipVisionModel.from_pretrained(modelo.hf, opts);
      if (textos) {
        tokenizador = await AutoTokenizer.from_pretrained(modelo.hf, { progress_callback: progresion });
        textoMod = await SiglipTextModel.from_pretrained(modelo.hf, opts);
        piezas.push(tokenizador, textoMod);
      }
    } else {
      vision = await AutoModel.from_pretrained(modelo.hf, opts);
    }
    piezas.push(vision);

    const vecImg = [];
    for (let i = 0; i < imagenes.length; i += LOTE) {
      avisar(`${modelo.nombre}: ${Math.min(imagenes.length, i + LOTE)} / ${imagenes.length}`);
      const imgs = imagenes.slice(i, i + LOTE).map(f => new RawImage(f.data, f.width, f.height, 4).rgb());
      vecImg.push(...vectoresDe(await vision(await procesador(imgs))));
    }
    let vecTxt = null;
    if (textoMod && tokenizador && textos) {
      const pad = modelo.tipo === 'siglip' ? { padding: 'max_length', truncation: true } : { padding: true, truncation: true };
      vecTxt = vectoresDe(await textoMod(tokenizador(textos, pad)));
    }
    return { imagenes: vecImg, textos: vecTxt };
  } finally { soltar(); }
}

self.onmessage = async ({ data: m }) => {
  const avisar = texto => self.postMessage({ tipo: 'progreso', texto });
  const porModelo = {};
  for (const modelo of MODELOS) {
    try {
      porModelo[modelo.id] = await embedir(modelo, m.imagenes || [], m.textos, avisar);
    } catch (e) {
      self.postMessage({ tipo: 'aviso', mensaje: `${modelo.nombre} no ha podido usarse: ${e?.message || e}` });
    }
  }
  const ids = Object.keys(porModelo);
  if (!ids.length) {
    self.postMessage({ tipo: 'error', id: m.id, mensaje: 'Ninguna de las 5 IAs locales ha podido arrancar.' });
    return;
  }
  const transfer = [];
  for (const r of Object.values(porModelo)) {
    for (const v of r.imagenes) transfer.push(v.buffer);
    if (r.textos) for (const v of r.textos) transfer.push(v.buffer);
  }
  self.postMessage({ tipo: 'hecho', id: m.id, porModelo }, transfer);
};
