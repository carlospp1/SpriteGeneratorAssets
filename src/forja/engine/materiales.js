/* «Detectar materiales» con IA, sin estado de página (lo usan el worker de SAM, el generador y el script en lote):
   los puntos que se le dan a SAM, las regiones que devuelve y el recuento de materiales a partir de ellas. */
import { toLab, deltaE2000 } from './color.js';

/* hasta 64 puntos en rejilla sobre el personaje, evitando los píxeles muy oscuros (las líneas del dibujo) */
export function puntosMateriales(S) {
  const { w, h, mask, rgba } = S;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return [];
  const paso = Math.max(2, Math.sqrt(((x1 - x0 + 1) * (y1 - y0 + 1)) / 90));
  const puntos = [];
  for (let y = y0 + paso / 2; y <= y1; y += paso) for (let x = x0 + paso / 2; x <= x1; x += paso) {
    const i = Math.round(y) * w + Math.round(x);
    if (!mask[i]) continue;
    if (rgba[i * 4] * 0.3 + rgba[i * 4 + 1] * 0.59 + rgba[i * 4 + 2] * 0.11 < 45) continue;
    puntos.push([Math.round(x), Math.round(y)]);
  }
  // demasiados: uno de cada tantos
  const salto = Math.ceil(puntos.length / 64);
  return puntos.filter((_, i) => i % salto === 0);
}

/* las regiones de colores parecidos cuentan como un solo material: un material por cada color. Devuelve el color
   medio (Lab) de cada uno, de mayor a menor (como mucho 16). kSens: «Tolerancia de la detección» (cuanto más
   alta, más diferentes deben ser dos colores para separarse) */
export function contarMateriales(regiones, kSens) {
  const umbral = kSens * 2.4;
  const grupos = [];   // [{ lab, suma, n }]
  for (const r of [...regiones].sort((a, b) => b.n - a.n)) {
    const lab = toLab(r.rgb.map(Math.round));
    const g = grupos.find(x => deltaE2000(x.lab, lab) < umbral);
    if (g) { g.n += r.n; for (let d = 0; d < 3; d++) g.suma[d] += lab[d] * r.n; }
    else grupos.push({ lab, suma: [...lab].map(v => v * r.n), n: r.n });
  }
  return grupos.sort((a, b) => b.n - a.n).slice(0, 16).map(g => g.suma.map(v => v / g.n));
}


/* «Detectar materiales»: the character split into its regions (hair, skin, clothes…). Each point asks the AI for
   the thing under it; of its three proposals, the one it trusts most that is a part and not the whole character.
   Repeated regions are skipped and every pixel goes to the smallest region holding it, so the regions don't
   overlap. Returns, per region big enough, its average colour (leaving out the dark line pixels) and its size. */
const LOTE = 8;   // points per pass of the AI (more at once needs much more memory)
export async function regionesSam({ modelo, procesador, raw, emb, puntos, mascara, progreso = () => {} }) {
  const { width: W, height: H } = raw, n = W * H, pj = mascara;
  let area = 0; for (let p = 0; p < n; p++) if (pj[p]) area++;
  if (!area) return [];
  const lista = [];   // { px: Uint32Array of pixel indices, set: Uint8Array }
  for (let i = 0; i < puntos.length; i += LOTE) {
    const lote = puntos.slice(i, i + LOTE);
    progreso(`La IA está buscando los materiales… ${Math.min(100, Math.round((i / puntos.length) * 100))} %`);
    const entrada = await procesador(raw, { input_points: [lote.map(p => [p])], input_labels: [lote.map(() => [1])] });
    const salida = await modelo({ ...emb, input_points: entrada.input_points, input_labels: entrada.input_labels });
    const [mascaras] = await procesador.post_process_masks(salida.pred_masks, entrada.original_sizes, entrada.reshaped_input_sizes);
    const md = mascaras.data, notas = salida.iou_scores.data, k = mascaras.dims[1];
    for (let j = 0; j < lote.length; j++) {
      let mejor = null;
      for (let q = 0; q < k; q++) {
        const base = (j * k + q) * n;
        let a = 0; for (let p = 0; p < n; p++) if (md[base + p] && pj[p]) a++;
        if (a < area * 0.003 || a > area * 0.5) continue;   // a crumb, or (almost) the whole character
        if (!mejor || notas[j * k + q] > mejor.nota) mejor = { base, a, nota: notas[j * k + q] };
      }
      if (!mejor) continue;
      const set = new Uint8Array(n), px = new Uint32Array(mejor.a);
      let c = 0; for (let p = 0; p < n; p++) if (md[mejor.base + p] && pj[p]) { set[p] = 1; px[c++] = p; }
      // the same region found from another point: keep the first one
      const repetida = lista.some(r => {
        let comun = 0; for (const p of px) if (r.set[p]) comun++;
        return comun / (r.px.length + px.length - comun) > 0.75;
      });
      if (!repetida) lista.push({ px, set });
    }
  }
  // every pixel of the character to the smallest region that holds it
  lista.sort((a, b) => a.px.length - b.px.length);
  const d = raw.data, suma = lista.map(() => [0, 0, 0, 0]), dueño = new Int16Array(n).fill(-1);
  lista.forEach((r, i) => { for (const p of r.px) if (dueño[p] < 0) dueño[p] = i; });
  for (let p = 0; p < n; p++) {
    const i = dueño[p]; if (i < 0) continue;
    const r = d[p * 3], g = d[p * 3 + 1], b = d[p * 3 + 2];
    if (r * 0.3 + g * 0.59 + b * 0.11 < 45) continue;   // line art: not the colour of the material
    const s = suma[i]; s[0] += r; s[1] += g; s[2] += b; s[3]++;
  }
  return suma.filter(s => s[3] >= area * 0.003).map(s => ({ rgb: [s[0] / s[3], s[1] / s[3], s[2] / s[3]], n: s[3] }));
}
