/* «Ajustar automáticamente»: the background settings worked out from the picture, in four tries.
   - Proposing the values is the simple part (instant): is there a plain background (the border is mostly one
     colour)? and a first tolerance: the highest one right before the drawing's area drops sharply (raising the
     tolerance removes the background's noise, soft edge, faint watermarks… in steps, until it starts taking
     light parts of the drawing).
   - Choosing among four tries around it is the expert part: each try is scored and compared with the best so
     far. Without a judge the score is halo (background-like edge left), «mordida» (sure drawing pixels lost)
     and specks. With a judge — the mask of the advanced background AI — the try that agrees most with what the
     AI sees as the drawing wins (plus the halo, to break ties).
   Works on a small copy of the picture, so it takes a fraction of a second (plus the AI judge, if asked). */
import { createImage } from './image.js';
import { createBg } from './background.js';

const LADO = 500;                                  // size of the copy that is analysed
const TOLERANCIAS = [8, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70];
const TOL_MAX = 50;                                // above this the background usually eats light drawings
const MESETA = 0.01;                               // a step that takes less than this share of the drawing: plateau
const CAIDA = 0.05;                                // a step that takes more: a big drop
const MESETAS_MIN = 3;                             // fewer plateaus than this (up to 45): a full scene
const BORDE_LISO = 0.6;                            // share of the border that must be the background colour
const LEJOS_DEL_FONDO = 70;                        // this far from the background colour: surely drawing
const OPCIONES = tol => ({ remove: true, tol, drift: 3.5, frame: true, island: 0.4, alphaMin: 128, globalTol: 1.6 });

/**
 * @param {HTMLImageElement} img
 * @param {{x,y,w,h}} [frame]  part of the picture being used (the whole picture if left out)
 * @param {{ mask: Uint8Array, w: number, h: number }} [juez]  the advanced AI's mask (1 drawing), any size
 * @param {number} [ronda]  0 the first time; every new click of the button tries four other tolerances
 * @returns {{ quitarFondo: boolean, tol: number, intentos?: object[], conJuez?: boolean }}
 */
export function ajustarFondo(img, frame, juez, ronda = 0) {
  const S = { bgSeeds: [], markers: [], edits: null, maxSide: LADO };
  const image = createImage(S);
  image.start(img, null);
  if (frame) image.setFrame(image.makeFrame(frame.x, frame.y, frame.w, frame.h));
  return ajustarFondoPixeles({ w: S.w, h: S.h, rgba: S.rgba }, juez, ronda);
}

/* the same on pixels already at the analysis size: { w, h, rgba } */
export function ajustarFondoPixeles({ w, h, rgba }, juez, ronda = 0) {
  const S = { w, h, rgba, bgSeeds: [], markers: [], edits: null }, n = w * h;

  // ---- simple part: plain background? first guess of the tolerance
  const borde = [];
  for (let x = 0; x < w; x++) borde.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) borde.push(y * w, y * w + w - 1);
  const cuenta = new Map();
  let ref = borde[0], max = 0;
  for (const p of borde) {
    const k = ((rgba[p * 4] >> 4) << 8) | ((rgba[p * 4 + 1] >> 4) << 4) | (rgba[p * 4 + 2] >> 4);
    const c = (cuenta.get(k) || 0) + 1; cuenta.set(k, c);
    if (c > max) { max = c; ref = p; }
  }
  const bgRef = [rgba[ref * 4], rgba[ref * 4 + 1], rgba[ref * 4 + 2]];
  const cerca = borde.filter(p => distFondo(rgba, p, bgRef) <= 30 || rgba[p * 4 + 3] < 128).length;
  if (cerca < borde.length * BORDE_LISO) return { quitarFondo: false, tol: 14 };

  const bg = createBg(S);
  const area = TOLERANCIAS.map(tol => { bg.compute(OPCIONES(tol)); let a = 0; for (let i = 0; i < n; i++) a += S.mask[i]; return a; });
  const baja = i => (area[i - 1] - area[i]) / Math.max(1, area[i - 1]);   // share lost from tolerance i-1 to i
  let mesetas = 0;
  for (let i = 1; i < TOLERANCIAS.length; i++) if (TOLERANCIAS[i] <= 45 && baja(i) < MESETA) mesetas++;
  if (mesetas < MESETAS_MIN) return { quitarFondo: false, tol: 14 };
  let guess = TOL_MAX;
  for (let i = TOLERANCIAS.length - 2; i >= 0; i--) {
    if (TOLERANCIAS[i] > TOL_MAX) continue;
    if (baja(i + 1) >= CAIDA && (i === 0 || baja(i) < CAIDA)) { guess = TOLERANCIAS[i]; break; }
  }

  // ---- expert part: four tries around the guess, one after the other, each compared with the best so far
  const candidatas = [];
  for (const t of desplazamientos(ronda).map(d => guess + d)) {
    let v = Math.max(8, Math.min(60, t));
    while (candidatas.includes(v) && v < 60) v += 5;
    candidatas.push(v);
  }
  const ia = juez ? reducirJuez(juez, w, h) : null;
  const nucleo = nucleoFigura(S, bg, Math.min(...candidatas), bgRef);
  const intentos = [];
  let mejor = null;
  for (const tol of candidatas) {
    bg.compute(OPCIONES(tol));
    const nota = puntuar(S, bgRef, nucleo, ia);
    const intento = { tol, ...nota, gana: false };
    if (!mejor || nota.total < mejor.total) mejor = intento;
    intentos.push(intento);
  }
  mejor.gana = true;
  return { quitarFondo: true, tol: mejor.tol, intentos, conJuez: !!ia };
}

