/* Pixel editor viewport: zoom, pan, checkerboard, grid, marching-ants selection, marquee / lasso
   previews, crop overlay, free-transform box, symmetry guides and the pixel cursor with its grid.
   The page hands it its stage and canvas with attach(); until then (or with the editor page disabled)
   it still keeps the composite canvas up to date, so floating windows and thumbnails work. */
import { E } from '../../engine/editor/E.js';
import { D } from '../../engine/editor/doc.js';
import * as pixgrid from '../../engine/pixgrid.js';
import { nav } from '../../app/nav.js';

const ZOOMS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
// auto: the view still matches the last «fit»; it refits on resize until the user zooms or pans
const V = { zoom: 8, ox: 0, oy: 0, hover: null, pan: null, space: false, auto: true };
let stage = null, canvas = null, ctx = null, tool = 'pencil';
let lastW = 0, lastH = 0;
const comp = document.createElement('canvas');
let compData = null, compDirty = true, raf = 0, checker = null;
let ants = null, antsVer = -1, antsPhase = 0;

const cssVar = (n, fb) => getComputedStyle(document.querySelector('.forja') || document.documentElement).getPropertyValue(n).trim() || fb;
const stageSize = () => { if (!stage) return [0, 0]; const r = stage.getBoundingClientRect(); return [r.width, r.height]; };

/* ---------- scheduling ---------- */
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
function invalidate() { compDirty = true; schedule(); }

function resize() {
  if (!canvas) return;
  const [w, h] = stageSize(), dpr = devicePixelRatio || 1;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  if (V.auto) fit();
  else if (lastW) { V.ox += Math.round((w - lastW) / 2); V.oy += Math.round((h - lastH) / 2); }   // keep the same centre
  lastW = w; lastH = h;
  schedule();
}

/* ---------- zoom / pan ---------- */
function fit() {
  const [w, h] = stageSize(); if (!w || !D.w) return;
  const best = Math.min(w / D.w, h / D.h) * 0.9;
  V.zoom = ZOOMS.filter(z => z <= best).pop() || 1;
  V.ox = Math.round((w - D.w * V.zoom) / 2); V.oy = Math.round((h - D.h * V.zoom) / 2);
  V.auto = true; E.ui.zoomChanged(V.zoom); schedule();
}
function setZoom(z, cx, cy) {
  if (cx == null) { const [w, h] = stageSize(); cx = w / 2; cy = h / 2; }
  const dx = (cx - V.ox) / V.zoom, dy = (cy - V.oy) / V.zoom;
  V.zoom = z; V.ox = Math.round(cx - dx * z); V.oy = Math.round(cy - dy * z);
  V.auto = false; E.ui.zoomChanged(z); schedule();
}
function zoomStep(dir, cx, cy) {
  const i = ZOOMS.indexOf(V.zoom), j = Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.findIndex(z => z > V.zoom) : i) + dir));
  if (ZOOMS[j] !== V.zoom) setZoom(ZOOMS[j], cx, cy);
}
/* centre the view on a document point (Navigator panel) */
function centerOn(x, y) { const [w, h] = stageSize(); V.ox = Math.round(w / 2 - x * V.zoom); V.oy = Math.round(h / 2 - y * V.zoom); V.auto = false; schedule(); }
/* visible part of the document, in document pixels (Navigator panel) */
function visibleRect() { const [w, h] = stageSize(); return { x: -V.ox / V.zoom, y: -V.oy / V.zoom, w: w / V.zoom, h: h / V.zoom }; }
/* centre of the visible part, in document pixels (paste goes there, like Photoshop) */
function viewCenter() { const r = visibleRect(); return [r.x + r.w / 2, r.y + r.h / 2]; }

/* ---------- drawing ---------- */
function checkerPattern() {
  if (checker) return checker;
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = cssVar('--chk1', '#fff'); x.fillRect(0, 0, 16, 16);
  x.fillStyle = cssVar('--chk2', '#ddd'); x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8);
  return (checker = ctx.createPattern(c, 'repeat'));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { checker = null; schedule(); });

