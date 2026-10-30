/* The line art's lines on the generator's sprite (step «Líneas del Line art», off by default).
   The sprite engine leaves them as a layer of their own (S.sprite.la: kind per pixel 1 outline / 2 inner line,
   the dark shade of the zone under each pixel, the line art's colour); here that layer goes over the sprite
   with its opacity and colour, only the kinds that are switched on, the colour changes made in its own
   palette row (S.lineColorMap) and the retouches made by hand on the sprite canvas (the zoomed preview and
   the floating «Sprite» windows): erase, erase a whole stroke, restore and draw.
   Retouches: S.lineEdits = { TW, TH, a } with, per sprite pixel, 0 as the line art has it, 1 erased, 2 drawn. */
import { hex2rgb } from '../../engine/color.js';
import * as pixgrid from '../../engine/pixgrid.js';
import { settings } from '../../state/settings.js';
import { createValue } from '../../state/signal.js';
import { S, spriteSignal, showMsg } from './state.js';
import { readSettings, place } from './settings.js';
import { showSprite, spriteCanvas } from './output.js';
import { history } from './history.js';
import { project } from '../project/project.js';
import { download, fileName } from '../../app/files.js';

const REMOVED = 'transparent';   // lineColorMap value of a line colour taken out ("Quitar")
const HINTS = {
  move: 'Elige «Borrar líneas», «Borrar trazo», «Recuperar» o «Dibujar líneas» y pinta sobre el sprite (con zoom o en su ventana flotante).',
  erase: 'Pinta sobre el sprite para quitar líneas; debajo queda su color. Clic derecho o Alt: recuperar. [ y ]: tamaño. Esc: mover sprite.',
  stroke: 'Clic en una línea: se borra el trazo entero. Clic derecho o Alt + clic: recupera el trazo entero. Esc: mover sprite.',
  restore: 'Pinta sobre lo borrado o dibujado para dejarlo como lo trae el Line art. Clic derecho o Alt: borrar. Esc: mover sprite.',
  draw: 'Pinta para añadir líneas donde no las hay. Clic derecho o Alt: borrar. [ y ]: tamaño. Esc: mover sprite.'
};
const INVERSE = { erase: 'restore', restore: 'erase', draw: 'erase', stroke: 'unstroke' };
const toolValue = createValue('move');   // the retouching tool ('move' = the preview drags the sprite)
let ver = 0;   // changes with every retouch, for the cache
const tool = () => toolValue.get();

function opts() {
  return {
    opacity: Math.max(0, Math.min(100, settings.num('laOpacity', 0))) / 100,
    color: settings.get('laColor'), custom: hex2rgb(settings.get('laCustom')),
    kinds: [false, !!settings.get('laOuter'), !!settings.get('laInner')]
  };
}
/* the lines count: switched on and a sprite that brought them */
const on = () => !!(S.sprite && S.sprite.la && settings.get('useLineArt'));
const active = () => on() && tool() !== 'move';

/* the retouches at the sprite's size. They keep the size they were made at: after a size change they are
   shown resized (nearest pixel) and only replaced by the resized copy when painting again. */
let resized = null;
function edits(forWrite) {
  const sp = S.sprite, e = S.lineEdits;
  if (e && e.TW === sp.TW && e.TH === sp.TH) return e.a;
  if (!e) { if (!forWrite) return null; S.lineEdits = { TW: sp.TW, TH: sp.TH, a: new Uint8Array(sp.TW * sp.TH) }; return S.lineEdits.a; }
  if (!resized || resized.src !== e.a || resized.TW !== sp.TW || resized.TH !== sp.TH) {
    const a = new Uint8Array(sp.TW * sp.TH);
    for (let j = 0; j < sp.TH; j++) for (let i = 0; i < sp.TW; i++) a[j * sp.TW + i] = e.a[Math.floor(j * e.TH / sp.TH) * e.TW + Math.floor(i * e.TW / sp.TW)];
    resized = { src: e.a, TW: sp.TW, TH: sp.TH, a };
  }
  if (!forWrite) return resized.a;
  S.lineEdits = { TW: sp.TW, TH: sp.TH, a: resized.a.slice() };
  return S.lineEdits.a;
}

