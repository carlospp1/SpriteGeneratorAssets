/* Pixel editor tools, Photoshop style. The view turns pointer events into document coordinates
   (p.x / p.y = pixel, p.fx / p.fy = exact position) and calls down / move / up / dbl here.
   btn: 0 = foreground colour (left button), 2 = background colour (right button).
   Selection tools combine like Photoshop: Shift adds, Alt subtracts, Shift+Alt intersects. */
import { E } from './E.js';
import { D } from './doc.js';
import { O } from './ops.js';

E.tool = 'pencil';
E.opts = {
  size: 1, pixelPerfect: true, contiguous: true, fillTol: 0, shapeFill: false,
  shadePalette: false, shadeMode: 'dodge', mirrorX: false, mirrorY: false, grid: true, extras: true,
  selMode: 'replace', wandTol: 32, wandContiguous: true, sampleAll: false
};
E.colors = { primary: [24, 20, 37, 255], secondary: [255, 255, 255, 255] };
E.overlay = null;        // preview pixels of lines and shapes
E.selShape = null;       // marquee being dragged: { type: 'rect' | 'ellipse', x0, y0, x1, y1 }
E.selPath = null;        // lasso being drawn: { points: [[x, y]], cursor: [x, y], poly }
E.crop = null;           // crop rectangle { x0, y0, x1, y1 } (pixels, inclusive)
E.transform = null;      // free transform: { orig, box: { x, y, w, h } }
E.lastPoint = null;      // end of the last stroke, for Shift + click straight lines

const TRANSPARENT = [0, 0, 0, 0];
const STROKE = new Set(['pencil', 'eraser', 'shade', 'dither']);
const SHAPE = new Set(['line', 'rect', 'ellipse']);
const USES_BRUSH = new Set([...STROKE, ...SHAPE]);
const SELECT = new Set(['marquee', 'ellipseSel', 'lasso', 'polyLasso', 'wand']);
const PIXEL = new Set([...USES_BRUSH, 'fill', 'picker', 'wand']);   // tools aimed at pixels: grid and cursor
let drag = null;

/* ---------- geometry ---------- */
function bresenham(x0, y0, x1, y1, fn) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function rectPts(x0, y0, x1, y1, filled) {
  const pts = [], [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (filled || x === ax || x === bx || y === ay || y === by) pts.push([x, y]);
  return pts;
}
function ellipsePts(x0, y0, x1, y1, filled) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  const cx = (ax + bx + 1) / 2, cy = (ay + by + 1) / 2, rx = (bx - ax + 1) / 2, ry = (by - ay + 1) / 2;
  if (rx < 1.5 || ry < 1.5) return rectPts(ax, ay, bx, by, true);
  const In = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const pts = [];
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++)
    if (In(x, y) && (filled || !In(x - 1, y) || !In(x + 1, y) || !In(x, y - 1) || !In(x, y + 1))) pts.push([x, y]);
  return pts;
}
/* Shift: lines snap to 0/45/90°, rectangles and ellipses become squares and circles */
function constrain(x0, y0, x, y, kind) {
  const dx = x - x0, dy = y - y0;
  if (kind === 'line') {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > ay * 2) return [x, y0];
    if (ay > ax * 2) return [x0, y];
    const m = Math.max(ax, ay); return [x0 + Math.sign(dx) * m, y0 + Math.sign(dy) * m];
  }
  const m = Math.max(Math.abs(dx), Math.abs(dy)); return [x0 + (Math.sign(dx) || 1) * m, y0 + (Math.sign(dy) || 1) * m];
}