/* outline of the selection mask as unit segments in document coordinates (cached per selection) */
function antsPath() {
  if (antsVer === D.selVer && ants) return ants;
  antsVer = D.selVer; ants = null;
  const s = D.sel; if (!s) return null;
  const m = s.mask, w = D.w, h = D.h, at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
  const p = new Path2D();
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
    if (!m[y * w + x]) continue;
    if (!at(x, y - 1)) { p.moveTo(x, y); p.lineTo(x + 1, y); }
    if (!at(x, y + 1)) { p.moveTo(x, y + 1); p.lineTo(x + 1, y + 1); }
    if (!at(x - 1, y)) { p.moveTo(x, y); p.lineTo(x, y + 1); }
    if (!at(x + 1, y)) { p.moveTo(x + 1, y); p.lineTo(x + 1, y + 1); }
  }
  return (ants = p);
}
/* black and white dashes that crawl, so the selection reads on any colour */
function strokeAnts(path, z, dpr) {
  ctx.save();
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * V.ox, dpr * V.oy);
  ctx.lineWidth = 1 / z;
  ctx.setLineDash([]); ctx.strokeStyle = '#000'; ctx.stroke(path);
  ctx.setLineDash([4 / z, 4 / z]); ctx.lineDashOffset = -antsPhase / z; ctx.strokeStyle = '#fff'; ctx.stroke(path);
  ctx.restore();
}
const sx = x => V.ox + x * V.zoom, sy = y => V.oy + y * V.zoom;

/* the document flattened into `comp` (also used without a page: floating windows, thumbnails) */
function updateComposite() {
  if (!compDirty || !D.has()) return;
  compData = D.composite({ overlay: E.overlay, replace: E.replacePreview });
  comp.width = D.w; comp.height = D.h;
  comp.getContext('2d').putImageData(new ImageData(compData, D.w, D.h), 0, 0);
  compDirty = false;
  E.ui.contentChanged(comp);
}

