/* Pixel editor commands, menu definitions and keyboard shortcuts, laid out like Photoshop.
   Every command has a label, its shortcuts (Photoshop's own; the ones the browser reserves have the
   Photoshop alternative), an action and optionally enabled() / checked(). */
import { E } from '../../engine/editor/E.js';
import { D } from '../../engine/editor/doc.js';
import { O } from '../../engine/editor/ops.js';
import { T } from '../../engine/editor/tools.js';
import { view } from './view.js';
import * as U from './store.js';
import { TOOL, GROUPS } from './tooldefs.js';
import { project } from '../project/project.js';
import { openDesignFile } from '../project/ProjectBar.jsx';
import { accordions } from '../../components/Step.jsx';
import { openWindow } from '../../components/FloatingWindows.jsx';
import { nav } from '../../app/nav.js';

const has = () => D.has(), hasSel = () => D.has() && !!D.sel;

/* ---------- commands ---------- */
const C = {};
const def = (id, label, keys, run, enabled, checked) => { C[id] = { id, label, keys: keys || [], run, enabled, checked }; };
const flip = (k, label) => () => U.act(label, () => O.transform(k), false);
const layer = (label, fn) => () => U.act(label, fn);

// Archivo
def('new', 'Nuevo…', ['Ctrl+Alt+N'], U.openNew);
def('open', 'Abrir imagen como capa…', ['Ctrl+O'], () => U.hooks.pickImage());
def('fromGen', 'Traer sprite del generador', [], () => U.importFromGenerator());
def('save', 'Guardar en el navegador', ['Ctrl+S'], () => project.save(false));
def('saveAs', 'Guardar como nuevo', ['Ctrl+Shift+S'], () => project.save(true));
def('saveFile', 'Guardar en el equipo…', ['Ctrl+Alt+S'], () => project.saveToComputer());
def('openFile', 'Abrir diseño desde el equipo…', ['Ctrl+Alt+O'], () => openDesignFile());
def('export', 'Exportar como PNG…', ['Ctrl+Alt+Shift+S'], () => U.openDialog('dlgExport'), has);
// Edición
def('undo', () => 'Deshacer ' + D.undoLabel().toLowerCase(), ['Ctrl+Z', 'Ctrl+Alt+Z'], () => { if (D.undo()) U.structureChanged(); }, () => D.canUndo());
def('redo', () => 'Rehacer ' + D.redoLabel().toLowerCase(), ['Ctrl+Shift+Z', 'Ctrl+Y'], () => { if (D.redo()) U.structureChanged(); }, () => D.canRedo());
def('cut', 'Cortar', ['Ctrl+X'], () => U.act('Cortar', () => { D.copy(); D.deleteSelection(E.colors.secondary); }, false), hasSel);
def('copy', 'Copiar', ['Ctrl+C'], () => { D.copy(); U.msg('Copiado.'); }, hasSel);
def('copyMerged', 'Copiar combinado', ['Ctrl+Shift+C'], () => { D.copy(true); U.msg('Copiado lo que se ve (todas las capas).'); }, hasSel);
def('paste', 'Pegar', ['Ctrl+V'], () => { const [x, y] = view.viewCenter(); if (U.act('Pegar', () => D.paste(false, x, y))) U.selectTool('move'); }, () => has() && D.hasClip());
def('pasteInPlace', 'Pegar en el sitio', ['Ctrl+Shift+V'], () => { if (U.act('Pegar en el sitio', () => D.paste(true))) U.selectTool('move'); }, () => has() && D.hasClip());
def('clear', 'Borrar', ['Delete', 'Backspace'], () => U.act('Borrar', () => D.deleteSelection(E.colors.secondary), false), hasSel);
def('fill', 'Rellenar…', ['Shift+Backspace'], () => U.openDialog('dlgFill'), has);
def('fillFg', 'Rellenar con color frontal', ['Alt+Backspace', 'Alt+Delete'], () => U.fillWith(E.colors.primary, false, 'Rellenar con color frontal'), has);
def('fillBg', 'Rellenar con color de fondo', ['Ctrl+Backspace', 'Ctrl+Delete'], () => U.fillWith(E.colors.secondary, false, 'Rellenar con color de fondo'), has);
def('stroke', 'Contornear…', [], () => U.openDialog('dlgStroke'), hasSel);
def('transform', 'Transformación libre', ['Ctrl+Alt+T', 'Ctrl+T'], () => T.startTransform(), has);
def('flipH', 'Voltear horizontal', [], flip('flipH', 'Voltear horizontal'), has);
def('flipV', 'Voltear vertical', [], flip('flipV', 'Voltear vertical'), has);
def('rot180', 'Rotar 180°', [], flip('rot180', 'Rotar 180°'), has);
def('rotR', 'Rotar 90° horario', [], flip('rotR', 'Rotar 90° horario'), has);
def('rotL', 'Rotar 90° antihorario', [], flip('rotL', 'Rotar 90° antihorario'), has);
// Imagen
def('hsl', 'Tono/saturación…', ['Ctrl+U'], U.openHSL, has);
def('desat', 'Desaturar', ['Ctrl+Shift+U'], () => U.act('Desaturar', () => { D.commit(); D.cur().px = O.desaturate(D.cur().px); }, false), has);
def('invert', 'Invertir', ['Ctrl+I'], () => U.act('Invertir', () => { D.commit(); D.cur().px = O.invert(D.cur().px); }, false), has);
def('bc', 'Brillo/contraste…', [], U.openBC, has);
def('posterize', 'Posterizar…', [], U.openPosterize, has);
def('imageSize', 'Tamaño de imagen…', ['Ctrl+Alt+I'], U.openImageSize, has);
def('canvasSize', 'Tamaño de lienzo…', ['Ctrl+Alt+C'], U.openCanvasSize, has);
def('canvas180', 'Rotar lienzo 180°', [], () => U.act('Rotar lienzo 180°', () => O.rotateCanvas('180')), has);
def('canvasCW', 'Rotar lienzo 90° horario', [], () => { U.act('Rotar lienzo 90° horario', () => O.rotateCanvas('cw')); view.fit(); }, has);
def('canvasCCW', 'Rotar lienzo 90° antihorario', [], () => { U.act('Rotar lienzo 90° antihorario', () => O.rotateCanvas('ccw')); view.fit(); }, has);
def('canvasFlipH', 'Voltear lienzo horizontal', [], () => U.act('Voltear lienzo horizontal', () => O.flipCanvas(true)), has);
def('canvasFlipV', 'Voltear lienzo vertical', [], () => U.act('Voltear lienzo vertical', () => O.flipCanvas(false)), has);
def('cropSel', 'Recortar', [], () => { const s = D.sel; U.act('Recortar', () => O.cropTo({ x: s.x, y: s.y, w: s.w, h: s.h })); view.fit(); }, hasSel);
def('trim', 'Cortar bordes transparentes', [], () => { if (!U.act('Cortar', () => O.trim())) U.msg('No hay bordes transparentes que quitar.'); else view.fit(); }, has);
// Capa
def('layerNew', 'Nueva capa', ['Ctrl+Alt+Shift+N', 'Ctrl+Shift+N'], layer('Nueva capa', () => D.addLayer()), has);
def('layerDup', 'Duplicar capa', [], layer('Duplicar capa', () => D.duplicateLayer()), has);
def('layerDel', 'Eliminar capa', [], layer('Eliminar capa', () => D.deleteLayer()), () => D.layers.length > 1);
def('layerViaCopy', 'Capa vía copiar', ['Ctrl+J'], layer('Capa vía copiar', () => D.layerVia(false)), has);
def('layerViaCut', 'Capa vía cortar', ['Ctrl+Shift+J'], layer('Capa vía cortar', () => D.layerVia(true)), hasSel);
def('layerFront', 'Traer al frente', ['Ctrl+Shift+]'], layer('Traer al frente', () => D.moveLayerTo(D.layers.length - 1)), () => has() && D.active < D.layers.length - 1);
def('layerForward', 'Hacia delante', ['Ctrl+]'], layer('Hacia delante', () => D.moveLayer(1)), () => has() && D.active < D.layers.length - 1);
def('layerBackward', 'Hacia atrás', ['Ctrl+['], layer('Hacia atrás', () => D.moveLayer(-1)), () => has() && D.active > 0);
def('layerBack', 'Enviar al fondo', ['Ctrl+Shift+['], layer('Enviar al fondo', () => D.moveLayerTo(0)), () => has() && D.active > 0);
def('layerAbove', 'Seleccionar capa superior', ['Alt+]'], () => { D.setActive(D.active + 1); U.structureChanged(); }, () => has() && D.active < D.layers.length - 1);
def('layerBelow', 'Seleccionar capa inferior', ['Alt+['], () => { D.setActive(D.active - 1); U.structureChanged(); }, () => has() && D.active > 0);
def('mergeDown', 'Combinar hacia abajo', ['Ctrl+E'], layer('Combinar hacia abajo', () => D.mergeDown()), () => has() && D.active > 0);
def('mergeVisible', 'Combinar visibles', ['Ctrl+Shift+E'], layer('Combinar visibles', () => D.mergeVisible()), () => has() && D.layers.filter(l => l.visible).length > 1);
def('flatten', 'Acoplar imagen', [], layer('Acoplar imagen', () => D.flatten()), () => has() && D.layers.length > 1);
def('lockAlpha', 'Bloquear píxeles transparentes', ['/', 'Shift+/'], U.toggleLockAlpha, has, () => has() && D.cur().lockAlpha);
def('layerFromGen', 'Actualizar capa «generado»', [], () => U.importFromGenerator(), U.hasGeneratorSprite);
// Selección
def('selAll', 'Todo', ['Ctrl+A'], () => U.act('Seleccionar todo', () => { D.commit(); D.setSel(D.allMask()); }, false), has);
def('deselect', 'Deseleccionar', ['Ctrl+D'], () => U.act('Deseleccionar', () => { D.commit(); D.setSel(new Uint8Array(D.w * D.h)); }, false), hasSel);
def('reselect', 'Volver a seleccionar', ['Ctrl+Shift+D'], () => U.act('Volver a seleccionar', () => { D.setSel(D.lastSel.mask.slice()); }, false), () => has() && !!D.lastSel && !D.sel);
def('invertSel', 'Invertir', ['Ctrl+Shift+I'], () => U.act('Invertir selección', () => { D.commit(); D.invertSel(); }, false), has);
def('selLayer', 'Píxeles de la capa', [], () => U.act('Seleccionar píxeles de la capa', () => D.setSel(D.layerAlphaMask()), false), has);
def('selSimilar', 'Similar (mismo color en todo el dibujo)', [], () => U.act('Similar', () => {
  const px = D.cur().px, cols = new Set(), m = new Uint8Array(D.w * D.h);
  for (let i = 0; i < m.length; i++) if (D.sel.mask[i]) cols.add(((px[i * 4] << 24) | (px[i * 4 + 1] << 16) | (px[i * 4 + 2] << 8) | px[i * 4 + 3]) >>> 0);
  for (let i = 0; i < m.length; i++) if (cols.has(((px[i * 4] << 24) | (px[i * 4 + 1] << 16) | (px[i * 4 + 2] << 8) | px[i * 4 + 3]) >>> 0)) m[i] = 1;
  D.setSel(m);
}, false), hasSel);
def('selGrow', 'Expandir…', [], () => U.askNumber('Expandir selección', 'Expandir (px)', 1, 1, n => U.act('Expandir selección', () => D.modifySel(Math.round(n)), false)), hasSel);
def('selShrink', 'Contraer…', [], () => U.askNumber('Contraer selección', 'Contraer (px)', 1, 1, n => U.act('Contraer selección', () => D.modifySel(-Math.round(n)), false)), hasSel);
// Filtro
def('outline', 'Contorno automático…', [], () => U.openDialog('dlgOutline'), has);
def('despeckle', 'Quitar píxeles sueltos', [], () => { let n = 0; U.act('Quitar píxeles sueltos', () => { D.commit(); const r = O.despeckle(D.cur().px); n = r.n; if (!n) return false; D.cur().px = r.px; }, false); U.msg(n ? `${n} píxeles sueltos quitados.` : 'No hay píxeles sueltos.'); }, has);
def('offset', 'Desplazamiento…', [], () => U.openDialog('dlgOffset'), has);
def('mergeColors', 'Fusionar colores parecidos…', [], () => U.askNumber('Fusionar colores parecidos', 'Diferencia máxima (6 = casi iguales)', 6, 0.5, v => {
  let n = 0; U.act('Fusionar colores parecidos', () => { D.commit(); n = O.mergeSimilar(v); if (!n) return false; }, false);
  U.msg(n ? `${n} ${n === 1 ? 'color fusionado' : 'colores fusionados'} con otros casi iguales.` : 'No hay colores tan parecidos.');
}), has);
// Vista
def('zoomIn', 'Aumentar', ['Ctrl++', 'Ctrl+Shift++'], () => view.zoomStep(1), has);
def('zoomOut', 'Reducir', ['Ctrl+-'], () => view.zoomStep(-1), has);
def('fit', 'Encajar en pantalla', ['Ctrl+0'], () => view.fit(), has);
def('actual', 'Píxeles reales (100%)', ['Ctrl+1'], () => view.setZoom(1), has);
def('extras', 'Extras (borde de la selección)', ['Ctrl+H'], () => U.toggleOpt('extras'), null, () => E.opts.extras);
def('grid', 'Cuadrícula de píxeles', ["Ctrl+'"], () => U.toggleOpt('grid'), null, () => E.opts.grid);
def('mirrorX', 'Simetría horizontal', [], () => U.toggleOpt('mirrorX'), null, () => E.opts.mirrorX);
def('mirrorY', 'Simetría vertical', [], () => U.toggleOpt('mirrorY'), null, () => E.opts.mirrorY);
def('panels', 'Ocultar paneles', ['Tab'], () => togglePanels(), null, () => U.panelsHidden.get());
def('fullscreen', 'Pantalla completa', ['F'], () => toggleFullscreen(), null, () => !!document.fullscreenElement);
// Ventana
def('newView', 'Nueva ventana del dibujo', [], () => openWindow('edview'));
for (const [id, label, acc] of [['winNav', 'Navegador', 'e-nav'], ['winSwatches', 'Muestras', 'e-sw'], ['winLayers', 'Capas', 'e-layers'], ['winHistory', 'Historia', 'e-hist']])
  def(id, label, [], () => {
    const open = !accordions.isOpen(acc); accordions.set(acc, open);
    if (open) requestAnimationFrame(() => { const d = document.querySelector('#page-edit details[data-acc="' + acc + '"]'); if (d) d.scrollIntoView({ block: 'nearest' }); });
  }, null, () => accordions.isOpen(acc));
