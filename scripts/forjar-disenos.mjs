/* Forja en lote: diseños de «A - Diseños Final» → sprites_automaticos, como en el forjador:
   - ajustes de partida = scripts/ajustes-forja.json (export del forjador), con «Líneas internas» en 1 y
     «Oscuridad para contar como línea» al mínimo, como el forjador ahora;
   - fondo: «Ajustar automáticamente» del fondo;
   - tamaño: alto = height del nombre ×2 con «Mantener proporción» (el ancho sale de la figura); si no cabe en el
     lienzo, lo más grande que quepa;
   - «✨ Ajustar automáticamente» del sprite con la IA: los materiales los cuenta SAM («✨ Detectar materiales con
     IA») y 4 combinaciones de valores se juzgan con el mismo juez que el forjador (líneas, colores y CLIP);
   - «Contorno del color de cada zona», lienzo 200×200 y sprite centrado. Nombre: «001 - Brotín_front.png».
   Solo sobrescribe los que hace: lo demás de la carpeta se queda como está.
   Uso: npm run forjar -- [--filtro=texto] [--saltar=021,028] [--desde=100] [--forzar]  (sin --forzar, salta los que ya existen) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { env, RawImage, SamModel, AutoProcessor, AutoTokenizer, CLIPVisionModelWithProjection, CLIPTextModelWithProjection } from '@huggingface/transformers';
import { rgb2lab, hex2rgb } from '../src/forja/engine/color.js';
import { createBg } from '../src/forja/engine/background.js';
import { createClusters } from '../src/forja/engine/clusters.js';
import { createSprite } from '../src/forja/engine/sprite.js';
import { createLineArt } from '../src/forja/engine/lineart.js';
import { RETOQUES } from '../src/forja/engine/retoques.js';
import { ajustarFondoPixeles } from '../src/forja/engine/autoajuste.js';
import { puntosMateriales, contarMateriales, regionesSam } from '../src/forja/engine/materiales.js';
import { combinaciones, referencia, medir, aCuadro, originalRecortado, vectoresPrompts, siFrenteANo, parecido, nota } from '../src/forja/engine/juezSprite.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = path.join('C:', 'Users', 'cpest', 'Pictures', 'Carlos', 'imperia', 'A - Diseños Final');
const DEST = path.join('C:', 'Users', 'cpest', 'Pictures', 'Carlos', 'imperia', 'sprites_automaticos');
const AJUSTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'ajustes-forja.json'), 'utf8'));
const G = AJUSTES.settings, LA = AJUSTES.line;
const LADO = 200, ZOOM = 2, MAXSIDE = 800;
// los valores que mueve «Ajustar automáticamente», tal como vienen en los ajustes de partida
const BASE = { k: G.k, kAuto: G.kAuto, s: G.s, mergeDE: G.mergeDE, cl: G.cl, lineKeep: G.lineKeep, colOut: G.colOut };
const TAG = /^(\d+)\s*-\s*(.+)_widht_(\d+)px_height_(\d+)px_(front|back)\.png$/i;
const argv = process.argv.slice(2);
const FILTRO = ((argv.find(x => x.startsWith('--filtro=')) || '').slice(9) || '').toLowerCase();
const FORZAR = argv.includes('--forzar');
const SALTAR = (argv.find(x => x.startsWith('--saltar=')) || '').slice(9).split(',').filter(Boolean);
const DESDE = +((argv.find(x => x.startsWith('--desde=')) || '').slice(8) || 0);   // para seguir un lote cortado: desde ese número

/* ---------- las IAs, desde public/modelos (sin internet) ---------- */
env.allowRemoteModels = false;
env.localModelPath = path.join(ROOT, 'public', 'modelos') + path.sep;
const CLIP = 'Xenova/clip-vit-base-patch32', SAM = 'Xenova/slimsam-77-uniform';
const [clipProc, clipVision, clipTok, clipTexto, samModelo, samProc] = await Promise.all([
  AutoProcessor.from_pretrained(CLIP), CLIPVisionModelWithProjection.from_pretrained(CLIP, { dtype: 'q8' }),
  AutoTokenizer.from_pretrained(CLIP), CLIPTextModelWithProjection.from_pretrained(CLIP, { dtype: 'q8' }),
  SamModel.from_pretrained(SAM, { dtype: 'q8' }), AutoProcessor.from_pretrained(SAM)
]);