function draw() {
  updateComposite();
  if (!ctx) { E.ui.drawNav(); return; }
  const dpr = devicePixelRatio || 1, W = canvas.width / dpr, Hh = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, Hh);
  if (!D.has()) { E.ui.drawNav(); return; }
  const z = V.zoom, x = V.ox, y = V.oy, w = D.w * z, h = D.h * z;
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = checkerPattern(); ctx.fillRect(0, 0, w, h); ctx.restore();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(comp, x, y, w, h);

  if (E.opts.grid && z >= 6) {
    ctx.beginPath();
    for (let i = 1; i < D.w; i++) { ctx.moveTo(x + i * z + 0.5, y); ctx.lineTo(x + i * z + 0.5, y + h); }
    for (let j = 1; j < D.h; j++) { ctx.moveTo(x, y + j * z + 0.5); ctx.lineTo(x + w, y + j * z + 0.5); }
    ctx.strokeStyle = 'rgba(128,128,128,.28)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(128,128,128,.7)'; ctx.lineWidth = 1; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);

  // symmetry guides
  const accent = cssVar('--accent', '#E4572E'), mark = cssVar('--mark', '#2F6FD6');
  ctx.setLineDash([6, 4]); ctx.strokeStyle = accent;
  if (E.opts.mirrorX) { ctx.beginPath(); ctx.moveTo(x + w / 2, y - 8); ctx.lineTo(x + w / 2, y + h + 8); ctx.stroke(); }
  if (E.opts.mirrorY) { ctx.beginPath(); ctx.moveTo(x - 8, y + h / 2); ctx.lineTo(x + w + 8, y + h / 2); ctx.stroke(); }
  ctx.setLineDash([]);

  // crop: darken what will be cut away
  if (E.crop) {
    const c = E.crop, cx0 = Math.min(c.x0, c.x1), cy0 = Math.min(c.y0, c.y1), cx1 = Math.max(c.x0, c.x1) + 1, cy1 = Math.max(c.y0, c.y1) + 1;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.rect(sx(cx0), sy(cy0), (cx1 - cx0) * z, (cy1 - cy0) * z); ctx.fill('evenodd');
    ctx.strokeStyle = '#fff'; ctx.strokeRect(sx(cx0) + 0.5, sy(cy0) + 0.5, (cx1 - cx0) * z - 1, (cy1 - cy0) * z - 1);
  }

  // selection (hidden with View > Extras, Ctrl+H)
  if (E.opts.extras && D.sel && !E.transform) { const p = antsPath(); if (p) strokeAnts(p, z, dpr); }
  // marquee being dragged
  if (E.selShape) {
    const s = E.selShape, ax = Math.min(s.x0, s.x1), ay = Math.min(s.y0, s.y1), bw = (Math.abs(s.x1 - s.x0) + 1) * z, bh = (Math.abs(s.y1 - s.y0) + 1) * z;
    const p = new Path2D();
    if (s.type === 'ellipse') p.ellipse(sx(ax) + bw / 2, sy(ay) + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2); else p.rect(sx(ax) + 0.5, sy(ay) + 0.5, bw - 1, bh - 1);
    ctx.strokeStyle = '#000'; ctx.stroke(p); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.stroke(p); ctx.setLineDash([]);
  }
  // lasso being drawn
  if (E.selPath && E.selPath.points.length) {
    const pts = E.selPath.points, p = new Path2D();
    p.moveTo(sx(pts[0][0]), sy(pts[0][1])); for (const q of pts) p.lineTo(sx(q[0]), sy(q[1]));
    if (E.selPath.cursor) p.lineTo(sx(E.selPath.cursor[0]), sy(E.selPath.cursor[1]));
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(p); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.stroke(p); ctx.setLineDash([]);
    if (E.selPath.poly) { ctx.fillStyle = mark; ctx.fillRect(sx(pts[0][0]) - 3, sy(pts[0][1]) - 3, 6, 6); }
  }
  // free transform box with handles
  if (E.transform) {
    const b = E.transform.box, X = sx(b.x), Y = sy(b.y), BW = b.w * z, BH = b.h * z, s = E.tools.HANDLE;
    ctx.strokeStyle = mark; ctx.lineWidth = 1; ctx.strokeRect(X + 0.5, Y + 0.5, BW - 1, BH - 1);
    for (const [hx, hy] of [[X, Y], [X + BW / 2, Y], [X + BW, Y], [X + BW, Y + BH / 2], [X + BW, Y + BH], [X + BW / 2, Y + BH], [X, Y + BH], [X, Y + BH / 2]]) {
      ctx.fillStyle = '#fff'; ctx.fillRect(hx - s, hy - s, s * 2, s * 2); ctx.strokeRect(hx - s + 0.5, hy - s + 0.5, s * 2 - 1, s * 2 - 1);
    }
  }

  // pixel tools: grid around the pointer (Ctrl+' hides it) and the pixels the tool will touch
  if (V.hover && !V.pan && E.tools.isPixel(E.tool) && !E.transform) {
    const hx = V.hover.x, hy = V.hover.y;
    if (E.opts.grid) pixgrid.grid(ctx, { ox: x, oy: y, k: z, cx: hx + 0.5, cy: hy + 0.5, R: E.opts.size / 2 + 6, w: D.w, h: D.h });
    pixgrid.cursor(ctx, E.tools.cursorPixels(hx, hy), x, y, z);
  }
  E.ui.drawNav();
}

/* ---------- pointer ---------- */
function toDoc(e) {
  const r = canvas.getBoundingClientRect(), fx = (e.clientX - r.left - V.ox) / V.zoom, fy = (e.clientY - r.top - V.oy) / V.zoom;
  return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
}
// Alt + click picks a colour with these tools (with Dodge/Burn Alt swaps the effect, with selections it subtracts)
const ALT_PICK = new Set(['pencil', 'eraser', 'fill', 'line', 'rect', 'ellipse', 'dither']);
const CURSOR = { move: 'move', hand: 'grab', zoom: 'zoom-in', picker: 'copy', crop: 'crosshair' };

