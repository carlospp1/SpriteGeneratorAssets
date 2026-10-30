/* What the AI is doing right now, for the full-screen «IA trabajando» window. Every AI job (background removal,
   click-to-select, front / back, line art) starts a task with a text and a way to cancel it; the window shows
   the newest one and its close button cancels them all. */
import { createValue } from '../../state/signal.js';

/* { texto } of the task on screen, or null when the AI is not working */
export const tareaIA = createValue(null);

const activas = new Map();   // id -> { texto, cancelar, nota }
let siguiente = 0;
const mostrar = () => {
  const ultima = [...activas.values()].pop();
  tareaIA.set(ultima ? { texto: ultima.texto, nota: ultima.nota } : null);
};

/**
 * @param {string} texto  what the AI is doing, for the user
 * @param {() => void} cancelar  stops the job (its promise must then reject with an AbortError)
 * @param {string} [nota]  footnote in the window (default: it runs on this computer)
 * @returns {{ texto: (t: string) => void, fin: () => void }}
 */
export function empezarTarea(texto, cancelar, nota) {
  const id = ++siguiente;
  activas.set(id, { texto, cancelar, nota });
  mostrar();
  return {
    texto: t => { const a = activas.get(id); if (a) { a.texto = t; mostrar(); } },
    fin: () => { if (activas.delete(id)) mostrar(); }
  };
}

/* the close button: every AI job stops */
export function cancelarTareas() {
  const todas = [...activas.values()];
  activas.clear(); mostrar();
  for (const t of todas) { try { t.cancelar(); } catch { /* already finished */ } }
}

export const cancelado = () => new DOMException('Cancelado', 'AbortError');
export const esCancelacion = e => e && e.name === 'AbortError';
