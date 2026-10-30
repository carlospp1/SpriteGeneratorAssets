/* «Ajustar automáticamente», sprite part: after the background, the sprite's own values (materials, shades,
   merge similar colours, noise cleaning, dark lines, colour outlines) are
   tried in four combinations around the current ones and the best sprite wins. Every click of the button tries
   four other combinations (another version, or the same one if it is still the best).
   A good sprite is not the drawing's colours shrunk: it has to read like a real game sprite, with lines that
   clearly show. So the judge looks at the original and at each try:
   - the lines: where the original has lines (its dark strokes, and the silhouette), the sprite must draw them as
     darker pixels: an outline all around the character and the inner lines of the drawing;
   - the fill colours: away from the lines, how close the sprite is to the drawing's colours (Lab difference);
   - the advanced AI (CLIP), with prompts: how much the sprite looks like a real game sprite (crisp outline,
     separate flat colour areas) and not like a blurry thumbnail of colours with no lines; and how much it still
     looks like the drawing. The same prompts on the original say how much line art the drawing has, so the inner
     lines weigh more on a drawing full of lines;
   with a penalty for loose pixels (noise) and for a sprite swallowed by dark pixels. */
import { settings } from '../../state/settings.js';
import { S, bg, clusters, sprite } from './state.js';
import { readSettings } from './settings.js';
import { huellaVisual, huellasTexto, pararClip, empezarTarea } from '../source/iaClip.js';
import { VALORES, vectoresPrompts, siFrenteANo, parecido, combinaciones, referencia, medir, aCuadro, originalRecortado, nota } from '../../engine/juezSprite.js';
import { esCancelacion } from '../source/tareasIA.js';
import { materialesIA } from './materialesIA.js';
import { hayContorno } from './retoques.js';

/**
 * Tries four combinations of the sprite's values and leaves the best one set (the page then regenerates it).
 * @returns {Promise<{ gana: object } | null>}
 */
export async function ajustarSprite(ronda) {
  if (!S.mask || !bg.bbox()) return null;
  const antes = settings.pick(VALORES);
  let cancelada = false;
  const tarea = empezarTarea('Analizando el dibujo original…', () => { cancelada = true; pararClip(); });
  const espera = () => new Promise(r => setTimeout(r, 0));   // lets the «IA trabajando» window paint
  try {
    // the original, once: its fingerprint and how much line art it has (without the AI: no prompts, no likeness)
    let huellaOriginal = null, P = null, lineasIA = 0.5;
    try {
      P = await vectoresPrompts(t => huellasTexto(t, tarea));
      huellaOriginal = await huellaVisual(originalRecortado(S, bg.bbox()), tarea);
      lineasIA = siFrenteANo(huellaOriginal, P[2], P[3]);
    } catch (e) { if (esCancelacion(e)) return null; P = null; huellaOriginal = null; }
    let mejor = null;
    // con un retoque de contorno, «Contornos de color» se queda apagado en todas las pruebas (se pisan)
    const pruebas = combinaciones(settings.pick(VALORES), ronda).map(c => (hayContorno() ? { ...c, colOut: false } : c));
    for (const [i, c] of pruebas.entries()) {
      if (cancelada) return null;
      tarea.texto(`Probando ajustes del sprite y evaluando sus líneas (${i + 1} de 4)…`);
      await espera();
      settings.setMany(c, false);
      S.clusters = null;
      const o = readSettings();
      if (o.kAuto && !S.matsMano.length) o.kIA = materialesIA(S, o.kSens);   // the AI's colours when it already has them
      clusters.build(o);
      const sp = sprite.generate(o); if (!sp) continue;
      const ref = referencia(S, bg.bbox(), sp.TW, sp.TH); if (!ref) continue;
      const m = medir(sp, ref);
      let ia = 0, esSprite = 0.5;
      if (huellaOriginal) {
        try {
          const h = await huellaVisual(aCuadro(sp.px, sp.TW, sp.TH), tarea);
          ia = parecido(huellaOriginal, h);
          esSprite = siFrenteANo(h, P[0], P[1]);
        } catch (e) { if (esCancelacion(e)) return null; }
      }
      const n = nota(m, ref, ia, esSprite, lineasIA);
      if (!mejor || n < mejor.nota) mejor = { nota: n, valores: c };
    }
    if (cancelada || !mejor) return null;
    settings.setMany(antes, false);   // back to the values before, so the change is one undo step
    settings.setMany(mejor.valores, true);
    return { gana: mejor.valores };
  } finally {
    if (cancelada) settings.setMany(antes, true);
    S.clusters = null;
    tarea.fin();
  }
}
