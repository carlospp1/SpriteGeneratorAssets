/* The analyzer's picture, worked with the same pieces as the generator, the line art and «Separar figuras»:
   image + crop, background removal (tolerance, or the AI with its checkbox) with points / zones / brushes / AI
   clicks, the source canvas with its tools, undo. What is left as the drawing (its mask) is what the analyzer
   measures and compares with your Pokémon. The working image keeps the original size up to 2048 px; sizes are
   given in pixels of the original (of its crop). */
import { createImage, loadImage } from '../../engine/image.js';
import { createBg } from '../../engine/background.js';
import { settings, AN_IDS } from '../../state/settings.js';
import { createSignal } from '../../state/signal.js';
import { createSourceView } from '../source/view.js';
import { createSourceTools } from '../source/tools.js';
import { crearHistorial } from '../source/historial.js';
import { mascaraParaPagina } from '../source/iaFondo.js';
import { notificar } from '../source/notificaciones.js';

const LADO_MAX = 2048;
const ALFA_MIN = 8;

/* same shape as the generator state, so the shared components can work on it */
export const A = {
  img: null, source: null, frame: null, w: 0, h: 0, rgba: null, lab: null, mask: null, edits: null,
  bgSeeds: [], markers: [], tool: 'none', view: 'cut', drag: null, cropDraft: null, selected: null, colorMap: {},
  maxSide: (w, h) => Math.min(LADO_MAX, Math.max(w, h))
};
export const anSignal = createSignal();     // lists, tools and buttons
export const figSignal = createSignal();    // the drawing (its mask) changed
const $v = id => settings.get('an-' + id);

const image = createImage(A), bg = createBg(A);
export const view = createSourceView({ S: A });

const pipeline = {
  /* background by tolerance, or the AI's mask when «Quitar el fondo con IA» is on; zones and retouches on top */
  mask() {
    if (!A.rgba) return;
    const tol = +$v('tol'), remove = !!$v('bgRemove');
    const ai = remove && $v('bgAI') ? mascaraParaPagina(A, () => pipeline.mask()) : false;
    if (ai === null) { A.mask = null; view.draw(); figSignal.bump(); return; }   // the AI is working
    bg.compute(ai ? { remove: true, aiMask: ai, island: 0.4 }
      : { remove: remove && tol > 0, tol, drift: 3.5, frame: true, island: 0.4, alphaMin: 128, globalTol: 1.6 });
    pipeline.maskEdited();
  },
  maskEdited() { view.draw(); figSignal.bump(); historial.schedule(); },
  sprite() {}
};
const base = createSourceTools({
  S: A, view, image, bg, pipeline, signal: anSignal,
  brush: () => settings.num('an-brush', 20), bgGlobal: () => !!$v('bgGlobal'), cellPx: () => 10
});
/* the view (sin fondo / silueta / original) is an undo step too */
export const tools = { ...base, setView: v => { base.setView(v); historial.schedule(); } };
export { bg };

/* undo / redo (Ctrl+Z, Ctrl+Y / Ctrl+Mayús+Z) of everything done on the picture */
const historial = crearHistorial({
  S: A, image, ids: () => AN_IDS, ocupado: () => !!A.drag,
  rehacer: () => { base.select('none'); anSignal.bump(); pipeline.mask(); }
});

async function loadFile(file) {
  let img;
  try { img = await loadImage(file); } catch { notificar('No se pudo leer esa imagen. Prueba con un PNG o JPG.'); return; }
  image.start(img, file);   // a new picture: no crop, no retouches
  base.select('none'); anSignal.bump(); view.draw(); pipeline.mask();
  historial.reset();
}

/* the tolerance, «Quitar el fondo» and the AI checkbox redo the background */
let timer = 0;
settings.listen(ids => {
  const own = ids.filter(id => id.startsWith('an-'));
  if (!own.length) return;
  if (own.length > 1 || own.some(id => ['an-tol', 'an-bgRemove', 'an-bgAI'].includes(id))) {
    clearTimeout(timer);
    timer = setTimeout(pipeline.mask, own.includes('an-tol') ? 200 : 0);
  }
  historial.schedule();
});

/* the drawing as the analyzer wants it: { im: { file, w, h, rgba }, fig: { es, r }, k } in working pixels, with k =
   working px per original px (to give sizes in original pixels); null while there is no drawing */
export function figuraActual() {
  if (!A.img || !A.mask || !A.rgba) return null;
  const { w, h, rgba, mask } = A, es = i => mask[i] && rgba[i * 4 + 3] >= ALFA_MIN;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (es(y * w + x)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const r = x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  return { im: { file: A.source, w, h, rgba }, fig: { es, r }, k: A.frame ? A.frame.k : 1 };
}

export const estadoAn = {
  loadFile, deshacer: historial.deshacer, rehacer: historial.rehacer, keyDown: historial.keyDown,
  has: () => !!A.img
};
