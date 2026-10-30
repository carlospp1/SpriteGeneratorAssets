/* Source canvas: the working image (cut / silhouette / original) with markers and background points,
   or, while cropping, the whole original with the crop rectangle. createSourceView({ S, onDraw }) works on a
   state object (the generator's or the line art's); attach(canvas) gives it the canvas on the page. */
import { MAXSIDE } from '../../engine/image.js';
import * as pixgrid from '../../engine/pixgrid.js';

const cssVar = (name, fb) => getComputedStyle(document.querySelector('.forja') || document.documentElement).getPropertyValue(name).trim() || fb;
const KEEP = '#1f9d55';   // "not background" points

export function createSourceView({ S, onDraw }) {
let canvas = null, over = null;   // set by attach() when the canvas is on the page

const previewScale = () => Math.min(1, MAXSIDE / Math.max(S.img.naturalWidth, S.img.naturalHeight));
function size(w, h) { if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h; }

/* ---------- geometry shared with the tools (canvas pixels) ---------- */
const HANDLE = 6;   // half size of a resize handle, in CSS px
const cssScale = () => { const r = canvas.getBoundingClientRect(); return r.width ? canvas.width / r.width : 1; };
function boxHandles(b) {
  const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
  return { nw: [b.x0, b.y0], n: [mx, b.y0], ne: [b.x1, b.y0], e: [b.x1, my], se: [b.x1, b.y1], s: [mx, b.y1], sw: [b.x0, b.y1], w: [b.x0, my] };
}
const markBox = m => ({ x0: m.x - m.rx, y0: m.y - m.ry, x1: m.x + m.rx, y1: m.y + m.ry });
const cropBox = r => { const k = previewScale(); return { x0: r.x * k, y0: r.y * k, x1: (r.x + r.w) * k, y1: (r.y + r.h) * k }; };
const seedRadius = () => Math.max(5, S.w / 90);

function drawHandles(cx, pts) {
  const s = HANDLE * cssScale();
  cx.setLineDash([]); cx.lineWidth = Math.max(1, s / 4);
  for (const [x, y] of pts) {
    cx.fillStyle = '#fff'; cx.fillRect(x - s, y - s, s * 2, s * 2);
    cx.strokeStyle = cssVar('--mark', '#2F6FD6'); cx.strokeRect(x - s, y - s, s * 2, s * 2);
  }
}
/* the selected mark: dashed box + 8 handles for eyes, end handles for strokes, one for points */
function drawSelection(cx) {
  const sel = S.selected; if (!sel) return;
  const it = sel.kind === 'seed' ? S.bgSeeds[sel.i] : S.markers[sel.i]; if (!it) return;
  const sc = cssScale();
  if ((sel.kind === 'mark' && (it.type === 'eye' || it.type === 'zone')) || it.type === 'cut') {
    const b = markBox(it);
    cx.setLineDash([5 * sc, 4 * sc]); cx.lineWidth = sc; cx.strokeStyle = cssVar('--mark', '#2F6FD6');
    cx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    drawHandles(cx, Object.values(boxHandles(b)));
  } else if (sel.kind === 'mark' && it.type === 'dot') drawHandles(cx, [[it.x, it.y], [it.x2, it.y2]]);
  else {
    cx.setLineDash([]); cx.lineWidth = 2 * sc; cx.strokeStyle = cssVar('--mark', '#2F6FD6');
    cx.beginPath(); cx.arc(it.x, it.y, (sel.kind === 'seed' ? seedRadius() : Math.max(4, S.w / 120)) + 4 * sc, 0, Math.PI * 2); cx.stroke();
  }
}

function drawWork() {
  const { w, h, rgba, mask } = S; if (!rgba || !mask || mask.length !== w * h) return;
  size(w, h);
  const cx = canvas.getContext('2d'), id = cx.createImageData(w, h), d = id.data;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (S.view === 'orig') { d[o] = rgba[o]; d[o + 1] = rgba[o + 1]; d[o + 2] = rgba[o + 2]; d[o + 3] = 255; }
    else if (!mask[i]) d[o + 3] = 0;
    else if (S.view === 'sil') { d[o] = 30; d[o + 1] = 34; d[o + 2] = 48; d[o + 3] = 255; }
    else { d[o] = rgba[o]; d[o + 1] = rgba[o + 1]; d[o + 2] = rgba[o + 2]; d[o + 3] = 255; }
  }
  cx.putImageData(id, 0, 0);
  drawMarkers(cx, w);
  drawSeeds(cx, w);
  drawSelection(cx);
}