/* is pixel c a line: drawn by hand, or brought by the line art (of a kind switched on) and not erased */
const isOn = (la, o, e, c) => { const v = e ? e[c] : 0; return v === 2 || (v !== 1 && !!la.kind[c] && o.kinds[la.kind[c]]); };
/* a hand-drawn pixel counts as outline when it is on the edge of the sprite */
function kindOf(sp, c) {
  const la = sp.la; if (la.kind[c]) return la.kind[c];
  const { TW, TH, px } = sp, i = c % TW, j = (c / TW) | 0;
  const empty = (x, y) => x < 0 || y < 0 || x >= TW || y >= TH || !px[(y * TW + x) * 4 + 3];
  return !px[c * 4 + 3] || empty(i - 1, j) || empty(i + 1, j) || empty(i, j - 1) || empty(i, j + 1) ? 1 : 2;
}
function colorOf(sp, o, c) {
  const la = sp.la;
  if (o.color === 'custom') return o.custom;
  if (o.color === 'all' || (o.color === 'inner' && kindOf(sp, c) === 2)) return [la.zone[c * 3], la.zone[c * 3 + 1], la.zone[c * 3 + 2]];
  return la.color;
}

/* only the lines, opaque, in the colour they get from the settings (before the palette row changes), plus
   counts. Kept until the sprite, the settings or the retouches change. */
let layerCache = null;
function layer(sp = S.sprite, o = opts()) {
  const key = JSON.stringify([o.color, o.custom, o.kinds]) + '|' + ver, le = S.lineEdits && S.lineEdits.a;   // undo / opening a design replace the retouches
  if (layerCache && layerCache.sp === sp && layerCache.key === key && layerCache.le === le) return layerCache;
  const N = sp.TW * sp.TH, la = sp.la, e = edits(false), raw = new Uint8ClampedArray(N * 4), st = { on: 0, erased: 0, drawn: 0 };
  for (let c = 0; c < N; c++) {
    if (e && e[c] === 1 && la.kind[c]) st.erased++;
    if (!isOn(la, o, e, c)) continue;
    if (e && e[c] === 2) st.drawn++;
    st.on++;
    const col = colorOf(sp, o, c), q = c * 4;
    raw[q] = col[0]; raw[q + 1] = col[1]; raw[q + 2] = col[2]; raw[q + 3] = 255;
  }
  layerCache = { sp, key, le, raw, st, shown: null, mapKey: null };
  return layerCache;
}
/* the lines as they are painted: with the colour changes of their palette row; a colour taken out leaves
   its pixels without line (alpha 0) */
function shown(L = layer()) {
  const map = S.lineColorMap || {}, mapKey = JSON.stringify(map);
  if (L.shown && L.mapKey === mapKey) return L.shown;
  let out = L.raw;
  if (Object.keys(map).length) {
    out = new Uint8ClampedArray(L.raw); const to = new Map();
    for (let q = 0; q < out.length; q += 4) {
      if (!out[q + 3]) continue;
      const k = (out[q] << 16) | (out[q + 1] << 8) | out[q + 2];
      if (!to.has(k)) { const v = map['#' + k.toString(16).padStart(6, '0')]; to.set(k, !v ? false : v === REMOVED ? null : hex2rgb(v)); }
      const rgb = to.get(k);
      if (rgb === false) continue;
      if (rgb === null) { out[q + 3] = 0; continue; }
      out[q] = rgb[0]; out[q + 1] = rgb[1]; out[q + 2] = rgb[2];
    }
  }
  L.shown = out; L.mapKey = mapKey;
  return out;
}

/* the sprite as shown and downloaded: base() gives the sprite with its own palette changes; the lines go
   over it at their opacity. Kept until something changes (the preview asks for it several times). */
