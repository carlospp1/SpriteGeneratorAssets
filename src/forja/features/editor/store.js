/* Pixel editor UI state and actions, without React (the old ui.js minus its DOM): the change hub, signals
   the components listen to, tools and options, colours, layers, history, dialogs, export, images as layers,
   status bar and loading. It works with or without the page mounted (session restore, thumbnails). */
import { createSignal, createValue } from '../../state/signal.js';
import { hex, hex2rgb } from '../../engine/color.js';
import { loadImage } from '../../engine/image.js';
import { E } from '../../engine/editor/E.js';
import { D } from '../../engine/editor/doc.js';
import { O } from '../../engine/editor/ops.js';
import { T } from '../../engine/editor/tools.js';
import { view } from './view.js';
import { TOOL, GROUPS, groupOf } from './tooldefs.js';
import { project } from '../project/project.js';
import { refreshWindows } from '../../components/FloatingWindows.jsx';
import { download, fileName } from '../../app/files.js';
import { S } from '../generator/state.js';
import { spriteCanvas } from '../generator/output.js';
import { readSettings } from '../generator/settings.js';

/* ---------- what the components listen to ---------- */
export const sig = {
  struct: createSignal(),   // layers, active layer, document size (old renderLayers)
  thumbs: createSignal(),   // content settled: layer thumbnails and swatches (200 ms after a change)
  hist: createSignal(),     // History panel
  colors: createSignal(),   // foreground / background colours
  opts: createSignal()      // tool options (size, mirrors, grid...)
};
export const toolVal = createValue(E.tool);
export const transformInfo = createValue(null);   // text of the free transform's size, or null
export const zoomVal = createValue(view.state.zoom);
export const statusVal = createValue(null);       // [position, colour] under the pointer
export const msgVal = createValue('');
export const dialogVal = createValue(null);       // { id, ...params } of the open dialog
export const flyoutVal = createValue(null);       // { group, anchor } of the open tool fly-out
export const panelsHidden = createValue(false);
export const menuOpen = createValue(false);
/* set by the page: the hidden «open image» file picker */
export const hooks = { pickImage: () => {} };

let quiet = 0, needFit = true, slowTimer = 0, histTimer = 0;

/* ---------- change hub ---------- */
E.onChange = () => {
  view.invalidate();
  refreshOptions();
  clearTimeout(histTimer); histTimer = setTimeout(() => sig.hist.bump(), 60);
  if (!quiet) project.touch();
};
export function structureChanged() { sig.struct.bump(); E.onChange(); }
export const onChange = () => E.onChange();

/* ---------- tools ---------- */
const current = new Map(GROUPS.filter(Boolean).map(g => [g, g[0]]));   // tool shown for each group
export const groupTool = g => current.get(g);

export function selectTool(t) {
  if (!TOOL[t]) return;
  T.cancel();
  if (E.selPath && t !== 'polyLasso' && t !== 'lasso') E.selPath = null;
  if (E.crop && t !== 'crop') E.crop = null;
  E.tool = t;
  current.set(groupOf(t), t);
  toolVal.set(t);
  view.setTool(t);
  refreshOptions();
}
/* letter key: the group's current tool; Shift + letter: the next one in the group (Photoshop) */
export function cycleTool(letter, shift) {
  const g = GROUPS.find(gr => gr && TOOL[gr[0]].key === letter); if (!g) return false;
  const now = current.get(g);
  selectTool(shift && g.includes(E.tool) ? g[(g.indexOf(now) + 1) % g.length] : now);
  return true;
}
export const closeFlyout = () => flyoutVal.set(null);

/* ---------- options bar ---------- */
function refreshOptions() {
  const tf = E.transform;
  transformInfo.set(tf ? `${tf.box.w}×${tf.box.h} px (${Math.round(tf.box.w / tf.orig.w * 100)}% × ${Math.round(tf.box.h / tf.orig.h * 100)}%)` : null);
}
export function setOpt(key, v) { E.opts[key] = v; sig.opts.bump(); view.schedule(); }
export const toggleOpt = key => setOpt(key, !E.opts[key]);
export const setSize = v => setOpt('size', Math.max(1, Math.min(64, v)));

