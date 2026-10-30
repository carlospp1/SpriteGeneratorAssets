/* Line art: turns a colour illustration into clean outlines, white inside and with a transparent background,
   like a page for colouring. It reuses the generator's components on its own state: image + crop, background
   removal with points / zones / brushes, the source canvas and its tools. The background is worked out exactly
   as in the generator (same working size, so the tolerance behaves the same); the lines are found on a copy of
   the picture at the size of the result (engine/lineart.js). */
import { createImage, loadImage } from '../../engine/image.js';
import { createBg } from '../../engine/background.js';
import { createLineArt, thin, distance } from '../../engine/lineart.js';
import { empezarTarea, esCancelacion } from '../source/tareasIA.js';
import { hex2rgb } from '../../engine/color.js';
import { settings, LINE_IDS, SCHEMA } from '../../state/settings.js';
import { createSignal, createValue } from '../../state/signal.js';
import { createSourceView } from '../source/view.js';
import { createSourceTools } from '../source/tools.js';
import { crearHistorial } from '../source/historial.js';
import { pageEnabled } from '../../app/env.js';
import { download, fileName } from '../../app/files.js';
import { S as G, setLineArtSource } from '../generator/state.js';
import { pipeline as genPipeline, loadFile as genLoadFile } from '../generator/pipeline.js';
import { project } from '../project/project.js';
import { mascaraParaPagina } from '../source/iaFondo.js';
import { lineasIA, lineasIAGuardadas } from './iaLineart.js';
import { elegirEstiloIA } from './referencias.js';
import { notificar } from '../source/notificaciones.js';

/* same shape as the generator state, so the shared components can work on it.
   hi: the picture at the size the lines are computed at { key, w, h, lab: [L, a, b] } */
export const L = {
  img: null, source: null, frame: null, w: 0, h: 0, rgba: null, lab: null, mask: null, edits: null,
  bgSeeds: [], markers: [], tool: 'none', view: 'cut', drag: null, cropDraft: null, selected: null, colorMap: {},
  hi: null, cache: {}, maskVer: 0, scale: 1
};
export const lineSignal = createSignal();     // lists, tools and buttons
export const resultSignal = createSignal();   // the result changed
export const lineMsg = createValue('');
export const lineInfo = createValue({ size: '–', res: '', ready: false });
const msg = t => lineMsg.set(t || '');
const $v = id => settings.get('la-' + id);

const image = createImage(L), bg = createBg(L), engine = createLineArt(L);
export const view = createSourceView({ S: L });
const out = document.createElement('canvas');   // the result (the page shows a copy of it)

/* read the settings of the page */
function opts() {
  const ia = !!$v('ai') && L.img && L.frame;
  return {
    ai: !!ia, aiStyle: $v('aiStyle'), thin: !!$v('thin'),
    // the AI's lines when they are already drawn for this picture (the generator's sprite uses them too)
    aiAlpha: ia ? lineasIAGuardadas(L.img, L.frame, $v('aiStyle'), ...hiSize()) : null,
    detail: +$v('detail'), smooth: +$v('smooth'), width: +$v('width'), outline: +$v('outline'),
    ink: !!$v('ink'), inkSens: +$v('inkSens'), min: +$v('min'), color: $v('color'), aa: !!$v('aa'), fill: !!$v('fill')
  };
}
const scaleOf = () => +$v('res') || 1;
const hiSize = () => { L.scale = scaleOf(); const { w, h } = engine.sizes(); return [w, h]; };

/* the last lines worked out, for the generator (see lines()) */
let linesVer = 0, lastLines = null;

let iaVer = 0;
function render() {
  if (!L.rgba || !L.mask) return;
  L.scale = scaleOf();
  const o = opts(), t0 = performance.now();
  if (o.ai && !o.aiAlpha) { renderIA(o); return; }
  const r = engine.render(o, out);
  lineInfo.set({ ...lineInfo.get(), size: `${r.W}×${r.H} px`, ready: true });
  resultSignal.bump();
  const ms = performance.now() - t0;
  msg(ms > 2500 ? `Calculado en ${(ms / 1000).toFixed(1)} s. Si va lento, reduce el tamaño del resultado en el paso 1.` : '');
  // the generator's sprite uses these lines: bring it up to date
  if (G.sprite && settings.get('useLineArt') && sameAsGenerator()) genPipeline.sprite();
}