// Ayuda
def('keys', 'Atajos de teclado', ['Ctrl+Alt+Shift+K', 'F1'], () => U.openDialog('dlgKeys'));

function togglePanels() { U.panelsHidden.set(!U.panelsHidden.get()); requestAnimationFrame(() => view.resize()); }
function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  const el = document.getElementById('page-edit');
  if (el && el.requestFullscreen) el.requestFullscreen().catch(() => U.msg('El navegador no permite la pantalla completa aquí.'));
  else U.msg('El navegador no permite la pantalla completa aquí.');
}

/* ---------- menus ---------- */
export const MENUS = [
  ['Archivo', ['new', 'open', 'openFile', '-', 'fromGen', '-', 'save', 'saveFile', 'saveAs', 'export']],
  ['Edición', ['undo', 'redo', '-', 'cut', 'copy', 'copyMerged', 'paste', 'pasteInPlace', 'clear', '-', 'fill', 'fillFg', 'fillBg', 'stroke', '-', 'transform', '#Transformar', 'flipH', 'flipV', 'rot180', 'rotR', 'rotL']],
  ['Imagen', ['#Ajustes', 'hsl', 'bc', 'posterize', 'desat', 'invert', '-', 'imageSize', 'canvasSize', '#Rotación de imagen', 'canvas180', 'canvasCW', 'canvasCCW', 'canvasFlipH', 'canvasFlipV', '-', 'cropSel', 'trim']],
  ['Capa', ['layerNew', 'layerDup', 'layerDel', '-', 'layerViaCopy', 'layerViaCut', '#Organizar', 'layerFront', 'layerForward', 'layerBackward', 'layerBack', '-', 'layerAbove', 'layerBelow', '-', 'mergeDown', 'mergeVisible', 'flatten', '-', 'lockAlpha', 'layerFromGen']],
  ['Selección', ['selAll', 'deselect', 'reselect', 'invertSel', '-', 'selLayer', 'selSimilar', '#Modificar', 'selGrow', 'selShrink']],
  ['Filtro', ['outline', 'despeckle', 'mergeColors', '#Otro', 'offset']],
  ['Vista', ['zoomIn', 'zoomOut', 'fit', 'actual', '-', 'extras', 'grid', '-', 'mirrorX', 'mirrorY', '-', 'panels', 'fullscreen']],
  ['Ventana', ['newView', '-', 'winNav', 'winSwatches', 'winLayers', 'winHistory']],
  ['Ayuda', ['keys']]
];
const NICE = { Ctrl: 'Ctrl', Shift: 'Mayús', Alt: 'Alt', Delete: 'Supr', Backspace: 'Retroceso', Tab: 'Tab', Enter: 'Intro', Escape: 'Esc' };
/* "Ctrl+Shift+Z" -> "Ctrl+Mayús+Z" ("Ctrl++" keeps its plus key) */
export const nice = k => (k.endsWith('++') ? [...k.slice(0, -2).split('+'), '+'] : k.split('+')).map(p => NICE[p] || p).join('+');
export const labelOf = c => typeof c.label === 'function' ? c.label() : c.label;
export const isEnabled = c => !c.enabled || !!c.enabled();
export { C };

