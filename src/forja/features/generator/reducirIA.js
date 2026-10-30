/* «✨ Reducir a estos colores (IA)»: prueba varias formas de elegir los n colores (engine/retoques.js) y una IA
   (CLIP, la misma del ajuste automático) compara cada resultado con el dibujo original y con el sprite tal como
   está; también cuenta la diferencia de color. Devuelve la paleta ganadora, que el retoque guarda. */
import { rgb2lab } from '../../engine/color.js';
import { paletaReducida, aPaleta } from '../../engine/retoques.js';
import { aCuadro, originalRecortado } from '../../engine/juezSprite.js';
import { huellaVisual, parecido, pararClip, empezarTarea } from '../source/iaClip.js';
import { esCancelacion } from '../source/tareasIA.js';
import { S, bg, showMsg } from './state.js';
import { finalPx } from './output.js';

const FORMAS = [
  {},
  { luz: 1.6 },
  { luz: 0.6 },
  { pesos: 'uniforme' },
  { oscuro: true },
  { representante: 'centro' },
  { luz: 1.6, oscuro: true },
  { pesos: 'uniforme', representante: 'centro' },
];

/* diferencia de color media (ΔE en Lab) entre dos sprites del mismo tamaño, en los píxeles opacos */
function diferencia(a, b) {
  const x = [0, 0, 0], y = [0, 0, 0];
  let s = 0, n = 0;
  for (let o = 0; o < a.length; o += 4) {
    if (!a[o + 3]) continue;
    rgb2lab(a[o], a[o + 1], a[o + 2], x, 0); rgb2lab(b[o], b[o + 1], b[o + 2], y, 0);
    s += Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); n++;
  }
  return n ? s / n : 0;
}

/** La paleta de n colores con la que mejor se ve el sprite, o null si se cancela o no hay sprite. */
export async function paletaConIA(n) {
  if (!S.sprite) return null;
  const { TW, TH } = S.sprite, px = finalPx();
  const paletas = [], vistas = new Set();
  for (const f of FORMAS) {
    const p = paletaReducida(px, n, f), clave = [...p].sort().join(',');
    if (!vistas.has(clave)) { vistas.add(clave); paletas.push(p); }
  }
  if (paletas.length === 1) return paletas[0];
  let cancelada = false;
  const tarea = empezarTarea('La IA está eligiendo los colores…', () => { cancelada = true; pararClip(); });
  try {
    let dibujo = null, sprite = null;
    try {
      dibujo = await huellaVisual(originalRecortado(S, bg.bbox()), tarea);
      sprite = await huellaVisual(aCuadro(px, TW, TH), tarea);
    } catch (e) { if (esCancelacion(e)) return null; }
    let mejor = null;
    for (const [i, p] of paletas.entries()) {
      if (cancelada) return null;
      tarea.texto(`La IA está comparando paletas (${i + 1} de ${paletas.length})…`);
      const r = aPaleta(px, p);
      let vista = 0;
      if (dibujo) {
        try {
          const h = await huellaVisual(aCuadro(r, TW, TH), tarea);
          vista = (parecido(dibujo, h) + parecido(sprite, h)) / 2;
        } catch (e) { if (esCancelacion(e)) return null; }
      }
      // más alto es mejor: que se siga viendo como el dibujo y el sprite, y que los colores cambien poco
      const nota = vista * 10 - diferencia(px, r) / 4;
      if (!mejor || nota > mejor.nota) mejor = { nota, p };
    }
    showMsg(`Paleta reducida a ${mejor.p.length} colores con IA (la mejor de ${paletas.length} formas de elegirlos).`);
    return mejor.p;
  } finally {
    tarea.fin();
  }
}