/* the AI draws the lines (a few seconds, the first time also loading the model), then the result is made as usual */
async function renderIA(o) {
  const ver = ++iaVer;
  try {
    let estilo = o.aiStyle;
    if ($v('aiRefs')) {
      try { estilo = await elegirEstiloIA(L.img, L.frame, ...hiSize()); }
      catch (e) { if (esCancelacion(e)) throw e; /* CLIP failed: keep the chosen style */ }
      if (estilo !== $v('aiStyle')) settings.set('la-aiStyle', estilo, false);
    }
    await lineasIA(L.img, L.frame, estilo, ...hiSize());
    if (ver === iaVer) render();
  } catch (e) {
    if (ver !== iaVer) return;
    if (e.name === 'AbortError') { notificar('Cancelado: las líneas de la IA no se han dibujado. Desmarca «Que dibuje las líneas una IA» para usar las normales, o cambia el estilo para intentarlo de nuevo.', 'aviso'); msg(''); }
    else notificar('La IA no ha podido dibujar las líneas: ' + e.message);
  }
}

/* the line art comes from the generator's picture (same file), so its lines can go on the sprite */
function sameAsGenerator() {
  const a = L.img, b = G.img;
  if (!a || !b) return false;
  if (a === b || (L.source && L.source === G.source)) return true;
  // reopened from storage: separate copies of the same file
  return a.naturalWidth === b.naturalWidth && a.naturalHeight === b.naturalHeight && !!L.source && !!G.source && L.source.size === G.source.size;
}

/* the AI's lines for this picture (current style), if they were already drawn */
const lineasIADeAhora = () => (L.img && L.frame ? lineasIAGuardadas(L.img, L.frame, $v('aiStyle'), ...hiSize()) : null);

/* lines for the generator: opacity of every line pixel and of the outline alone, at the computing size,
   with where that size sits on the original picture. null when there is no line art of this picture.
   The generator chooses whose lines (laFuente): the tool's, or the AI's when they exist (else the tool's). */
function lines() {
  if (!L.mask || !sameAsGenerator()) return null;
  L.scale = scaleOf();
  const aiAlpha = settings.get('laFuente') === 'ai' ? lineasIADeAhora() : null;
  const k = linesVer + '|' + (aiAlpha ? 'ia' : 'herramienta');
  if (!lastLines || lastLines.k !== k) { const o = { ...opts(), aiAlpha }, r = engine.compute(o); lastLines = { k, alpha: r.alpha, outer: r.outer, o }; }
  const { alpha, outer, o } = lastLines;
  return { alpha, outer, w: L.hi.w, h: L.hi.h, frame: { ...L.frame }, width: o.width, color: hex2rgb(o.color) };
}
setLineArtSource(lines);

/* recalculate shortly after the last change (sliders fire many times while dragging) */
let timer = 0;
function schedule(delay = 120) {
  if (!L.rgba) return;
  project.touch();   // every change passes here: the design is unsaved and the session is kept
  linesVer++;
  clearTimeout(timer);
  timer = setTimeout(() => { msg('Calculando…'); requestAnimationFrame(() => setTimeout(render, 0)); }, delay);
}

/* ---------- shared components on the line art state ---------- */
const pipeline = {
  /* background by tolerance, or the AI's mask (shared with the generator: same picture) when «Quitar el fondo
     con IA» is on; the zones and retouches go on top */
  mask() {
    if (!L.rgba) return;
    const tol = +$v('tol'), remove = !!$v('bgRemove');
    const ai = remove && $v('bgAI') ? mascaraParaPagina(L, () => pipeline.mask()) : false;
    if (ai === null) { L.mask = null; view.draw(); return; }   // the AI is working
    bg.compute(ai ? { remove: true, aiMask: ai, island: 0.4 }
      : { remove: remove && tol > 0, tol, drift: 3.5, frame: true, island: 0.4, alphaMin: 128, globalTol: 1.6 });
    pipeline.maskEdited();
  },
  maskEdited() { L.maskVer++; view.draw(); sizeInfo(); schedule(0); historial.schedule(); },
  sprite() {}
};
const base = createSourceTools({
  S: L, view, image, bg, pipeline, signal: lineSignal,
  brush: () => settings.num('la-brush', 20), bgGlobal: () => !!$v('bgGlobal'), cellPx: () => 10
});
/* the view (sin fondo / silueta / original) is an undo step too */
export const tools = { ...base, setView: v => { base.setView(v); historial.schedule(); } };
export { bg };

/* undo / redo (Ctrl+Z, Ctrl+Y / Ctrl+Mayús+Z): every change of the page, see source/historial.js */
const historial = crearHistorial({
  S: L, image, ids: () => LINE_IDS.filter(id => !SCHEMA[id].ui),
  ocupado: () => !!L.drag,
  rehacer: () => { tools.select('none'); lineSignal.bump(); view.draw(); pipeline.mask(); }
});

function sizeInfo() {
  if (!L.frame) { lineInfo.set({ ...lineInfo.get(), res: '' }); return; }
  L.scale = scaleOf();
  const { W, H, w, h } = engine.sizes();
  lineInfo.set({ ...lineInfo.get(), res: `Original ${L.frame.w}×${L.frame.h} px → resultado ${W}×${H} px${W !== w || H !== h ? ` (se calcula a ${w}×${h} y se amplía)` : ''}.` });
}
function ready() { tools.select('none'); lineSignal.bump(); view.draw(); pipeline.mask(); historial.reset(); }