function drawMarkers(cx, w) {
  const mark = cssVar('--mark', '#2F6FD6'), lw = Math.max(1.5, w / 400);
  cx.lineWidth = lw; cx.strokeStyle = mark; cx.fillStyle = mark;
  if (S.drag && S.drag.preview && S.drag.preview.type === 'cut') drawCut(cx, S.drag.preview);
  const all = S.drag && S.drag.preview && S.drag.preview.type !== 'cut' ? [...S.markers, S.drag.preview] : S.markers;
  for (const m of all) {
    cx.beginPath();
    if (m.type === 'eye') { cx.ellipse(m.x, m.y, Math.max(m.rx, 1), Math.max(m.ry, 1), 0, 0, Math.PI * 2); cx.stroke(); }
    else if (m.type === 'dot') { cx.moveTo(m.x, m.y); cx.lineTo(m.x2, m.y2); cx.lineWidth = Math.max(3, w / 200); cx.stroke(); cx.lineWidth = lw; cx.arc(m.x, m.y, 2, 0, 7); cx.fill(); }
    else if (m.type === 'shine') { cx.arc(m.x, m.y, Math.max(4, w / 120), 0, Math.PI * 2); cx.stroke(); cx.fillStyle = '#fff'; cx.fill(); cx.fillStyle = mark; }
    else if (m.type === 'zone') {
      // quality zone: dashed accent rectangle with a light tint
      const acc = cssVar('--accent', '#E4572E'), sc = cssScale();
      cx.save(); cx.globalAlpha = 0.12; cx.fillStyle = acc; cx.fillRect(m.x - m.rx, m.y - m.ry, m.rx * 2, m.ry * 2); cx.restore();
      cx.setLineDash([6 * sc, 4 * sc]); cx.strokeStyle = acc; cx.strokeRect(m.x - m.rx, m.y - m.ry, m.rx * 2, m.ry * 2);
      cx.setLineDash([]); cx.strokeStyle = mark;
    }
  }
}

/* "Quitar zona": red rectangle with hatching (also its preview while dragging) */
function drawCut(cx, c) {
  const sc = cssScale(), x0 = c.x - c.rx, y0 = c.y - c.ry, w = c.rx * 2, h = c.ry * 2;
  cx.save();
  cx.beginPath(); cx.rect(x0, y0, w, h); cx.clip();
  cx.fillStyle = 'rgba(220,40,40,.14)'; cx.fillRect(x0, y0, w, h);
  cx.strokeStyle = 'rgba(220,40,40,.55)'; cx.lineWidth = sc; cx.beginPath();
  for (let k = -h; k < w; k += 8 * sc) { cx.moveTo(x0 + k, y0 + h); cx.lineTo(x0 + k + h, y0); }
  cx.stroke(); cx.restore();
  cx.setLineDash([5 * sc, 3 * sc]); cx.strokeStyle = '#dc2828'; cx.lineWidth = 1.5 * sc; cx.strokeRect(x0, y0, w, h); cx.setLineDash([]);
}
/* background points: accent ring with a cross */
function drawSeeds(cx, w) {
  const r = seedRadius();
  cx.strokeStyle = cssVar('--accent', '#E4572E'); cx.lineWidth = Math.max(2, w / 300);
  for (const sd of S.bgSeeds) {
    if (sd.type === 'cut') { drawCut(cx, sd); continue; }
    if (sd.type === 'keep') { drawKeep(cx, sd, r, w); continue; }
    cx.beginPath(); cx.arc(sd.x, sd.y, r, 0, Math.PI * 2);
    cx.moveTo(sd.x - r * 0.6, sd.y - r * 0.6); cx.lineTo(sd.x + r * 0.6, sd.y + r * 0.6);
    cx.moveTo(sd.x + r * 0.6, sd.y - r * 0.6); cx.lineTo(sd.x - r * 0.6, sd.y + r * 0.6);
    cx.stroke();
  }
}

