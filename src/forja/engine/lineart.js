/* Line art: turns a colour illustration into clean outlines. Lines come from three sources, merged:
   - colour changes: Canny edge detector on the smoothed Lab image (Di Zenzo colour gradient,
     non-maximum suppression and hysteresis), thickened to the chosen width;
   - the dark ink strokes the drawing already has (thin and darker than both sides), kept as they are;
   - the outline of the silhouette, once the background is removed.
   The background is worked out exactly as in the generator (same working size); the lines are found on a
   copy of the picture at the size of the result, with the background mask scaled up to it. */
import { rgb2lab, hex2rgb } from './color.js';

const MAX_WORK = 2400;   // longest side processed; bigger results are scaled up from it
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

/* ---------- image processing helpers ---------- */

/* separable Gaussian blur of a single channel */
function blur(src, w, h, s) {
  if (s < 0.3) return Float32Array.from(src);
  const r = Math.ceil(s * 3), k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-i * i / (2 * s * s));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  // rows: edges clamp to the border pixel, the inside needs no checks
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      if (x >= r && x < w - r) for (let i = 0, p = o + x - r; i < k.length; i++) a += src[p + i] * k[i];
      else for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i; a += src[o + xx] * k[i + r]; }
      tmp[o + x] = a;
    }
  }
  // columns, a whole row at a time (memory in order)
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let i = -r; i <= r; i++) {
      const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i, p = yy * w, c = k[i + r];
      for (let x = 0; x < w; x++) out[o + x] += tmp[p + x] * c;
    }
  }
  return out;
}

/* exact Euclidean distance from every pixel to the nearest pixel of the set (Felzenszwalb & Huttenlocher) */
export function distance(set, w, h) {
  const n = w * h, m = Math.max(w, h), INF = 1e20;
  const d = new Float64Array(n), f = new Float64Array(m), o = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let i = 0; i < n; i++) d[i] = set[i] ? 0 : INF;
  const dt = len => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s;
      while ((s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= z[k]) k--;
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; o[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = d[y * w + x]; dt(h); for (let y = 0; y < h; y++) d[y * w + x] = o[y]; }
  for (let y = 0; y < h; y++) { const r = y * w; for (let x = 0; x < w; x++) f[x] = d[r + x]; dt(w); for (let x = 0; x < w; x++) d[r + x] = o[x]; }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sqrt(d[i]);
  return out;
}

/* connected pieces of a set; drop (in place) those for which keep(size) is false */
function filterPieces(set, w, h, diag, keep) {
  const n = w * h, comp = new Int32Array(n).fill(-1), q = new Int32Array(n), sizes = [];
  for (let i = 0; i < n; i++) {
    if (!set[i] || comp[i] >= 0) continue;
    const id = sizes.length; let qh = 0, qt = 0; q[qt++] = i; comp[i] = id;
    while (qh < qt) {
      const p = q[qh++], x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diag && dx && dy)) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (set[j] && comp[j] < 0) { comp[j] = id; q[qt++] = j; }
      }
    }
    sizes.push(qt);
  }
  const ok = sizes.map(s => keep(s));
  for (let i = 0; i < n; i++) if (set[i] && !ok[comp[i]]) set[i] = 0;
}

/* max (or min) of every (2r+1)×(2r+1) square: separable, each pass in constant time per pixel
   whatever r is (van Herk / Gil-Werman: running max inside blocks, forwards and backwards) */
function rankFilter(src, w, h, r, max) {
  // min(a, b) = -max(-a, -b): work on negated values for min so there is a single code path
  const s = max ? src : src.map(v => -v);
  const rows = rankRows(transpose(rankRows(s, w, h, r), w, h), h, w, r);
  const out = transpose(rows, h, w);
  if (!max) for (let i = 0; i < out.length; i++) out[i] = -out[i];
  return out;
}
function transpose(src, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0, o = y * w; x < w; x++) out[x * h + y] = src[o + x];
  return out;
}
/* running max over 2r+1 along each row */
function rankRows(src, w, h, r) {
  const k = 2 * r + 1, L = w + 2 * r, a = new Float32Array(L), g = new Float32Array(L), hb = new Float32Array(L), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    a.fill(-Infinity); a.set(src.subarray(o, o + w), r);
    for (let i = 0; i < L; i++) { const v = a[i]; g[i] = i % k === 0 ? v : g[i - 1] > v ? g[i - 1] : v; }
    for (let i = L - 1; i >= 0; i--) { const v = a[i]; hb[i] = i === L - 1 || (i + 1) % k === 0 ? v : hb[i + 1] > v ? hb[i + 1] : v; }
    for (let x = 0; x < w; x++) { const p = hb[x], q = g[x + 2 * r]; out[o + x] = p > q ? p : q; }
  }
  return out;
}