/* ---------- colours ---------- */
export function colorsChanged() { sig.colors.bump(); }
export function setColor(which, c) { E.colors[which] = [c[0], c[1], c[2], 255]; colorsChanged(); }
export function swapColors() { [E.colors.primary, E.colors.secondary] = [E.colors.secondary, E.colors.primary]; colorsChanged(); }
export function defaultColors() { E.colors.primary = [0, 0, 0, 255]; E.colors.secondary = [255, 255, 255, 255]; colorsChanged(); }
/* double click on a swatch: that colour becomes another one in every layer */
export function replaceSwatch(from, toHex) {
  const to = hex2rgb(toHex);
  if (hex(to) === hex(from)) return;
  D.record('Reemplazar color'); D.commit(); O.replaceColor(from, to);
  if (hex(E.colors.primary) === hex(from)) setColor('primary', to);
  E.onChange();
}
/* a swatch dragged onto another: merged in every layer */
export function mergeSwatches(dragged, target, keep) {
  const gone = keep === dragged ? target : dragged;
  D.record('Fusionar colores'); D.commit();
  O.replaceColor(hex2rgb(gone), hex2rgb(keep));
  if (hex(E.colors.primary) === gone) setColor('primary', hex2rgb(keep));
  msg(`Colores fusionados: queda ${keep}.`); E.onChange();
}

/* ---------- Navigator and real-size preview (canvases registered by the panel) ---------- */
const refs = { nav: null, prev: null };
export function registerCanvas(name, el) { refs[name] = el; if (el) { if (name === 'prev') drawPrev(); else drawNav(); } }
function drawPrev() {
  const c = refs.prev; if (!c) return;
  if (!D.has()) { c.width = 0; c.height = 0; return; }
  c.width = D.w; c.height = D.h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(view.compositeCanvas(), 0, 0);
}
export function drawNav() {
  const nav = refs.nav; if (!nav) return;
  if (!D.has()) { nav.width = nav.height = 0; return; }
  const comp = view.compositeCanvas(), maxW = Math.max(120, nav.parentElement.clientWidth || 260), s = Math.min(maxW / D.w, 180 / D.h);
  const w = Math.max(1, Math.round(D.w * s)), h = Math.max(1, Math.round(D.h * s));
  if (nav.width !== w) nav.width = w; if (nav.height !== h) nav.height = h;
  const x = nav.getContext('2d'); x.clearRect(0, 0, w, h); x.imageSmoothingEnabled = false; x.drawImage(comp, 0, 0, w, h);
  const r = view.visibleRect();
  x.strokeStyle = '#e4572e'; x.lineWidth = 2;
  x.strokeRect(Math.max(1, r.x * s), Math.max(1, r.y * s), Math.min(w - 2, r.w * s), Math.min(h - 2, r.h * s));
  nav.dataset.scale = s;
}
function contentChanged() {
  drawPrev();
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => sig.thumbs.bump(), 200);
  refreshWindows('edview');
}

/* ---------- layers ---------- */
/* run an action on the document as one history step; fn returning false = nothing changed */
export function act(label, fn, structural = true) {
  if (!D.has()) return false;
  D.record(label);
  if (fn() === false) { D.dropRecord(); return false; }
  structural ? structureChanged() : E.onChange();
  return true;
}
let opacityRecorded = false, opacityTimer = 0;
/* one history step per slider drag (or per burst of number keys) */
export function setOpacity(v) {
  if (!D.has()) return;
  if (!opacityRecorded) { D.record('Opacidad de capa'); opacityRecorded = true; }
  clearTimeout(opacityTimer); opacityTimer = setTimeout(() => { opacityRecorded = false; }, 600);
  D.cur().opacity = Math.max(0, Math.min(100, v)) / 100; structureChanged();
}
export function setBlend(b) { if (!D.has()) return; D.record('Modo de fusión'); D.cur().blend = b; structureChanged(); }
export function toggleLockAlpha() { if (!D.has()) return; const l = D.cur(); D.record(l.lockAlpha ? 'Desbloquear transparencia' : 'Bloquear transparencia'); l.lockAlpha = !l.lockAlpha; structureChanged(); }
export function toggleVisible(l) { D.record(l.visible ? 'Ocultar capa' : 'Mostrar capa'); l.visible = !l.visible; structureChanged(); }
export function selectLayerPixels(l) { D.record('Seleccionar píxeles de la capa'); D.setSel(D.layerAlphaMask(l)); E.onChange(); }
export function activateLayer(i) { if (i === D.active) return; if (D.floating) D.record('Soltar'); D.setActive(i); structureChanged(); }
export function renameLayer(l, name) { const v = name.trim(); if (v && v !== l.name) { D.record('Cambiar nombre de capa'); l.name = v; } structureChanged(); }
/* drag in the Layers panel: layer `from` to position `to` */
export function dropLayer(from, to) {
  if (D.active !== from) D.setActive(from);
  D.record('Mover capa'); if (!D.moveLayerTo(to)) D.dropRecord(); structureChanged();
}
export function deleteLayerAsk() { act('Eliminar capa', () => confirm('¿Eliminar la capa «' + D.cur().name + '»?') && D.deleteLayer()); }
export function historyGo(n) { if (n === D.history().pos) return; D.historyGo(n); structureChanged(); }

