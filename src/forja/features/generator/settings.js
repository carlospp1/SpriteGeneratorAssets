/* The generator's settings as the engines use them. Basic mode (advanced options off) uses only the basic
   controls, clamped to their basic ranges; every advanced setting takes its default value, whatever its
   field says. Also where the sprite goes on the canvas and the sizes the browser can handle. */
import { settings, SCHEMA } from '../../state/settings.js';
import { hex2rgb } from '../../engine/color.js';
import { bg } from './state.js';
import { pageEnabled } from '../../app/env.js';

const n = (id, d = 0) => settings.num(id, d);
const chk = id => !!settings.get(id);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
/* no maximum sizes: only what the browser itself can handle */
const MAX_SIDE = 32767, MAX_AREA = 268435456;   // biggest canvas browsers allow (side, pixels)
const MAX_CELLS = 4e6;                           // sprite pixels that fit comfortably in memory while building it
const adv = () => settings.advanced();
const dflt = id => parseFloat(SCHEMA[id].def);
const basicOf = id => SCHEMA[id].basic ? [SCHEMA[id].basic[0] ?? -Infinity, SCHEMA[id].basic[1] ?? Infinity] : null;
/* basic control: clamped to its basic range unless in advanced mode */
const bn = id => {
  const v = n(id, dflt(id)), r = basicOf(id);
  return adv() || !r ? v : Math.min(r[1], Math.max(r[0], v));
};
/* advanced-only controls: their default in basic mode */
const an = id => adv() ? n(id, dflt(id)) : dflt(id);
const ac = id => adv() ? chk(id) : !!SCHEMA[id].def;
const acol = id => hex2rgb(adv() ? settings.get(id) : SCHEMA[id].def);
export const spriteW = () => int(bn('tw'), 1, Infinity), spriteH = () => int(bn('th'), 1, Infinity);

export function readSettings() {
  const TW = spriteW(), TH = spriteH(), A = adv();
  const cw = int(bn('cw'), 1, Infinity), ch = int(bn('chh'), 1, Infinity);
  return {
    advanced: A,
    // background: removed from the borders with the tolerance; by the AI instead while «Quitar el fondo con IA» is checked
    remove: chk('bgRemove'), ai: chk('bgAI'),
    tol: bn('tol'), drift: an('bgDrift'), frame: ac('bgFrame'), island: an('bgIsland'),
    alphaMin: an('alphaMin'), globalTol: an('bgGlobalTol'),
    // details
    eyeK: int(an('eyeK'), 1, 64), eyeRare: an('eyeRare'),
    shineColor: acol('shineColor'), dotAuto: ac('dotAuto'), dotColor: acol('dotColor'),
    // sprite
    lineKeep: chk('lineKeep'), lineContrast: an('lineContrast'),
    TW, TH, K: int(bn('k'), 1, 30000), SH: int(bn('s'), 1, 30000), kAuto: chk('kAuto'), kSens: an('kSens'),
    lineL: 0, lineThr: 0.01,   // «Oscuridad para contar como línea» / «Líneas internas»: fijos, no se muestran
    clean: int(bn('cl'), 0, 100),
    colOut: chk('colOut'), mergeDE: Math.max(0, bn('mergeDE')), outline: ac('outline'),
    // lines of the line art page painted over the sprite (only while that page is available)
    useLineArt: chk('useLineArt') && pageEnabled('line'), laAmount: bn('laAmount'),
    laThin: settings.get('laThin'), laEdge: chk('laEdge'), laPerfect: chk('laPerfect'), laGaps: chk('laGaps'),
    laSmooth: bn('laSmooth'), laMinPiece: int(bn('laMinPiece'), 0, 1e6),
    minTone: Math.max(0, bn('mergeDE')), minMat: Math.max(0, bn('mergeDE')) * 1.5, cellCov: an('cellCov') / 100, lineStrong: an('lnStrong') / 100,
    spurs: int(an('spurs'), 0, 1000), speck: int(an('speck'), 0, 1e7),
    lWeight: an('lWeight'), shadeSat: an('shadeSat') / 100, outDark: an('outDark') / 100, outSat: an('outSat') / 100, outMaxL: an('outMaxL'), outBlack: an('outBlack'),
    kIter: int(an('kIter'), 1, 10000), seed: int(an('seed'), 0, 4294967295),
    // canvas & output: width and height chosen freely, never smaller than the sprite
    CW: Math.max(cw, TW), CH: Math.max(ch, TH),
    fx: Math.round(n('fx', 0)), fy: Math.round(bn('fy')), flipH: chk('flipH'),
    zoom: n('zoom', 2), dlScale: A ? n('dlScale', 4) : 4
  };
}

/* a size the browser cannot handle: returns the message to show, or '' */
export function tooBig(o) {
  if (o.TW * o.TH > MAX_CELLS) return `Un sprite de ${o.TW}×${o.TH} px es demasiado grande para generarlo en el navegador (hasta unos ${(MAX_CELLS / 1e6).toFixed(0)} millones de píxeles, por ejemplo 2000×2000).`;
  if (o.CW > MAX_SIDE || o.CH > MAX_SIDE || o.CW * o.CH > MAX_AREA) return `Un lienzo de ${o.CW}×${o.CH} px supera lo que el navegador puede dibujar (máximo ${MAX_SIDE} px por lado).`;
  return '';
}

/* where the sprite goes on the canvas: centred + fx, feet at fy, always kept inside the canvas.
   Returns the top-left corner and the fx / fy that really apply after keeping it inside. */
export function place(o) {
  const cx = Math.floor((o.CW - o.TW) / 2);
  const ox = Math.max(0, Math.min(o.CW - o.TW, cx + o.fx)), oy = Math.max(0, Math.min(o.CH - o.TH, o.fy - o.TH));
  return { ox, oy, fx: ox - cx, fy: oy + o.TH };
}

/* grow the canvas fields when the sprite no longer fits, and make the position fields show the position
   actually used. Fields being typed in are left alone. Returns true if the canvas grew. */
export function ensureCanvas() {
  const TW = spriteW(), TH = spriteH();
  let grew = false;
  const grow = (id, v) => { if (n(id, 0) < v && !settings.isFocused(id)) { settings.set(id, v, false); grew = true; } };
  grow('cw', TW); grow('chh', TH);
  const pl = place(readSettings());
  for (const [id, v] of [['fx', pl.fx], ['fy', pl.fy]]) if (!settings.isFocused(id) && n(id, NaN) !== v) settings.set(id, v, false);
  return grew;
}

/* keep the sprite size in the character's proportion; fromH = height is the fixed side.
   Returns the field the proportion lock changed ('tw' / 'th') or null. */
export function fitSize(fromH) {
  const b = bg.bbox(); if (!b || !settings.get('lock')) return null;
  const aspect = (b.x1 - b.x0) / (b.y1 - b.y0), r = !adv() && basicOf('tw');
  const [lo, hi] = r ? [Math.max(1, r[0]), r[1]] : [1, Infinity];
  const id = fromH ? 'tw' : 'th', before = String(settings.get(id));
  const v = fromH ? int(spriteH() * aspect, lo, hi) : int(spriteW() / aspect, lo, hi);
  settings.set(id, v, false);
  return String(v) !== before ? id : null;
}
