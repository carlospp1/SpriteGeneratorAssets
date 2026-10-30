/* The judge of «Ajustar automáticamente» (sprite part), with no page state, so the generator and the batch
   script (scripts/forjar-disenos.mjs) judge the same way: the combinations to try, the drawing at the sprite's
   size, what each try does with the lines and the colours, CLIP's prompts and the final score.
   S: { w, rgba, lab, mask } of the working picture; b: the character's box { x0, y0, x1, y1 }. */
import { rgb2lab } from './color.js';

export const VALORES = ['k', 'kAuto', 's', 'mergeDE', 'cl', 'lineKeep', 'colOut'];
const LADO_CLIP = 224;

/* The prompts of the judge. CLIP compares a picture with short captions, so each idea is said several ways (the
   average is steadier) and the good ones are weighed against what a bad sprite looks like: the sprite is scored
   by how much of its likeness goes to SPRITE_SI rather than to SPRITE_NO. */
const SPRITE_SI = [
  'a pixel art sprite of a creature from a retro video game, with a crisp dark outline around the whole body',
  'a clean 16-bit game sprite with a bold black outline, flat cel shading and clearly separated colour areas',
  'an official pokemon game sprite with sharp dark line art outlining the body, the eyes and every limb',
  'hand-made pixel art character with a one pixel dark outline, readable inner lines and a few flat shades'
];
const SPRITE_NO = [
  'a blurry downscaled picture of a drawing, soft colour blobs with no outline and no lines',
  'a low resolution pixelated image where the colours just sit next to each other without any line art',
  'a noisy jpeg thumbnail with muddy colours, scattered dots and no clear edges',
  'a mosaic of coloured squares, a smudge of colours with no outline'
];
/* the same idea on the original: does the drawing have line art (then its inner lines must show in the sprite)? */
const DIBUJO_SI = [
  'a cartoon illustration with clean dark line art outlining every shape',
  'a drawing of a creature with bold black ink outlines and inner lines'
];
const DIBUJO_NO = [
  'a soft painting or 3D render with no outlines and no line art',
  'a smooth digital painting where shapes are made of colour only, without lines'
];
const ESCALA = 100;   // CLIP's own logit scale: turns similarities into probabilities

/* the prompts' fingerprints, worked out once with huellasTexto (CLIP's text side, in the page or in Node) */
let prompts = null;
export async function vectoresPrompts(huellasTexto) {
  if (prompts) return prompts;
  const listas = [SPRITE_SI, SPRITE_NO, DIBUJO_SI, DIBUJO_NO];
  const v = await huellasTexto(listas.flat());
  let i = 0;
  prompts = listas.map(l => l.map(() => v[i++]));
  return prompts;
}
export const parecido = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
/* 0..1: how much the picture goes with the «yes» prompts rather than with the «no» ones */
export function siFrenteANo(img, si, no) {
  const l = [...si, ...no].map(t => ESCALA * parecido(img, t)), m = Math.max(...l);
  const e = l.map(x => Math.exp(x - m)), total = e.reduce((a, b) => a + b, 0);
  return e.slice(0, si.length).reduce((a, b) => a + b, 0) / total;
}