/* with the generator available the line art is always of its picture: a new one goes to the generator
   and comes here from there (see follow) */
async function loadFile(file) {
  if (genOn()) { await genLoadFile(file); msg('Imagen cargada también en el Generador: el Line art usa siempre su imagen.'); return; }
  let img;
  try { img = await loadImage(file); } catch { msg('No se pudo leer ese archivo. Prueba con un PNG o JPG.'); return; }
  image.start(img, file);   // a new picture: no crop, no retouches
  ready();
}

/* the generator's picture with its crop, background points, zones and brush work (and its tolerance) */
const genOn = () => pageEnabled('gen');
function fromGenerator() {
  if (!G.img) { msg('El Generador no tiene ninguna imagen cargada.'); return; }
  // same working size as the generator, so its points and brush work apply as they are
  image.restore(G.img, G.source, { frame: G.frame, markers: [], bgSeeds: G.bgSeeds, edits: G.edits });
  settings.setMany({ 'la-bgRemove': settings.get('bgRemove'), 'la-bgAI': settings.get('bgAI'), 'la-bgGlobal': settings.get('bgGlobal'), 'la-tol': settings.get('tol') }, false);
  ready();
}
/* the line art always has the generator's picture: when the generator gets another one (uploaded, pasted,
   a design opened) it comes here with its crop and background; the same picture keeps its own retouches */
function follow() {
  if (!genOn() || !G.img) return;
  if (!L.img || !sameAsGenerator()) fromGenerator();
}

/* settings: the lines are recomputed; the tolerance and «Quitar el fondo» redo the background */
let maskTimer = 0;
settings.listen(ids => {
  const own = ids.filter(id => id.startsWith('la-'));
  if (!own.length) return;
  historial.schedule();   // every setting of the page is an undo step
  if (own.length > 1) { pipeline.mask(); return; }   // several at once («Restablecer este paso»): everything again
  if (own.some(id => id === 'la-tol' || id === 'la-bgRemove' || id === 'la-bgAI')) { clearTimeout(maskTimer); maskTimer = setTimeout(pipeline.mask, own.includes('la-tol') ? 200 : 0); }
  // result size: only the lines are recomputed (the background does not depend on it)
  if (own.includes('la-res') && L.img) { sizeInfo(); schedule(0); }
  if (own.some(id => ['la-detail', 'la-smooth', 'la-width', 'la-outline', 'la-inkSens', 'la-min', 'la-color'].includes(id))) schedule();
  if (own.some(id => ['la-ink', 'la-aa', 'la-fill', 'la-ai', 'la-aiStyle', 'la-aiRefs', 'la-thin'].includes(id))) schedule(0);
});

function downloadPng() {
  if (!L.hi) return;
  out.toBlob(blob => download(blob, fileName($v('ai') ? '_lineart_ia' : '_lineart'), msg), 'image/png');
}

/* ---------- saving (with the design in «Mis diseños», and the working session) ---------- */
const DESIGN_IDS = LINE_IDS.filter(id => !SCHEMA[id].ui);
function serialize() {
  if (!L.img) return null;
  const f = L.frame, st = settings.pick(DESIGN_IDS);
  for (const id of DESIGN_IDS) if (typeof st[id] === 'number') st[id] = String(st[id]);
  return { source: L.source, frame: { x: f.x, y: f.y, w: f.w, h: f.h }, bgSeeds: L.bgSeeds.map(sd => ({ ...sd })),
    edits: L.edits ? L.edits.slice() : null, view: L.view, settings: st };
}
/* back to an empty page, settings at their defaults */
function clear() {
  clearTimeout(timer);
  image.clear(); Object.assign(L, { markers: [], tool: 'none', hi: null, cache: {} });
  settings.setMany(Object.fromEntries(DESIGN_IDS.map(id => [id, SCHEMA[id].def])), false);
  out.width = 0; out.height = 0;
  lineInfo.set({ size: '–', res: '', ready: false }); msg('');
  L.view = 'cut'; tools.select('none'); lineSignal.bump(); resultSignal.bump();
}
async function load(rec) {
  clear();
  if (!rec || !rec.source) return;
  const vals = {};
  for (const id of DESIGN_IDS) if (rec.settings && id in rec.settings) vals[id] = rec.settings[id];
  settings.setMany(vals, false);
  const img = await loadImage(rec.source);
  image.restore(img, rec.source, { frame: rec.frame, markers: [], bgSeeds: rec.bgSeeds || [], edits: rec.edits });
  L.view = rec.view || 'cut';
  ready();
}