let cache = null;
function composite(base) {
  if (!on()) return base();
  const o = opts(), L = layer(S.sprite, o), lines = shown(L), key = o.opacity + '|' + JSON.stringify(S.colorMap || {});
  if (cache && cache.lines === lines && cache.key === key) return cache.px;
  const a = o.opacity, out = new Uint8ClampedArray(base());
  if (a > 0) for (let q = 0; q < out.length; q += 4) {
    if (!lines[q + 3]) continue;
    if (out[q + 3]) for (let k = 0; k < 3; k++) out[q + k] = Math.round(out[q + k] + (lines[q + k] - out[q + k]) * a);
    else { out[q] = lines[q]; out[q + 1] = lines[q + 1]; out[q + 2] = lines[q + 2]; out[q + 3] = Math.round(255 * a); }   // drawn outside the silhouette
  }
  cache = { lines, key, px: out };
  return out;
}

/* ---------- the preview while retouching: only the lines («Ver solo las líneas») and the highlight (what is
   not line fades, erased lines show in pink) ---------- */
function preview(c1) {
  if (!active()) return c1;   // with «Mover sprite» the preview is the sprite as it is
  const solo = !!settings.get('laSolo'), hl = !!settings.get('laHighlight');
  if (!solo && !hl) return c1;
  const sp = S.sprite, o = opts(), e = edits(false), la = sp.la, lines = shown();
  const { ox, oy } = place({ ...readSettings(), TW: sp.TW, TH: sp.TH });
  const c = document.createElement('canvas'); c.width = c1.width; c.height = c1.height;
  const x = c.getContext('2d');
  if (solo) x.globalAlpha = 0.15;   // the sprite, very faint, to know where each line is
  x.drawImage(c1, 0, 0); x.globalAlpha = 1;
  const id = x.getImageData(ox, oy, sp.TW, sp.TH), d = id.data;
  for (let n = 0; n < sp.TW * sp.TH; n++) {
    const q = n * 4;
    if (lines[q + 3]) {
      // alone, or at low opacity while retouching, lines are shown solid so you can see what you retouch
      if (solo || o.opacity < 0.5) { d[q] = lines[q]; d[q + 1] = lines[q + 1]; d[q + 2] = lines[q + 2]; d[q + 3] = 255; }
      continue;
    }
    if (!hl) continue;
    if (e && e[n] === 1 && la.kind[n] && o.kinds[la.kind[n]]) { d[q] = 255; d[q + 1] = 80; d[q + 2] = 170; d[q + 3] = 255; continue; }
    if (!solo && d[q + 3]) for (let k = 0; k < 3; k++) d[q + k] = Math.round(d[q + k] + (255 - d[q + k]) * 0.7);
  }
  x.putImageData(id, ox, oy);
  return c;
}

/* ---------- painting on the sprite canvas ---------- */
let paint = null;
const brush = () => Math.max(1, Math.round(settings.num('laBrush', 1)));
function cellAt(canvas, ev) {
  const sp = S.sprite, r = canvas.getBoundingClientRect();
  const o = readSettings(), { ox, oy } = place({ ...o, TW: sp.TW, TH: sp.TH });
  const i = Math.floor((ev.clientX - r.left) * canvas.width / r.width) - ox;
  return [o.flipH ? sp.TW - 1 - i : i, Math.floor((ev.clientY - r.top) * canvas.height / r.height) - oy];   // mirrored sprite: back to its own pixels
}
function dab(i, j, mode) {
  if (mode === 'stroke' || mode === 'unstroke') return wholeStroke(i, j, mode);
  const sp = S.sprite, la = sp.la, o = opts(), e = edits(true), s = brush(), h = Math.floor((s - 1) / 2);
  let changed = false;
  for (let y = j - h; y < j - h + s; y++) for (let x = i - h; x < i - h + s; x++) {
    if (x < 0 || y < 0 || x >= sp.TW || y >= sp.TH) continue;
    const c = y * sp.TW + x, fromArt = !!la.kind[c] && o.kinds[la.kind[c]];
    // erase: a line of the line art is marked erased, a drawn one just goes; draw: only where there is none
    const v = mode === 'restore' ? 0 : mode === 'erase' ? (la.kind[c] ? 1 : 0) : fromArt ? 0 : 2;
    if (e[c] !== v) { e[c] = v; changed = true; }
  }
  return changed;
}
/* the whole stroke under (i, j): its line pixels joined to it (also diagonally) and of the same kind, so
   erasing an inner line does not take the outline with it. stroke erases what is shown now; unstroke
   brings back the whole stroke as the line art has it. */
