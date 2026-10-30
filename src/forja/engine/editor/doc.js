/* Pixel editor document, Photoshop style: layers (blend mode, opacity, lock transparent pixels), a
   pixel-mask selection (any shape) with floating pixels, clipboard, named history and compositing.
   Pixels are straight-alpha RGBA in Uint8ClampedArray(w * h * 4); masks are Uint8Array(w * h). */
import { E } from './E.js';
let nextId = 1;
// sel: { mask, x, y, w, h } (bounding box of the mask) · floating: { x, y, w, h, px, mask } · lastSel for "reselect"
export const D = { w: 0, h: 0, layers: [], active: 0, sel: null, floating: null, lastSel: null, selVer: 0 };
const H = { undo: [], redo: [] };   // entries: { label, state }
E.doc = D;

/* ---------- basics ---------- */
const idx = (x, y) => (y * D.w + x) * 4;
const inside = (x, y) => x >= 0 && y >= 0 && x < D.w && y < D.h;
const inSel = (x, y) => !D.sel || (inside(x, y) && D.sel.mask[y * D.w + x] === 1);
const cur = () => D.layers[D.active];

function makeLayer(name, px, extra) {
  return { id: nextId++, name, visible: true, opacity: 1, blend: 'normal', lockAlpha: false, generated: false,
    px: px || new Uint8ClampedArray(D.w * D.h * 4), ...extra };
}
function reset(w, h, layers, active = 0) {
  D.w = w; D.h = h; D.layers = layers; D.active = Math.max(0, Math.min(active, layers.length - 1));
  D.sel = null; D.floating = null; D.lastSel = null; D.selVer++; H.undo = []; H.redo = [];
}
function create(w, h, basePx, name = 'Capa 1', extra) {
  D.w = w; D.h = h;
  reset(w, h, [makeLayer(name, basePx ? new Uint8ClampedArray(basePx) : null, extra)]);
}
function clear() { reset(0, 0, []); }

/* ---------- history: full snapshots, each with the name of the action that followed ---------- */
const cloneSel = s => s && { ...s, mask: s.mask.slice() };
const snapshot = () => ({
  w: D.w, h: D.h, active: D.active, sel: cloneSel(D.sel), lastSel: D.lastSel,
  floating: D.floating && { ...D.floating, px: D.floating.px.slice(), mask: D.floating.mask.slice() },
  layers: D.layers.map(l => ({ ...l, px: l.px.slice() }))
});
function restore(s) { Object.assign(D, s); D.selVer++; }
const depth = () => Math.max(8, Math.min(80, Math.floor(80e6 / (D.w * D.h * 4 * Math.max(1, D.layers.length) + 1))));
/* call BEFORE changing anything; label names the step in the History panel */
function record(label = 'Edición') {
  H.undo.push({ label, state: snapshot() }); H.redo = [];
  while (H.undo.length > depth()) H.undo.shift();
}
function undo() { const e = H.undo.pop(); if (!e) return false; H.redo.push({ label: e.label, state: snapshot() }); restore(e.state); E.emit(); return true; }
function redo() { const e = H.redo.pop(); if (!e) return false; H.undo.push({ label: e.label, state: snapshot() }); restore(e.state); E.emit(); return true; }
const canUndo = () => H.undo.length > 0, canRedo = () => H.redo.length > 0;
const dropRecord = () => { H.undo.pop(); };
/* for the History panel: steps done (oldest first), steps that can be redone, and where we are */
const history = () => ({ done: H.undo.map(e => e.label), undone: H.redo.map(e => e.label).reverse(), pos: H.undo.length });
function historyGo(n) {
  while (H.undo.length > n && undo());
  while (H.undo.length < n && redo());
}
const undoLabel = () => H.undo.length ? H.undo[H.undo.length - 1].label : '';
const redoLabel = () => H.redo.length ? H.redo[H.redo.length - 1].label : '';