/* ---------- the steps ---------- */

/* Canny on the colour image: 1 px wide edges where the colour changes by about `high` ΔE or more */
function colourEdges(ch, s, detail, mask, w, h) {
  const n = w * h;
  const high = 5 + 55 * Math.pow(1 - detail / 100, 1.5), low = high * 0.5;
  // Sobel of a step blurred with sigma s peaks at about 8·step/(s·√2π): scale back to the size of the step (ΔE)
  const norm = Math.max(s, 0.8) * Math.sqrt(2 * Math.PI) / 8;
  const mag = new Float32Array(n), dir = new Int32Array(n);
  const steps = [1, w + 1, w, w - 1];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    let gxx = 0, gyy = 0, gxy = 0;
    for (const c of ch) {
      const gx = (c[i - w + 1] + 2 * c[i + 1] + c[i + w + 1]) - (c[i - w - 1] + 2 * c[i - 1] + c[i + w - 1]);
      const gy = (c[i + w - 1] + 2 * c[i + w] + c[i + w + 1]) - (c[i - w - 1] + 2 * c[i - w] + c[i - w + 1]);
      gxx += gx * gx; gyy += gy * gy; gxy += gx * gy;
    }
    // strongest direction of change of the three channels together (Di Zenzo)
    const dd = gxx - gyy, lam = 0.5 * (gxx + gyy + Math.sqrt(dd * dd + 4 * gxy * gxy));
    mag[i] = Math.sqrt(lam) * norm;
    let a = 0.5 * Math.atan2(2 * gxy, dd) * 180 / Math.PI; if (a < 0) a += 180;
    dir[i] = steps[a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3];
  }
  // thin to the ridge, then keep weak edges only where they continue a strong one
  const edge = new Uint8Array(n), q = new Int32Array(n);
  let qt = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, m = mag[i], st = dir[i];
    if (m < low || !mask[i] || m < mag[i + st] || m <= mag[i - st]) continue;
    edge[i] = 1;
    if (m >= high) { edge[i] = 2; q[qt++] = i; }
  }
  let qh = 0;
  while (qh < qt) {
    const i = q[qh++];
    for (const st of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) { const j = i + st; if (edge[j] === 1) { edge[j] = 2; q[qt++] = j; } }
  }
  for (let i = 0; i < n; i++) edge[i] = edge[i] === 2 ? 1 : 0;
  return edge;
}

/* the drawing's own ink: thin strokes clearly darker than both sides of them. Black-hat (closing minus
   the image) answers to dark lines up to ~2r px wide and not to big dark areas such as black hair. */
function inkStrokes(Lc, s, sens, mask, w, h) {
  const n = w * h, r = Math.max(2, Math.round(Math.max(w, h) / 150));
  const near = blur(Lc, w, h, Math.min(1, s * 0.5));
  const closed = rankFilter(rankFilter(near, w, h, r, true), w, h, r, false);
  const T = 40 - 0.35 * sens, ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (mask[i] && closed[i] - near[i] > T) ink[i] = 1;
  return ink;
}

/* L: the line art state (shaped like the generator's, plus hi, cache, maskVer and scale = result size / crop) */
/* thinning (Zhang-Suen): every stroke of a 1/0 set becomes its 1 px wide centre line, keeping its shape and
   how it connects. Only the pixels on the edge of a stroke are looked at on each pass, so thick lines are fast. */
export function thin(set, w, h) {
  const s = Uint8Array.from(set);
  for (let x = 0; x < w; x++) { s[x] = 0; s[(h - 1) * w + x] = 0; }
  for (let y = 0; y < h; y++) { s[y * w] = 0; s[y * w + w - 1] = 0; }
  const nb = i => [s[i - w], s[i - w + 1], s[i + 1], s[i + w + 1], s[i + w], s[i + w - 1], s[i - 1], s[i - w - 1]];
  let edge = [];
  for (let i = w; i < w * (h - 1); i++) if (s[i]) edge.push(i);
  for (let changed = true; changed;) {
    changed = false;
    for (const step of [0, 1]) {
      const del = [];
      for (const i of edge) {
        if (!s[i]) continue;
        const p = nb(i);
        let b = 0, a = 0;
        for (let k = 0; k < 8; k++) { b += p[k]; if (!p[k] && p[(k + 1) % 8]) a++; }
        if (b < 2 || b > 6 || a !== 1) continue;
        if (step === 0 ? (p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) : (p[0] * p[2] * p[6] || p[0] * p[4] * p[6])) continue;
        del.push(i);
      }
      if (del.length) changed = true;
      for (const i of del) s[i] = 0;
    }
    // next pass: only pixels that are still set and touch the background
    edge = edge.filter(i => s[i] && (!s[i - 1] || !s[i + 1] || !s[i - w] || !s[i + w] || !s[i - w - 1] || !s[i - w + 1] || !s[i + w - 1] || !s[i + w + 1]));
  }
  return s;
}