export function run(id) {
  const c = C[id]; if (!c || !isEnabled(c)) return false;
  T.cancel(); c.run(); return true;
}

/* ---------- keyboard ---------- */
/* the combination of a key event as written in the commands: "Ctrl+Alt+Shift+K" */
export function comboOf(e) {
  let k;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) k = e.code.slice(5);
  else if (e.code === 'NumpadAdd') k = '+';
  else if (e.code === 'NumpadSubtract') k = '-';
  else if (/^Numpad\d$/.test(e.code)) k = e.code.slice(6);
  else k = { '{': '[', '}': ']', '=': '+', ' ': 'Space' }[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + k;
}
const byKey = new Map();
for (const c of Object.values(C)) for (const k of c.keys) byKey.set(k.toUpperCase(), c.id);
byKey.delete('CTRL+S');   // Ctrl+S already saves from anywhere in the app (ProjectBar)
const TOOL_LETTERS = new Set(GROUPS.filter(Boolean).map(g => TOOL[g[0]].key));
const typing = t => t.closest && (t.closest('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button]), select, textarea, [contenteditable=true]') || t.isContentEditable);

/* document keydown while the editor page is shown */
export function onKeyDown(e) {
  if (!nav.is('edit') || U.menuOpen.get()) return;
  if (document.querySelector('dialog[open]')) return;
  const t = e.target; if (typing(t)) return;
  const combo = comboOf(e), key = combo.toUpperCase();
  // in-progress operations first: Enter applies, Esc cancels (transform, crop, polygonal lasso)
  if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && T.enter()) { e.preventDefault(); return; }
  if (e.key === 'Escape') { U.closeFlyout(); if (T.escape()) { e.preventDefault(); return; } if (D.floating) { U.act('Soltar', () => D.commit(), false); return; } return; }
  if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.shiftKey && T.backspacePoly()) { e.preventDefault(); return; }
  if (key === 'SPACE') { if (t.tagName !== 'BUTTON' || t.closest('#edStage')) { e.preventDefault(); view.setSpace(true); } return; }
  // Tab hides the panels only when nothing else has the focus (Tab keeps moving the focus on controls)
  if (key === 'TAB' && !(t === document.body || t.id === 'edCanvas')) return;
  if (t.type === 'range' && e.key.startsWith('Arrow')) return;
  if (byKey.has(key)) {
    const id = byKey.get(key);
    // Ctrl+V with nothing copied inside the editor: let the browser paste (an image from the system)
    if (id === 'paste' && !isEnabled(C.paste)) return;
    e.preventDefault(); run(id); return;
  }
  if (!D.has() && !e.ctrlKey) return;
  // arrows: nudge 1 px, Shift: 10 px
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && !e.ctrlKey && !e.altKey) { const s = e.shiftKey ? 10 : 1; if (T.nudge(arrows[e.key][0] * s, arrows[e.key][1] * s)) e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = combo.replace('Shift+', '');
  if (TOOL_LETTERS.has(k)) { e.preventDefault(); U.cycleTool(k, e.shiftKey); return; }
  if (k === 'X') { e.preventDefault(); U.swapColors(); return; }
  if (k === 'D') { e.preventDefault(); U.defaultColors(); return; }
  if (e.key === '[' || e.key === '<') { e.preventDefault(); U.setSize(E.opts.size - 1); return; }
  if (e.key === ']' || e.key === '>') { e.preventDefault(); U.setSize(E.opts.size + 1); return; }
  // number keys with the Move tool: layer opacity 10 % … 100 % (Photoshop)
  if (E.tool === 'move' && /^\d$/.test(k)) { e.preventDefault(); U.setOpacity(k === '0' ? 100 : +k * 10); }
}
export function onKeyUp(e) { if (e.key === ' ') view.setSpace(false); }
export function onBlur() { view.setSpace(false); }

