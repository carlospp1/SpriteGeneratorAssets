/* Tools on the source canvas: crop, background / not-background points, brushes and sprite markers.
   Everything placed on the canvas can be clicked to select it, then moved or resized with its handles.
   createSourceTools(ctx) runs one page (the generator or the line art) on its own state:
   ctx = { S, view, image, bg, signal (bumped when lists / buttons change), pipeline: { mask, maskEdited, sprite },
   brush() (radius of the brushes), bgGlobal() (new background points take their tone everywhere),
   cellPx() (size of a sprite pixel in working px, for default mark sizes),
   clic(tool, x, y) (optional: the page's own one-click tools; true if it handled the click) }. */

import { segmentar } from './iaSam.js';
import { notificar } from './notificaciones.js';

export const HINTS = {
  mat: 'Haz clic sobre una parte del dibujo para seleccionar su material (pelo, piel, ropa…).',
  iabg: 'Haz clic sobre algo que sea fondo (un texto, una sombra, una marca de agua…): la IA lo selecciona entero, con su forma, y lo quita.',
  iakeep: 'Haz clic sobre una parte del dibujo que se haya borrado como fondo: la IA la selecciona entera, con su forma, y la recupera.',
  crop: 'Arrastra un rectángulo sobre la parte que quieres usar. Después arrastra sus esquinas o lados para ajustarlo (o desde dentro para moverlo) y pulsa «Aplicar recorte».',
  cut: 'Arrastra un rectángulo sobre lo que sobra: todo lo que quede dentro deja de ser personaje. Haz clic en una zona para moverla o cambiar su tamaño con las esquinas; Supr la quita.',
  bg: 'Haz clic en una zona que siga siendo fondo: se quitará junto con todo lo que la rodea del mismo tono. Arrastra un punto ya marcado para moverlo.',
  keep: 'Haz clic en una parte del personaje que se haya borrado como si fuera fondo (por ejemplo, ropa blanca sobre fondo blanco): se recupera junto con lo que la rodea del mismo tono. Arrastra un punto ya marcado para moverlo.',
  erase: 'Pinta sobre restos de fondo para quitarlos de la silueta.',
  restore: 'Pinta sobre partes del personaje que se hayan borrado para recuperarlas.',
  eye: 'Arrastra un rectángulo sobre cada ojo. Haz clic en un ojo marcado para seleccionarlo: arrastra sus esquinas para cambiar el tamaño, desde dentro para moverlo, y Supr para quitarlo.',
  dot: 'Haz clic para un píxel oscuro (nariz) o arrastra para una línea (boca, cejas). Arrastra sus extremos para ajustarla.',
  shine: 'Haz clic donde quieras un píxel de brillo. Arrástralo para moverlo.',
  zone: 'Arrastra un rectángulo donde quieras más colores (blancos, brillos o degradados que se juntan). En la lista eliges cuántos colores usa la zona. Clic en ella para ajustarla.',
  none: 'Haz clic en cualquier marca para seleccionarla y ajustarla: esquinas para el tamaño, dentro para mover, Supr para quitar, flechas para mover 1 px.'
};
export const MARK_NAMES = { eye: 'Detalle de ojo', dot: 'Trazo oscuro', shine: 'Brillo', zone: 'Zona de colores' };
export const ZONE_COLORS = 8;   // default colours of a new quality zone
const BRUSH = { erase: false, restore: true };
const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move', p1: 'move', p2: 'move' };
export const sameSel = (a, b) => !!a && !!b && a.kind === b.kind && a.i === b.i;

