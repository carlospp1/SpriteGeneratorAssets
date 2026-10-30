/* Image loading and the working frame (crop). The working image is always re-rendered from the
   original, so cropping a small area of a big picture gains resolution instead of losing it.
   createImage(state) works on a state object (the generator's or the line art's). state.maxSide (a number, or a function of the crop's w, h) overrides MAXSIDE; state.upscale also enlarges small pictures. */
import { rgb2lab } from './color.js';

export const MAXSIDE = 800;   // longest side of the working image

/* decode an image file / blob */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

export function createImage(S) {
function makeFrame(x, y, w, h) {
  const side = typeof S.maxSide === 'function' ? S.maxSide(w, h) : S.maxSide || MAXSIDE, k = S.upscale ? side / Math.max(w, h) : Math.min(1, side / Math.max(w, h));
  return { x, y, w, h, k, ww: Math.max(1, Math.round(w * k)), wh: Math.max(1, Math.round(h * k)) };
}
const fullFrame = () => makeFrame(0, 0, S.img.naturalWidth, S.img.naturalHeight);
const isFull = () => !S.frame || (S.frame.x === 0 && S.frame.y === 0 && S.frame.w === S.img.naturalWidth && S.frame.h === S.img.naturalHeight);

function render(frame) {
  const c = document.createElement('canvas'); c.width = frame.ww; c.height = frame.wh;
  const cx = c.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(S.img, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.ww, frame.wh);
  S.frame = frame; S.w = frame.ww; S.h = frame.wh;
  S.rgba = cx.getImageData(0, 0, S.w, S.h).data;
  const n = S.w * S.h; S.lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb2lab(S.rgba[i * 4], S.rgba[i * 4 + 1], S.rgba[i * 4 + 2], S.lab, i * 3);
}

/* move markers, background points and brush edits from frame o to frame n */
function remap(o, n) {
  const s = n.k / o.k;
  const P = (x, y) => [(o.x + x / o.k - n.x) * n.k, (o.y + y / o.k - n.y) * n.k];
  const inside = (x, y) => x >= 0 && y >= 0 && x < n.ww && y < n.wh;
  S.markers = S.markers.flatMap(m => {
    const [x, y] = P(m.x, m.y); if (!inside(x, y)) return [];
    const r = { ...m, x, y };
    if (m.type === 'eye') { r.rx = m.rx * s; r.ry = m.ry * s; }
    if (m.type === 'dot') [r.x2, r.y2] = P(m.x2, m.y2);
    return [r];
  });
  S.bgSeeds = S.bgSeeds.flatMap(sd => {
    const [x, y] = P(sd.x, sd.y), r = { ...sd, x, y };
    if (sd.type === 'cut') { r.rx = sd.rx * s; r.ry = sd.ry * s; return x + r.rx > 0 && y + r.ry > 0 && x - r.rx < n.ww && y - r.ry < n.wh ? [r] : []; }
    return inside(x, y) ? [r] : [];
  });
  const ed = new Uint8Array(n.ww * n.wh), old = S.edits;
  if (old) for (let y = 0; y < n.wh; y++) {
    const oy = Math.floor(((y + 0.5) / n.k + n.y - o.y) * o.k); if (oy < 0 || oy >= o.wh) continue;
    for (let x = 0; x < n.ww; x++) {
      const ox = Math.floor(((x + 0.5) / n.k + n.x - o.x) * o.k); if (ox < 0 || ox >= o.ww) continue;
      ed[y * n.ww + x] = old[oy * o.ww + ox];
    }
  }
  S.edits = ed;
}

function setFrame(frame) {
  S.selected = null;
  if (S.frame) remap(S.frame, frame); else S.edits = new Uint8Array(frame.ww * frame.wh);
  render(frame);
}

/* source: the original file/blob, kept so the design can be saved and reopened */
function start(img, source) {
  S.img = img; S.source = source; S.frame = null; S.markers = []; S.bgSeeds = []; S.edits = null; S.cropDraft = null; S.colorMap = {}; S.lineColorMap = {}; S.lineEdits = null;
  setFrame(fullFrame());
}

/* reopen a saved design exactly as it was (frame, markers, background points and brush edits) */
function restore(img, source, saved) {
  S.img = img; S.source = source; S.cropDraft = null; S.selected = null;
  const f = saved.frame;
  render(makeFrame(f.x, f.y, f.w, f.h));
  S.markers = saved.markers.map(m => ({ ...m }));
  S.bgSeeds = saved.bgSeeds.map(sd => ({ ...sd }));
  S.edits = saved.edits && saved.edits.length === S.w * S.h ? new Uint8Array(saved.edits) : new Uint8Array(S.w * S.h);
  const le = saved.lineEdits;   // retouches of the line art on the sprite
  S.lineEdits = le && le.a ? { TW: le.TW, TH: le.TH, a: new Uint8Array(le.a) } : null;
}

function clear() {
  Object.assign(S, { img: null, source: null, frame: null, w: 0, h: 0, rgba: null, lab: null, mask: null, edits: null,
    bgSeeds: [], markers: [], cropDraft: null, selected: null, colorMap: {}, lineColorMap: {}, lineEdits: null, matIdx: null, clusters: null, sprite: null });
}

return { start, restore, clear, makeFrame, fullFrame, isFull, setFrame };
}