/* ---------- plotting with brush size, symmetry, selection and locked transparency ---------- */
function mirrors(x, y) {
  const pts = [[x, y]];
  if (E.opts.mirrorX) pts.push([D.w - 1 - x, y]);
  if (E.opts.mirrorY) pts.push([x, D.h - 1 - y]);
  if (E.opts.mirrorX && E.opts.mirrorY) pts.push([D.w - 1 - x, D.h - 1 - y]);
  return pts;
}
function footprint(x, y) {
  const s = E.opts.size, a = -Math.floor((s - 1) / 2), pts = [];
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) pts.push([x + a + i, y + a + j]);
  return pts;
}
/* the pixels the current tool would touch at x, y (hover cursor) */
function cursorPixels(x, y) {
  const t = E.tool, pts = [];
  for (const [mx, my] of t === 'picker' || t === 'wand' ? [[x, y]] : mirrors(x, y)) pts.push(...(USES_BRUSH.has(t) ? footprint(mx, my) : [[mx, my]]));
  return pts;
}
function plot(x, y, fn, brush = true) {
  const lock = D.cur().lockAlpha, px = D.cur().px;
  for (const [mx, my] of mirrors(x, y)) for (const [qx, qy] of brush ? footprint(mx, my) : [[mx, my]])
    if (D.inside(qx, qy) && D.inSel(qx, qy) && (!lock || px[D.idx(qx, qy) + 3])) fn(qx, qy);
}
/* with locked transparency colours change but the alpha of each pixel is kept */
function paintAt(px, o, c) {
  if (D.cur().lockAlpha) { if (px[o + 3]) { px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; } }
  else O.setAt(px, o, c);
}

/* ---------- stroke tools ---------- */
function strokeOp(tool, btn, ev) {
  const l = D.cur().px;
  const col = btn === 2 ? E.colors.secondary : E.colors.primary, alt = btn === 2 ? E.colors.primary : E.colors.secondary;
  if (tool === 'pencil') return (x, y) => paintAt(l, D.idx(x, y), col);
  // eraser: transparent, or the background colour where transparency is locked (like Photoshop)
  if (tool === 'eraser') return (x, y) => paintAt(l, D.idx(x, y), D.cur().lockAlpha ? E.colors.secondary : TRANSPARENT);
  if (tool === 'dither') return (x, y) => paintAt(l, D.idx(x, y), (x + y) % 2 ? alt : col);
  // dodge / burn: each pixel once per stroke; right button or Alt does the opposite
  const pal = E.opts.shadePalette ? O.documentColours() : null;
  let dir = E.opts.shadeMode === 'burn' ? -1 : 1; if (btn === 2) dir = -dir; if (ev && ev.altKey) dir = -dir;
  return (x, y) => {
    const k = y * D.w + x; if (drag.visited[k]) return; drag.visited[k] = 1;
    const o = D.idx(x, y); if (!l[o + 3]) return;
    O.setAt(l, o, O.shade(O.getAt(l, o), dir, pal));
  };
}
/* pixel perfect: drop the corner pixel of every L-shaped step so 1 px lines stay clean */
function pixelPerfect(x, y) {
  const pts = drag.pts, last = pts[pts.length - 1];
  if (last && last[0] === x && last[1] === y) return false;
  pts.push([x, y]);
  if (pts.length >= 3) {
    const [a, b, c] = pts.slice(-3);
    if (Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1 && (b[0] === a[0] || b[1] === a[1]) && (b[0] === c[0] || b[1] === c[1])) {
      const l = D.cur().px;
      plot(b[0], b[1], (px, py) => { const o = D.idx(px, py); l.set(drag.base.subarray(o, o + 4), o); }, false);
      pts.splice(-2, 1);
    }
  }
  return true;
}
function strokeTo(x, y) {
  const usePP = E.tool === 'pencil' && E.opts.pixelPerfect && E.opts.size === 1;
  bresenham(drag.lx, drag.ly, x, y, (px, py) => { if (usePP && !pixelPerfect(px, py)) return; plot(px, py, drag.op); });
  drag.lx = x; drag.ly = y;
}

/* ---------- shapes ---------- */
function shapePts(x, y, shift) {
  const [ex, ey] = shift ? constrain(drag.x0, drag.y0, x, y, E.tool) : [x, y];
  if (E.tool === 'line') { const pts = []; bresenham(drag.x0, drag.y0, ex, ey, (a, b) => pts.push([a, b])); return pts; }
  if (E.tool === 'rect') return rectPts(drag.x0, drag.y0, ex, ey, E.opts.shapeFill);
  return ellipsePts(drag.x0, drag.y0, ex, ey, E.opts.shapeFill);
}
function drawShape(target, pts, col) { for (const [x, y] of pts) plot(x, y, (px, py) => paintAt(target, D.idx(px, py), col)); }

/* ---------- eyedropper: what you see (all layers) or only the current layer ---------- */
function pick(x, y, btn) {
  if (!D.inside(x, y)) return;
  const src = E.opts.sampleAll ? E.view.lastComposite() : D.cur().px, o = D.idx(x, y);
  if (!src || !src[o + 3]) return;
  E.colors[btn === 2 ? 'secondary' : 'primary'] = [src[o], src[o + 1], src[o + 2], 255];
  E.ui.colorsChanged();
}

