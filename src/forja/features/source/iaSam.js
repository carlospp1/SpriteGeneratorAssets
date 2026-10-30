/* «Selección con IA»: a click on something of the picture and the AI gives back that thing whole, with its exact
   shape (SlimSAM in a worker, see iaSam.worker.js). Works on the working picture of any page state S. While it
   works the «IA trabajando» window is shown; closing it cancels the selection. */
import { empezarTarea, cancelado } from './tareasIA.js';

let worker = null, siguiente = 0, enviada = null;
const pendientes = new Map();
const claves = new WeakMap();
let nImg = 0;
/* the same picture with the same crop and size has the same key */
function clave(S) {
  if (!claves.has(S.img)) claves.set(S.img, ++nImg);
  const f = S.frame || {};
  return [claves.get(S.img), f.x, f.y, f.w, f.h, S.w, S.h].join('|');
}

function arrancar() {
  if (worker) return;
  worker = new Worker(new URL('./iaSam.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: m }) => {
    if (m.tipo === 'progreso') { for (const p of pendientes.values()) p.tarea.texto(m.texto); return; }
    const p = pendientes.get(m.id); if (!p) return;
    pendientes.delete(m.id);
    if (m.tipo === 'hecho') p.resolve(m.mascara ?? m.regiones); else p.reject(new Error(m.mensaje));
  };
  worker.onerror = e => {
    for (const p of pendientes.values()) p.reject(new Error(e.message || 'la IA no ha podido arrancar'));
    pendientes.clear();
  };
}
/* the worker works on the picture of S (sent only when it changes); returns its key */
function enviar(S) {
  arrancar();
  const key = clave(S);
  if (enviada !== key) {
    worker.postMessage({ tipo: 'imagen', key, data: S.rgba.slice(), width: S.w, height: S.h });
    enviada = key;
  }
  return key;
}

function parar() {
  if (worker) { worker.terminate(); worker = null; enviada = null; }
  for (const p of pendientes.values()) p.reject(cancelado());
  pendientes.clear();
}

/**
 * The thing at the given points, as 1 / 0 per pixel of the working picture (S.w × S.h).
 * @param {object} S  page state (img, frame, w, h, rgba)
 * @param {{x: number, y: number, dentro: boolean}[]} puntos  dentro = part of the thing; false = not part of it
 * @returns {Promise<Uint8Array>}  rejects with an AbortError when cancelled
 */
export async function segmentar(S, puntos) {
  const key = enviar(S);
  const id = ++siguiente;
  const tarea = empezarTarea('La IA está seleccionando…', parar);
  try {
    return await new Promise((resolve, reject) => {
      pendientes.set(id, { resolve, reject, tarea });
      worker.postMessage({
        tipo: 'segmentar', id, key,
        puntos: puntos.map(p => [Math.round(p.x), Math.round(p.y)]),
        etiquetas: puntos.map(p => (p.dentro ? 1 : 0))
      });
    });
  } finally {
    tarea.fin();
  }
}

/**
 * The character split into its regions by the AI (hair, skin, clothes…), for «Detectar materiales».
 * No «IA trabajando» window: it runs on its own while you work; what it is doing goes to alTexto.
 * @param {object} S  page state (img, frame, w, h, rgba, mask)
 * @param {[number, number][]} puntos  points spread over the character, in picture pixels
 * @param {(t: string) => void} alTexto
 * @returns {Promise<{rgb: number[], n: number}[]>}  average colour (without the line art) and size of each region
 */
export function regionesSam(S, puntos, alTexto) {
  const key = enviar(S);
  const id = ++siguiente;
  return new Promise((resolve, reject) => {
    pendientes.set(id, { resolve, reject, tarea: { texto: alTexto } });
    worker.postMessage({ tipo: 'regiones', id, key, puntos, mascara: S.mask.slice() });
  });
}