/* small seeded random numbers: the same click number gives the same tries */
function azar(semilla) { let s = semilla * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const entre = (r, a, b) => a + Math.floor(r() * (b - a + 1));

/* four combinations: every try gives a new value to all of the sprite's values (the first click keeps the
   current ones among the four, so it never ends up worse than what there was) */
export function combinaciones(actual, ronda) {
  const r = azar(ronda + 1), lista = [];
  const kBase = +actual.k || 6;
  if (ronda === 0) lista.push({ ...actual });
  while (lista.length < 4) {
    // materials: half the times the AI's count, the other half a number around the current one
    const kAuto = r() < 0.5;
    lista.push({
      kAuto,
      k: kAuto ? actual.k : Math.max(2, Math.min(16, kBase + entre(r, -3, 3))),
      s: entre(r, 1, 5),
      mergeDE: [0, 1.5, 2.5, 4, 6, 8][entre(r, 0, 5)],
      cl: entre(r, 0, 3),
      // the dark lines are what makes a sprite read: switching them off is tried less often
      lineKeep: r() < 0.8,
      colOut: r() < 0.5
    });
  }
  return lista;
}

/* The drawing at the sprite's size, cell by cell (a cell = the part of the drawing under one sprite pixel):
   the average Lab of the character's pixels, and whether the drawing has a line there — a share of its pixels
   clearly darker than the cells around (an ink stroke) or plain dark. */
export function referencia(S, b, TW, TH) {
  if (!b) return null;
  const { w, lab, mask } = S, nc = TW * TH, suma = new Float64Array(nc * 3), n = new Uint32Array(nc);
  const cw = (b.x1 - b.x0) / TW, ch = (b.y1 - b.y0) / TH;
  const celda = (x, y) => Math.min(TH - 1, Math.floor((y - b.y0) / ch)) * TW + Math.min(TW - 1, Math.floor((x - b.x0) / cw));
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const p = y * w + x; if (!mask[p]) continue;
    const c = celda(x, y);
    suma[c * 3] += lab[p * 3]; suma[c * 3 + 1] += lab[p * 3 + 1]; suma[c * 3 + 2] += lab[p * 3 + 2]; n[c]++;
  }
  // lightness around every cell (its 3×3 cells)
  const alrededor = new Float32Array(nc);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    let s = 0, m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = i + dx, y = j + dy; if (x < 0 || y < 0 || x >= TW || y >= TH) continue;
      const q = y * TW + x; if (n[q]) { s += suma[q * 3]; m += n[q]; }
    }
    alrededor[j * TW + i] = m ? s / m : 100;
  }
  const tinta = new Uint32Array(nc);
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const p = y * w + x; if (!mask[p]) continue;
    const c = celda(x, y), L = lab[p * 3];
    if (L < 25 || L < alrededor[c] - 15) tinta[c]++;
  }
  const linea = new Uint8Array(nc);
  let lineas = 0, llenas = 0;
  for (let c = 0; c < nc; c++) if (n[c]) { llenas++; if (tinta[c] >= n[c] * 0.12) { linea[c] = 1; lineas++; } }
  return { suma, n, linea, lineas: llenas ? lineas / llenas : 0 };
}

/* the sprite (or the original crop) as a white-backed picture of LADO_CLIP px, for CLIP */
export function aCuadro(px, w, h) {
  const k = LADO_CLIP / Math.max(w, h), W = LADO_CLIP, out = new Uint8ClampedArray(W * W * 4).fill(255);
  const ox = Math.floor((W - w * k) / 2), oy = Math.floor((W - h * k) / 2);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const sx = Math.floor((x - ox) / k), sy = Math.floor((y - oy) / k);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const s = (sy * w + sx) * 4, a = px[s + 3] / 255, o = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(px[s + c] * a + 255 * (1 - a));
  }
  return { data: out, width: W, height: W };
}
export function originalRecortado(S, b) {
  const { w, rgba, mask } = S, W = b.x1 - b.x0, H = b.y1 - b.y0, px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (b.y0 + y) * w + b.x0 + x, o = (y * W + x) * 4;
    if (!mask[p]) continue;
    px[o] = rgba[p * 4]; px[o + 1] = rgba[p * 4 + 1]; px[o + 2] = rgba[p * 4 + 2]; px[o + 3] = 255;
  }
  return aCuadro(px, W, H);
}

/* What the sprite does with the lines and the colours:
   - contorno: share of the silhouette's edge pixels that are an outline (dark, or clearly darker than the pixel
     just inside);
   - interiores: share of the drawing's inner lines (cells with a line that are not on the edge) that the sprite
     draws as a pixel darker than its neighbours (on the cell or right next to it);
   - fidelidad: mean Lab difference to the drawing, only away from the lines (the fill colours);
   - ruido: share of pixels with no neighbour of their colour;
   - oscuro: share of the sprite that is dark (too much and it is a black blob, not lines). */