/* ---------- compositing with blend modes ---------- */
const BLEND = {
  normal: null,
  multiply: (s, d) => s * d / 255,
  screen: (s, d) => s + d - s * d / 255,
  overlay: (s, d) => d < 128 ? 2 * s * d / 255 : 255 - 2 * (255 - s) * (255 - d) / 255,
  darken: (s, d) => Math.min(s, d),
  lighten: (s, d) => Math.max(s, d),
  difference: (s, d) => Math.abs(s - d),
  add: (s, d) => Math.min(255, s + d)
};
function blendPx(out, o, r, g, b, a, f) {
  if (a <= 0) return;
  const da = out[o + 3] / 255;
  if (f && da > 0) {   // W3C compositing: the blended colour only where there is something below
    r = (1 - da) * r + da * f(r, out[o]); g = (1 - da) * g + da * f(g, out[o + 1]); b = (1 - da) * b + da * f(b, out[o + 2]);
  }
  const k = da * (1 - a), oa = a + k;
  out[o] = (r * a + out[o] * k) / oa; out[o + 1] = (g * a + out[o + 1] * k) / oa; out[o + 2] = (b * a + out[o + 2] * k) / oa;
  out[o + 3] = oa * 255;
}
function blendAll(out, src, op, f) {
  for (let o = 0; o < src.length; o += 4) if (src[o + 3]) blendPx(out, o, src[o], src[o + 1], src[o + 2], src[o + 3] / 255 * op, f);
}
function blendFloating(out, fl, op, f) {
  for (let j = 0; j < fl.h; j++) for (let i = 0; i < fl.w; i++) {
    const x = fl.x + i, y = fl.y + j, q = (j * fl.w + i) * 4;
    if (inside(x, y) && fl.mask[j * fl.w + i] && fl.px[q + 3]) blendPx(out, idx(x, y), fl.px[q], fl.px[q + 1], fl.px[q + 2], fl.px[q + 3] / 255 * op, f);
  }
}
/* opt.overlay: tool preview drawn over the active layer; opt.replace: pixels shown instead of the active layer */
function composite(opt = {}) {
  const out = new Uint8ClampedArray(D.w * D.h * 4);
  D.layers.forEach((l, li) => {
    if (!l.visible) return;
    const active = li === D.active, f = BLEND[l.blend] || null;
    blendAll(out, active && opt.replace ? opt.replace : l.px, l.opacity, f);
    if (active && D.floating) blendFloating(out, D.floating, l.opacity, f);
    if (active && opt.overlay) blendAll(out, opt.overlay, l.opacity, f);
  });
  return out;
}

