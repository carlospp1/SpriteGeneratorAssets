/* Style target for the line-art AI: CLIP compares each ONNX style (contour / anime) with these
   linearts + a text prompt, and keeps the closer one. Pictures are original sprite-style linearts
   (biped / quadruped / winged / plant) plus a CC0 pixel ghost outline (JotaFaD / OpenGameArt). */
import { huellaVisual, huellasTexto, parecido, pararClip } from '../source/iaClip.js';
import { empezarTarea, cancelado } from '../source/tareasIA.js';
import { lineasIA, pararLineas } from './iaLineart.js';

import bipedo from '../../../assets/lineart-refs/bipedo.png';
import cuadrupedo from '../../../assets/lineart-refs/cuadrupedo.png';
import alado from '../../../assets/lineart-refs/alado.png';
import planta from '../../../assets/lineart-refs/planta.png';
import fantasma from '../../../assets/lineart-refs/fantasma.png';

export const REFS = [
  { src: bipedo, nombre: 'Bípedo' },
  { src: cuadrupedo, nombre: 'Cuadrúpedo' },
  { src: alado, nombre: 'Alado' },
  { src: planta, nombre: 'Planta' },
  { src: fantasma, nombre: 'Sprite 1 px' }
];

/* shown in the Line art UI */
export const PROMPT_UI = 'Líneas negras limpias, silueta cerrada, pocas interiores (ojos y juntas), interior blanco, sin sombreado ni rayado.';

/* CLIP reads English more steadily than Spanish */
const PROMPT_SI = [
  'clean pixel art sprite lineart, one pixel black outline, white interior, no shading',
  'closed silhouette coloring page of a creature, few inner lines for eyes and joints, no hatching',
  'game sprite ink outlines only, crisp pixel stairs, bold outer contour, white fill'
];
const PROMPT_NO = [
  'messy sketch with overlapping strokes, grey shading, hatching and noise',
  'blurry anti-aliased cartoon with thick double lines and gaps in the outline'
];

function media(vectores) {
  const d = vectores[0].length, o = new Float32Array(d);
  for (const v of vectores) for (let i = 0; i < d; i++) o[i] += v[i];
  const n = vectores.length;
  let s = 0;
  for (let i = 0; i < d; i++) { o[i] /= n; s += o[i] * o[i]; }
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < d; i++) o[i] /= s;
  return o;
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('no se pudo leer una referencia de line art'));
    im.src = src;
  });
}

function imageDataDe(im) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(im, 0, 0);
  return x.getImageData(0, 0, c.width, c.height);
}

/* ONNX grey lines (0..1) → opaque black-on-white picture for CLIP */
function alphaAImagen(alpha, w, h) {
  const data = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const k = 255 - Math.round(alpha[i] * 255), j = i * 4;
    data.data[j] = k; data.data[j + 1] = k; data.data[j + 2] = k; data.data[j + 3] = 255;
  }
  return data;
}

let objetivo = null;
async function objetivoCLIP(tarea) {
  if (objetivo) return objetivo;
  const imgs = await Promise.all(REFS.map(r => loadImg(r.src)));
  const vis = [];
  for (const im of imgs) vis.push(await huellaVisual(imageDataDe(im), tarea));
  const txt = await huellasTexto([...PROMPT_SI, ...PROMPT_NO], tarea);
  objetivo = { si: media([...vis, ...txt.slice(0, PROMPT_SI.length)]), no: media(txt.slice(PROMPT_SI.length)) };
  return objetivo;
}

const ESTILOS = [['contour', 'contorno'], ['anime', 'anime']];

/**
 * Which ONNX style (contour / anime) is closer to the reference linearts + prompt.
 * Draws both (cached) and scores them with CLIP.
 */
export async function elegirEstiloIA(img, f, w, h) {
  const tarea = empezarTarea('La IA está dibujando las líneas con las referencias de estilo…', () => { pararLineas(); pararClip(); });
  try {
    const o = await objetivoCLIP(tarea);
    let mejor = { estilo: 'contour', s: -Infinity };
    for (const [estilo, nombre] of ESTILOS) {
      tarea.texto(`Dibujando líneas (${nombre}) y comparándolas con las referencias…`);
      const alpha = await lineasIA(img, f, estilo, w, h, { sinTarea: true });
      const vec = await huellaVisual(alphaAImagen(alpha, w, h), tarea);
      const s = parecido(vec, o.si) - parecido(vec, o.no);
      if (s > mejor.s) mejor = { estilo, s };
    }
    return mejor.estilo;
  } finally { tarea.fin(); }
}

export { cancelado };