/* ---------- Ayuda > Atajos de teclado: [title, [[keys, what]]] ---------- */
export function keySections() {
  const out = [['Herramientas', GROUPS.filter(Boolean).map(g => [TOOL[g[0]].key + (g.length > 1 ? ' / Mayús+' + TOOL[g[0]].key : ''), g.map(t => TOOL[t].name).join(', ')]).concat([
    ['X', 'Intercambiar color frontal y de fondo'], ['D', 'Colores por defecto (negro y blanco)'], ['[ ]  ó  < >', 'Tamaño del pincel'],
    ['Espacio + arrastrar', 'Mover la vista'], ['Alt + clic', 'Cuentagotas con las herramientas de pintar'], ['Mayús + clic', 'Línea recta desde el último punto'],
    ['Mayús / Alt / Mayús+Alt', 'Al seleccionar: añadir / restar / intersecar'], ['Ctrl + arrastrar', 'Con las herramientas de selección: mover los píxeles'],
    ['Alt + arrastrar', 'Con Mover: duplicar'], ['Flechas (Mayús: ×10)', 'Mover la selección o la capa'], ['1 … 0', 'Con Mover: opacidad de la capa'],
    ['Intro / Esc', 'Aplicar / cancelar (transformar, recortar, lazo poligonal)'], ['Ctrl + clic en miniatura', 'Seleccionar los píxeles de la capa']
  ])]];
  for (const [name, items] of MENUS) {
    const rows = items.filter(id => id[0] !== '#' && id !== '-' && C[id].keys.length).map(id => [C[id].keys.map(nice).join('  ·  '), labelOf(C[id]).trim()]);
    if (rows.length) out.push([name, rows.map(([k, l]) => [k, l.replace(/^Deshacer .*/, 'Deshacer').replace(/^Rehacer .*/, 'Rehacer')])]);
  }
  return out;
}
