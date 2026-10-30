/* The AI's background mask for a page state S (generator, line art, separar): 1 = drawing, 0 = background, per
   pixel of the working picture, plus a soft edge and the background colour. Each picture / crop / size goes
   through the AI once: the answer is kept in memory and in the browser (cacheIA), so after reloading the page or
   uploading the same picture again it is instant. The AI's answer is then refined with the picture's own colours
   (engine/refinarFondo.js): no halo or remains of a one-colour background around the drawing. While the AI works
   the «IA trabajando» window is shown; closing it cancels the job and the picture keeps its background until it
   is asked again. */
import { empezarTarea, cancelado, esCancelacion } from './tareasIA.js';
import { notificar } from './notificaciones.js';
import { leerIA, guardarIA, huella } from './cacheIA.js';
import { refinarFondo } from '../../engine/refinarFondo.js';

const MODELO = 'isnet-anime';   // the worker's model (public/modelos), part of the key of the answers kept
const URL_MODELO = () => new URL('modelos/fondo-isnet-anime.onnx', document.baseURI).href;
const GUARDADAS = 4;         // results kept in memory (different pictures or crops)
const ESPERA_PREPARAR = 60000;   // ms: preparing the model takes a few seconds; longer means it got stuck
const ESPERA_TOTAL = 5 * 60000;  // ms: a picture takes from 10 s to a minute or two; past this it is an error

let worker = null, siguiente = 0, hilos = 0, vigilante = 0, reloj = 0;   // hilos: 0 = all the cores, 1 = after getting stuck
const pendientes = new Map(), hechas = new Map(), enCurso = new Map(), canceladas = new Set();
const rehacerDe = new WeakMap();   // page state -> its pipeline.mask, to try again after a cancel
const claves = new WeakMap();
let nImg = 0;
export function claveDe(S) {
  if (!claves.has(S.img)) claves.set(S.img, ++nImg);
  const f = S.frame || {};
  return [claves.get(S.img), f.x, f.y, f.w, f.h, S.w, S.h].join('|');
}