/* «Ajustar automáticamente», line part: the tool's line values (detail, smoothing, dark strokes, their
   sensitivity, short strokes) in four combinations around the current ones. The judge uses no AI (the line art AI
   is only for the «IA» tab): good lines lie on the drawing's real edges — where its colour changes strongly — and
   cover them, without loose strokes over flat areas. The try whose centre lines agree most with those edges wins
   (2 px of margin, as an F-score). Every click tries four other combinations. */
const VALORES_LINEA = ['la-detail', 'la-smooth', 'la-ink', 'la-inkSens', 'la-min'];
async function ajustarLineas(ronda = 0) {
  if (!L.img || !L.mask || !L.frame) return null;
  const [w, h] = hiSize(), n = w * h;
  engine.compute({ ...opts(), aiAlpha: null });   // makes sure the picture is ready at the computing size
  if (!L.hi || L.hi.w !== w || L.hi.h !== h) return null;
  // the drawing's strong edges: lightness gradient (Sobel) above the 85th percentile, inside the drawing
  const Lc = L.hi.lab[0], mask = L.cache.mask && L.cache.mask.mask, g = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = Lc[i - w + 1] + 2 * Lc[i + 1] + Lc[i + w + 1] - Lc[i - w - 1] - 2 * Lc[i - 1] - Lc[i + w - 1];
    const gy = Lc[i + w - 1] + 2 * Lc[i + w] + Lc[i + w + 1] - Lc[i - w - 1] - 2 * Lc[i - w] - Lc[i - w + 1];
    g[i] = Math.hypot(gx, gy);
  }
  const dentro = [];
  for (let i = 0; i < n; i++) if (!mask || mask[i]) dentro.push(g[i]);
  dentro.sort((p, q) => p - q);
  const umbral = dentro[Math.floor(dentro.length * 0.85)] || 1;
  const bordes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bordes[i] = g[i] >= umbral && (!mask || mask[i]) ? 1 : 0;
  const ref = new Float32Array(n); for (let i = 0; i < n; i++) ref[i] = bordes[i];
  const centro = a => { const s = new Uint8Array(n); for (let i = 0; i < n; i++) s[i] = a[i] >= 0.5 ? 1 : 0; return thin(s, w, h); };
  const refC = centro(ref), dRef = distance(refC, w, h);
  let refN = 0; for (let i = 0; i < n; i++) refN += refC[i];
  if (!refN) return null;
  const antes = settings.pick(VALORES_LINEA);
  let s = ronda * 9301 + 49297;
  const azar = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const elige = l => l[Math.floor(azar() * l.length)];
  const lista = ronda === 0 ? [{ ...antes }] : [];
  while (lista.length < 4) lista.push({
    'la-detail': elige([25, 35, 45, 55, 65, 75]), 'la-smooth': elige([0.5, 1, 1.5, 2, 3]),
    'la-ink': azar() < 0.75, 'la-inkSens': elige([30, 40, 50, 60, 70]), 'la-min': elige([5, 10, 15, 25, 35])
  });
  let cancelada = false, mejor = null;
  const tarea = empezarTarea('Probando ajustes de las líneas…', () => { cancelada = true; });   // (no AI: just the four tries)
  try {
    for (const [i, c] of lista.entries()) {
      if (cancelada) break;
      tarea.texto(`Probando ajustes de las líneas (${i + 1} de 4)…`);
      await new Promise(r => setTimeout(r, 0));   // lets the «IA trabajando» window paint
      settings.setMany(c, false);
      const r = engine.compute({ ...opts(), aiAlpha: null });
      const cC = centro(r.alpha), dC = distance(cC, w, h);
      let nC = 0, aciertos = 0, cubiertos = 0;
      for (let p = 0; p < n; p++) {
        if (cC[p]) { nC++; if (dRef[p] <= 2) aciertos++; }
        if (refC[p] && dC[p] <= 2) cubiertos++;
      }
      const precision = nC ? aciertos / nC : 0, recall = cubiertos / refN;
      const f = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
      if (!mejor || f > mejor.f) mejor = { f, valores: c };
    }
  } finally { tarea.fin(); }
  settings.setMany(antes, false);
  if (!cancelada && mejor) settings.setMany(mejor.valores, true);   // the line art is drawn again with them
  else schedule(0);
  return mejor;
}

export const lineArt = {
  ajustarLineas,
  hayLineasIA: () => !!lineasIADeAhora(),
  deshacer: historial.deshacer, rehacer: historial.rehacer, teclaHistorial: historial.keyDown,
  has: () => !!L.img, serialize, load, clear, lines, follow, fromGenerator, loadFile, downloadPng, sameAsGenerator,
  canvas: () => (L.img && out.width ? out : null),
  result: () => out
};