/* lines of the given width drawn along the centre of a 1/0 set of strokes (soft 0..1 per pixel) */
function strokesOfWidth(set, w, h, width) {
  const d = distance(thin(set, w, h), w, h), half = width / 2, a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = clamp01(half + 0.5 - d[i]);
  return a;
}

export function createLineArt(L) {

/* ---------- the steps ---------- */
/* size of the result (original crop × scale) and the size the lines are computed at (up to MAX_WORK) */
function sizes() {
  const scale = L.scale || 1, f = L.frame, W = Math.max(1, Math.round(f.w * scale)), H = Math.max(1, Math.round(f.h * scale));
  const k = Math.min(1, MAX_WORK / Math.max(W, H));
  return { W, H, w: Math.max(1, Math.round(W * k)), h: Math.max(1, Math.round(H * k)) };
}

/* the cropped picture redrawn from the original at the computing size, as Lab (over white where
   transparent). Returns true when it had to be redone. */
function hiRes() {
  const f = L.frame, { w, h } = sizes(), key = [f.x, f.y, f.w, f.h, w, h].join('|');
  if (L.hi && L.hi.img === L.img && L.hi.key === key) return false;
  /* Node / same-size pixels: no canvas needed */
  if (L.rgba && L.w === w && L.h === h) {
    const n = w * h, lab = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], t = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const a = L.rgba[i * 4 + 3] / 255, wh = 255 * (1 - a);
      rgb2lab(Math.round(L.rgba[i * 4] * a + wh), Math.round(L.rgba[i * 4 + 1] * a + wh), Math.round(L.rgba[i * 4 + 2] * a + wh), t, 0);
      lab[0][i] = t[0]; lab[1][i] = t[1]; lab[2][i] = t[2];
    }
    L.hi = { img: L.img, key, w, h, lab };
    return true;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(L.img, f.x, f.y, f.w, f.h, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h).data, n = w * h, lab = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], t = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255, wh = 255 * (1 - a);
    rgb2lab(Math.round(px[i * 4] * a + wh), Math.round(px[i * 4 + 1] * a + wh), Math.round(px[i * 4 + 2] * a + wh), t, 0);
    lab[0][i] = t[0]; lab[1][i] = t[1]; lab[2][i] = t[2];
  }
  L.hi = { img: L.img, key, w, h, lab };
  return true;
}

/* the background mask (generator size) scaled up to the computing size, its pixel steps rounded off;
   cut: there is some background */
function bigMask() {
  const { w, h } = L.hi, n = w * h;
  if (L.w === w && L.h === h && L.mask) {
    const mask = new Uint8Array(n); let cut = false;
    for (let i = 0; i < n; i++) { mask[i] = L.mask[i] ? 1 : 0; if (!mask[i]) cut = true; }
    return { mask, cut };
  }
  const small = new ImageData(L.w, L.h);
  for (let i = 0; i < L.w * L.h; i++) small.data[i * 4 + 3] = L.mask[i] ? 255 : 0;
  const a = document.createElement('canvas'); a.width = L.w; a.height = L.h; a.getContext('2d').putImageData(small, 0, 0);
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const bx = b.getContext('2d', { willReadFrequently: true }); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high';
  bx.drawImage(a, 0, 0, w, h);
  const d = bx.getImageData(0, 0, w, h).data, soft = new Float32Array(n);
  for (let i = 0; i < n; i++) soft[i] = d[i * 4 + 3] / 255;
  const sm = blur(soft, w, h, Math.max(1.2, 0.6 * w / L.w)), mask = new Uint8Array(n);
  let cut = false;
  for (let i = 0; i < n; i++) { mask[i] = sm[i] >= 0.5 ? 1 : 0; if (!mask[i]) cut = true; }
  return { mask, cut };
}

