/* Pixel editor image operations (Photoshop's Edit / Image / Filter menus, adapted to pixel art):
   fill, shading with hue shift, adjustments, flips and rotations, canvas and image size, crop, trim,
   fill / stroke selection, offset, despeckle, outline, palette swap and colour merging.
   Callers record history; everything respects the selection mask (D.inSel) where it makes sense. */
import { rgb2lab, lab2rgb, groupColours, mergeMap } from '../color.js';
import { E } from './E.js';
import { D } from './doc.js';

const eq = (px, o, c) => px[o] === c[0] && px[o + 1] === c[1] && px[o + 2] === c[2] && px[o + 3] === c[3];
const setAt = (px, o, c) => { px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3]; };
const getAt = (px, o) => [px[o], px[o + 1], px[o + 2], px[o + 3]];
const dropSel = () => { D.sel = null; D.floating = null; D.selVer++; };

/* ---------- paint bucket ---------- */
/* contiguous = only the connected area (Photoshop's "Contiguo"); lockAlpha = keep transparent pixels empty */
function fill(px, x, y, color, contiguous = true, lockAlpha = false, tol = 0) {
  if (!D.inside(x, y) || !D.inSel(x, y)) return;
  const t = getAt(px, D.idx(x, y));
  const match = o => (!t[3] && !px[o + 3]) || (Math.abs(px[o] - t[0]) <= tol && Math.abs(px[o + 1] - t[1]) <= tol && Math.abs(px[o + 2] - t[2]) <= tol && Math.abs(px[o + 3] - t[3]) <= tol);
  const paint = o => { if (lockAlpha) { if (px[o + 3]) { px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2]; } } else setAt(px, o, color); };
  if (eq(px, D.idx(x, y), color)) return;
  const { w, h } = D;
  if (!contiguous) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const o = D.idx(xx, yy); if (D.inSel(xx, yy) && match(o)) paint(o); }
    return;
  }
  const stack = [x, y], seen = new Uint8Array(w * h);
  while (stack.length) {
    const yy = stack.pop(), xx = stack.pop();
    if (!D.inside(xx, yy) || !D.inSel(xx, yy) || seen[yy * w + xx]) continue;
    seen[yy * w + xx] = 1;
    const o = D.idx(xx, yy); if (!match(o)) continue;
    paint(o);
    stack.push(xx + 1, yy, xx - 1, yy, xx, yy + 1, xx, yy - 1);
  }
}

/* ---------- dodge / burn with hue shift: lighter drifts to warm yellow, darker to cool violet ---------- */
const WARM = 85, COOL = 285;
function toLch(c) { const l = new Float32Array(3); rgb2lab(c[0], c[1], c[2], l, 0); return [l[0], Math.hypot(l[1], l[2]), (Math.atan2(l[2], l[1]) * 180 / Math.PI + 360) % 360]; }
function fromLch(L, C, h) { const r = h * Math.PI / 180; return lab2rgb(L, C * Math.cos(r), C * Math.sin(r)); }
function towards(h, target, step) { const d = ((target - h + 540) % 360) - 180; return (h + Math.sign(d) * Math.min(Math.abs(d), step) + 360) % 360; }
/* dir: +1 lighten, -1 darken. palette: optional list of [r,g,b,a] to snap to (Aseprite-style shading ink) */
function shade(c, dir, palette) {
  const [L, C, h] = toLch(c);
  if (palette && palette.length) {
    let best = null, bs = Infinity;
    for (const p of palette) {
      const [pL, pC, ph] = toLch(p), dL = (pL - L) * dir;
      if (dL < 1.5) continue;
      const dh = Math.abs(((ph - h + 540) % 360) - 180) * Math.min(C, pC) / 40;
      const s = Math.abs(dL - 9) * 0.6 + Math.abs(pC - C) * 0.4 + dh;
      if (s < bs) { bs = s; best = p; }
    }
    return best ? [best[0], best[1], best[2], c[3]] : c;
  }
  const nL = Math.max(2, Math.min(98, L + dir * 8));
  const nh = C > 4 ? towards(h, dir > 0 ? WARM : COOL, 6) : h;
  const nC = Math.max(0, C * (dir > 0 ? 0.96 : 1.04) + (C <= 4 ? 3 : 0));
  return [...fromLch(nL, nC, C <= 4 ? (dir > 0 ? WARM : COOL) : nh), c[3]];
}

