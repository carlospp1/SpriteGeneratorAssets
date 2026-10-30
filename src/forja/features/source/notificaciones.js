/* Notifications in the top-right corner: errors and notices for the user, instead of messages in the console.
   Any part of the app calls notificar(); the list is shown by the <Notificaciones /> component of the app. */
import { createValue } from '../../state/signal.js';

export const notificaciones = createValue([]);   // [{ id, texto, tipo: 'error' | 'aviso' | 'ok' }]
let siguiente = 0;
const DURACION = { error: 9000, aviso: 6000, ok: 4000 };

export function notificar(texto, tipo = 'error') {
  if (!texto) return;
  const id = ++siguiente;
  // the same message twice in a row is shown once
  const lista = notificaciones.get().filter(n => n.texto !== texto);
  notificaciones.set([...lista, { id, texto, tipo }].slice(-4));
  setTimeout(() => cerrarNotificacion(id), DURACION[tipo] || 6000);
}
export function cerrarNotificacion(id) {
  notificaciones.set(notificaciones.get().filter(n => n.id !== id));
}

/* errors nobody caught: a notification instead of the console */
let instalado = false;
export function capturarErroresGlobales() {
  if (instalado) return;
  instalado = true;
  addEventListener('unhandledrejection', e => {
    if (e.reason && e.reason.name === 'AbortError') { e.preventDefault(); return; }   // a cancelled AI job
    e.preventDefault();
    notificar('Algo ha fallado: ' + (e.reason?.message || e.reason || 'error desconocido'));
  });
  addEventListener('error', e => {
    if (!e.error) return;   // resources that failed to load are reported where they are used
    e.preventDefault();
    notificar('Algo ha fallado: ' + (e.error.message || e.message));
  });
}