/* "not background" points: green ring with a plus */
function drawKeep(cx, sd, r, w) {
  cx.save();
  cx.strokeStyle = KEEP; cx.lineWidth = Math.max(2, w / 300);
  cx.fillStyle = 'rgba(255,255,255,.75)';
  cx.beginPath(); cx.arc(sd.x, sd.y, r, 0, Math.PI * 2); cx.fill(); cx.stroke();
  cx.beginPath();
  cx.moveTo(sd.x - r * 0.6, sd.y); cx.lineTo(sd.x + r * 0.6, sd.y);
  cx.moveTo(sd.x, sd.y - r * 0.6); cx.lineTo(sd.x, sd.y + r * 0.6);
  cx.stroke(); cx.restore();
}

function drawCrop() {
  const k = previewScale(), W = Math.round(S.img.naturalWidth * k), H = Math.round(S.img.naturalHeight * k);
  size(W, H);
  const cx = canvas.getContext('2d');
  cx.clearRect(0, 0, W, H); cx.imageSmoothingEnabled = true; cx.drawImage(S.img, 0, 0, W, H);
  const r = S.cropDraft || S.frame, rect = [r.x * k, r.y * k, r.w * k, r.h * k];
  cx.fillStyle = 'rgba(0,0,0,.55)';
  cx.beginPath(); cx.rect(0, 0, W, H); cx.rect(...rect); cx.fill('evenodd');
  cx.setLineDash([6, 4]); cx.lineWidth = Math.max(1.5, W / 400); cx.strokeStyle = cssVar('--mark', '#2F6FD6');
  cx.strokeRect(...rect); cx.setLineDash([]);
  drawHandles(cx, Object.values(boxHandles(cropBox(r))));
}

function draw() { if (!canvas) return; if (S.img) S.tool === 'crop' ? drawCrop() : drawWork(); drawHover(); if (onDraw) onDraw(); }

/* ---------- brush hover: pixel grid around the pointer and the pixels the brush will touch ---------- */
const PIX_OUTLINE = 64;   // bigger brushes get a round outline (pixel by pixel would be too slow)
let hover = null;
/* h = { x, y, r, pixels() } in image px (brush centre and radius), or null when the pointer leaves */
function setHover(h) { hover = h; drawHover(); }
function drawHover() {
  if (!over) return;
  if (!hover || !S.img || S.tool === 'crop') { over.hide(); return; }
  const { x, y, r: br } = hover;
  over.draw((cx, k) => {
    pixgrid.grid(cx, { ox: 0, oy: 0, k, cx: x, cy: y, R: br + 6, w: S.w, h: S.h });
    if (k >= 3 && br <= PIX_OUTLINE) pixgrid.cursor(cx, hover.pixels(), 0, 0, k);
    else pixgrid.ring(cx, x * k, y * k, br * k);
  });
}

/* pointer position in canvas pixels (working image px, or preview px while cropping) */
function evPos(e) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; }

/* the canvas element: set when it is on the page (null when it goes) */
function attach(el) { canvas = el; over = el ? pixgrid.overlay(el) : null; if (el) draw(); }

return { get canvas() { return canvas; }, attach, draw, evPos, previewScale, hover: setHover, geom: { HANDLE, cssScale, boxHandles, markBox, cropBox, seedRadius } };
}
