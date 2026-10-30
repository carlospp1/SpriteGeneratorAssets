/* The sprite as shown and downloaded, its palette (one row per colour family, the removed colours, the
   line art's lines apart) and the colour changes made on it. */
import { hex2rgb, groupColours } from '../../engine/color.js';
import { S, spriteSignal, showMsg } from './state.js';
import { readSettings, place, tooBig } from './settings.js';
import { spriteLines } from './spriteLines.js';
import { aplicarRetoques } from './retoques.js';
import { history } from './history.js';
import { project } from '../project/project.js';
import { refreshWindows } from '../../components/FloatingWindows.jsx';
import { download, fileName } from '../../app/files.js';

export const REMOVED = 'transparent';   // colorMap value of a colour taken out of the sprite ("Quitar")
const hex6 = (px, o) => '#' + ((px[o] << 16) | (px[o + 1] << 8) | px[o + 2]).toString(16).padStart(6, '0');

/* pixels of the sprite's size with the palette changes made by hand (S.colorMap: generated colour -> new colour) */
function mappedPx(src) {
  const map = S.colorMap || {};
  if (!Object.keys(map).length) return src;
  const out = new Uint8ClampedArray(src), cache = new Map();
  for (let o = 0; o < out.length; o += 4) {
    if (!out[o + 3]) continue;
    const k = hex6(out, o); if (!(k in map)) continue;
    if (map[k] === REMOVED) { out[o + 3] = 0; continue; }
    let rgb = cache.get(k); if (!rgb) { rgb = hex2rgb(map[k]); cache.set(k, rgb); }
    out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2];
  }
  return out;
}
/* the sprite with its palette changes, and the line art's lines over it (when they are used) with their own
   colour changes. The sprite's palette never touches the lines. */
const basePx = () => mappedPx(S.sprite.px);
/* the sprite as shown and downloaded: palette changes, the line art's lines and then the touch-ups */
export const finalPx = () => {
  const px = spriteLines.composite(basePx);
  return S.retoques && S.retoques.length ? aplicarRetoques(px, S.sprite.TW, S.sprite.TH) : px;
};

/* the sprite on its canvas. src: other pixels of the sprite's size instead of the sprite (the lines alone) */
export function spriteCanvas(scale, src) {
  const o = readSettings(), { CW, CH } = o, { TW, TH } = S.sprite, px = src || finalPx();
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const cx = c.getContext('2d'), id = cx.createImageData(TW, TH); id.data.set(px);
  const tmp = document.createElement('canvas'); tmp.width = TW; tmp.height = TH; tmp.getContext('2d').putImageData(id, 0, 0);
  const { ox, oy } = place({ ...o, TW, TH });
  if (o.flipH) { cx.translate(ox + TW, oy); cx.scale(-1, 1); cx.drawImage(tmp, 0, 0); cx.setTransform(1, 0, 0, 1, 0, 0); }   // mirrored where it stands
  else cx.drawImage(tmp, ox, oy);
  if (scale === 1) return c;
  const big = document.createElement('canvas'); big.width = CW * scale; big.height = CH * scale;
  const bx = big.getContext('2d'); bx.imageSmoothingEnabled = false; bx.drawImage(c, 0, 0, big.width, big.height);
  return big;
}
/* the zoomed preview (and the floating Sprite windows): the lines alone or highlighted while retouching them */
export const previewCanvas = () => spriteLines.preview(spriteCanvas(1));

/* show the sprite again (the preview, the real size, the palette and the floating windows) */
export function showSprite() {
  if (!S.sprite) return;
  const big = tooBig({ ...readSettings(), TW: S.sprite.TW, TH: S.sprite.TH });
  if (big) { showMsg(big); return; }
  spriteSignal.bump();
  refreshWindows('sprite'); refreshWindows('real');
}

/* ---------- palette ---------- */
const LAYERS = {
  sprite: { map: () => S.colorMap || {}, set: m => { S.colorMap = m; } },
  lines: { map: () => S.lineColorMap || {}, set: m => { S.lineColorMap = m; } }
};
/* the generated colours of each layer: the sprite's (leaving out what solid lines cover) and the lines' */
function rawColours() {
  const sp = S.sprite, L = spriteLines.on() ? spriteLines.lines() : null;
  const cover = L && L.opacity >= 1 ? L.shown : null, sprite = new Set(), lines = new Set();
  for (let o = 0; o < sp.px.length; o += 4) if (sp.px[o + 3] && !(cover && cover[o + 3])) sprite.add(hex6(sp.px, o));
  if (L) for (let o = 0; o < L.raw.length; o += 4) if (L.raw[o + 3]) lines.add(hex6(L.raw, o));
  return { sprite, lines };
}
/* colour shown now -> the generated colours behind it (several when merged) */
function byNow(set, map) {
  const r = new Map();
  for (const k of set) { if (map[k] === REMOVED) continue; const now = map[k] || k; if (!r.has(now)) r.set(now, []); r.get(now).push(k); }
  return r;
}
const lum = h => { const [r, g, b] = hex2rgb(h); return r * 0.299 + g * 0.587 + b * 0.114; };

