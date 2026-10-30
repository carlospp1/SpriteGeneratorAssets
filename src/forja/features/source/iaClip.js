/* CLIP's «visual fingerprint» of a picture (512 numbers): two pictures that look like the same thing have close
   fingerprints, and a picture is close to the prompts that describe it. The automatic adjustment of the sprite uses
   it to tell which try still looks like the drawing and which looks like a real game sprite.
   Runs in a worker (iaClip.worker.js); the model (~90 MB, the same as the front / back one) downloads once. */
import { empezarTarea, cancelado } from './tareasIA.js';

let worker = null, siguiente = 0;
const pendientes = new Map();

function parar() {
  if (worker) { worker.terminate(); worker = null; }
  for (const p of pendientes.values()) p.reject(cancelado());
  pendientes.clear();
}

function preguntar(msg, tarea) {
  const id = ++siguiente;
  return new Promise((resolve, reject) => {
    pendientes.set(id, { resolve, reject, tarea });
    worker.postMessage({ id, ...msg });
  });
}

function arrancar() {
  if (!worker) {
    worker = new Worker(new URL('./iaClip.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: m }) => {
      if (m.tipo === 'progreso') { for (const p of pendientes.values()) p.tarea?.texto(m.texto); return; }
      const p = pendientes.get(m.id); if (!p) return;
      pendientes.delete(m.id);
      if (m.tipo === 'hecho') p.resolve(m.vector ?? m.vectores); else p.reject(new Error(m.mensaje));
    };
    worker.onerror = e => { for (const p of pendientes.values()) p.reject(new Error(e.message || 'la IA no ha podido arrancar')); pendientes.clear(); };
  }
}

/* the picture (ImageData-like, opaque) → its fingerprint, normalised (Float32Array of 512) */
export function huellaVisual(img, tarea) {
  arrancar();
  return preguntar({ data: img.data, width: img.width, height: img.height }, tarea);
}
/* prompts → their fingerprints, in the same space as the pictures' (Float32Array of 512 each) */
export function huellasTexto(textos, tarea) {
  arrancar();
  return preguntar({ textos }, tarea);
}
export const parecido = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export { parar as pararClip, empezarTarea };