/* the four tries of each round around the first guess: the first round the usual ones; the next ones closer,
   wider or shifted, and from the fourth on, four different ones each time (so another click can give another
   version) */
function desplazamientos(ronda) {
  const fijas = [[-10, -5, 0, 5], [-8, -3, 2, 7], [-14, -6, 3, 9], [-4, -2, 2, 4]];
  if (ronda < fijas.length) return fijas[ronda];
  let semilla = ronda * 9301 + 49297;
  const azar = () => { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280; };
  const d = new Set();
  while (d.size < 4) d.add(Math.round(azar() * 28) - 15);
  return [...d].sort((a, b) => a - b);
}

/* how far a pixel's colour is from the background colour */
const distFondo = (rgba, i, ref) => Math.hypot(rgba[i * 4] - ref[0], rgba[i * 4 + 1] - ref[1], rgba[i * 4 + 2] - ref[2]);

/* the AI judge's mask at the analysis size (nearest pixel) */
function reducirJuez({ mask, w: jw, h: jh }, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(jh - 1, Math.floor((y + 0.5) * jh / h));
    for (let x = 0; x < w; x++) out[y * w + x] = mask[sy * jw + Math.min(jw - 1, Math.floor((x + 0.5) * jw / w))];
  }
  return out;
}

/* the drawing's surely-not-background pixels at the gentlest tolerance: losing them later is «eating» */
function nucleoFigura(S, bg, tol, ref) {
  bg.compute(OPCIONES(tol));
  const n = S.w * S.h, nucleo = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) if (S.mask[i] && distFondo(S.rgba, i, ref) > LEJOS_DEL_FONDO) { nucleo[i] = 1; total++; }
  return { nucleo, total: Math.max(1, total) };
}

/* score of a result (lower is better):
   halo: how background-like the edge of the drawing still is; mordida: share of the sure drawing pixels lost;
   motas: loose specks; desacuerdo (with the AI judge): pixels where the try and the AI disagree, as a share of
   what the AI sees as drawing — with a judge, this is what decides */
function puntuar(S, ref, { nucleo, total }, ia) {
  const { w, h, mask, rgba } = S, n = w * h;
  let borde = 0, parecido = 0, comidos = 0, distintos = 0, figuraIA = 0;
  for (let i = 0; i < n; i++) {
    if (nucleo[i] && !mask[i]) comidos++;
    if (ia) { if (ia[i]) figuraIA++; if (ia[i] !== mask[i]) distintos++; }
    if (!mask[i]) continue;
    const x = i % w;
    if ((x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) || (i >= w && !mask[i - w]) || (i < n - w && !mask[i + w])) {
      borde++;
      parecido += Math.max(0, 1 - distFondo(rgba, i, ref) / 100);
    }
  }
  const visto = new Uint8Array(n), min = Math.max(4, n * 0.0005);
  let motas = 0;
  for (let s = 0; s < n; s++) {
    if (!mask[s] || visto[s]) continue;
    let tam = 0; const pila = [s]; visto[s] = 1;
    while (pila.length) {
      const p = pila.pop(); tam++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w])
        if (q >= 0 && q < n && mask[q] && !visto[q]) { visto[q] = 1; pila.push(q); }
    }
    if (tam < min) motas++;
  }
  const halo = borde ? parecido / borde : 0, mordida = comidos / total;
  const desacuerdo = ia ? distintos / Math.max(1, figuraIA) : null;
  const total_ = ia ? desacuerdo * 10 + halo * 0.5 + motas * 0.002 : halo + mordida * 20 + motas * 0.002;
  return { halo, mordida, motas, desacuerdo, total: total_ };
}
