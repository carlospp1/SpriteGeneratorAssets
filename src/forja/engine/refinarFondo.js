/* Refines the AI's background mask with the picture's own colours. The AI looks at the picture at 512 px, so
   near the outline it is a little blurry: some background is left around the drawing (a halo, small remains)
   or eats a thin bit of it. Design sheets and sprites almost always have a background of one colour, so:
   1. the background colour is taken where the AI is sure it is background;
   2. in a thin band around the AI's outline every pixel is decided by its colour against that background:
      close to it → background (no halo, no remains), far from it → drawing;
   3. closed pockets of background colour inside the drawing are removed where the AI itself was not sure
      (gaps between legs…), but not where it was sure (white highlights of the eyes stay);
   4. only the outermost pixels of the drawing get a soft opacity, from that same colour distance (the outline's
      own anti-aliasing), so light parts of the drawing are never made half transparent.
   Pure function, no DOM: rgba of the picture and the AI's opacity (0-255) per pixel, same size. */

const SEGURO_FONDO = 20;    // AI opacity (0-255) below which a pixel is surely background
const SEGURO_FIGURA = 235;  // and above which it is surely drawing
const MAX_MUESTRAS = 40000;

const dist = (rgba, i, c) => Math.hypot(rgba[i * 4] - c[0], rgba[i * 4 + 1] - c[1], rgba[i * 4 + 2] - c[2]);

/**
 * @param {Uint8ClampedArray} rgba
 * @param {Uint8Array} alfaIA  the AI's opacity 0-255 per pixel
 * @param {number} w
 * @param {number} h
 * @returns {{ mask: Uint8Array, alfa: Uint8Array, fondo: number[] | null }}
 *   mask 1/0 (drawing / background), alfa 0-255 soft edge, fondo the background colour (null: not one colour)
 */
export function refinarFondo(rgba, alfaIA, w, h) {
  const n = w * h;

  // 1. background colour: the most common colour where the AI is sure it is background
  const cuenta = new Map(), paso = Math.max(1, Math.floor(n / MAX_MUESTRAS));
  let ref = -1, max = 0, seguros = 0;
  for (let i = 0; i < n; i += paso) {
    if (alfaIA[i] > SEGURO_FONDO) continue;
    seguros++;
    const k = ((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3);
    const c = (cuenta.get(k) || 0) + 1; cuenta.set(k, c);
    if (c > max) { max = c; ref = i; }
  }
  const mask = new Uint8Array(n), alfa = new Uint8Array(n);
  // not a one-colour background (a scene, a gradient): the AI's own answer, as it is
  if (ref < 0 || max < seguros * 0.35) {
    for (let i = 0; i < n; i++) { alfa[i] = alfaIA[i]; mask[i] = alfaIA[i] >= 128 ? 1 : 0; }
    return { mask, alfa, fondo: null };
  }
  // the average colour of that most common tone, and how much the background itself varies (noise)
  const base = [rgba[ref * 4], rgba[ref * 4 + 1], rgba[ref * 4 + 2]];
  let sr = 0, sg = 0, sb = 0, sn = 0;
  const ds = [];
  for (let i = 0; i < n; i += paso) {
    if (alfaIA[i] > SEGURO_FONDO) continue;
    const d = dist(rgba, i, base);
    if (d < 40) { sr += rgba[i * 4]; sg += rgba[i * 4 + 1]; sb += rgba[i * 4 + 2]; sn++; }
    ds.push(d);
  }
  const fondo = [sr / sn, sg / sn, sb / sn];
  ds.sort((a, b) => a - b);
  const ruido = ds[Math.floor(ds.length * 0.95)] || 0;
  // a pixel this close to the background colour is background; this far, surely drawing
  const T_FONDO = Math.max(16, Math.min(60, ruido + 12));
  const T_FIGURA = T_FONDO + 45;

  // 2. the band around the AI's outline: where it is not sure, plus a few pixels on each side
  const banda = new Uint8Array(n);
  let cola = [];
  const R = Math.max(2, Math.round(Math.max(w, h) / 400));
  for (let i = 0; i < n; i++) if (alfaIA[i] > SEGURO_FONDO && alfaIA[i] < SEGURO_FIGURA) { banda[i] = 1; cola.push(i); }
  for (let i = 0; i < n; i++) {
    const x = i % w, a = alfaIA[i] >= 128;
    if ((x > 0 && (alfaIA[i - 1] >= 128) !== a) || (i >= w && (alfaIA[i - w] >= 128) !== a)) { if (!banda[i]) { banda[i] = 1; cola.push(i); } }
  }
  for (let r = 0; r < R; r++) {   // widen the band R pixels
    const sig = [];
    for (const i of cola) {
      const x = i % w;
      for (const q of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (q >= 0 && q < n && !banda[q]) { banda[q] = 1; sig.push(q); }
    }
    cola = sig;
  }

  for (let i = 0; i < n; i++) {
    if (!banda[i]) { alfa[i] = alfaIA[i] >= 128 ? 255 : 0; continue; }
    // in the band the colour decides: background colour → background, anything else → drawing. A pixel the AI
    // was sure was background stays background however it looks (no stray bits around)
    alfa[i] = alfaIA[i] > SEGURO_FONDO && dist(rgba, i, fondo) > T_FONDO ? 255 : 0;
  }

  // 3. closed pockets of background colour where the AI was not sure: background
  const visto = new Uint8Array(n), minimo = Math.max(16, n * 0.0002);
  for (let s = 0; s < n; s++) {
    if (visto[s] || alfa[s] < 128 || alfaIA[s] >= SEGURO_FIGURA || dist(rgba, s, fondo) > T_FONDO) continue;
    const zona = [s]; visto[s] = 1;
    for (let k = 0; k < zona.length; k++) {
      const p = zona[k], x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w])
        if (q >= 0 && q < n && !visto[q] && alfa[q] >= 128 && alfaIA[q] < SEGURO_FIGURA && dist(rgba, q, fondo) <= T_FONDO) { visto[q] = 1; zona.push(q); }
    }
    if (zona.length >= minimo) for (const p of zona) alfa[p] = 0;
  }

  for (let i = 0; i < n; i++) mask[i] = alfa[i] >= 128 ? 1 : 0;

  // 4. soft edge: only the drawing's outermost pixels (those touching the background) get a partial opacity,
  //    from how close their colour is to the background's — that is the anti-aliasing of the outline
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const x = i % w;
    const borde = (x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) || (i >= w && !mask[i - w]) || (i < n - w && !mask[i + w]);
    if (!borde) continue;
    const t = (dist(rgba, i, fondo) - T_FONDO) / (T_FIGURA - T_FONDO);
    alfa[i] = Math.round(255 * Math.max(0.25, Math.min(1, t)));
  }
  return { mask, alfa, fondo };
}

/**
 * Takes the background's tint off a half-transparent edge pixel (so a white background leaves no light rim).
 * c: colour channel 0-255 of the picture, f: the same channel of the background colour, a: opacity 0-255.
 */
export function sinTinteFondo(c, f, a) {
  if (a >= 250 || a <= 5) return c;
  const k = a / 255;
  return Math.max(0, Math.min(255, Math.round((c - (1 - k) * f) / k)));
}