/* filas de un tensor [n, d] con longitud 1 (así el producto escalar es el parecido) */
function filas(t) {
  const [n, d] = t.dims, out = [];
  for (let i = 0; i < n; i++) {
    const v = new Float32Array(t.data.subarray(i * d, (i + 1) * d));
    let q = 0; for (const x of v) q += x * x; q = Math.sqrt(q) || 1;
    for (let j = 0; j < d; j++) v[j] /= q;
    out.push(v);
  }
  return out;
}
const huellaVisual = async img => filas((await clipVision(await clipProc(new RawImage(img.data, img.width, img.height, 4).rgb()))).image_embeds)[0];
const huellasTexto = async textos => filas((await clipTexto(clipTok(textos, { padding: true, truncation: true }))).text_embeds);
const P = await vectoresPrompts(huellasTexto);

/* materiales según SAM, como «✨ Detectar materiales con IA» (null si no encuentra regiones) */
async function materialesIA(S, kSens) {
  const raw = new RawImage(S.rgba, S.w, S.h, 4).rgb();
  const emb = await samModelo.get_image_embeddings(await samProc(raw));
  const regiones = await regionesSam({ modelo: samModelo, procesador: samProc, raw, emb, puntos: puntosMateriales(S), mascara: S.mask });
  return regiones.length ? contarMateriales(regiones, kSens) : null;
}

/* ---------- el forjador ---------- */

function metaDe(name) {
  const m = name.match(TAG); if (!m) return null;
  const nombre = m[2].replace(/(?:_(?:pseudo|legendary))?_\d_\d$/i, '').trim();
  return { w: +m[3], h: +m[4], dest: `${m[1]} - ${nombre}_${m[5].toLowerCase()}.png` };
}

/* v: los valores que mueve el ajuste automático; f: lo que propuso el ajuste del fondo */
function opciones(TW, TH, v, f) {
  return {
    remove: f.quitarFondo, ai: false, tol: f.tol, drift: 3.5, frame: true, island: 0.4, alphaMin: 128, globalTol: 1.6,
    eyeK: 6, eyeRare: 0.5, shineColor: [255, 255, 255], dotAuto: true, dotColor: [26, 16, 16],
    lineKeep: !!v.lineKeep, lineContrast: +G.lineContrast,
    TW, TH, K: +v.k, SH: +v.s, kAuto: !!v.kAuto, kSens: +G.kSens, lineL: 0, lineThr: 0.01, clean: +v.cl,
    colOut: !!v.colOut, mergeDE: +v.mergeDE, outline: !!G.outline, useLineArt: !!G.useLineArt,
    laAmount: +G.laAmount, laThin: G.laThin, laEdge: !!G.laEdge, laPerfect: !!G.laPerfect,
    laGaps: !!G.laGaps, laSmooth: +G.laSmooth, laMinPiece: +G.laMinPiece,
    minTone: Math.max(0, +v.mergeDE), minMat: Math.max(0, +v.mergeDE) * 1.5,
    cellCov: +G.cellCov / 100, lineStrong: +G.lnStrong / 100,
    spurs: +G.spurs, speck: +G.speck,
    lWeight: +G.lWeight, shadeSat: +G.shadeSat / 100, outDark: +G.outDark / 100, outSat: +G.outSat / 100,
    outMaxL: +G.outMaxL, outBlack: +G.outBlack, kIter: +G.kIter, seed: +G.seed
  };
}