/* line opacity (0..1) for every pixel of the computing size, plus the drawing's mask */
function compute(o) {
  if (hiRes()) L.cache = {};   // a new picture, crop or size: nothing cached is valid
  const C = L.cache, { w, h } = L.hi, n = w * h;
  C.lab = L.hi.lab;
  if (C.maskVer !== L.maskVer) { C.mask = bigMask(); C.maskVer = L.maskVer; C.edgeKey = C.inkKey = null; }
  const { mask, cut } = C.mask;
  if (C.blurKey !== o.smooth) { C.blurred = C.lab.map(c => blur(c, w, h, o.smooth)); C.blurKey = o.smooth; C.edgeKey = C.inkKey = null; }

  let alpha = new Float32Array(n);
  if (o.aiAlpha && o.aiAlpha.length === n) {
    // lines drawn by the AI: only inside the drawing when there is a background
    alpha.set(o.aiAlpha);
    if (cut) for (let i = 0; i < n; i++) if (!mask[i]) alpha[i] = 0;
    // «Afinar»: the AI's strokes (often thick) become thin lines of the chosen width along their centre
    if (o.thin) {
      const set = new Uint8Array(n); for (let i = 0; i < n; i++) set[i] = alpha[i] >= 0.5 ? 1 : 0;
      if (o.min > 0) filterPieces(set, w, h, true, s => s >= o.min);
      alpha = strokesOfWidth(set, w, h, o.width);
    }
  } else {
  let ink = null;
  if (o.ink) {
    if (C.inkKey !== o.inkSens) { C.ink = inkStrokes(C.lab[0], o.smooth, o.inkSens, mask, w, h); C.inkKey = o.inkSens; }
    ink = Uint8Array.from(C.ink);
    if (o.min > 0) filterPieces(ink, w, h, true, s => s >= o.min);
  }
  if (C.edgeKey !== o.detail) { C.edges = colourEdges(C.blurred, o.smooth, o.detail, mask, w, h); C.edgeKey = o.detail; }
  const edges = Uint8Array.from(C.edges);
  // the borders of an ink stroke would give two parallel lines around it: the stroke itself is enough
  if (ink) { const dInk = distance(ink, w, h); for (let i = 0; i < n; i++) if (edges[i] && dInk[i] <= 2) edges[i] = 0; }
  if (o.min > 0) filterPieces(edges, w, h, true, s => s >= o.min);

  if (o.thin) {
    // «Afinar»: colour edges and the drawing's dark strokes together, thinned to their centre and drawn at the
    // chosen width — thin, clean lines instead of the strokes' own (often thick) width
    const set = Uint8Array.from(edges);
    if (ink) for (let i = 0; i < n; i++) if (ink[i]) set[i] = 1;
    alpha = strokesOfWidth(set, w, h, o.width);
  } else {
    const dE = distance(edges, w, h), half = o.width / 2;
    for (let i = 0; i < n; i++) alpha[i] = clamp01(half + 0.5 - dE[i]);
    if (ink) for (let i = 0; i < n; i++) if (ink[i]) alpha[i] = 1;
  }
  }
  let outer = null;   // the silhouette outline alone (the pixel art tells it apart from inner lines)
  if (cut && o.outline > 0) {
    const bgSet = new Uint8Array(n); for (let i = 0; i < n; i++) bgSet[i] = mask[i] ? 0 : 1;
    const dB = distance(bgSet, w, h);
    outer = new Float32Array(n);
    for (let i = 0; i < n; i++) if (mask[i]) { outer[i] = clamp01(o.outline + 1 - dB[i]); alpha[i] = Math.max(alpha[i], outer[i]); }
  }
  if (o.aa) { if (!o.aiAlpha || o.thin) alpha = blur(alpha, w, h, 0.6); }   // the AI's own lines are already soft
  else for (let i = 0; i < n; i++) alpha[i] = alpha[i] >= 0.5 ? 1 : 0;
  return { alpha, mask, outer };
}

/* the result as an image: lines over white inside the drawing (o.fill), transparent outside.
   Returns { canvas, W, H, lines } (lines: what the generator's sprite uses) */
function render(o, out = document.createElement('canvas')) {
  const { alpha, mask, outer } = compute(o);
  const { w, h } = L.hi, n = w * h, [r, g, b] = hex2rgb(o.color);
  const img = new ImageData(w, h), d = img.data;
  for (let i = 0; i < n; i++) {
    const a = alpha[i], p = i * 4;
    if (o.fill && mask[i]) {
      // lines over white inside the drawing; outside stays transparent
      d[p] = Math.round(255 + (r - 255) * a); d[p + 1] = Math.round(255 + (g - 255) * a); d[p + 2] = Math.round(255 + (b - 255) * a); d[p + 3] = 255;
    } else { d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = Math.round(a * 255); }
  }
  const { W, H } = sizes();
  out.width = W; out.height = H;
  const cx = out.getContext('2d');
  if (W === w && H === h) cx.putImageData(img, 0, 0);
  else {
    // processed smaller than the result (very big pictures): scale the lines up smoothly
    const work = document.createElement('canvas'); work.width = w; work.height = h; work.getContext('2d').putImageData(img, 0, 0);
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.drawImage(work, 0, 0, W, H);
  }
  return { canvas: out, W, H, lines: { alpha, outer, o } };
}

return { sizes, compute, render };
}