/* ---------- selection helpers ---------- */
const modeOf = ev => ev.shiftKey && ev.altKey ? 'and' : ev.shiftKey ? 'add' : ev.altKey ? 'sub' : E.opts.selMode;
const SEL_LABEL = { replace: 'Selección', add: 'Añadir a la selección', sub: 'Restar de la selección', and: 'Intersecar selección' };
const inFloating = (x, y) => { const f = D.floating; return f && x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h && f.mask[(y - f.y) * f.w + (x - f.x)]; };
function startMovePixels(x, y, copy) {
  if (!D.floating) { D.record(copy ? 'Duplicar selección' : 'Mover'); D.lift(copy); }
  drag = { kind: 'moveSel', sx: x, sy: y, fx: D.floating.x, fy: D.floating.y };
}
function finishPoly() {
  const sp = E.selPath; if (!sp) return;
  E.selPath = null;
  if (sp.points.length >= 3) { D.record(SEL_LABEL[sp.mode] + ' (lazo)'); D.setSel(D.polyMask(sp.points), sp.mode); }
  E.emit();
}

/* ---------- free transform (Ctrl+Alt+T): scale with handles, move inside, Enter applies, Esc cancels ---------- */
const HANDLE = 6;
function startTransform() {
  if (!D.has() || E.transform) return false;
  if (!D.floating) {
    if (!D.sel) { const m = D.layerAlphaMask(); if (!m.some(v => v)) return false; D.record('Transformación libre'); D.setSel(m); }
    else D.record('Transformación libre');
    D.lift();
  } else D.record('Transformación libre');
  const f = D.floating;
  E.transform = { orig: { ...f, px: f.px.slice(), mask: f.mask.slice() }, box: { x: f.x, y: f.y, w: f.w, h: f.h } };
  E.emit(); return true;
}
function applyTransformBox() {
  const T = E.transform, b = T.box, s = O.scaleBlock(T.orig, b.w, b.h);
  D.setFloating({ x: Math.round(b.x), y: Math.round(b.y), ...s });
}
function endTransform(apply) {
  if (!E.transform) return;
  E.transform = null; drag = null;
  if (apply) D.commit(); else D.undo();
  E.emit();
}
/* flips and quarter turns while transforming act on the original block */
function transformTurn(kind) {
  const T = E.transform; if (!T) return;
  const o = T.orig;
  if (kind === 'flipH' || kind === 'flipV') { o.px = O.flip(o.px, o.w, o.h, kind === 'flipH'); o.mask = O.flip(o.mask, o.w, o.h, kind === 'flipH', 1); }
  else {
    const cw = kind === 'rotR';
    o.px = O.rotate(o.px, o.w, o.h, cw); o.mask = O.rotate(o.mask, o.w, o.h, cw, 1); [o.w, o.h] = [o.h, o.w];
    const b = T.box, cx = b.x + b.w / 2, cy = b.y + b.h / 2; [b.w, b.h] = [b.h, b.w]; b.x = cx - b.w / 2; b.y = cy - b.h / 2;
  }
  applyTransformBox(); E.emit();
}
function transformHit(p) {
  const T = E.transform, b = T.box, z = E.view.state.zoom, t = HANDLE / z;
  const hx = { w: b.x, c: b.x + b.w / 2, e: b.x + b.w }, hy = { n: b.y, m: b.y + b.h / 2, s: b.y + b.h };
  const H = { nw: [hx.w, hy.n], n: [hx.c, hy.n], ne: [hx.e, hy.n], e: [hx.e, hy.m], se: [hx.e, hy.s], s: [hx.c, hy.s], sw: [hx.w, hy.s], w: [hx.w, hy.m] };
  for (const [id, [x, y]] of Object.entries(H)) if (Math.abs(p.fx - x) <= t && Math.abs(p.fy - y) <= t) return id;
  return p.fx >= b.x && p.fx <= b.x + b.w && p.fy >= b.y && p.fy <= b.y + b.h ? 'move' : null;
}
function transformDrag(p, ev) {
  const T = E.transform, d = drag, o = d.box0, dx = p.fx - d.sx, dy = p.fy - d.sy;
  let { x, y, w, h } = o;
  if (d.h === 'move') { x = o.x + Math.round(dx); y = o.y + Math.round(dy); }
  else {
    if (d.h.includes('w')) { x = o.x + dx; w = o.w - dx; }
    if (d.h.includes('e')) w = o.w + dx;
    if (d.h.includes('n')) { y = o.y + dy; h = o.h - dy; }
    if (d.h.includes('s')) h = o.h + dy;
    if (ev.shiftKey && d.h.length === 2) {   // keep proportions from a corner
      const k = Math.max(w / o.w, h / o.h);
      const nw = o.w * k, nh = o.h * k;
      if (d.h.includes('w')) x = o.x + o.w - nw; if (d.h.includes('n')) y = o.y + o.h - nh;
      w = nw; h = nh;
    }
    if (w < 1) { if (d.h.includes('w')) x -= 1 - w; w = 1; }
    if (h < 1) { if (d.h.includes('n')) y -= 1 - h; h = 1; }
    w = Math.round(w); h = Math.round(h); x = Math.round(x); y = Math.round(y);
  }
  T.box = { x, y, w, h };
  applyTransformBox();
}