function leerPng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width: W, height: H, data } = png;
  const k = Math.min(1, MAXSIDE / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(W - 1, Math.floor(x * W / w)), sy = Math.min(H - 1, Math.floor(y * H / h));
    const si = (sy * W + sx) * 4, di = (y * w + x) * 4;
    rgba[di] = data[si]; rgba[di + 1] = data[si + 1]; rgba[di + 2] = data[si + 2]; rgba[di + 3] = data[si + 3];
  }
  const lab = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) rgb2lab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], lab, i * 3);
  return { w, h, rgba, lab };
}

function lineasDe(S) {
  const L = {
    img: { naturalWidth: S.w, naturalHeight: S.h },
    frame: { x: 0, y: 0, w: S.w, h: S.h },
    w: S.w, h: S.h, rgba: S.rgba, lab: S.lab, mask: S.mask,
    maskVer: 1, scale: +LA['la-res'] || 1, cache: {}, hi: null
  };
  const r = createLineArt(L).compute({
    ai: false, aiAlpha: null, thin: LA['la-thin'] !== false,
    detail: +LA['la-detail'], smooth: +LA['la-smooth'], width: +LA['la-width'], outline: +LA['la-outline'],
    ink: !!LA['la-ink'], inkSens: +LA['la-inkSens'], min: +LA['la-min'],
    color: LA['la-color'], aa: !!LA['la-aa'], fill: !!LA['la-fill']
  });
  return { alpha: r.alpha, outer: r.outer, w: L.hi.w, h: L.hi.h, frame: { ...L.frame }, width: +LA['la-width'], color: hex2rgb(LA['la-color']) };
}

function pintarLineas(sp) {
  if (!sp.la) return sp.px;
  const { kind, zone, color } = sp.la, a = +G.laOpacity / 100, custom = hex2rgb(G.laCustom);
  const out = new Uint8ClampedArray(sp.px);
  for (let c = 0; c < kind.length; c++) {
    const k = kind[c];
    if (!k || (k === 1 && !G.laOuter) || (k === 2 && !G.laInner)) continue;
    let col = color;
    if (G.laColor === 'all' || (G.laColor === 'inner' && k === 2)) col = [zone[c * 3], zone[c * 3 + 1], zone[c * 3 + 2]];
    else if (G.laColor === 'custom') col = custom;
    const q = c * 4;
    if (out[q + 3]) for (let i = 0; i < 3; i++) out[q + i] = Math.round(out[q + i] + (col[i] - out[q + i]) * a);
    else { out[q] = col[0]; out[q + 1] = col[1]; out[q + 2] = col[2]; out[q + 3] = Math.round(255 * a); }
  }
  return out;
}

/* el sprite centrado en el lienzo de LADO × LADO */
function colocar(px, TW, TH) {
  const out = new Uint8Array(LADO * LADO * 4);
  const ox = Math.floor((LADO - TW) / 2), oy = Math.floor((LADO - TH) / 2);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const dx = x + ox, dy = y + oy;
    if (dx < 0 || dy < 0 || dx >= LADO || dy >= LADO) continue;
    const s = (y * TW + x) * 4, d = (dy * LADO + dx) * 4;
    out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
  }
  const png = new PNG({ width: LADO, height: LADO });
  png.data.set(out);
  return PNG.sync.write(png);
}

