/* Analiza todos los diseños (excepto preanalizis) con las 5 IAs locales y los renombra
   a NAME_widht_Wpx_height_Hpx_front.png según el analizador. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { MODELOS } from '../src/forja/features/analizador/modelos.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGO = path.join(ROOT, 'src', 'assets', 'pokemons');
const DISENOS = path.join('C:', 'Users', 'cpest', 'Pictures', 'Carlos', 'imperia', 'A - Diseños Final');
const CACHE = path.join(ROOT, '.cache', 'analizador');
fs.mkdirSync(CACHE, { recursive: true });

const ZOOM = 2, ALFA = 8, LADO = 224, LOTE = 1;
const TAG_LADO = /_(front|back)\.png$/i;
const TAG_TAM = /_widht_\d+px_height_\d+px/i;
const TAG_ETAPA = /(?:_(pseudo|legendary))?_(\d)_(\d)$/i;
const POR_CARPETA = {
  'etapa unica': { linea: 1, etapa: 1 },
  'primera etapa de dos': { linea: 2, etapa: 1 }, 'segunda etapa de dos': { linea: 2, etapa: 2 },
  'primera etapa': { linea: 3, etapa: 1 }, 'segunda etapa': { linea: 3, etapa: 2 }, 'tercera etapa': { linea: 3, etapa: 3 }
};

function pngs(dir, skip = []) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (skip.includes(ent.name.toLowerCase())) continue;
      out.push(...pngs(p, skip));
    } else if (/\.png$/i.test(ent.name)) out.push(p);
  }
  return out;
}

function categoriaDeCarpeta(carpeta, archivo) {
  const m = String(archivo || '').replace(/\.png$/i, '').replace(TAG_TAM, '').replace(TAG_LADO, '').match(TAG_ETAPA);
  if (m) {
    const kind = (m[1] || '').toLowerCase();
    const tipo = kind === 'legendary' ? 'legendario' : kind === 'pseudo' ? 'pseudo' : 'normal';
    return { tipo, linea: +m[3], etapa: +m[2] };
  }
  const [raiz, sub] = String(carpeta || '').toLowerCase().split(/[/\\]/);
  if (raiz === 'pseudolegendario' || raiz === 'psudolegendario') {
    const e = POR_CARPETA[sub] || { linea: 3, etapa: 3 };
    return { tipo: 'pseudo', linea: 3, etapa: e.etapa };
  }
  if (raiz === 'legendario' || raiz === 'singular' || raiz === 'mega') return { tipo: raiz, linea: null, etapa: null };
  if (raiz === 'gmax') return { tipo: 'gmax', linea: null, etapa: null };
  const e = POR_CARPETA[raiz];
  return e ? { tipo: 'normal', ...e } : { tipo: 'normal', linea: null, etapa: null };
}

function entraEnFiltros({ tipo, linea, etapa }, { tipos, lineas, etapas }) {
  if (tipos.size && !tipos.has(tipo)) return false;
  if (lineas.size && linea != null && !lineas.has(linea)) return false;
  if (etapas.size && etapa != null && !etapas.has(etapa)) return false;
  return true;
}

function bboxPng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width: w, height: h, data } = png;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] < ALFA) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function figura(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width: w, height: h, data } = png;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] < ALFA) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const k = Math.min(1, LADO / Math.max(bw, bh));
  const nw = Math.max(1, Math.round(bw * k)), nh = Math.max(1, Math.round(bh * k));
  const rgb = new Uint8ClampedArray(nw * nh * 3);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const sx = x0 + Math.min(bw - 1, Math.floor(x * bw / nw));
    const sy = y0 + Math.min(bh - 1, Math.floor(y * bh / nh));
    const si = (sy * w + sx) * 4, di = (y * nw + x) * 3, a = data[si + 3] / 255;
    rgb[di] = Math.round(data[si] * a + 255 * (1 - a));
    rgb[di + 1] = Math.round(data[si + 1] * a + 255 * (1 - a));
    rgb[di + 2] = Math.round(data[si + 2] * a + 255 * (1 - a));
  }
  return { fig: { data: rgb, width: nw, height: nh, channels: 3 }, bbox: { w: bw, h: bh } };
}

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
  if (out.pooler_output) return filas(out.pooler_output);
  if (out.last_hidden_state) return filasCLS(out.last_hidden_state);
  throw new Error('sin vector');
}

function punto(a, b) {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s;
}

function promedio(queryPorModelo, catPorModelo, idxs) {
  const ids = Object.keys(queryPorModelo).filter(id => catPorModelo[id] && queryPorModelo[id]);
  const normas = ids.map(id => {
    const q = queryPorModelo[id];
    const sims = idxs.map(j => punto(q, catPorModelo[id][j]));
    const lo = Math.min(...sims), hi = Math.max(...sims), d = hi - lo || 1;
    return sims.map(s => (s - lo) / d);
  });
  return idxs.map((_, i) => {
    let s = 0; for (const row of normas) s += row[i];
    return s / (normas.length || 1);
  });
}

function tamanoComo(rw, rh, w, h) {
  const k = Math.sqrt((rw * rh) / (w * h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

function filtrosDe(clave) {
  const m = clave.match(TAG_ETAPA);
  if (!m) return { tipos: new Set(), lineas: new Set(), etapas: new Set() };
  const kind = (m[1] || '').toLowerCase();
  const tipo = kind === 'legendary' ? 'legendario' : kind === 'pseudo' ? 'pseudo' : 'normal';
  return { tipos: new Set([tipo]), lineas: new Set([+m[3]]), etapas: new Set([+m[2]]) };
}

const catPaths = pngs(CATALOGO);
console.log('catálogo', catPaths.length);
const metaCache = path.join(CACHE, 'cat-meta.json');
let catMeta;
if (fs.existsSync(metaCache)) {
  catMeta = JSON.parse(fs.readFileSync(metaCache, 'utf8'));
  console.log('catálogo meta en caché', catMeta.length);
} else {
  catMeta = [];
  for (let i = 0; i < catPaths.length; i++) {
    try {
      const b = bboxPng(catPaths[i]);
      if (!b) continue;
      const archivo = path.basename(catPaths[i]);
      const partes = catPaths[i].split(path.sep);
      const ip = partes.findIndex(x => x.toLowerCase() === 'pokemons');
      const carpeta = partes.slice(ip + 1, -1).join('/');
      catMeta.push({
        path: catPaths[i],
        tam: [Math.ceil(b.w / ZOOM), Math.ceil(b.h / ZOOM)],
        cat: categoriaDeCarpeta(carpeta, archivo)
      });
    } catch (e) { console.log('salto cat', catPaths[i], e.message); }
    if ((i + 1) % 200 === 0) console.log('  recortes', i + 1, '/', catPaths.length);
  }
  fs.writeFileSync(metaCache, JSON.stringify(catMeta));
  console.log('catálogo válido', catMeta.length);
}

const disFiles = pngs(DISENOS, ['preanalizis']);
console.log('diseños (sin preanalizis)', disFiles.length);
const grupos = new Map();
for (const p of disFiles) {
  const name = path.basename(p);
  const m = name.match(TAG_LADO);
  if (!m) continue;
  const clave = name.replace(TAG_LADO, '').replace(TAG_TAM, '');
  const g = grupos.get(clave) || {};
  g[m[1].toLowerCase()] = p;
  grupos.set(clave, g);
}

const queries = [];
for (const [clave, g] of [...grupos].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
  const src = g.front || g.back;
  let b;
  try { b = bboxPng(src); } catch (e) { console.log('sin figura', src, e.message); continue; }
  if (!b) { console.log('sin figura', src); continue; }
  queries.push({ clave, g, file: src, dir: path.dirname(src), w: b.w, h: b.h, filtros: filtrosDe(clave) });
}
console.log('variantes', queries.length);

function leerVecs(file) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).map(a => a ? Float32Array.from(a) : null);
  } catch { return []; }
}

function guardarVecs(file, vecs) {
  fs.writeFileSync(file, JSON.stringify(vecs.map(v => v ? Array.from(v) : null)));
}

const catOk = catMeta.map(m => m.path);
const catVecs = {}, qVecs = queries.map(() => ({}));

function cacheListo(id) {
  const cat = leerVecs(path.join(CACHE, `${id}-cat.json`));
  const q = leerVecs(path.join(CACHE, `${id}-q.json`));
  return cat.length === catOk.length && q.length === queries.length ? { cat, q } : null;
}

function aplicarRenombres(motivo) {
  const ids = Object.keys(catVecs);
  if (!ids.length) return 0;
  const log = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const idxs = [];
    for (let j = 0; j < catMeta.length; j++) if (entraEnFiltros(catMeta[j].cat, q.filtros)) idxs.push(j);
    if (!idxs.length) { console.log('sin candidatos', q.clave); continue; }
    const scores = promedio(qVecs[i], catVecs, idxs);
    let bestI = 0; for (let k = 1; k < scores.length; k++) if (scores[k] > scores[bestI]) bestI = k;
    const best = idxs[bestI];
    const [rw, rh] = catMeta[best].tam;
    const [nw, nh] = tamanoComo(rw, rh, q.w, q.h);
    const ref = path.basename(catMeta[best].path, '.png');
    for (const lado of Object.keys(q.g)) {
      const src = q.g[lado];
      const destName = `${q.clave}_widht_${nw}px_height_${nh}px_${lado}.png`;
      const dest = path.join(q.dir, destName);
      if (path.basename(src) === destName) continue;
      if (fs.existsSync(dest) && dest !== src) fs.unlinkSync(dest);
      fs.renameSync(src, dest);
      q.g[lado] = dest;
      if (q.file === src) q.file = dest;
      console.log(`${path.basename(src)} -> ${destName}  (ref ${ref} ${rw}x${rh})`);
      log.push({ src: path.basename(src), dest: destName, ref, w: nw, h: nh, score: scores[bestI] });
    }
  }
  fs.writeFileSync(path.join(CACHE, 'renombres.json'), JSON.stringify(log, null, 2));
  console.log('renombrados', log.length, `(${motivo}: ${ids.join(', ')})`);
  return log.length;
}

for (const modelo of MODELOS) {
  const listo = cacheListo(modelo.id);
  if (!listo) continue;
  catVecs[modelo.id] = listo.cat;
  listo.q.forEach((v, i) => { if (v) qVecs[i][modelo.id] = v; });
  console.log('IA', modelo.nombre, 'en caché');
}
if (Object.keys(catVecs).length) aplicarRenombres('caché');

const faltan = MODELOS.filter(m => !catVecs[m.id]);
if (faltan.length) {
  console.log('faltan IAs', faltan.map(m => m.id).join(', '));
  console.log('cargando transformers…');
  const {
    AutoProcessor, AutoModel,
    CLIPVisionModelWithProjection, SiglipVisionModel,
    RawImage, env
  } = await import('@huggingface/transformers');
  env.backends.onnx.wasm.numThreads = 1;
  function aRaw(f) { return new RawImage(f.data, f.width, f.height, f.channels); }
  async function visionDe(modelo) {
    const opts = { dtype: 'q8' };
    const proc = await AutoProcessor.from_pretrained(modelo.hf);
    let vis;
    if (modelo.tipo === 'clip') vis = await CLIPVisionModelWithProjection.from_pretrained(modelo.hf, opts);
    else if (modelo.tipo === 'siglip') vis = await SiglipVisionModel.from_pretrained(modelo.hf, opts);
    else vis = await AutoModel.from_pretrained(modelo.hf, opts);
    return { proc, vis };
  }
  async function embedirArchivos(pair, files, etiqueta, cachePath) {
    const out = leerVecs(cachePath);
    if (out.length) console.log(`    ${etiqueta} reanuda ${out.length}/${files.length}`);
    for (let i = out.length; i < files.length; i += LOTE) {
      const chunk = files.slice(i, i + LOTE);
      const placed = [];
      for (const p of chunk) {
        try {
          const f = figura(p);
          if (!f) { placed.push(null); continue; }
          const v = vectoresDe(await pair.vis(await pair.proc([aRaw(f.fig)])))[0];
          placed.push(v);
        } catch (e) {
          console.log('    fallo embed', path.basename(p), e.message);
          placed.push(null);
        }
      }
      out.push(...placed);
      if (out.length % 32 === 0 || out.length === files.length) {
        guardarVecs(cachePath, out);
        console.log(`    ${etiqueta} ${out.length}/${files.length}`);
      }
    }
    if (out.length !== files.length) guardarVecs(cachePath, out);
    return out;
  }
  for (const modelo of faltan) {
    let pair;
    try {
      console.log('IA', modelo.nombre);
      pair = await visionDe(modelo);
    } catch (e) {
      console.log('  no cargó:', e.message);
      continue;
    }
    const catCache = path.join(CACHE, `${modelo.id}-cat.json`);
    catVecs[modelo.id] = await embedirArchivos(pair, catOk, modelo.nombre + ' cat', catCache);
    const qCache = path.join(CACHE, `${modelo.id}-q.json`);
    const qv = await embedirArchivos(pair, queries.map(q => q.file), modelo.nombre + ' query', qCache);
    qv.forEach((v, i) => { if (v) qVecs[i][modelo.id] = v; });
    try { pair.vis.dispose?.(); } catch { /* */ }
    aplicarRenombres(modelo.id);
  }
}

if (!Object.keys(catVecs).length) throw new Error('ninguna IA ha cargado');
console.log('IAs usadas', Object.keys(catVecs).join(', '));