/* ---------- geometry on a w×h block (ch = 4 for pixels, 1 for masks) ---------- */
function flip(px, w, h, horizontal, ch = 4) {
  const out = new px.constructor(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = horizontal ? w - 1 - x : x, sy = horizontal ? y : h - 1 - y;
    out.set(px.subarray((sy * w + sx) * ch, (sy * w + sx) * ch + ch), (y * w + x) * ch);
  }
  return out;
}
/* rotate 90° clockwise (cw = true) or counter-clockwise; returns an h×w block */
function rotate(px, w, h, cw, ch = 4) {
  const out = new px.constructor(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = cw ? h - 1 - y : y, ny = cw ? x : w - 1 - x;
    out.set(px.subarray((y * w + x) * ch, (y * w + x) * ch + ch), (ny * h + nx) * ch);
  }
  return out;
}
/* paste an sw×sh block into a dw×dh buffer at (ox, oy), clipping */
function place(src, sw, sh, dw, dh, ox, oy, ch = 4) {
  const out = new src.constructor(dw * dh * ch);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const tx = x + ox, ty = y + oy; if (tx < 0 || ty < 0 || tx >= dw || ty >= dh) continue;
    out.set(src.subarray((y * sw + x) * ch, (y * sw + x) * ch + ch), (ty * dw + tx) * ch);
  }
  return out;
}
/* nearest-neighbour resize, the pixel-art way (no blur) */
function resample(src, sw, sh, dw, dh, ch = 4) {
  const out = new src.constructor(dw * dh * ch);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
    for (let x = 0; x < dw; x++) { const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw)); out.set(src.subarray((sy * sw + sx) * ch, (sy * sw + sx) * ch + ch), (y * dw + x) * ch); }
  }
  return out;
}
/* shift a whole layer, empty pixels become transparent */
const shift = (px, dx, dy) => place(px, D.w, D.h, D.w, D.h, dx, dy);
/* Filtro > Otro > Desplazamiento: like shift, but what leaves one side can come back on the other */
function offset(px, dx, dy, wrap) {
  if (!wrap) return shift(px, dx, dy);
  const out = new Uint8ClampedArray(px.length), { w, h } = D;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tx = ((x + dx) % w + w) % w, ty = ((y + dy) % h + h) % h;
    out.set(px.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (ty * w + tx) * 4);
  }
  return out;
}

/* ---------- outline: 1 px around opaque pixels (only where the selection allows) ---------- */
function outline(px, w, h, color, diagonal) {
  const out = px.slice(), A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 0;
  const nb = diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(x, y) || !D.inSel(x, y)) continue;
    const n = nb.find(([dx, dy]) => A(x + dx, y + dy)); if (!n) continue;
    let c = color;
    if (!c) { // darker, cooler version of the neighbour, like a coloured outline
      const o = ((y + n[1]) * w + x + n[0]) * 4;
      c = shade(shade(shade([px[o], px[o + 1], px[o + 2], 255], -1), -1), -1);
    }
    out.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
  }
  return out;
}

/* ---------- adjustments (Imagen > Ajustes), per colour, inside the selection ---------- */
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
/* apply fn([r,g,b]) -> [r,g,b] to every opaque pixel inside the selection; returns new pixels */
function mapColours(px, fn) {
  const out = px.slice(), cache = new Map();
  for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) {
    if (!D.inSel(x, y)) continue;
    const o = D.idx(x, y); if (!px[o + 3]) continue;
    const key = (px[o] << 16) | (px[o + 1] << 8) | px[o + 2];
    let c = cache.get(key); if (!c) { c = fn([px[o], px[o + 1], px[o + 2]]); cache.set(key, c); }
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  }
  return out;
}
/* Tono/saturación (Ctrl+U): hue in degrees, sat and light in -100..100 */
const adjust = (px, hue, sat, light) => mapColours(px, ([r, g, b]) => {
  let [h, s, l] = rgb2hsl(r, g, b);
  h = (h + hue + 360) % 360;
  s = Math.max(0, Math.min(1, sat >= 0 ? s + (1 - s) * sat / 100 : s * (1 + sat / 100)));
  l = Math.max(0, Math.min(1, light >= 0 ? l + (1 - l) * light / 100 : l * (1 + light / 100)));
  return hsl2rgb(h, s, l);
});
const invert = px => mapColours(px, c => c.map(v => 255 - v));                                     // Ctrl+I
const desaturate = px => mapColours(px, ([r, g, b]) => { const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b); return [v, v, v]; });  // Mayús+Ctrl+U
/* Brillo/contraste: both -100..100 */
function brightnessContrast(px, bri, con) {
  const k = (259 * (con * 1.275 + 255)) / (255 * (259 - con * 1.275));
  return mapColours(px, c => c.map(v => Math.max(0, Math.min(255, Math.round(k * (v + bri * 1.275 - 128) + 128)))));
}
/* Posterizar: n levels per channel */
const posterize = (px, n) => mapColours(px, c => c.map(v => Math.round(Math.round(v / 255 * (n - 1)) * 255 / (n - 1))));