/* what the palette shows: { count (colours of the final sprite), rows: [{ name, title, cls, items }] }.
   item: { now (colour shown, or REMOVED), raws (the generated colours behind it), layer, changed } */
export function paletteModel() {
  if (!S.sprite) return { count: 0, rows: [] };
  const raws = rawColours(), map = LAYERS.sprite.map(), lmap = LAYERS.lines.map(), px = finalPx(), finals = new Set();
  for (let o = 0; o < px.length; o += 4) if (px[o + 3]) finals.add(hex6(px, o));
  const rows = [];
  const item = (now, rs, m, layer) => ({ now, raws: rs, layer, changed: now !== REMOVED && rs.some(k => m[k]) });
  // one row per colour family (reds, blues…), dark to light, grouped by the colour shown now
  const sNow = byNow(raws.sprite, map);
  for (const g of groupColours([...sNow.keys()].map(h => [...hex2rgb(h), h])))
    rows.push({ name: g.name, title: g.title, items: g.colors.map(c => item(c[3], sNow.get(c[3]), map, 'sprite')) });
  const removed = [...raws.sprite].filter(k => map[k] === REMOVED).sort();
  // colours taken out: shown crossed out, a click opens them to bring them back
  if (removed.length) rows.push({ name: 'Quitados', title: 'Colores que ahora son transparentes. Clic en uno para recuperarlo.', items: removed.map(k => item(REMOVED, [k], map, 'sprite')) });
  if (raws.lines.size) {   // the lines, dark to light, with the line colours taken out at the end
    const lNow = byNow(raws.lines, lmap);
    rows.push({
      name: 'Líneas', cls: 'pal-lines',
      title: 'Colores de las líneas del Line art, aparte de los del sprite. Clic para cambiar uno o quitarlo; arrástralo sobre otro color (de las líneas o del sprite) para fusionarlos.',
      items: [...[...lNow.keys()].sort((a, b) => lum(a) - lum(b)).map(now => item(now, lNow.get(now), lmap, 'lines')),
        ...[...raws.lines].filter(k => lmap[k] === REMOVED).sort().map(k => item(REMOVED, [k], lmap, 'lines'))]
    });
  }
  return { count: finals.size, rows };
}

/* v: new colour for all of them; null = back to what the sprite generated (undoes merges too) */
export function setColor(raws, v, layer = 'sprite') {
  const m = { ...LAYERS[layer].map() };
  for (const k of raws) { if (!v || v.toLowerCase() === k) delete m[k]; else m[k] = v === REMOVED ? REMOVED : v.toLowerCase(); }
  LAYERS[layer].set(m);
  showSprite();
}
/* a colour change is finished (the popover closes) */
export function colorsSettled() { project.touch(); history.schedule(); }

/* drag a colour onto another: both become the one chosen. Each side changes in its own layer: a line dropped
   on a sprite colour takes that colour (or the sprite colour takes the line's) without the rest of the other
   layer changing. sides: [[layer, colour shown now], [layer, colour shown now]] */
export function mergeColors(sides, keep) {
  const raws = rawColours(), todo = new Map();   // layer -> the colours shown now that become keep
  for (const [l, col] of sides) { if (!todo.has(l)) todo.set(l, new Set()); todo.get(l).add(col); }
  for (const [l, cols] of todo) {
    const m = { ...LAYERS[l].map() };
    for (const k of raws[l]) {
      if (m[k] === REMOVED || !cols.has(m[k] || k)) continue;
      if (keep === k) delete m[k]; else m[k] = keep;
    }
    LAYERS[l].set(m);
  }
  showSprite(); project.touch(); history.schedule();
}

/* ---------- downloads ---------- */
export async function saveSprite(scale) {
  if (!S.sprite) { showMsg('Primero sube una imagen.'); return; }
  const blob = await new Promise(r => spriteCanvas(scale).toBlob(r, 'image/png'));
  download(blob, fileName(scale === 1 ? '' : '_x' + scale));
}