export function createSourceTools(ctx) {
const { S, view, image, bg, pipeline, signal } = ctx;
const G = view.geom;
let toolBeforeCrop = S.tool === 'crop' ? 'none' : S.tool;
const changed = () => signal.bump();

/* ---------- tool and view ---------- */
function select(tool) {
  if (tool === 'crop' && S.tool !== 'crop') toolBeforeCrop = S.tool;
  if (tool !== S.tool) { S.cropDraft = null; S.drag = null; }
  if (tool === 'crop' || tool in BRUSH) S.selected = null;
  S.tool = tool;
  if (view.canvas) view.canvas.style.cursor = '';
  if (!(tool in BRUSH)) view.hover(null);
  changed(); view.draw();
}
/* the Recortar button toggles crop mode */
const toggleTool = t => select(t === 'crop' && S.tool === 'crop' ? toolBeforeCrop : t);
function setView(v) { S.view = v; changed(); view.draw(); }

/* ---------- geometry ---------- */
const tolPx = () => G.HANDLE * 1.5 * G.cssScale();
function hitBox(b, x, y, t, allowMove = true) {
  for (const [id, [hx, hy]] of Object.entries(G.boxHandles(b))) if (Math.abs(x - hx) <= t && Math.abs(y - hy) <= t) return id;
  return allowMove && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 ? 'move' : null;
}
/* drag a handle (or the whole box) by dx, dy; boxes never get smaller than min */
function resizeBox(b, h, dx, dy, min) {
  let { x0, y0, x1, y1 } = b;
  if (h === 'move') return { x0: x0 + dx, y0: y0 + dy, x1: x1 + dx, y1: y1 + dy };
  if (h.includes('w')) x0 = Math.min(x0 + dx, x1 - min);
  if (h.includes('e')) x1 = Math.max(x1 + dx, x0 + min);
  if (h.includes('n')) y0 = Math.min(y0 + dy, y1 - min);
  if (h.includes('s')) y1 = Math.max(y1 + dy, y0 + min);
  return { x0, y0, x1, y1 };
}
function distToSeg(x, y, m) {
  const vx = m.x2 - m.x, vy = m.y2 - m.y, L = vx * vx + vy * vy;
  const t = L ? Math.max(0, Math.min(1, ((x - m.x) * vx + (y - m.y) * vy) / L)) : 0;
  return Math.hypot(x - (m.x + t * vx), y - (m.y + t * vy));
}
const itemOf = sel => sel && (sel.kind === 'seed' ? S.bgSeeds[sel.i] : S.markers[sel.i]);

/* what is under (x, y): handles of the selected item first, then the topmost item */
function hitOne(sel, x, y, t) {
  const it = itemOf(sel); if (!it) return null;
  if (sel.kind === 'seed' && it.type === 'cut') {
    if (sameSel(sel, S.selected)) { const h = hitBox(G.markBox(it), x, y, t); if (h) return h; }
    return Math.abs(x - it.x) <= it.rx + t && Math.abs(y - it.y) <= it.ry + t ? 'move' : null;
  }
  if (sel.kind === 'seed') return Math.hypot(x - it.x, y - it.y) <= Math.max(t, G.seedRadius()) ? 'move' : null;
  if (it.type === 'eye' || it.type === 'zone') {
    if (sameSel(sel, S.selected)) { const h = hitBox(G.markBox(it), x, y, t); if (h) return h; }
    if (it.type === 'zone') return Math.abs(x - it.x) <= it.rx + t && Math.abs(y - it.y) <= it.ry + t ? 'move' : null;
    return ((x - it.x) / (it.rx + t)) ** 2 + ((y - it.y) / (it.ry + t)) ** 2 <= 1 ? 'move' : null;
  }
  if (it.type === 'dot') {
    if (Math.hypot(x - it.x, y - it.y) <= t) return 'p1';
    if (Math.hypot(x - it.x2, y - it.y2) <= t) return 'p2';
    return distToSeg(x, y, it) <= t ? 'move' : null;
  }
  return Math.hypot(x - it.x, y - it.y) <= t * 1.3 ? 'move' : null;
}
function hitAt(x, y) {
  const t = tolPx(), order = [];
  if (S.selected) order.push(S.selected);
  for (let i = S.markers.length - 1; i >= 0; i--) order.push({ kind: 'mark', i });
  for (let i = S.bgSeeds.length - 1; i >= 0; i--) order.push({ kind: 'seed', i });
  for (const sel of order) { const h = hitOne(sel, x, y, t); if (h) return { sel, h }; }
  return null;
}
/* the crop box can always be resized from its handles; moving it needs an actual crop (not the whole image) */
function cropHit(x, y) {
  const r = S.cropDraft || S.frame;
  return hitBox(G.cropBox(r), x, y, tolPx(), !!S.cropDraft || !image.isFull());
}

/* ---------- crop ---------- */
function cropRect(x0, y0, x1, y1) {
  const k = view.previewScale(), W = S.img.naturalWidth, H = S.img.naturalHeight;
  const cl = (v, m) => Math.max(0, Math.min(m, v / k));
  const ax = cl(Math.min(x0, x1), W), bx = cl(Math.max(x0, x1), W), ay = cl(Math.min(y0, y1), H), by = cl(Math.max(y0, y1), H);
  const x = Math.floor(ax), y = Math.floor(ay);
  return { x, y, w: Math.ceil(bx) - x, h: Math.ceil(by) - y };
}
const canApplyCrop = () => !!S.cropDraft;
const canResetCrop = () => !!S.img && !image.isFull();
function applyFrame(frame) { image.setFrame(frame); changed(); pipeline.mask(); }
function cropApply() {
  const r = S.cropDraft; if (!r) return;
  S.cropDraft = null;
  applyFrame(image.makeFrame(r.x, r.y, r.w, r.h));
  select(toolBeforeCrop);
}
function cropReset() {
  if (!S.img) return;
  S.cropDraft = null;
  applyFrame(image.fullFrame());
  changed(); view.draw();
}

/* ---------- live sprite while dragging marks (at most once per frame) ---------- */
let spriteRaf = 0;
const liveSprite = () => { if (!spriteRaf) spriteRaf = requestAnimationFrame(() => { spriteRaf = 0; pipeline.sprite(); }); };

/* ---------- pointer ---------- */
const clampX = v => Math.max(0, Math.min(S.w - 1, v)), clampY = v => Math.max(0, Math.min(S.h - 1, v));
/* brushes show the pixels they will touch (and a pixel grid when the cells are big enough) */
function brushHover(x, y) {
  if (!(S.tool in BRUSH)) return;
  const r = ctx.brush();
  view.hover({ x, y, r, pixels: () => bg.brushPixels(x, y, r) });
}

function down(e) {
  if (!S.img || e.button !== 0) return;
  const canvas = view.canvas;
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = view.evPos(e);
  if (S.tool === 'crop') {
    const h = cropHit(x, y);
    S.drag = h ? { kind: 'cropEdit', h, b0: G.cropBox(S.cropDraft || S.frame), x0: x, y0: y } : { kind: 'cropNew', x0: x, y0: y };
    return;
  }
  if (S.tool in BRUSH) { S.drag = { kind: 'brush' }; bg.paint(x, y, BRUSH[S.tool], ctx.brush()); view.draw(); return; }
  if (S.tool === 'iabg' || S.tool === 'iakeep') { iaClick(x, y, S.tool === 'iakeep'); return; }
  // herramientas de un solo clic que pone la página (el generador: «Seleccionar material»)
  if (ctx.clic && ctx.clic(S.tool, x, y)) return;
  const hit = hitAt(x, y);
  if (hit) {
    S.selected = hit.sel;
    S.drag = { kind: 'edit', sel: hit.sel, h: hit.h, x0: x, y0: y, orig: { ...itemOf(hit.sel) }, moved: false };
    changed(); view.draw(); return;
  }
  const hadSel = !!S.selected;
  if (hadSel) { S.selected = null; changed(); }
  S.drag = S.tool === 'none' ? null : { kind: 'new', x0: x, y0: y, hadSel };
  view.draw();
}

function move(e) {
  if (!S.img) return;
  const [x, y] = view.evPos(e), d = S.drag;
  brushHover(x, y);
  if (!d) {   // hover: show what a drag would do
    let h = null;
    if (S.tool === 'crop') h = cropHit(x, y);
    else if (!(S.tool in BRUSH)) { const hit = hitAt(x, y); h = hit && hit.h; }
    view.canvas.style.cursor = h ? CURSORS[h] : '';
    return;
  }
  const dx = x - d.x0, dy = y - d.y0;
  switch (d.kind) {
    case 'brush': bg.paint(x, y, BRUSH[S.tool], ctx.brush()); break;
    case 'cropNew': S.cropDraft = cropRect(d.x0, d.y0, x, y); changed(); break;
    case 'cropEdit': {
      let mx = dx, my = dy;
      if (d.h === 'move') {   // keep the whole box inside the image when moving it
        const k = view.previewScale(), W = S.img.naturalWidth * k, H = S.img.naturalHeight * k;
        mx = Math.max(-d.b0.x0, Math.min(W - d.b0.x1, dx)); my = Math.max(-d.b0.y0, Math.min(H - d.b0.y1, dy));
      }
      const b = resizeBox(d.b0, d.h, mx, my, 8 * view.previewScale());
      S.cropDraft = cropRect(b.x0, b.y0, b.x1, b.y1); changed(); break;
    }
    case 'edit': {
      d.moved = d.moved || Math.abs(dx) + Math.abs(dy) > 0.5;
      const it = itemOf(d.sel), o = d.orig;
      if ((d.sel.kind === 'seed' && it.type !== 'cut') || it.type === 'shine') { it.x = clampX(o.x + dx); it.y = clampY(o.y + dy); }
      else if (it.type === 'dot') {
        if (d.h !== 'p2') { it.x = clampX(o.x + dx); it.y = clampY(o.y + dy); }
        if (d.h !== 'p1') { it.x2 = clampX(o.x2 + dx); it.y2 = clampY(o.y2 + dy); }
      } else {
        const b = resizeBox(G.markBox(o), d.h, dx, dy, 2);
        it.x = (b.x0 + b.x1) / 2; it.y = (b.y0 + b.y1) / 2; it.rx = (b.x1 - b.x0) / 2; it.ry = (b.y1 - b.y0) / 2;
      }
      if (d.sel.kind === 'mark') liveSprite();
      break;
    }
    case 'new':
      if (S.tool === 'eye' || S.tool === 'zone' || S.tool === 'cut') d.preview = { type: S.tool, x: (d.x0 + x) / 2, y: (d.y0 + y) / 2, rx: Math.abs(dx) / 2, ry: Math.abs(dy) / 2 };
      if (S.tool === 'dot') d.preview = { type: 'dot', x: d.x0, y: d.y0, x2: x, y2: y };
      break;
  }
  view.draw();
}

/* «IA: es fondo» / «IA: no es fondo»: the AI selects the thing that was clicked and it becomes background or
   drawing, like painting it with the brush (so it survives tolerance changes) */
async function iaClick(x, y, keep) {
  if (!S.edits || !S.mask) return;
  const img = S.img;
  try {
    const sel = await segmentar(S, [{ x, y, dentro: true }]);
    if (S.img !== img || sel.length !== S.mask.length) return;   // the picture changed meanwhile
    for (let i = 0; i < sel.length; i++) if (sel[i]) { S.edits[i] = keep ? 1 : 2; S.mask[i] = keep ? 1 : 0; }
    pipeline.maskEdited(); changed();
  } catch (e) {
    if (e.name !== 'AbortError') notificar('La IA no ha podido seleccionar: ' + e.message);
  }
}

function up(e) {
  const d = S.drag; if (!d) return;
  const [x, y] = view.evPos(e); S.drag = null;
  switch (d.kind) {
    case 'brush': pipeline.maskEdited(); return;
    case 'cropNew': case 'cropEdit':
      if (S.cropDraft && (S.cropDraft.w < 8 || S.cropDraft.h < 8)) S.cropDraft = null;
      changed(); view.draw(); return;
    case 'edit':
      if (!d.moved) { view.draw(); return; }
      if (d.sel.kind === 'seed') { changed(); pipeline.mask(); } else marksChanged();
      return;
  }
  // a plain click on empty space while something was selected only deselects it
  if (d.hadSel && Math.hypot(x - d.x0, y - d.y0) < 3 * G.cssScale()) { view.draw(); return; }
  // new item
  let added = null;
  if (S.tool === 'bg') { bg.addSeed(x, y, !!ctx.bgGlobal()); added = { kind: 'seed', i: S.bgSeeds.length - 1 }; }
  else if (S.tool === 'keep') { bg.addKeep(x, y); added = { kind: 'seed', i: S.bgSeeds.length - 1 }; }
  else if (S.tool === 'cut') {
    const rx = Math.abs(x - d.x0) / 2, ry = Math.abs(y - d.y0) / 2;
    if (rx < 2 || ry < 2) { view.draw(); return; }   // a click is not a rectangle
    S.bgSeeds.push({ type: 'cut', x: (d.x0 + x) / 2, y: (d.y0 + y) / 2, rx, ry }); added = { kind: 'seed', i: S.bgSeeds.length - 1 };
  }
  else if (S.tool === 'eye') {
    let rx = Math.abs(x - d.x0) / 2, ry = Math.abs(y - d.y0) / 2;
    if (rx < 3 && ry < 3) { const c = ctx.cellPx(); rx = c * 2.6; ry = c * 3.4; }
    S.markers.push({ type: 'eye', x: (d.x0 + x) / 2, y: (d.y0 + y) / 2, rx, ry });
  } else if (S.tool === 'zone') {
    let rx = Math.abs(x - d.x0) / 2, ry = Math.abs(y - d.y0) / 2;
    if (rx < 3 && ry < 3) { const c = ctx.cellPx(); rx = ry = c * 4; }
    S.markers.push({ type: 'zone', x: (d.x0 + x) / 2, y: (d.y0 + y) / 2, rx, ry, colors: ZONE_COLORS });
  } else if (S.tool === 'dot') S.markers.push({ type: 'dot', x: d.x0, y: d.y0, x2: x, y2: y });
  else if (S.tool === 'shine') S.markers.push({ type: 'shine', x, y });
  else return;
  S.selected = added || { kind: 'mark', i: S.markers.length - 1 };   // ready to adjust right away
  if (added) { changed(); pipeline.mask(); } else marksChanged();
}
function cancel() { S.drag = null; view.draw(); }

/* pointer handlers for the canvas element (React props) */
const pointer = { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: cancel, onPointerLeave: () => view.hover(null) };

/* ---------- keyboard: delete / nudge / deselect the selected mark (the page calls it while it is shown) ---------- */
function removeSelected() {
  const sel = S.selected; if (!sel) return;
  S.selected = null;
  if (sel.kind === 'seed') { S.bgSeeds.splice(sel.i, 1); changed(); pipeline.mask(); }
  else { S.markers.splice(sel.i, 1); marksChanged(); }
}
let nudgeTimer;
/* tool shortcuts, the same on every page with these tools (matched by the physical key: with Ctrl + Alt, that is
   AltGr, the letter changes, e.g. «€») */
const ATAJOS = { 'alt+KeyE': 'bg', 'shift+KeyE': 'keep' };
function atajo(e) {
  if (!e.ctrlKey || e.metaKey || (e.altKey && e.shiftKey)) return null;
  return ATAJOS[(e.altKey ? 'alt+' : e.shiftKey ? 'shift+' : '') + e.code] || null;
}
function keyDown(e) {
  if (e.defaultPrevented) return;
  const t = e.target;
  if (t.closest && (t.closest('input:not([type=checkbox]):not([type=range]), select, textarea, dialog') || t.isContentEditable)) return;
  const tool = atajo(e);
  if (tool) { e.preventDefault(); select(tool); return; }
  if (!S.selected) return;
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
  else if (e.key === 'Escape') { S.selected = null; changed(); view.draw(); }
  else if (arrows[e.key] && t.type !== 'range') {
    e.preventDefault();
    const [ax, ay] = arrows[e.key], s = e.shiftKey ? 10 : 1, it = itemOf(S.selected);
    it.x = clampX(it.x + ax * s); it.y = clampY(it.y + ay * s);
    if (it.type === 'dot') { it.x2 = clampX(it.x2 + ax * s); it.y2 = clampY(it.y2 + ay * s); }
    view.draw();
    const sel = S.selected; clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => sel.kind === 'seed' ? pipeline.mask() : pipeline.sprite(), 120);
  }
}

