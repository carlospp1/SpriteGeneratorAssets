/* The generator's source tools (crop, background, marks) on its state. */
import { settings } from '../../state/settings.js';
import { createSourceTools } from '../source/tools.js';
import { S, view, image, bg, genSignal } from './state.js';
import { pipeline } from './pipeline.js';
import { history } from './history.js';
import { materiales } from './materiales.js';

const base = createSourceTools({
  S, view, image, bg, signal: genSignal,
  pipeline: { mask: () => pipeline.mask(), maskEdited: () => pipeline.maskEdited(), sprite: () => pipeline.sprite() },
  brush: () => settings.num('brush', 14),
  bgGlobal: () => !!settings.get('bgGlobal'),
  // size of a sprite pixel in working px: default size of a mark made with a click
  cellPx: () => { const b = bg.bbox(); return b ? (b.y1 - b.y0) / settings.num('th', 80) : 10; },
  clic: (tool, x, y) => { if (tool !== 'mat') return false; materiales.clicEn(x, y, () => { S.clusters = null; pipeline.sprite(); }); return true; }
});
/* the view (sin fondo / silueta / original) is an undo step too */
export const tools = { ...base, setView: v => { base.setView(v); history.schedule(); } };