/* ---------- palette swap and merging across every layer ---------- */
function replaceColor(from, to) {
  for (const l of D.layers) for (let o = 0; o < l.px.length; o += 4)
    if (l.px[o + 3] && l.px[o] === from[0] && l.px[o + 1] === from[1] && l.px[o + 2] === from[2]) { l.px[o] = to[0]; l.px[o + 1] = to[1]; l.px[o + 2] = to[2]; }
}
function documentColours(limit = 256) {
  const set = new Map();
  for (const l of D.layers) for (let o = 0; o < l.px.length; o += 4) {
    if (!l.px[o + 3]) continue;
    const k = (l.px[o] << 16) | (l.px[o + 1] << 8) | l.px[o + 2];
    if (!set.has(k)) { set.set(k, [l.px[o], l.px[o + 1], l.px[o + 2], 255]); if (set.size >= limit) break; }
  }
  return groupColours([...set.values()]).flatMap(g => g.colors);
}
const documentGroups = () => groupColours(documentColours());
function mergeSimilar(maxDE) {
  const counts = new Map();
  for (const l of D.layers) for (let o = 0; o < l.px.length; o += 4) if (l.px[o + 3]) {
    const k = (l.px[o] << 16) | (l.px[o + 1] << 8) | l.px[o + 2]; counts.set(k, (counts.get(k) || 0) + 1);
  }
  const map = mergeMap([...counts].map(([key, count]) => ({ key, count, rgb: [key >> 16, (key >> 8) & 255, key & 255] })), maxDE);
  for (const l of D.layers) for (let o = 0; o < l.px.length; o += 4) {
    if (!l.px[o + 3]) continue;
    const to = map.get((l.px[o] << 16) | (l.px[o + 1] << 8) | l.px[o + 2]);
    if (to) { l.px[o] = to[0]; l.px[o + 1] = to[1]; l.px[o + 2] = to[2]; }
  }
  return map.size;
}

/* ---------- canvas & image (Imagen menu): every layer ---------- */
/* Tamaño de lienzo: the drawing is not scaled; anchor 'c' centre, 'b' bottom centre, 'tl' top left */
function resizeCanvas(nw, nh, anchor) {
  D.commit(); dropSel();
  const dx = anchor === 'tl' ? 0 : Math.floor((nw - D.w) / 2);
  const dy = anchor === 'tl' ? 0 : anchor === 'b' ? nh - D.h : Math.floor((nh - D.h) / 2);
  for (const l of D.layers) l.px = place(l.px, D.w, D.h, nw, nh, dx, dy);
  D.w = nw; D.h = nh;
}
/* Tamaño de imagen: everything scaled, nearest neighbour */
function imageSize(nw, nh) {
  D.commit(); dropSel();
  for (const l of D.layers) l.px = resample(l.px, D.w, D.h, nw, nh);
  D.w = nw; D.h = nh;
}
/* Rotación de imagen: '180', 'cw' (90° horario), 'ccw'; flipCanvas: horizontal or vertical */
function rotateCanvas(kind) {
  D.commit(); dropSel();
  for (const l of D.layers) {
    if (kind === '180') l.px = flip(flip(l.px, D.w, D.h, true), D.w, D.h, false);
    else l.px = rotate(l.px, D.w, D.h, kind === 'cw');
  }
  if (kind !== '180') [D.w, D.h] = [D.h, D.w];
}
function flipCanvas(horizontal) { D.commit(); dropSel(); for (const l of D.layers) l.px = flip(l.px, D.w, D.h, horizontal); }
/* Recortar: the canvas becomes the rectangle r */
function cropTo(r) {
  D.commit(); dropSel();
  for (const l of D.layers) l.px = place(l.px, D.w, D.h, r.w, r.h, -r.x, -r.y);
  D.w = r.w; D.h = r.h;
}
/* Cortar (trim): remove the empty transparent border */
function trim() {
  const comp = D.composite(), m = new Uint8Array(D.w * D.h);
  for (let i = 0; i < m.length; i++) if (comp[i * 4 + 3]) m[i] = 1;
  const b = D.boundsOf(m);
  if (!b || (b.x === 0 && b.y === 0 && b.w === D.w && b.h === D.h)) return false;
  cropTo(b); return true;
}