/* ---------- lists ---------- */
function marksChanged() { changed(); view.draw(); pipeline.sprite(); }
const seedsChanged = () => { changed(); pipeline.mask(); };
const actions = {
  /* click on a list item: select it (again: deselect) */
  pick(sel) { S.selected = sameSel(sel, S.selected) ? null : sel; changed(); view.draw(); },
  removeMark(i) { S.markers.splice(i, 1); S.selected = null; marksChanged(); },
  removeSeed(i) { S.bgSeeds.splice(i, 1); S.selected = null; seedsChanged(); },
  toggleGlobal(i) { const sd = S.bgSeeds[i]; sd.global = !sd.global; seedsChanged(); },
  zoneColors(i, n) { const m = S.markers[i]; m.colors = Math.max(2, Math.round(+n) || ZONE_COLORS); changed(); pipeline.sprite(); },
  undoMark() { S.markers.pop(); S.selected = null; marksChanged(); },
  clearMarks() { S.markers = []; S.selected = null; marksChanged(); },
  undoSeed() { S.bgSeeds.pop(); S.selected = null; seedsChanged(); },
  clearSeeds() { bg.clearRetouch(); S.selected = null; seedsChanged(); }
};

return { select, toggleTool, setView, refreshLists: changed, updateCropButtons: changed, canApplyCrop, canResetCrop, cropApply, cropReset, pointer, keyDown, ...actions };
}
