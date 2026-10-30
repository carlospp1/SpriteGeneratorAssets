/* Materiales elegidos a mano. Con la herramienta «Seleccionar material» se hace clic en cada parte del dibujo
   (pelo, piel, ropa…): cada clic en un color nuevo añade un material con ese color, y al sprite solo van los
   materiales de la lista; cada píxel del personaje va al material de color más parecido. De cada uno se elige
   cuántos tonos (variedades de su color) tiene. Sin lista, los materiales son automáticos.
   S.matsMano = [{ centro: [L, a, b], tonos }] (parte del diseño: se guarda y se deshace con Ctrl+Z). */
import { createValue } from '../../state/signal.js';
import { deltaE2000 } from '../../engine/color.js';
import { settings } from '../../state/settings.js';
import { S, genSignal, showMsg } from './state.js';

const MISMO = 12;   // ΔE: un clic en un color así de parecido a su material lo selecciona en vez de añadir otro

/* el material seleccionado: su índice en S.matsMano, o null */
export const materialSel = createValue(null);

const general = () => Math.max(1, Math.round(settings.num('s', 3)));

/* el color de la zona del clic: la media de los píxeles de material (no línea ni fondo) de alrededor */
function colorEn(p) {
  const x0 = p % S.w, y0 = (p / S.w) | 0, c = [0, 0, 0]; let n = 0;
  for (let y = Math.max(0, y0 - 2); y <= Math.min(S.h - 1, y0 + 2); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(S.w - 1, x0 + 2); x++) {
    const i = y * S.w + x; if (S.matIdx[i] < 0) continue;
    for (let d = 0; d < 3; d++) c[d] += S.lab[i * 3 + d]; n++;
  }
  return n ? c.map(v => v / n) : [...S.lab.slice(p * 3, p * 3 + 3)];
}

export const materiales = {
  /* clic en la imagen con «Seleccionar material» (x, y en píxeles de trabajo): si es el color de un material de la
     lista, lo selecciona; si no, añade uno nuevo con ese color. cambio() rehace el sprite y guarda el paso */
  clicEn(x, y, cambio) {
    const p = Math.floor(y) * S.w + Math.floor(x), m = S.matIdx ? S.matIdx[p] : -1;
    if (m === -2) { showMsg('Eso es una línea del dibujo, no un material.'); return; }
    if (m == null || m < 0) { showMsg('Ahí no hay ningún material (es fondo).'); return; }
    const centro = colorEn(p), lista = S.matsMano || [];
    if (S.clusters?.mano && lista[m] && deltaE2000(lista[m].centro, centro) < MISMO) { materialSel.set(m); genSignal.bump(); return; }
    S.matsMano = [...lista, { centro, tonos: general() }];
    materialSel.set(S.matsMano.length - 1);
    cambio();
  },
  /* clic en un material de la lista; si aún son automáticos, pasan todos a la lista (con sus tonos) para editarlos */
  seleccionar(m, cambio) {
    if (m == null) { materialSel.set(null); genSignal.bump(); return; }
    if (!S.clusters?.mano) {
      const mats = S.clusters?.mats || [], vivos = mats.filter(Boolean);
      if (!mats[m]) return;
      S.matsMano = vivos.map(x => ({ centro: [...x.centro], tonos: x.tonos }));
      materialSel.set(vivos.indexOf(mats[m]));
      cambio(); return;
    }
    materialSel.set(m); genSignal.bump();
  },
  /* tonos (variedades de su color) del seleccionado; solo cambia ese material */
  ponerTonos(tonos, cambio) {
    const m = materialSel.get(), lista = S.matsMano || []; if (m == null || !lista[m]) return;
    S.matsMano = lista.map((x, i) => i === m ? { ...x, tonos } : x);
    cambio();
  },
  quitar(cambio) {
    const m = materialSel.get(), lista = S.matsMano || []; if (m == null || !lista[m]) return;
    S.matsMano = lista.filter((_, i) => i !== m);
    materialSel.set(null);
    cambio();
  },
  /* volver a los materiales automáticos («Materiales» / «Detectar materiales con IA») */
  automaticos(cambio) { S.matsMano = []; materialSel.set(null); cambio(); },
};
