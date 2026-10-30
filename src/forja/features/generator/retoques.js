/* The sprite's touch-ups (engine/retoques.js) as the generator uses them: a list the user builds with buttons,
   applied in order on top of the sprite (after the palette changes and the line art's lines), so they survive
   the sprite being generated again. Nothing is applied by itself. The list is part of the design (saved, undo). */
import { S } from './state.js';
import { RETOQUES } from '../../engine/retoques.js';
import { settings } from '../../state/settings.js';

/* el sprite lleva un retoque de contorno (de 1 color o del color de cada zona) */
export const hayContorno = () => (S.retoques || []).some(r => r.tipo === 'contorno');

/* the name shown in the list for each touch-up */
export const NOMBRES_RETOQUE = {
  unificar: r => `Unificar colores parecidos (${r.umbral})`,
  reducir: r => `Reducir a ${r.n} colores${r.paleta ? ' (IA)' : ''}`,
  contorno: r => ({ uno: 'Contorno de 1 color', dos: 'Contorno de 2 tonos', zona: 'Contorno del color de cada zona' })[r.modo],
  limpiar: () => 'Limpiar píxeles sueltos'
};

/* the sprite's pixels with every touch-up of the list applied, in order */
export function aplicarRetoques(px, w, h) {
  let out = px;
  for (const r of S.retoques || []) {
    const f = RETOQUES[r.tipo];
    if (f) out = f(out, w, h, r);
  }
  return out;
}

let id = 0;
/* actions for the buttons; cambio() redraws the sprite and records the step (undo, design) */
export function crearAccionesRetoque(cambio) {
  return {
    añadir(tipo, opciones = {}) {
      // un contorno sustituye al que hubiera y apaga «Contornos de color»: el borde lo pinta uno solo
      const antes = tipo === 'contorno' ? (S.retoques || []).filter(r => r.tipo !== 'contorno') : (S.retoques || []);
      S.retoques = [...antes, { id: `${Date.now().toString(36)}-${++id}`, tipo, ...opciones }];
      if (tipo === 'contorno' && settings.get('colOut')) settings.set('colOut', false);
      cambio();
    },
    quitar(rid) { S.retoques = (S.retoques || []).filter(r => r.id !== rid); cambio(); },
    quitarTodos() { if (!S.retoques?.length) return; S.retoques = []; cambio(); }
  };
}