function onDown(e) {
  canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true });
  if (e.button === 1 || V.space || E.tool === 'hand') {
    e.preventDefault();
    V.pan = { sx: e.clientX, sy: e.clientY, ox: V.ox, oy: V.oy }; stage.classList.add('panning'); return;
  }
  if (e.button !== 0 && e.button !== 2) return;
  const r = canvas.getBoundingClientRect();
  if (E.tool === 'zoom') { zoomStep(e.altKey || e.button === 2 ? -1 : 1, e.clientX - r.left, e.clientY - r.top); return; }
  const p = toDoc(e), btn = e.button === 2 ? 2 : 0;
  if (e.altKey && ALT_PICK.has(E.tool)) { E.tools.pick(p.x, p.y, btn); return; }
  E.tools.down(p, btn, e);
}
function onMove(e) {
  if (V.pan) { V.ox = V.pan.ox + e.clientX - V.pan.sx; V.oy = V.pan.oy + e.clientY - V.pan.sy; V.auto = false; schedule(); return; }
  const p = toDoc(e);
  stage.classList.toggle('zoom-out', E.tool === 'zoom' && e.altKey);
  if (!V.hover || V.hover.x !== p.x || V.hover.y !== p.y || E.tools.isSelect(E.tool) || E.transform) {
    const changed = !V.hover || V.hover.x !== p.x || V.hover.y !== p.y;
    V.hover = p; if (changed) E.ui.status(p, compData); schedule();
    E.tools.move(p, e);
  }
}
function onUp(e) {
  if (V.pan) { V.pan = null; stage.classList.remove('panning'); return; }
  E.tools.up(toDoc(e), e);
}
const onDbl = () => E.tools.dbl();
const onCancel = () => { V.pan = null; stage.classList.remove('panning'); E.tools.cancel(); };
const onLeave = () => { V.hover = null; E.ui.status(null); schedule(); };
const onMenu = e => e.preventDefault();
function onWheel(e) {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
}

function setSpace(on) { V.space = on; if (stage) stage.classList.toggle('grab', on); }
function applyTool() { if (!stage) return; stage.dataset.tool = tool; stage.style.setProperty('--tool-cursor', CURSOR[tool] || 'crosshair'); }
function setTool(t) { tool = t; applyTool(); schedule(); }

/* the page's stage and canvas; returns the cleanup */
function attach(stageEl, canvasEl) {
  stage = stageEl; canvas = canvasEl; ctx = canvas.getContext('2d');
  const evs = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['dblclick', onDbl], ['pointercancel', onCancel],
    ['pointerleave', onLeave], ['contextmenu', onMenu]];
  for (const [t, f] of evs) canvas.addEventListener(t, f);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const ro = new ResizeObserver(resize); ro.observe(stage);
  // crawling ants while there is a selection (slow and cheap: only the overlay changes)
  const antsTimer = setInterval(() => { if (D.sel && E.opts.extras && nav.is('edit') && !document.hidden) { antsPhase = (antsPhase + 1) % 8; schedule(); } }, 140);
  applyTool(); lastW = 0; lastH = 0; compDirty = true; resize(); schedule();
  return () => {
    for (const [t, f] of evs) canvasEl.removeEventListener(t, f);
    canvasEl.removeEventListener('wheel', onWheel);
    ro.disconnect(); clearInterval(antsTimer);
    if (canvas === canvasEl) { stage = null; canvas = null; ctx = null; }
  };
}

export const view = E.view = {
  invalidate, schedule, fit, setZoom, zoomStep, setSpace, setTool, centerOn, visibleRect, viewCenter,
  lastComposite: () => compData, compositeCanvas: () => { if (compDirty) updateComposite(); return comp; }, state: V, resize, attach,
  hasStage: () => !!stage && stage.getBoundingClientRect().width > 0
};
