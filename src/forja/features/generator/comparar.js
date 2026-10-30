/* Antes / después de «✨ Ajustar automáticamente»: el sprite y los ajustes de justo antes, para verlo en el panel
   del sprite junto al nuevo y, si gusta más, volver a él. */
import { createValue } from '../../state/signal.js';
import { settings, GEN_IDS, SCHEMA } from '../../state/settings.js';
import { S } from './state.js';
import { spriteCanvas } from './output.js';

const DISEÑO = GEN_IDS.filter(id => !SCHEMA[id].ui);

// nombres de los valores que toca el ajuste automático, tal como salen en los pasos
const NOMBRES = {
  tol: 'Tolerancia del fondo', bgRemove: 'Quitar el fondo', bgIsland: 'Quitar restos sueltos', bgDrift: 'Deriva del degradado',
  bgGlobalTol: 'Alcance del tono global', alphaMin: 'Opacidad mínima', bgFrame: 'Quitar marcos',
  k: 'Materiales', kAuto: 'Detectar materiales con IA', s: 'Tonos por material', mergeDE: 'Fusionar colores parecidos',
  cl: 'Limpieza de ruido', lineKeep: 'Conservar líneas oscuras', colOut: 'Contornos de color'
};
const texto = v => (v === true ? 'sí' : v === false ? 'no' : String(v));

/* { img, antes: canvas, valores, viendo: 'antes' | 'despues' } o null sin comparación */
export const comparacion = createValue(null);

export const comparar = {
  /* justo antes de ajustar: devuelve lo que hay que llamar al terminar (abre la comparación) */
  empezar() {
    if (!S.sprite) return () => {};
    const img = S.img, antes = spriteCanvas(1), valores = settings.pick(DISEÑO);
    return () => { if (S.img === img) comparacion.set({ img, antes, valores, viendo: 'despues' }); };
  },
  ver(viendo) { const c = comparacion.get(); if (c) comparacion.set({ ...c, viendo }); },
  /* «Quedarme con el de antes»: vuelven los ajustes de antes (se deshace con Ctrl+Z como cualquier cambio) */
  volver() { const c = comparacion.get(); if (!c) return; comparacion.set(null); settings.setMany(c.valores, true); },
  cerrar() { comparacion.set(null); },
  /* lo que cambió el ajuste: ['Materiales 6 → 5', …] (los valores sin nombre aquí se cuentan aparte) */
  cambios() {
    const c = comparacion.get(); if (!c) return [];
    const ahora = settings.pick(DISEÑO), lista = [];
    let otros = 0;
    for (const id of DISEÑO) {
      if (String(c.valores[id]) === String(ahora[id])) continue;
      if (NOMBRES[id]) lista.push(`${NOMBRES[id]} ${texto(c.valores[id])} → ${texto(ahora[id])}`);
      else otros++;
    }
    if (otros) lista.push(`${otros} ajuste${otros === 1 ? '' : 's'} más`);
    return lista;
  },
  /* la comparación es de esta imagen: con otra no vale */
  activa: () => { const c = comparacion.get(); return c && c.img === S.img ? c : null; }
};
