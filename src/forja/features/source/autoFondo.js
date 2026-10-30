/* «Ajustar automáticamente»: the background settings of a page (generator '', line art 'la-', separar 'sep-')
   worked out from its picture (engine/autoajuste.js).
   - autoFondo: the simple AI only (instant).
   - autoFondoExperto: the same four tries. Used by the button, which never starts the background AI:
     only when its mask of this picture is already there does it judge the tries (the one that agrees most with
     what it sees as the drawing wins). */
import { ajustarFondo } from '../../engine/autoajuste.js';
import { settings } from '../../state/settings.js';
import { mascaraGuardada } from './iaFondo.js';

const aplicar = (r, prefix, fire, extra = {}) => settings.setMany({ [prefix + 'bgRemove']: r.quitarFondo, [prefix + 'tol']: r.tol, ...extra }, fire);

/* fire = true: the page recomputes its background now; false: the caller is about to do it anyway */
export function autoFondo(S, prefix, fire = true) {
  if (!S.img) return null;
  const r = ajustarFondo(S.img, S.frame);
  aplicar(r, prefix, fire);
  return r;
}

/* clicks of the button per picture: each one tries four other tolerances (another version, or the same one if it
   is still the best) */
const rondas = new WeakMap();

/* with the advanced AI's mask as judge when it is already worked out for this picture, else the simple adjustment.
   The background is left on the tolerance: «Quitar el fondo con IA» stays on only if its mask is already there,
   so the button never sets the background AI to work */
export async function autoFondoExperto(S, prefix) {
  if (!S.img) return null;
  const ronda = rondas.get(S.img) ?? 0;
  rondas.set(S.img, ronda + 1);
  const ia = mascaraGuardada(S);
  const r = ajustarFondo(S.img, S.frame, ia ? { mask: ia, w: S.w, h: S.h } : null, ronda);
  aplicar(r, prefix, true, ia ? {} : { [prefix + 'bgAI']: false });
  return { ...r, ronda };
}