export function medir(sp, ref) {
  const { px, TW, TH } = sp, nc = TW * TH, L = new Float32Array(nc), t = [0, 0, 0];
  const opaco = c => px[c * 4 + 3] > 0;
  for (let c = 0; c < nc; c++) if (opaco(c)) { rgb2lab(px[c * 4], px[c * 4 + 1], px[c * 4 + 2], t, 0); L[c] = t[0]; }
  const dentro = (i, j) => i >= 0 && j >= 0 && i < TW && j < TH && opaco(j * TW + i);
  // darker than the mean of its opaque neighbours (8 around)
  const marcado = (i, j) => {
    const c = j * TW + i; if (!opaco(c)) return false;
    if (L[c] < 30) return true;
    let s = 0, m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && dentro(i + dx, j + dy)) { s += L[(j + dy) * TW + i + dx]; m++; }
    return m > 0 && L[c] <= s / m - 8;
  };
  const LADOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let borde = 0, contorno = 0, internas = 0, vistas = 0, dif = 0, nd = 0, sueltos = 0, opacos = 0, oscuros = 0;
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const c = j * TW + i, o = c * 4; if (!opaco(c)) continue;
    opacos++;
    if (L[c] < 30) oscuros++;
    // silhouette edge: a side looks out to the background
    const fuera = LADOS.find(([dx, dy]) => !dentro(i + dx, j + dy));
    if (fuera) {
      borde++;
      const [dx, dy] = fuera, x = i - dx, y = j - dy;   // the pixel just inside, opposite the background
      if (L[c] < 40 || (dentro(x, y) && L[c] <= L[y * TW + x] - 15)) contorno++;
    } else if (ref.linea[c]) {
      internas++;
      if (marcado(i, j) || LADOS.some(([dx, dy]) => dentro(i + dx, j + dy) && marcado(i + dx, j + dy))) vistas++;
    } else if (ref.n[c]) {
      const m = ref.n[c];
      rgb2lab(px[o], px[o + 1], px[o + 2], t, 0);
      dif += Math.hypot(t[0] - ref.suma[c * 3] / m, t[1] - ref.suma[c * 3 + 1] / m, t[2] - ref.suma[c * 3 + 2] / m); nd++;
    }
    let igual = false;
    for (let dy = -1; dy <= 1 && !igual; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = i + dx, y = j + dy; if (x < 0 || y < 0 || x >= TW || y >= TH) continue;
      const q = (y * TW + x) * 4;
      if (px[q + 3] && px[q] === px[o] && px[q + 1] === px[o + 1] && px[q + 2] === px[o + 2]) { igual = true; break; }
    }
    if (!igual) sueltos++;
  }
  return {
    contorno: borde ? contorno / borde : 0, interiores: internas ? vistas / internas : 1,
    fidelidad: nd ? dif / nd : 99, ruido: opacos ? sueltos / opacos : 1, oscuro: opacos ? oscuros / opacos : 0
  };
}

/* Lower is better: lines that show (outline and inner lines), a sprite that reads as one (esSprite), the drawing
   still recognised (ia), faithful fill colours, little noise, no dark blob. The drawing's inner lines matter more
   the more line art it has (measured on its pixels and by the AI: lineasIA). */
export function nota(m, ref, ia, esSprite, lineasIA) {
  const pesoInteriores = 1 + Math.min(1, ref.lineas * 4) * 0.5 + lineasIA * 0.5;
  return -m.contorno * 3 - m.interiores * 2 * pesoInteriores - esSprite * 2 - ia * 4
    + m.fidelidad / 10 + m.ruido * 3 + Math.max(0, m.oscuro - 0.4) * 6;
}