/* ---------- dialogs ---------- */
export function openDialog(id, params) { if (D.has() || id === 'dlgNew' || id === 'dlgKeys') dialogVal.set({ id, ...params }); }
export function closeDialog() {
  dialogVal.set(null);
  if (E.replacePreview) { E.replacePreview = null; view.invalidate(); }
}
/* live preview dialogs (Tono/saturación, Brillo/contraste, Posterizar): they compute from the layer as it
   was when opened and show the result instead of the active layer until OK or Cancel */
export const live = { base: null };
export function openLive(id) {
  if (!D.has()) return;
  if (D.floating) { D.record('Soltar'); D.commit(); E.onChange(); }
  live.base = D.cur().px;
  dialogVal.set({ id });
}
export function preview(px) { E.replacePreview = px; view.invalidate(); }
export function applyLive(label) {
  const px = E.replacePreview; closeDialog();
  if (!px) return;
  D.record(label); D.cur().px = px; E.onChange();
}
export const openHSL = () => openLive('dlgAdjust');
export const openBC = () => openLive('dlgBC');
export const openPosterize = () => openLive('dlgPosterize');

const clampSide = v => Math.max(1, Math.min(4096, +v | 0));
export function openCanvasSize() { if (D.has()) openDialog('dlgCanvas', { w: D.w, h: D.h }); }
export function applyCanvasSize(w, h, anchor) {
  w = clampSide(w); h = clampSide(h); closeDialog();
  if (w === D.w && h === D.h) return;
  act('Tamaño de lienzo', () => O.resizeCanvas(w, h, anchor)); view.fit();
}
export function openImageSize() { if (D.has()) openDialog('dlgImageSize', { w: D.w, h: D.h }); }
export function applyImageSize(w, h) {
  w = clampSide(w); h = clampSide(h); closeDialog();
  if (w === D.w && h === D.h) return;
  act('Tamaño de imagen', () => O.imageSize(w, h)); view.fit();
}
export function openNew() {
  let w = 64, h = 64;
  if (D.has()) { w = D.w; h = D.h; } else { try { const s = readSettings(); w = s.CW; h = s.CH; } catch { /* generator not ready */ } }
  openDialog('dlgNew', { w, h });
}
export function applyNew(w, h, bg) {
  w = clampSide(w); h = clampSide(h); closeDialog();
  if (D.has() && !confirm('El documento actual se sustituye por uno nuevo. ¿Continuar?')) return;
  D.create(w, h, null, bg === 'transparent' ? 'Capa 1' : 'Fondo');
  if (bg !== 'transparent') { const c = bg === 'white' ? [255, 255, 255, 255] : E.colors.secondary; D.cur().px.fill(0); for (let o = 0; o < D.cur().px.length; o += 4) O.setAt(D.cur().px, o, c); }
  afterLoad(); project.touch();
}
export const colorOf = v => v === 'bg' ? E.colors.secondary : v === 'clear' ? [0, 0, 0, 0] : E.colors.primary;
export function fillWith(c, keep, label) { return act(label, () => { D.commit(); O.fillSel(c, keep || D.cur().lockAlpha); }, false); }
export function applyStroke(color, width, pos) {
  closeDialog();
  act('Contornear', () => { D.commit(); return O.strokeSel(colorOf(color), Math.max(1, +width | 0), pos); }, false);
}
export function applyOffset(x, y, wrap) {
  closeDialog();
  const dx = +x | 0, dy = +y | 0; if (!dx && !dy) return;
  act('Desplazamiento', () => { D.commit(); D.cur().px = O.offset(D.cur().px, dx, dy, wrap); }, false);
}
export function applyOutline(color, diag) {
  closeDialog();
  act('Contorno automático', () => { D.commit(); D.cur().px = O.outline(D.cur().px, D.w, D.h, color === 'fg' ? E.colors.primary : null, diag); }, false);
}
/* a small "type a number" dialog */
export function askNumber(title, label, value, min, done) { dialogVal.set({ id: 'dlgNum', title, label, value, min, done }); }

