/* Front and back, found by a small AI that runs in the browser (CLIP, in a worker so the page does not freeze):
   it looks at everything on the sheet (each creature, but also texts, icons, swatches) and scores how much each
   one looks like a creature seen from the front, from behind, or not a creature at all. While it works the
   «IA trabajando» window is shown; closing it cancels the choice. */
import { empezarTarea, cancelado } from '../source/tareasIA.js';
import { leerIA, guardarIA, huella } from '../source/cacheIA.js';
import { elegirPar } from './vistas.js';

const LADO = 384;          // CLIP looks at 224 px: bigger figures only slow it down

let worker = null, siguiente = 0, pendiente = null;

/* the figure small and over white (CLIP knows nothing of transparency) */
function preparar(figura) {
  const src = document.createElement('canvas');
  src.width = figura.width; src.height = figura.height;
  src.getContext('2d').putImageData(figura, 0, 0);
  const k = Math.min(1, LADO / Math.max(figura.width, figura.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(figura.width * k)); c.height = Math.max(1, Math.round(figura.height * k));
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
  return x.getImageData(0, 0, c.width, c.height);
}

function parar() {
  if (worker) { worker.terminate(); worker = null; }
  if (pendiente) { pendiente.reject(cancelado()); pendiente = null; }
}

/**
 * Looks at everything found on the sheet and says which one is the front and which one the back.
 * @param {{ recorte: ImageData, area: number }[]} candidatas  everything that could be a view (creatures, texts…)
 * @returns {Promise<{ frente: number, espalda: number } | null>}  indices into candidatas; null if there are not two
 *   creatures. Rejects with an AbortError when cancelled. The answer is remembered in the browser.
 */
export async function elegirVistas(candidatas) {
  const datos = candidatas.map(c => preparar(c.recorte));
  const guardada = 'vistas2|clip-vit-base-patch32|' + datos.map(d => huella(d.data, d.width, d.height)).join('|');
  let puntos = await leerIA(guardada);
  if (!Array.isArray(puntos) || puntos.length !== datos.length || !Array.isArray(puntos[0])) {
    worker ??= new Worker(new URL('./ia.worker.js', import.meta.url), { type: 'module' });
    const id = ++siguiente;
    const MB = b => (b / 1e6).toFixed(0);
    const tarea = empezarTarea('La IA está buscando en la imagen cuál es el front y cuál el back…', parar);
    puntos = await new Promise((resolve, reject) => {
      pendiente = { reject };
      worker.onmessage = ({ data: m }) => {
        if (m.tipo === 'progreso') tarea.texto(`Descargando la IA que reconoce el front (solo la primera vez): ${MB(m.hecho)} / ${MB(m.total)} MB`);
        else if (m.id !== id) return;
        else if (m.tipo === 'error') reject(new Error(m.mensaje));
        else resolve(m.puntos);
      };
      worker.onerror = e => reject(new Error(e.message || 'la IA no ha podido arrancar'));
      worker.postMessage({ id, figuras: datos.map(d => ({ data: d.data, width: d.width, height: d.height })) });
    }).finally(() => { pendiente = null; tarea.fin(); });
    guardarIA(guardada, puntos);
  }
  return elegirPar(candidatas, puntos);
}