/* ---------- selection masks ---------- */
function boundsOf(mask) {
  let x0 = D.w, y0 = D.h, x1 = -1, y1 = -1;
  for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) if (mask[y * D.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const selFromMask = mask => { const b = boundsOf(mask); return b ? { mask, ...b } : null; };
const emptyMask = () => new Uint8Array(D.w * D.h);
/* mode: 'replace' | 'add' | 'sub' | 'and' (Shift / Alt / Shift+Alt in Photoshop) */
function setSel(mask, mode = 'replace') {
  let m = mask;
  if (mode !== 'replace') {
    const a = D.sel ? D.sel.mask : emptyMask(); m = emptyMask();
    for (let i = 0; i < m.length; i++) m[i] = mode === 'add' ? (a[i] | mask[i]) : mode === 'sub' ? (a[i] && !mask[i] ? 1 : 0) : (a[i] & mask[i]);
  }
  D.sel = selFromMask(m);
  if (D.sel) D.lastSel = D.sel;
  D.selVer++;
}
function rectMask(x0, y0, x1, y1) {
  const m = emptyMask(), ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(D.w - 1, Math.max(x0, x1)), ay = Math.max(0, Math.min(y0, y1)), by = Math.min(D.h - 1, Math.max(y0, y1));
  for (let y = ay; y <= by; y++) m.fill(1, y * D.w + ax, y * D.w + bx + 1);
  return m;
}
function ellipseMask(x0, y0, x1, y1) {
  const m = emptyMask(), ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const cx = (ax + bx + 1) / 2, cy = (ay + by + 1) / 2, rx = (bx - ax + 1) / 2, ry = (by - ay + 1) / 2;
  for (let y = Math.max(0, ay); y <= Math.min(D.h - 1, by); y++) for (let x = Math.max(0, ax); x <= Math.min(D.w - 1, bx); x++)
    if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) m[y * D.w + x] = 1;
  return m;
}
/* polygon through pixel centres (lasso): even-odd rule, pixel centre inside */
function polyMask(pts) {
  const m = emptyMask(); if (pts.length < 3) return m;
  for (let y = 0; y < D.h; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > yc) !== (yj > yc)) xs.push(xi + (yc - yi) * (xj - xi) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(D.w - 1, Math.floor(xs[k + 1] - 0.5));
      if (b >= a) m.fill(1, y * D.w + a, y * D.w + b + 1);
    }
  }
  return m;
}
/* magic wand: pixels whose colour (and alpha) is within tol of the clicked one; contiguous or everywhere */
function wandMask(px, x, y, tol, contiguous) {
  const m = emptyMask(); if (!inside(x, y)) return m;
  const o0 = idx(x, y), t = [px[o0], px[o0 + 1], px[o0 + 2], px[o0 + 3]];
  const ok = o => {
    if (!t[3] && !px[o + 3]) return true;   // transparent matches transparent whatever its rgb
    return Math.abs(px[o] - t[0]) <= tol && Math.abs(px[o + 1] - t[1]) <= tol && Math.abs(px[o + 2] - t[2]) <= tol && Math.abs(px[o + 3] - t[3]) <= tol;
  };
  if (!contiguous) { for (let i = 0; i < m.length; i++) if (ok(i * 4)) m[i] = 1; return m; }
  const stack = [y * D.w + x];
  while (stack.length) {
    const i = stack.pop(); if (m[i] || !ok(i * 4)) continue;
    m[i] = 1; const xx = i % D.w, yy = (i / D.w) | 0;
    if (xx > 0) stack.push(i - 1); if (xx < D.w - 1) stack.push(i + 1); if (yy > 0) stack.push(i - D.w); if (yy < D.h - 1) stack.push(i + D.w);
  }
  return m;
}
const allMask = () => new Uint8Array(D.w * D.h).fill(1);
function layerAlphaMask(l = cur()) { const m = emptyMask(); for (let i = 0; i < m.length; i++) if (l.px[i * 4 + 3]) m[i] = 1; return m; }
function invertSel() { const a = D.sel ? D.sel.mask : emptyMask(), m = emptyMask(); for (let i = 0; i < m.length; i++) m[i] = a[i] ? 0 : 1; setSel(m); }
/* grow (n > 0) or shrink (n < 0) the selection by |n| pixels (8-neighbourhood) */
function modifySel(n) {
  if (!D.sel) return;
  let m = D.sel.mask;
  for (let step = 0; step < Math.abs(n); step++) {
    const out = m.slice(), grow = n > 0;
    for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) {
      const i = y * D.w + x; if (!!m[i] === grow) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, v = inside(X, Y) ? m[Y * D.w + X] : 0;
        if (grow ? v : !v) { out[i] = grow ? 1 : 0; dy = dx = 2; }
      }
    }
    m = out;
  }
  setSel(m);
}
/* the selection outline moves (not the pixels): selection tools dragging inside the selection */
function shiftSel(dx, dy) {
  if (!D.sel) return;
  const a = D.sel.mask, m = emptyMask();
  for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) { const X = x - dx, Y = y - dy; if (inside(X, Y) && a[Y * D.w + X]) m[y * D.w + x] = 1; }
  D.sel = selFromMask(m); D.selVer++;
}

/* ---------- floating pixels (moving or transforming a selection) ---------- */
/* cut (or copy, when copy is true: Alt + drag duplicates) the selected pixels into a floating block */
function lift(copy) {
  if (D.floating || !D.sel) return;
  const s = D.sel, l = cur(), px = new Uint8ClampedArray(s.w * s.h * 4), mask = new Uint8Array(s.w * s.h);
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const X = s.x + i, Y = s.y + j; if (!s.mask[Y * D.w + X]) continue;
    const o = idx(X, Y), q = (j * s.w + i) * 4;
    px[q] = l.px[o]; px[q + 1] = l.px[o + 1]; px[q + 2] = l.px[o + 2]; px[q + 3] = l.px[o + 3]; mask[j * s.w + i] = 1;
    if (!copy) l.px.fill(0, o, o + 4);
  }
  D.floating = { x: s.x, y: s.y, w: s.w, h: s.h, px, mask };
}
function floatingMask() {
  const fl = D.floating, m = emptyMask();
  for (let j = 0; j < fl.h; j++) for (let i = 0; i < fl.w; i++) { const X = fl.x + i, Y = fl.y + j; if (fl.mask[j * fl.w + i] && inside(X, Y)) m[Y * D.w + X] = 1; }
  return m;
}
function syncFloatingSel() { D.sel = selFromMask(floatingMask()); D.selVer++; }
function moveFloating(x, y) { const fl = D.floating; if (!fl) return; fl.x = x; fl.y = y; syncFloatingSel(); }
/* replace the floating block (free transform resizes it) */
function setFloating(fl) { D.floating = fl; syncFloatingSel(); }
/* stamp the floating block into the active layer; the selection stays where the pixels landed */
function commit() {
  const fl = D.floating; if (!fl) return;
  const l = cur();
  for (let j = 0; j < fl.h; j++) for (let i = 0; i < fl.w; i++) {
    const x = fl.x + i, y = fl.y + j, q = (j * fl.w + i) * 4;
    if (inside(x, y) && fl.mask[j * fl.w + i] && fl.px[q + 3]) blendPx(l.px, idx(x, y), fl.px[q], fl.px[q + 1], fl.px[q + 2], fl.px[q + 3] / 255);
  }
  syncFloatingSel();
  D.floating = null;
}