function wholeStroke(i, j, mode) {
  const sp = S.sprite, la = sp.la, o = opts(), { TW, TH } = sp;
  if (i < 0 || j < 0 || i >= TW || j >= TH) return false;
  const e = edits(true), c0 = j * TW + i;
  let ok;
  if (mode === 'stroke') {
    if (!isOn(la, o, e, c0)) return false;
    const k = kindOf(sp, c0); ok = c => isOn(la, o, e, c) && kindOf(sp, c) === k;
  } else {
    const k = la.kind[c0]; if (!k || !o.kinds[k]) return false;
    ok = c => la.kind[c] === k;
  }
  const seen = new Uint8Array(TW * TH), list = [c0]; seen[c0] = 1;
  for (let n = 0; n < list.length; n++) {
    const c = list[n], x = c % TW, y = (c / TW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
      const q = yy * TW + xx; if (!seen[q] && ok(q)) { seen[q] = 1; list.push(q); }
    }
  }
  let changed = false;
  for (const c of list) {
    const v = mode === 'stroke' ? (la.kind[c] ? 1 : 0) : e[c] === 1 ? 0 : e[c];
    if (e[c] !== v) { e[c] = v; changed = true; }
  }
  return changed;
}
function stroke(to) {
  const [x0, y0] = paint.last, [x1, y1] = to, n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
  let changed = false;
  for (let t = 0; t <= n; t++) changed = dab(Math.round(x0 + (x1 - x0) * t / n), Math.round(y0 + (y1 - y0) * t / n), paint.mode) || changed;
  paint.last = to;
  if (changed) { ver++; showSprite(); }
}
function endPaint() {
  if (!paint) return;
  paint = null; S.drag = null;
  if (S.lineEdits && !S.lineEdits.a.some(v => v)) { S.lineEdits = null; ver++; }
  project.touch(); history.schedule(); spriteSignal.bump();
}
/* hover: pixel grid around the pointer and the sprite pixels the tool will touch */
const overlays = new Set();
function hover(canvas, over, ev) {
  if (!active()) { over.hide(); return; }
  const r = canvas.getBoundingClientRect();
  const cx = Math.floor((ev.clientX - r.left) * canvas.width / r.width), cy = Math.floor((ev.clientY - r.top) * canvas.height / r.height);
  const whole = tool() === 'stroke', s = whole ? 1 : brush(), h = Math.floor((s - 1) / 2), pts = [];
  for (let y = cy - h; y < cy - h + s; y++) for (let x = cx - h; x < cx - h + s; x++) pts.push([x, y]);
  over.draw((ctx, k) => {
    pixgrid.grid(ctx, { ox: 0, oy: 0, k, cx: cx + 0.5, cy: cy + 0.5, R: s / 2 + 6, w: canvas.width, h: canvas.height });
    pixgrid.cursor(ctx, pts, 0, 0, k);
  });
}
/* a canvas that shows the sprite on its canvas: the preview, a floating «Sprite» window. Returns a cleanup. */
function attach(canvas) {
  const over = pixgrid.overlay(canvas); overlays.add(over);
  const down = ev => {
    if (!active() || (ev.button !== 0 && ev.button !== 2)) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    canvas.setPointerCapture(ev.pointerId);
    S.drag = { lines: true };   // the undo history waits for the end of the stroke
    paint = { mode: ev.button === 2 || ev.altKey ? INVERSE[tool()] : tool(), last: cellAt(canvas, ev) };
    stroke(paint.last);
  };
  const move = ev => {
    canvas.style.cursor = active() ? 'crosshair' : '';
    if (paint) stroke(cellAt(canvas, ev));
    hover(canvas, over, ev);
  };
  const leave = () => over.hide();
  const menu = ev => { if (active()) ev.preventDefault(); };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('pointerup', endPaint);
  canvas.addEventListener('pointercancel', endPaint);
  canvas.addEventListener('contextmenu', menu);
  return () => {
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerleave', leave);
    canvas.removeEventListener('pointerup', endPaint); canvas.removeEventListener('pointercancel', endPaint); canvas.removeEventListener('contextmenu', menu);
    over.hide(); overlays.delete(over);
  };
}

