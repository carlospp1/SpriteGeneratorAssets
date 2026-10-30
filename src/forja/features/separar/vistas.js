/* What the AI (CLIP) is asked about each thing found on a design sheet, and how the front and the back are chosen
   from its answers. Shared by the worker and the page (no browser pieces here). */

export const ETIQUETAS = [
  'the front view of a full-body cartoon creature facing the viewer, its face and eyes are visible',
  'the back view of a full-body cartoon creature seen from behind, its face is not visible',
  'the side view of a cartoon creature in profile',
  'a close-up of a head, a detail, text, letters, colour swatches or an icon'
];
export const FRENTE = 0, ESPALDA = 1;

// Only things at least this fraction of the biggest creature found are taken as a view (not a small icon), and
// the bigger ones are preferred: the main views of a sheet are its biggest drawings.
const VISTA_MIN = 0.15;
const PESO_TAMAÑO = 0.5;
const NO_CRIATURA = 0.5;

/**
 * The front and the back among the things found on the sheet.
 * @param {{ area: number }[]} candidatas
 * @param {number[][]} puntos  per candidate, CLIP's probability of each label (same order as ETIQUETAS)
 * @returns {{ frente: number, espalda: number } | null}  indices into candidatas, or null if there are not two creatures
 */
export function elegirPar(candidatas, puntos) {
  const otro = ETIQUETAS.length - 1;
  const criatura = i => puntos[i][otro] < NO_CRIATURA;
  const mayor = Math.max(0, ...candidatas.map((c, i) => (criatura(i) ? c.area : 0)));
  const vale = i => criatura(i) && candidatas[i].area >= mayor * VISTA_MIN;
  let mejor = null, max = -Infinity;
  for (let i = 0; i < candidatas.length; i++) for (let j = 0; j < candidatas.length; j++) {
    if (i === j || !vale(i) || !vale(j)) continue;
    const v = puntos[i][FRENTE] + puntos[j][ESPALDA] + PESO_TAMAÑO * (candidatas[i].area + candidatas[j].area) / (2 * mayor);
    if (v > max) { max = v; mejor = { frente: i, espalda: j }; }
  }
  return mejor;
}