/* ---------- crop tool: drag a rectangle, Enter (or double click) crops, Esc cancels ---------- */
function applyCrop() {
  const c = E.crop; if (!c) return false;
  const x0 = Math.max(0, Math.min(c.x0, c.x1)), y0 = Math.max(0, Math.min(c.y0, c.y1)), x1 = Math.min(D.w - 1, Math.max(c.x0, c.x1)), y1 = Math.min(D.h - 1, Math.max(c.y0, c.y1));
  E.crop = null;
  if (x1 < x0 || y1 < y0) { E.emit(); return false; }
  D.record('Recortar'); O.cropTo({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  E.emit(); E.view.fit(); return true;
}

/* ---------- pointer entry points ---------- */
function down(p, btn, ev) {
  if (!D.has()) return;
  const { x, y } = p, t = E.tool;
  if (E.transform) { const h = transformHit(p); if (h) { drag = { kind: 'transform', h, sx: p.fx, sy: p.fy, box0: { ...E.transform.box } }; return; } endTransform(true); return; }
  if (t === 'picker') { pick(x, y, btn); drag = { kind: 'pick', btn }; return; }
  if (t === 'crop') {
    const c = E.crop;
    if (c && x >= Math.min(c.x0, c.x1) && x <= Math.max(c.x0, c.x1) && y >= Math.min(c.y0, c.y1) && y <= Math.max(c.y0, c.y1)) drag = { kind: 'cropMove', sx: x, sy: y, c0: { ...c } };
    else { E.crop = { x0: x, y0: y, x1: x, y1: y }; drag = { kind: 'crop' }; }
    E.emit(); return;
  }

  // ---- selection tools ----
  if (SELECT.has(t)) {
    const mode = modeOf(ev);
    // Ctrl + drag inside the selection moves the pixels (Alt as well: duplicates them)
    if ((ev.ctrlKey || ev.metaKey) && D.sel && D.inSel(x, y)) { startMovePixels(x, y, ev.altKey); return; }
    if (t === 'polyLasso') {
      const sp = E.selPath, z = E.view.state.zoom;
      if (!sp) E.selPath = { points: [[p.fx, p.fy]], cursor: [p.fx, p.fy], poly: true, mode };
      else if (sp.points.length >= 3 && Math.hypot(p.fx - sp.points[0][0], p.fy - sp.points[0][1]) * z < 8) { finishPoly(); return; }
      else sp.points.push([p.fx, p.fy]);
      E.emit(); return;
    }
    if (t === 'wand') {
      const src = E.opts.sampleAll ? D.composite() : D.cur().px;
      D.record(SEL_LABEL[mode] + ' (varita)');
      D.setSel(D.wandMask(src, x, y, E.opts.wandTol, E.opts.wandContiguous), mode);
      E.emit(); return;
    }
    // drag inside the selection without modifiers: the outline moves (not the pixels), like Photoshop
    if (mode === 'replace' && D.sel && !D.floating && D.inSel(x, y) && t !== 'lasso') {
      D.record('Mover selección'); drag = { kind: 'selShift', sx: x, sy: y, dx: 0, dy: 0 }; return;
    }
    if (D.floating) { D.record('Soltar'); D.commit(); }
    if (t === 'lasso') { E.selPath = { points: [[p.fx, p.fy]], cursor: null, mode }; drag = { kind: 'lasso' }; E.emit(); return; }
    drag = { kind: 'marquee', x0: x, y0: y, mode, moved: false, type: t === 'ellipseSel' ? 'ellipse' : 'rect' };
    E.selShape = { type: drag.type, x0: x, y0: y, x1: x, y1: y };
    E.emit(); return;
  }

  // ---- move tool: the selection's pixels, or the whole layer (Alt duplicates) ----
  if (t === 'move') {
    if (D.floating && inFloating(x, y)) { drag = { kind: 'moveSel', sx: x, sy: y, fx: D.floating.x, fy: D.floating.y }; return; }
    if (D.sel) { startMovePixels(x, y, ev.altKey); E.emit(); return; }
    D.record(ev.altKey ? 'Duplicar capa' : 'Mover');
    if (ev.altKey) D.duplicateLayer();
    drag = { kind: 'moveLayer', sx: x, sy: y, base: D.cur().px.slice() }; E.emit(); return;
  }

  // ---- painting tools work on the layer: drop any floating block first ----
  const names = { pencil: 'Lápiz', eraser: 'Borrador', shade: E.opts.shadeMode === 'burn' ? 'Subexponer' : 'Sobreexponer', dither: 'Tramado', fill: 'Bote de pintura', line: 'Línea', rect: 'Rectángulo', ellipse: 'Elipse' };
  D.record(names[t] || 'Edición'); D.commit();
  if (STROKE.has(t)) {
    drag = { kind: 'stroke', lx: x, ly: y, base: D.cur().px.slice(), visited: new Uint8Array(D.w * D.h), pts: [] };
    drag.op = strokeOp(t, btn, ev);
    // Shift + click: straight line from where the last stroke ended (Photoshop)
    if (ev.shiftKey && E.lastPoint) { drag.lx = E.lastPoint[0]; drag.ly = E.lastPoint[1]; drag.pts = []; }
    strokeTo(x, y); E.emit(); return;
  }
  if (SHAPE.has(t)) { drag = { kind: 'shape', x0: x, y0: y, btn }; move(p, ev); return; }
  if (t === 'fill') {
    const col = btn === 2 ? E.colors.secondary : E.colors.primary, l = D.cur();
    for (const [mx, my] of mirrors(x, y)) O.fill(l.px, mx, my, col, E.opts.contiguous, l.lockAlpha, E.opts.fillTol);
    E.emit();
  }
}
function move(p, ev) {
  if (!drag) {   // hover feedback for the polygonal lasso
    if (E.selPath && E.selPath.poly) { E.selPath.cursor = [p.fx, p.fy]; E.view.schedule(); }
    return;
  }
  const { x, y } = p;
  switch (drag.kind) {
    case 'pick': pick(x, y, drag.btn); return;
    case 'stroke': strokeTo(x, y); break;
    case 'shape':
      E.overlay = new Uint8ClampedArray(D.w * D.h * 4);
      drawShape(E.overlay, shapePts(x, y, ev.shiftKey), drag.btn === 2 ? E.colors.secondary : E.colors.primary);
      break;
    case 'marquee': {
      drag.moved = drag.moved || x !== drag.x0 || y !== drag.y0;
      const [ex, ey] = ev.shiftKey ? constrain(drag.x0, drag.y0, x, y, 'rect') : [x, y];
      E.selShape = { type: drag.type, x0: drag.x0, y0: drag.y0, x1: ex, y1: ey };
      E.view.schedule(); return;
    }
    case 'lasso': E.selPath.points.push([p.fx, p.fy]); E.view.schedule(); return;
    case 'selShift': {
      const ddx = x - drag.sx - drag.dx, ddy = y - drag.sy - drag.dy;
      if (ddx || ddy) { D.shiftSel(ddx, ddy); drag.dx += ddx; drag.dy += ddy; }
      break;
    }
    case 'moveSel': D.moveFloating(drag.fx + x - drag.sx, drag.fy + y - drag.sy); break;
    case 'moveLayer': D.cur().px = O.shift(drag.base, x - drag.sx, y - drag.sy); break;
    case 'transform': transformDrag(p, ev); break;
    case 'crop': E.crop.x1 = x; E.crop.y1 = y; E.view.schedule(); return;
    case 'cropMove': { const c = drag.c0, dx = x - drag.sx, dy = y - drag.sy; E.crop = { x0: c.x0 + dx, y0: c.y0 + dy, x1: c.x1 + dx, y1: c.y1 + dy }; E.view.schedule(); return; }
  }
  E.emit();
}
function up(p, ev) {
  if (!drag) return;
  const d = drag; drag = null;
  switch (d.kind) {
    case 'shape':
      E.overlay = null;
      drawShape(D.cur().px, shapePts(p.x, p.y, ev.shiftKey), d.btn === 2 ? E.colors.secondary : E.colors.primary);
      E.lastPoint = [p.x, p.y]; break;
    case 'stroke': E.lastPoint = [d.lx, d.ly]; break;
    case 'marquee': {
      const s = E.selShape; E.selShape = null;
      if (!d.moved) {   // a plain click: deselect (in "new selection" mode)
        if (d.mode === 'replace' && D.sel) { D.record('Deseleccionar'); D.setSel(new Uint8Array(D.w * D.h)); }
        break;
      }
      D.record(SEL_LABEL[d.mode]);
      D.setSel(s.type === 'ellipse' ? D.ellipseMask(s.x0, s.y0, s.x1, s.y1) : D.rectMask(s.x0, s.y0, s.x1, s.y1), d.mode);
      break;
    }
    case 'lasso': {
      const sp = E.selPath; E.selPath = null;
      if (sp && sp.points.length >= 3) { D.record(SEL_LABEL[sp.mode] + ' (lazo)'); D.setSel(D.polyMask(sp.points), sp.mode); }
      break;
    }
    // a click inside the selection without dragging: deselect, like a click anywhere else
    case 'selShift': if (!d.dx && !d.dy) { D.dropRecord(); D.record('Deseleccionar'); D.setSel(new Uint8Array(D.w * D.h)); } break;
  }
  E.emit();
}
function dbl() {
  if (E.selPath && E.selPath.poly) { E.selPath.points.pop(); finishPoly(); }   // the double click also added a point
  else if (E.tool === 'crop' && E.crop) applyCrop();
}
function cancel() {
  if (drag && drag.kind === 'shape') E.overlay = null;
  if (drag && drag.kind === 'marquee') E.selShape = null;
  drag = null; E.emit();
}
/* Esc: cancels whatever is in progress; returns true if there was something */
function escape() {
  if (E.transform) { endTransform(false); return true; }
  if (E.selPath) { E.selPath = null; E.emit(); return true; }
  if (E.crop) { E.crop = null; E.emit(); return true; }
  return false;
}
/* Enter: applies whatever is in progress */
function enter() {
  if (E.transform) { endTransform(true); return true; }
  if (E.selPath && E.selPath.poly) { finishPoly(); return true; }
  if (E.crop) { applyCrop(); return true; }
  return false;
}
function backspacePoly() { const sp = E.selPath; if (!sp || !sp.poly) return false; sp.points.pop(); if (!sp.points.length) E.selPath = null; E.emit(); return true; }

/* arrow keys: move tool moves pixels (or the layer); selection tools move the outline */
function nudge(dx, dy) {
  if (!D.has()) return false;
  if (E.transform) { const b = E.transform.box; b.x += dx; b.y += dy; applyTransformBox(); E.emit(); return true; }
  if (E.tool === 'move') {
    if (D.sel) { if (!D.floating) { D.record('Mover'); D.lift(); } else D.record('Mover'); D.moveFloating(D.floating.x + dx, D.floating.y + dy); }
    else { D.record('Mover'); D.cur().px = O.shift(D.cur().px, dx, dy); }
    E.emit(); return true;
  }
  if (SELECT.has(E.tool) && D.sel) {
    D.record('Mover selección');
    if (D.floating) D.moveFloating(D.floating.x + dx, D.floating.y + dy); else D.shiftSel(dx, dy);
    E.emit(); return true;
  }
  return false;
}

export const T = E.tools = {
  down, move, up, dbl, cancel, escape, enter, backspacePoly, nudge, pick,
  startTransform, endTransform, transformTurn, applyCrop,
  usesBrush: t => USES_BRUSH.has(t), isSelect: t => SELECT.has(t), isPixel: t => PIXEL.has(t), cursorPixels, footprint, mirrors, HANDLE
};