function arrancar() {
  if (worker) return;
  worker = new Worker(new URL('./iaFondo.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: m }) => {
    clearTimeout(vigilante);
    if (m.fase === 'preparando' && !hilos) vigilante = setTimeout(atascada, ESPERA_PREPARAR);
    if (m.tipo === 'progreso') { for (const p of pendientes.values()) { p.texto = m.texto; p.fase = m.fase || p.fase; } contar(); return; }
    const p = pendientes.get(m.id); if (!p) return;
    if (m.tipo === 'hecho') acabar(m.id, null, m.alfa);
    else acabar(m.id, new Error(`${m.mensaje} (${p.fase || 'cargando'})`));
  };
  worker.onerror = e => {
    e.preventDefault?.();
    clearTimeout(vigilante);
    for (const id of [...pendientes.keys()]) acabar(id, new Error(e.message || 'la IA no ha podido arrancar'));
  };
  worker.onmessageerror = () => { for (const id of [...pendientes.keys()]) acabar(id, new Error('la respuesta de la IA llegó dañada')); };
}
/* a picture is answered (or failed): its window closes; a failure is also written to the console */
function acabar(id, error, alfa) {
  const p = pendientes.get(id); if (!p) return;
  pendientes.delete(id);
  if (!pendientes.size) { clearInterval(reloj); reloj = 0; }
  if (!error) return p.resolve(alfa);
  if (!esCancelacion(error)) console.error('[IA fondo]', error);
  p.reject(error);
}
/* the seconds each picture has been waiting, in the «IA trabajando» window (slow is not stuck), and the limit */
function contar() {
  const ahora = Date.now();
  for (const [id, p] of pendientes) {
    const s = Math.round((ahora - p.t0) / 1000);
    p.tarea.texto(s >= 3 ? `${p.texto} (${s} s)` : p.texto);
    if (ahora - p.t0 > ESPERA_TOTAL) {
      // a worker that does not answer in this long will not answer: stopped, the next try starts a new one
      clearTimeout(vigilante);
      if (worker) { worker.terminate(); worker = null; }
      for (const id2 of [...pendientes.keys()]) acabar(id2, new Error(`no ha respondido en ${ESPERA_TOTAL / 60000} minutos (${pendientes.get(id2).fase || 'cargando'})`));
      return;
    }
  }
}
/* the model never finished preparing with several threads (onnxruntime hangs if one of its threads fails, e.g.
   short of memory): a new worker with a single thread, slower but sure, and the pending pictures sent again */
function atascada() {
  if (worker) { worker.terminate(); worker = null; }
  hilos = 1;
  arrancar();
  for (const [id, p] of pendientes) {
    p.texto = 'La IA se había quedado atascada: volviendo a empezar con un solo núcleo (más lento)…';
    contar();
    enviar(id, p);
  }
}
function enviar(id, p) {
  const copia = p.data.slice();
  worker.postMessage({ id, modelo: URL_MODELO(), data: copia, width: p.w, height: p.h, hilos }, [copia.buffer]);
}
/* closing the «IA trabajando» window: the worker is stopped (a new one starts next time) */
function parar() {
  clearTimeout(vigilante);
  if (worker) { worker.terminate(); worker = null; }
  for (const id of [...pendientes.keys()]) acabar(id, cancelado());
}
/* the AI's opacity (0-255) per pixel for an opaque picture */
function preguntar(data, w, h, texto) {
  arrancar();
  const id = ++siguiente, tarea = empezarTarea(texto, parar);
  return new Promise((resolve, reject) => {
    const p = { resolve, reject, tarea, data, w, h, texto, fase: '', t0: Date.now() };
    pendientes.set(id, p);
    reloj ||= setInterval(contar, 1000);
    enviar(id, p);
  }).finally(() => tarea.fin());
}

/* the result already worked out for this picture: { mask, alfa, fondo }, or null */
export const fondoGuardado = S => (S.img ? hechas.get(claveDe(S)) || null : null);
export const mascaraGuardada = S => fondoGuardado(S)?.mask || null;
export const fondoCancelado = S => !!S.img && canceladas.has(claveDe(S));

/* the result for S: { mask, alfa, fondo } (the AI is asked once per picture / crop / size, ever).
   comoJuez: asked by «Ajustar automáticamente» to judge its tries, not to remove the background — its own message,
   and cancelling it leaves the page as it is (the adjustment just goes on without the judge) */
export function mascaraIA(S, { comoJuez = false } = {}) {
  const key = claveDe(S);
  if (hechas.has(key)) return Promise.resolve(hechas.get(key));
  if (enCurso.has(key)) return enCurso.get(key);
  const { w, h } = S;
  // opaque picture: transparent pixels over white, so the model only sees what is drawn
  const data = new Uint8ClampedArray(S.rgba);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    if (a < 1) { for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * a + 255 * (1 - a)); data[i * 4 + 3] = 255; }
  }
  const guardada = `fondo|${MODELO}|${huella(data, w, h)}`;
  const promesa = (async () => {
    let alfa = await leerIA(guardada);   // this picture already went through the AI (even before a reload)
    if (!(alfa instanceof Uint8Array) || alfa.length !== w * h) {
      alfa = await preguntar(data, w, h, comoJuez ? 'La IA avanzada está revisando la imagen para elegir el mejor ajuste…' : 'La IA está quitando el fondo…');
      guardarIA(guardada, alfa);
    }
    const r = refinarFondo(data, alfa, w, h);
    hechas.set(key, r);
    if (hechas.size > GUARDADAS) hechas.delete(hechas.keys().next().value);
    return r;
  })().catch(e => {
    if (comoJuez) throw e;   // the adjustment goes on without the judge; the background is not touched
    // cancelled or failed: the picture keeps its background until it is asked again (button in the background step)
    canceladas.add(key);
    if (esCancelacion(e)) notificar('Cancelado: el fondo no se ha quitado. Pulsa «Volver a quitar el fondo con IA» cuando quieras.', 'aviso');
    else notificar('La IA no ha podido quitar el fondo: ' + e.message);
    throw e;
  }).finally(() => enCurso.delete(key));
  enCurso.set(key, promesa);
  return promesa;
}

/**
 * For a page's pipeline.mask(): the AI mask if it is ready (Uint8Array); null while it is being worked out
 * (rehacer() is called when it arrives, if the picture is still the same); false if the user cancelled it.
 */
export function mascaraParaPagina(S, rehacer) {
  rehacerDe.set(S, rehacer);
  const lista = mascaraGuardada(S);
  if (lista) return lista;
  if (fondoCancelado(S)) return false;
  const img = S.img, key = claveDe(S);
  const otraVez = () => { if (S.img === img && claveDe(S) === key) rehacer(); };
  mascaraIA(S).then(otraVez, otraVez);   // also after a cancel: the page then shows the picture with its background
  return null;
}

/* ask the AI again after a cancel (the button of the background step) */
export function reintentarFondo(S) {
  if (!S.img) return;
  canceladas.delete(claveDe(S));
  rehacerDe.get(S)?.();
}