/* ---------- the controls ---------- */
function select(t) {
  toolValue.set(t);
  if (!active()) overlays.forEach(o => o.hide());
  showSprite();
}
/* the counts shown under the controls */
function stats() {
  if (!settings.get('useLineArt')) return '';
  // no lines: say why here too (the message under the sprite is replaced by the next one)
  if (!on()) return !S.sprite ? 'Genera un sprite para ver sus líneas.' : S.sprite.note || 'Pulsa «Actualizar desde el Line art».';
  const st = layer().st;
  return `${st.on} píxeles de línea` + (st.erased ? ` · ${st.erased} borrados` : '') + (st.drawn ? ` · ${st.drawn} dibujados a mano` : '');
}
/* these only change how the lines are put on the sprite: no need to generate it again */
const changed = () => { spriteSignal.bump(); if (!S.sprite) return; showSprite(); project.touch(); history.schedule(); };
settings.listen(ids => {
  if (ids.some(id => ['laOpacity', 'laCustom', 'laColor', 'laOuter', 'laInner'].includes(id))) changed();
  if (ids.some(id => ['laHighlight', 'laSolo'].includes(id))) showSprite();
});
function clearRetouches() {
  if (!S.lineEdits) { showMsg('No hay retoques de las líneas que quitar.'); return; }
  S.lineEdits = null; ver++; changed(); showMsg('Las líneas vuelven a ser las del Line art.');
}
function resetColors() { S.lineColorMap = {}; changed(); showMsg('Las líneas vuelven a sus colores.'); }
async function downloadLines() {
  if (!on()) { showMsg('Primero genera el sprite con las líneas del Line art.'); return; }
  const o = opts(), lines = new Uint8ClampedArray(shown(layer(S.sprite, o)));
  if (o.opacity < 1) for (let q = 3; q < lines.length; q += 4) if (lines[q]) lines[q] = Math.round(255 * o.opacity);
  const c = spriteCanvas(1, lines);
  download(await new Promise(r => c.toBlob(r, 'image/png')), fileName('_lineas'));
}
/* Esc: back to moving the sprite; [ and ]: brush size (while retouching, outside text fields). The
   generator page calls it while it is shown. */
function keyDown(ev) {
  if (!active() || paint || document.querySelector('dialog[open]')) return;
  const t = ev.target; if (t.closest && t.closest('input:not([type=checkbox]):not([type=range]), select, textarea')) return;
  if (ev.key === 'Escape') select('move');
  else if (ev.key === '[' || ev.key === ']') { ev.preventDefault(); settings.set('laBrush', brush() + (ev.key === ']' ? 1 : -1)); }
}

export const spriteLines = {
  on, active, composite, preview, attach, select, tool: toolValue, HINTS, stats, clearRetouches, resetColors, downloadLines, keyDown, REMOVED,
  /* the retouches were replaced from outside (undo, opening a design): caches must not reuse the old ones */
  retouchesReplaced() { ver++; },
  /* for the palette: the lines in their own colour (raw), as painted (shown) and their opacity */
  lines: () => { const o = opts(), L = layer(S.sprite, o); return { raw: L.raw, shown: shown(L), opacity: o.opacity }; },
  /* for the design file: the retouches, or null */
  serialize: () => S.lineEdits ? { TW: S.lineEdits.TW, TH: S.lineEdits.TH, a: S.lineEdits.a.slice() } : null
};