/* ---------- clipboard (inside the app; images from the system can also be pasted, see ui) ---------- */
let clip = null;
function blockFromSel(px) {
  const s = D.sel, out = new Uint8ClampedArray(s.w * s.h * 4), mask = new Uint8Array(s.w * s.h);
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const X = s.x + i, Y = s.y + j; if (!s.mask[Y * D.w + X]) continue;
    const o = idx(X, Y), q = (j * s.w + i) * 4;
    out.set(px.subarray(o, o + 4), q); mask[j * s.w + i] = 1;
  }
  return { x: s.x, y: s.y, w: s.w, h: s.h, px: out, mask };
}
/* merged = copy what is seen (all visible layers), like "Copiar combinado" */
function copy(merged) {
  if (D.floating && !merged) { const f = D.floating; clip = { ...f, px: f.px.slice(), mask: f.mask.slice() }; return true; }
  if (!D.sel) return false;
  clip = blockFromSel(merged ? composite() : cur().px); return true;
}
/* clear the selected pixels (with locked transparency they become `fill`, like Photoshop's background colour) */
function deleteSelection(fill) {
  if (D.floating) { D.floating = null; D.selVer++; return; }
  if (!D.sel) return;
  const l = cur();
  for (let i = 0; i < D.w * D.h; i++) if (D.sel.mask[i]) {
    const o = i * 4;
    if (l.lockAlpha) { if (l.px[o + 3] && fill) { l.px[o] = fill[0]; l.px[o + 1] = fill[1]; l.px[o + 2] = fill[2]; } }
    else l.px.fill(0, o, o + 4);
  }
}
/* paste into a new layer, like Photoshop: in place, or centred at (cx, cy) */
function paste(inPlace, cx, cy, block = clip) {
  if (!block) return false;
  commit();
  addLayer();
  const x = inPlace ? block.x : Math.round(cx - block.w / 2), y = inPlace ? block.y : Math.round(cy - block.h / 2);
  setFloating({ x, y, w: block.w, h: block.h, px: block.px.slice(), mask: block.mask ? block.mask.slice() : new Uint8Array(block.w * block.h).fill(1) });
  return true;
}
const hasClip = () => !!clip;