/* ---------- Edición > Rellenar / Contornear: on the active layer, inside the selection (or all) ---------- */
function fillSel(color, preserveAlpha) {
  const px = D.cur().px;
  for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) {
    if (!D.inSel(x, y)) continue;
    const o = D.idx(x, y);
    if (preserveAlpha) { if (px[o + 3]) { px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2]; } }
    else setAt(px, o, color);
  }
}
/* a line of `width` px along the selection edge: pos 'inside', 'center' or 'outside' */
function strokeSel(color, width, pos) {
  if (!D.sel) return false;
  const m = D.sel.mask, { w, h } = D, px = D.cur().px;
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h ? m[y * w + x] : 0;
  // distance (in rings) of each pixel to the edge, inside and outside, up to `width`
  const inner = Math.ceil(pos === 'inside' ? width : pos === 'center' ? width / 2 : 0), outer = Math.floor(pos === 'outside' ? width : pos === 'center' ? width / 2 : 0);
  const near = (x, y, r, want) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (at(x + dx, y + dy) === want) return true; return false; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = at(x, y);
    if ((v && inner > 0 && near(x, y, inner, 0)) || (!v && outer > 0 && near(x, y, outer, 1))) setAt(px, D.idx(x, y), color);
  }
  return true;
}

/* ---------- Filtro > Quitar píxeles sueltos: opaque pixels with no opaque 4-neighbour ---------- */
function despeckle(px) {
  const out = px.slice(), A = (x, y) => D.inside(x, y) && px[D.idx(x, y) + 3] > 0;
  let n = 0;
  for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) {
    if (!A(x, y) || !D.inSel(x, y)) continue;
    if (!A(x - 1, y) && !A(x + 1, y) && !A(x, y - 1) && !A(x, y + 1)) { out.fill(0, D.idx(x, y), D.idx(x, y) + 4); n++; }
  }
  return { px: out, n };
}

/* ---------- flips / rotations of the selection (lifted) or of the whole active layer ---------- */
function transform(kind) {
  if (D.sel && !D.floating) D.lift();
  const fl = D.floating;
  if (fl) {
    if (kind === 'flipH' || kind === 'flipV') { fl.px = flip(fl.px, fl.w, fl.h, kind === 'flipH'); fl.mask = flip(fl.mask, fl.w, fl.h, kind === 'flipH', 1); }
    else if (kind === 'rot180') { fl.px = flip(flip(fl.px, fl.w, fl.h, true), fl.w, fl.h, false); fl.mask = flip(flip(fl.mask, fl.w, fl.h, true, 1), fl.w, fl.h, false, 1); }
    else {
      const cx = fl.x + fl.w / 2, cy = fl.y + fl.h / 2, cw = kind === 'rotR';
      fl.px = rotate(fl.px, fl.w, fl.h, cw); fl.mask = rotate(fl.mask, fl.w, fl.h, cw, 1);
      [fl.w, fl.h] = [fl.h, fl.w];
      fl.x = Math.round(cx - fl.w / 2); fl.y = Math.round(cy - fl.h / 2);
    }
    D.moveFloating(fl.x, fl.y);
    return;
  }
  const l = D.cur();
  if (kind === 'flipH' || kind === 'flipV') l.px = flip(l.px, D.w, D.h, kind === 'flipH');
  else if (kind === 'rot180') l.px = flip(flip(l.px, D.w, D.h, true), D.w, D.h, false);
  else l.px = place(rotate(l.px, D.w, D.h, kind === 'rotR'), D.h, D.w, D.w, D.h, Math.floor((D.w - D.h) / 2), Math.floor((D.h - D.w) / 2));
}
/* free transform: the original floating block scaled to w×h (nearest neighbour) */
function scaleBlock(fl, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  return { w, h, px: resample(fl.px, fl.w, fl.h, w, h), mask: resample(fl.mask, fl.w, fl.h, w, h, 1) };
}

export const O = E.ops = {
  fill, shade, flip, rotate, place, resample, shift, offset, outline,
  adjust, invert, desaturate, brightnessContrast, posterize,
  replaceColor, documentColours, documentGroups, mergeSimilar,
  resizeCanvas, imageSize, rotateCanvas, flipCanvas, cropTo, trim, fillSel, strokeSel, despeckle,
  transform, scaleBlock, eq, setAt, getAt
};
