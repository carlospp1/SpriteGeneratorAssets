/* «Detectar materiales» con IA: SlimSAM (la misma IA de «Selección con IA») separa al personaje en sus regiones
   (pelo, piel, ropa…) a partir de puntos repartidos por él; las regiones de colores parecidos son un mismo
   material, así que los materiales son los grupos de color que quedan. La IA mira cada imagen y máscara una vez
   (lo que ya «entendió» de una imagen se recuerda); mientras trabaja, el generador usa el recuento por colores. */
import { createValue } from '../../state/signal.js';
import { puntosMateriales, contarMateriales } from '../../engine/materiales.js';
import { regionesSam } from '../source/iaSam.js';

/* lo que está haciendo la IA, para mostrarlo junto a «Materiales» ('' = nada) */
export const estadoMateriales = createValue('');

const imagenes = new WeakMap();
let nImg = 0;
/* misma imagen, mismo recorte y misma máscara: misma clave */
function claveDe(S) {
  if (!imagenes.has(S.img)) imagenes.set(S.img, ++nImg);
  let h = 2166136261;
  const m = S.mask;
  for (let i = 0; i < m.length; i++) if (m[i]) h = Math.imul(h ^ i, 16777619);
  const f = S.frame || {};
  return [imagenes.get(S.img), f.x, f.y, f.w, f.h, S.w, S.h, h >>> 0].join('|');
}

let hecho = null;     // { clave, regiones } lo último que devolvió la IA (regiones: null si falló)
let enCurso = null;   // clave que la IA está mirando ahora
let espera = 0;
let avisar = null;    // a quién avisar cuando termine (el generador, para rehacer el sprite)

/**
 * Los materiales según la IA, uno por color (su color medio en Lab), o null mientras trabaja (o si no ha podido):
 * entonces se cuentan por colores.
 * Al terminar llama a rehacer() para volver a generar el sprite con su número (sin rehacer, solo pregunta:
 * se avisa al último que lo pasó).
 * kSens: «Tolerancia de la detección»; cuanto más alta, más diferentes deben ser dos colores para separarse.
 */
export function materialesIA(S, kSens, rehacer) {
  const clave = claveDe(S);
  if (hecho && hecho.clave === clave) return hecho.regiones ? contarMateriales(hecho.regiones, kSens) : null;
  if (rehacer) avisar = rehacer;
  if (enCurso === clave) return null;
  enCurso = clave;
  clearTimeout(espera);
  // espera un poco: mientras se mueve un deslizador del fondo la máscara cambia muchas veces seguidas
  espera = setTimeout(async () => {
    if (enCurso !== clave) return;
    estadoMateriales.set('la IA está mirando los materiales…');
    let regiones = null;
    try {
      regiones = await regionesSam(S, puntosMateriales(S), t => enCurso === clave && estadoMateriales.set(t));
    } catch {
      // sin IA (no carga, o se canceló): se queda el recuento por colores
    }
    if (enCurso !== clave) return;   // mientras tanto cambió la imagen o la máscara: esa respuesta ya no vale
    enCurso = null;
    hecho = { clave, regiones };
    estadoMateriales.set(regiones ? '' : 'la IA no ha podido: se cuentan por colores');
    avisar?.();
  }, 400);
  return null;
}