/* ---------- export ---------- */
export function canvasAt(scale) {
  const c = document.createElement('canvas'); c.width = D.w * scale; c.height = D.h * scale;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  const base = document.createElement('canvas'); base.width = D.w; base.height = D.h;
  base.getContext('2d').putImageData(new ImageData(D.composite(), D.w, D.h), 0, 0);
  x.drawImage(base, 0, 0, c.width, c.height);
  return c;
}
export async function exportPng(s) {
  if (!D.has()) return;
  closeDialog();
  const blob = await new Promise(r => canvasAt(s).toBlob(r, 'image/png'));
  download(blob, fileName(s > 1 ? '_x' + s : ''), msg);
}

/* ---------- images as layers: Archivo > Abrir, drag and drop, or paste from the system ---------- */
export async function addImageLayer(file, name) {
  let img;
  try { img = await loadImage(file); } catch { msg('No se pudo leer esa imagen.'); return; }
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const block = { w: c.width, h: c.height, px: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, mask: null };
  if (!D.has()) {   // no document yet: it becomes the document
    D.create(block.w, block.h, block.px, name || 'Capa 1'); afterLoad(); project.touch(); return;
  }
  const [cx, cy] = view.viewCenter();
  D.record('Pegar imagen');
  D.paste(false, cx, cy, block);
  D.cur().name = name || 'Imagen pegada';
  selectTool('move'); structureChanged();
  msg(`Imagen añadida como capa nueva (${block.w}×${block.h} px). Muévela con el ratón o las flechas; Ctrl+Alt+T para escalarla.`);
}
export const baseName = f => f.name.replace(/\.[^.]+$/, '');

/* ---------- status bar ---------- */
let msgTimer = 0;
export function msg(t) { msgVal.set(t || ''); clearTimeout(msgTimer); if (t) msgTimer = setTimeout(() => msgVal.set(''), 5000); }
function status(p, comp) {
  if (!p || !D.inside(p.x, p.y)) { statusVal.set(null); return; }
  const o = D.idx(p.x, p.y);
  statusVal.set([`x ${p.x}, y ${p.y}`, comp && comp[o + 3] ? hex([comp[o], comp[o + 1], comp[o + 2]]) : 'transparente']);
}
const zoomChanged = z => zoomVal.set(z);

E.ui = { contentChanged, colorsChanged, status, zoomChanged, drawNav };

/* ---------- loading, showing the page, the generator's sprite ---------- */
export function afterLoad() {
  if (!D.has()) { drawPrev(); drawNav(); }
  sig.struct.bump(); sig.thumbs.bump(); sig.hist.bump(); colorsChanged();
  needFit = true; shown();
}
export function shown() {
  view.resize();
  if (needFit && D.has() && view.hasStage()) { needFit = false; view.fit(); }
  view.invalidate();
}
function spriteFromGenerator() {
  if (!S.sprite) return null;
  const c = spriteCanvas(1);
  return { w: c.width, h: c.height, px: c.getContext('2d').getImageData(0, 0, c.width, c.height).data };
}
/* ask: confirm before touching an existing document */
export function importFromGenerator(ask = true) {
  const s = spriteFromGenerator();
  if (!s) { msg('Primero genera un sprite en el generador.'); return false; }
  if (!D.has() || D.w !== s.w || D.h !== s.h) {
    if (D.has() && !confirm(`El lienzo del generador (${s.w}×${s.h}) no mide lo mismo que el del editor (${D.w}×${D.h}). ¿Empezar de nuevo con el sprite generado? Se perderán las capas actuales.`)) return false;
    D.create(s.w, s.h, s.px, 'Sprite generado', { generated: true });
  } else {
    const gl = D.layers.find(l => l.generated);
    if (ask && !confirm(gl ? `Se reemplazará la capa «${gl.name}» con el sprite actual del generador. El resto de capas se mantiene. ¿Continuar?` : 'Se añadirá el sprite del generador como capa de fondo. ¿Continuar?')) return false;
    D.record('Actualizar desde el generador'); D.commit();
    if (gl) gl.px = new Uint8ClampedArray(s.px);
    else { D.layers.unshift(D.makeLayer('Sprite generado', new Uint8ClampedArray(s.px), { generated: true })); D.active++; }
  }
  afterLoad(); project.touch();
  return true;
}
export const hasGeneratorSprite = () => !!S.sprite;

/* load / clear without marking the design as changed */
export function loadDoc(data) { quiet++; try { D.load(data); afterLoad(); } finally { quiet--; } }
export function clearDoc() { quiet++; try { D.clear(); E.replacePreview = null; afterLoad(); } finally { quiet--; } refreshWindows('edview'); }
