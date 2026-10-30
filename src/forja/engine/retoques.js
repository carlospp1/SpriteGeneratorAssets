/* Pixel art touch-ups for the finished sprite, the way a pixel artist would do them by hand. Each one takes the
   sprite's pixels (RGBA, w × h) and returns new ones; the generator applies the list of touch-ups the user asked
   for (with a button) on top of the sprite, in order, so they survive the sprite being generated again.
   «Edge» = an opaque pixel next to a transparent one (or the sprite's border). */
import { rgb2lab, lab2rgb } from './color.js';

const clave = (d, o) => (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
const labDe = (() => { const t = [0, 0, 0]; return k => { rgb2lab((k >> 16) & 255, (k >> 8) & 255, k & 255, t, 0); return [t[0], t[1], t[2]]; }; })();
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const aRGB = lab => lab2rgb(Math.max(0, Math.min(100, lab[0])), lab[1], lab[2]);
const poner = (d, o, rgb) => { d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; };
/* colours of the opaque pixels with how many there are */
function colores(px) {
  const m = new Map();
  for (let o = 0; o < px.length; o += 4) if (px[o + 3]) { const k = clave(px, o); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
const opaco = (px, w, h, x, y) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 0;
function esBorde(px, w, h, i) {
  const x = i % w, y = (i / w) | 0;
  return px[i * 4 + 3] > 0 && (!opaco(px, w, h, x - 1, y) || !opaco(px, w, h, x + 1, y) || !opaco(px, w, h, x, y - 1) || !opaco(px, w, h, x, y + 1));
}
/* every opaque pixel of colour k becomes mapa.get(k) */
function recolorear(px, mapa) {
  const out = new Uint8ClampedArray(px);
  for (let o = 0; o < out.length; o += 4) {
    if (!out[o + 3]) continue;
    const n = mapa.get(clave(out, o));
    if (n !== undefined) { out[o] = (n >> 16) & 255; out[o + 1] = (n >> 8) & 255; out[o + 2] = n & 255; }
  }
  return out;
}

/* «Unificar colores parecidos»: colours closer than umbral (ΔE, Lab) become the most used one of them */
export function unificar(px, w, h, { umbral = 8 }) {
  const lista = [...colores(px)].sort((a, b) => b[1] - a[1]);
  const reps = [], mapa = new Map();
  for (const [k] of lista) {
    const lab = labDe(k), r = reps.find(r => dE(r.lab, lab) < umbral);
    if (r) mapa.set(k, r.k); else reps.push({ k, lab });
  }
  return recolorear(px, mapa);
}

/* «Reducir a N colores»: the palette grouped into n (k-means in Lab, weighted by use); each group keeps its most
   used colour, so the sprite only has colours it already had */
/**
 * Los n colores a los que reducir la paleta, de entre los que ya tiene el sprite. Varias formas de elegirlos
 * (la IA prueba todas y se queda con la que mejor se ve):
 *  - pesos: cuánto cuenta lo usado que está cada color ('raiz' o 'uniforme');
 *  - luz: peso de la luminosidad frente al tono (más alto conserva mejor el sombreado);
 *  - representante: qué color queda de cada grupo ('usado': el más usado; 'centro': el más cercano al centro);
 *  - oscuro: guardar siempre el color más oscuro (el de las líneas).
 * Devuelve las claves (0xRRGGBB) de los colores elegidos.
 */
export function paletaReducida(px, n, { pesos = 'raiz', luz = 1, representante = 'usado', oscuro = false } = {}) {
  const lista = [...colores(px)].sort((a, b) => b[1] - a[1]);
  if (lista.length <= n) return lista.map(([k]) => k);
  const labs = lista.map(([k]) => labDe(k)), peso = lista.map(([, c]) => (pesos === 'uniforme' ? 1 : Math.sqrt(c)));
  const d = (a, b) => Math.hypot((a[0] - b[0]) * luz, a[1] - b[1], a[2] - b[2]);
  const fijo = oscuro ? labs.reduce((m, l, i) => (l[0] < labs[m][0] ? i : m), 0) : -1;
  const centros = [labs[fijo >= 0 ? fijo : 0]];   // cada centro nuevo, el color más lejos de los ya elegidos
  while (centros.length < n) {
    let mejor = 0, md = -1;
    labs.forEach((l, i) => { const v = Math.min(...centros.map(c => d(c, l))) * peso[i]; if (v > md) { md = v; mejor = i; } });
    centros.push(labs[mejor]);
  }
  const grupo = new Int32Array(lista.length);
  for (let it = 0; it < 10; it++) {
    labs.forEach((l, i) => { let g = 0, gd = Infinity; centros.forEach((c, j) => { const v = d(c, l); if (v < gd) { gd = v; g = j; } }); grupo[i] = g; });
    centros.forEach((c, j) => {
      if (j === 0 && fijo >= 0) return;   // el oscuro no se mueve
      let suma = [0, 0, 0], t = 0;
      labs.forEach((l, i) => { if (grupo[i] === j) { const p = lista[i][1]; suma = suma.map((v, q) => v + l[q] * p); t += p; } });
      if (t) centros[j] = suma.map(v => v / t);
    });
  }
  const elegido = new Map();   // grupo → { i, v }
  lista.forEach(([, c], i) => {
    const g = grupo[i], v = representante === 'centro' ? -d(centros[g], labs[i]) : c;
    if (!elegido.has(g) || elegido.get(g).v < v) elegido.set(g, { i, v });
  });
  if (fijo >= 0) elegido.set(grupo[fijo], { i: fijo, v: Infinity });
  return [...new Set([...elegido.values()].map(e => lista[e.i][0]))];
}

/* cada color al más parecido de la paleta (en Lab) */
export function aPaleta(px, paleta) {
  const labs = paleta.map(labDe), mapa = new Map();
  for (const [k] of colores(px)) {
    const l = labDe(k);
    let mejor = 0, md = Infinity;
    labs.forEach((p, j) => { const v = dE(p, l); if (v < md) { md = v; mejor = j; } });
    mapa.set(k, paleta[mejor]);
  }
  return recolorear(px, mapa);
}

/* Reducir a n colores. Con paleta (la que eligió la IA) se usa esa: cada color va al más parecido de ella, aunque
   el sprite se vuelva a generar con otros colores. Sin ella, la forma de siempre. */
export function reducir(px, w, h, { n = 8, paleta = null }) {
  if (paleta && paleta.length) return aPaleta(px, paleta);
  return aPaleta(px, paletaReducida(px, n));
}

/* the colour for an outline: the most used among the darkest edge pixels */
function colorContorno(px, w, h) {
  const n = w * h, cuenta = new Map();
  for (let i = 0; i < n; i++) if (esBorde(px, w, h, i)) { const k = clave(px, i * 4); cuenta.set(k, (cuenta.get(k) || 0) + 1); }
  const lista = [...cuenta].map(([k, c]) => ({ k, c, L: labDe(k)[0] })).sort((a, b) => a.L - b.L);
  if (!lista.length) return null;
  const oscuros = lista.slice(0, Math.max(1, Math.ceil(lista.length * 0.3)));
  const base = oscuros.reduce((a, b) => (b.c > a.c ? b : a));
  const lab = labDe(base.k);
  // always a deep shade of that colour (the hue of the drawing, dark enough to read as an outline)
  return [Math.min(lab[0], 20), lab[1] * 0.9, lab[2] * 0.9];
}

/* «Contorno»: the edge of the sprite in one colour (modo 'uno'), in two shades of the same colour (modo 'dos':
   the lighter one where the drawing next to it is light), or each part a dark shade of the colour beside it
   (modo 'zona', the «selout» of hand-made pixel art) */
export function contorno(px, w, h, { modo = 'uno' }) {
  const out = new Uint8ClampedArray(px), n = w * h;
  const borde = new Uint8Array(n); for (let i = 0; i < n; i++) borde[i] = esBorde(px, w, h, i) ? 1 : 0;
  // the colour just inside each edge pixel (an opaque neighbour that is not edge), or its own
  const dentro = i => {
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const xx = x + dx, yy = y + dy;
      if (opaco(px, w, h, xx, yy) && !borde[yy * w + xx]) return clave(px, (yy * w + xx) * 4);
    }
    return clave(px, i * 4);
  };
  if (modo === 'zona') {
    const cache = new Map();
    for (let i = 0; i < n; i++) {
      if (!borde[i]) continue;
      const k = dentro(i);
      if (!cache.has(k)) { const l = labDe(k); cache.set(k, aRGB([Math.max(6, l[0] * 0.55 - 6), l[1] * 1.1, l[2] * 1.1])); }
      poner(out, i * 4, cache.get(k));
    }
    return out;
  }
  const base = colorContorno(px, w, h); if (!base) return px;
  const oscuro = aRGB(base);
  if (modo === 'uno') { for (let i = 0; i < n; i++) if (borde[i]) poner(out, i * 4, oscuro); return out; }
  // two shades of the same colour: light where the drawing inside is lighter than the middle
  const claro = aRGB([base[0] + 16, base[1], base[2]]);
  const Ls = []; for (let i = 0; i < n; i++) if (borde[i]) Ls.push(labDe(dentro(i))[0]);
  const medio = Ls.sort((a, b) => a - b)[Ls.length >> 1] || 50;
  for (let i = 0; i < n; i++) if (borde[i]) poner(out, i * 4, labDe(dentro(i))[0] > medio ? claro : oscuro);
  return out;
}

/* «Limpiar píxeles sueltos»: a pixel with no neighbour of its own colour takes the most common colour around it;
   an opaque pixel alone in the transparency goes */
export function limpiar(px, w, h) {
  const out = new Uint8ClampedArray(px);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4; if (!px[o + 3]) continue;
    const k = clave(px, o), vecinos = new Map();
    let igual = false, opacos = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!opaco(px, w, h, x + dx, y + dy)) continue;
      opacos++;
      const q = ((y + dy) * w + x + dx) * 4, kq = clave(px, q);
      if (kq === k) igual = true; else vecinos.set(kq, (vecinos.get(kq) || 0) + 1);
    }
    if (igual) continue;
    if (!opacos) { out[o + 3] = 0; continue; }
    let mejor = null, mc = 0;
    for (const [kq, c] of vecinos) if (c > mc) { mc = c; mejor = kq; }
    if (mejor !== null && mc >= 2) { out[o] = (mejor >> 16) & 255; out[o + 1] = (mejor >> 8) & 255; out[o + 2] = mejor & 255; }
  }
  return out;
}

/* the touch-ups by name, for the generator's list */
export const RETOQUES = { unificar, reducir, contorno, limpiar };