/* un diseño de principio a fin; devuelve lo que eligió el ajuste automático */
async function forjar(name, meta) {
  const im = leerPng(path.join(ORIGEN, name));
  const S = {
    w: im.w, h: im.h, rgba: im.rgba, lab: im.lab,
    mask: null, edits: null, bgSeeds: [], markers: [],
    matIdx: null, clusters: null, sprite: null,
    frame: { x: 0, y: 0, w: im.w, h: im.h, k: 1 }
  };
  const bg = createBg(S), clusters = createClusters(S);
  // fondo: «Ajustar automáticamente»
  const f = ajustarFondoPixeles(S);
  bg.compute(opciones(1, 1, BASE, f));
  const b = bg.bbox();
  if (!b) throw new Error('no queda figura al quitar el fondo');
  // tamaño: alto del nombre ×2 y el ancho por la proporción de la figura; si no cabe, lo más grande que quepa
  const aspecto = (b.x1 - b.x0) / (b.y1 - b.y0);
  let TH = Math.min(LADO, Math.round(meta.h * ZOOM)), TW = Math.max(1, Math.round(TH * aspecto));
  if (TW > LADO) { TW = LADO; TH = Math.max(1, Math.round(LADO / aspecto)); }
  const lines = G.useLineArt ? lineasDe(S) : null;
  const sprite = createSprite(S, { bbox: () => bg.bbox(), lineArtLines: () => lines });
  const kIA = await materialesIA(S, +G.kSens);
  const generar = v => {
    const o = opciones(TW, TH, v, f);
    if (o.kAuto && kIA) o.kIA = kIA;
    S.clusters = null;
    clusters.build(o);
    return sprite.generate(o);
  };
  // «✨ Ajustar automáticamente» del sprite: 4 combinaciones (la primera, los valores de partida); gana la mejor
  const original = await huellaVisual(originalRecortado(S, b));
  const lineasIA = siFrenteANo(original, P[2], P[3]);
  let mejor = null;
  // lleva «Contorno del color de cada zona»: «Contornos de color» apagado en todas las pruebas (se pisan)
  for (const v of combinaciones(BASE, 0).map(c => ({ ...c, colOut: false }))) {
    const sp = generar(v); if (!sp) continue;
    const ref = referencia(S, b, sp.TW, sp.TH); if (!ref) continue;
    const h = await huellaVisual(aCuadro(sp.px, sp.TW, sp.TH));
    const n = nota(medir(sp, ref), ref, parecido(original, h), siFrenteANo(h, P[0], P[1]), lineasIA);
    if (!mejor || n < mejor.nota) mejor = { nota: n, v };
  }
  if (!mejor) throw new Error('no salió ningún sprite');
  const sp = generar(mejor.v);
  // líneas del line art, «Contorno del color de cada zona» y al centro del lienzo
  const px = RETOQUES.contorno(pintarLineas(sp), sp.TW, sp.TH, { modo: 'zona' });
  fs.writeFileSync(path.join(DEST, meta.dest), colocar(px, sp.TW, sp.TH));
  return { TW: sp.TW, TH: sp.TH, v: mejor.v, kIA };
}

fs.mkdirSync(DEST, { recursive: true });
const files = fs.readdirSync(ORIGEN).filter(n => TAG.test(n) && (!FILTRO || n.toLowerCase().includes(FILTRO)) && !SALTAR.includes(n.match(TAG)[1]) && +n.match(TAG)[1] >= DESDE);
console.log('diseños', files.length, 'lienzo', `${LADO}×${LADO}`, SALTAR.length ? `(sin ${SALTAR.join(', ')})` : '', '→', DEST);

let hechos = 0, fallos = 0;
const t0 = Date.now();
for (let i = 0; i < files.length; i++) {
  const name = files[i], meta = metaDe(name); if (!meta) continue;
  if (!FORZAR && fs.existsSync(path.join(DEST, meta.dest))) { hechos++; continue; }
  const t = Date.now();
  try {
    const { TW, TH, v, kIA } = await forjar(name, meta);
    hechos++;
    console.log(`${i + 1}/${files.length} ${meta.dest}  ${TW}×${TH}  materiales ${v.kAuto && kIA ? kIA.length + ' (IA)' : v.k} · tonos ${v.s} · fusionar ${v.mergeDE} · limpieza ${v.cl} · líneas oscuras ${v.lineKeep ? 'sí' : 'no'} · contornos de color ${v.colOut ? 'sí' : 'no'}  ${((Date.now() - t) / 1000).toFixed(0)} s`);
  } catch (e) {
    fallos++;
    console.log(`${i + 1}/${files.length} fallo ${name}: ${e.message}`);
  }
}
console.log('listos', hechos, 'fallos', fallos, `${((Date.now() - t0) / 60000).toFixed(1)} min`);