/* ---------- layers ---------- */
function addLayer(name, px) {
  commit();
  const l = makeLayer(name || 'Capa ' + (D.layers.length + 1), px);
  D.layers.splice(D.active + 1, 0, l); D.active++;
  return l;
}
function duplicateLayer() {
  commit();
  const s = cur(), l = makeLayer(s.name + ' copia', s.px.slice(), { opacity: s.opacity, visible: s.visible, blend: s.blend, lockAlpha: s.lockAlpha });
  D.layers.splice(D.active + 1, 0, l); D.active++;
}
/* Ctrl+J / Ctrl+Mayús+J: the selection to a new layer (copied or cut); without selection, the whole layer */
function layerVia(cut) {
  commit();
  if (!D.sel) { duplicateLayer(); return; }
  const l = cur(), block = blockFromSel(l.px);
  if (cut) for (let i = 0; i < D.w * D.h; i++) if (D.sel.mask[i]) l.px.fill(0, i * 4, i * 4 + 4);
  const n = makeLayer(cut ? 'Capa cortada' : 'Capa copiada');
  for (let j = 0; j < block.h; j++) for (let i = 0; i < block.w; i++) if (block.mask[j * block.w + i]) n.px.set(block.px.subarray((j * block.w + i) * 4, (j * block.w + i) * 4 + 4), idx(block.x + i, block.y + j));
  D.layers.splice(D.active + 1, 0, n); D.active++;
}
function deleteLayer() {
  if (D.layers.length < 2) return false;
  D.floating = null;
  D.layers.splice(D.active, 1); D.active = Math.max(0, D.active - 1);
  return true;
}
function moveLayer(dir) {
  const j = D.active + dir; if (j < 0 || j >= D.layers.length) return false;
  commit();
  [D.layers[D.active], D.layers[j]] = [D.layers[j], D.layers[D.active]]; D.active = j;
  return true;
}
/* move the active layer to position `to` (drag in the Layers panel, bring to front / send to back) */
function moveLayerTo(to) {
  to = Math.max(0, Math.min(D.layers.length - 1, to)); if (to === D.active) return false;
  commit();
  const [l] = D.layers.splice(D.active, 1); D.layers.splice(to, 0, l); D.active = to;
  return true;
}
function mergeDown() {
  if (D.active < 1) return false;
  commit();
  const top = cur(), below = D.layers[D.active - 1];
  if (top.visible) blendAll(below.px, top.px, top.opacity, BLEND[top.blend]);
  D.layers.splice(D.active, 1); D.active--;
  return true;
}
/* Mayús+Ctrl+E: every visible layer into one; hidden layers stay as they are */
function mergeVisible() {
  commit();
  const vis = D.layers.filter(l => l.visible); if (vis.length < 2) return false;
  const merged = makeLayer('Combinada', composite());
  const at = D.layers.indexOf(vis[0]);
  D.layers = D.layers.filter(l => !l.visible); D.layers.splice(Math.min(at, D.layers.length), 0, merged);
  D.active = D.layers.indexOf(merged);
  return true;
}
/* Acoplar imagen: everything into a single layer (hidden layers are dropped, like Photoshop) */
function flatten() {
  commit();
  if (D.layers.length < 2 && cur().blend === 'normal' && cur().opacity === 1) return false;
  D.layers = [makeLayer('Fondo', composite())]; D.active = 0;
  return true;
}
function setActive(i) { if (i === D.active || i < 0 || i >= D.layers.length) return; commit(); D.active = i; }

/* ---------- save / load ---------- */
/* peek: read without touching the document (an autosave must not drop a selection being moved) */
function serialize(peek) {
  if (!D.layers.length) return null;
  if (!peek) commit();
  const layers = D.layers.map(l => ({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, lockAlpha: l.lockAlpha, generated: l.generated, px: l.px.slice() }));
  const fl = peek && D.floating;
  if (fl) {
    const px = layers[D.active].px;
    for (let j = 0; j < fl.h; j++) for (let i = 0; i < fl.w; i++) {
      const x = fl.x + i, y = fl.y + j, q = (j * fl.w + i) * 4;
      if (inside(x, y) && fl.mask[j * fl.w + i] && fl.px[q + 3]) blendPx(px, idx(x, y), fl.px[q], fl.px[q + 1], fl.px[q + 2], fl.px[q + 3] / 255);
    }
  }
  return { w: D.w, h: D.h, active: D.active, layers };
}
function load(data) {
  if (!data || !data.layers || !data.layers.length) { clear(); return; }
  D.w = data.w; D.h = data.h;
  reset(data.w, data.h, data.layers.map(l => makeLayer(l.name, new Uint8ClampedArray(l.px), {
    visible: l.visible !== false, opacity: l.opacity == null ? 1 : l.opacity, blend: l.blend || 'normal', lockAlpha: !!l.lockAlpha, generated: !!l.generated
  })), data.active || 0);
}

Object.assign(D, {
  idx, inside, inSel, cur, makeLayer, create, clear,
  record, dropRecord, undo, redo, canUndo, canRedo, history, historyGo, undoLabel, redoLabel,
  composite, blendPx, blendAll, BLEND,
  setSel, rectMask, ellipseMask, polyMask, wandMask, allMask, layerAlphaMask, invertSel, modifySel, shiftSel, boundsOf, selFromMask,
  lift, commit, moveFloating, setFloating, copy, paste, hasClip, deleteSelection, blockFromSel,
  addLayer, duplicateLayer, layerVia, deleteLayer, moveLayer, moveLayerTo, mergeDown, mergeVisible, flatten, setActive,
  serialize, load,
  has: () => D.layers.length > 0
});
