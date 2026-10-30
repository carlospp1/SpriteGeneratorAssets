import { FUENTES } from '../data/campos';

export const INTERLINEADO = 1.15;
// Se mide a 10x para no perder precisión con tamaños de fuente diminutos.
const PRECISION = 10;
const PASO = 0.5;

const ctx = document.createElement('canvas').getContext('2d');

export function fuenteCSS(font, size) {
  const { family, weight } = FUENTES[font];
  return `${weight} ${size}px ${family}`;
}

/** Parte el texto en líneas que no superen anchoMax (respeta los saltos de línea). */
export function partirLineas(texto, anchoMax, fuente) {
  ctx.font = fuente;
  const lineas = [];
  for (const parrafo of texto.split('\n')) {
    let linea = '';
    for (const palabra of parrafo.split(' ')) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (linea && ctx.measureText(prueba).width > anchoMax) {
        lineas.push(linea);
        linea = palabra;
      } else {
        linea = prueba;
      }
    }
    lineas.push(linea);
  }
  return lineas;
}

/** Mayor tamaño de fuente (entre campo.min y campo.size) con el que el texto cabe en su caja. */
export function tamanoAjustado(campo, texto) {
  const { w, h } = campo.caja;
  const cabe = (s) => {
    const fuente = fuenteCSS(campo.font, s * PRECISION);
    if (campo.multilinea) {
      return partirLineas(texto, (w - 4) * PRECISION, fuente).length * s * INTERLINEADO <= h - 1;
    }
    ctx.font = fuente;
    return ctx.measureText(texto).width <= (w - 1) * PRECISION;
  };
  let s = campo.size;
  while (s > campo.min && !cabe(s)) s -= PASO;
  return s;
}
