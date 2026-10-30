/* Reference image for the sprite size: reads the size of an image (and of its visible part, without
   transparent borders) and copies it to the sprite size, and optionally to the canvas and position. */
import { loadImage } from '../../engine/image.js';
import { settings } from '../../state/settings.js';
import { createValue } from '../../state/signal.js';
import { S, showMsg } from './state.js';
import { ensureCanvas } from './settings.js';
import { pipeline } from './pipeline.js';
import { project } from '../project/project.js';

/* { name, w, h, box: {x, y, w, h}, url, text }, box = the visible (non-transparent) part */
export const refImage = createValue(null);

/* bounding box of the pixels that are not (almost) transparent */
function visibleBox(img) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 16) {
    if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? { x: 0, y: 0, w: c.width, h: c.height } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function load(file) {
  let img;
  try { img = await loadImage(file); } catch { showMsg('No se pudo leer la imagen de referencia.'); return; }
  const w = img.naturalWidth, h = img.naturalHeight, box = visibleBox(img);
  const trimmed = box.w !== w || box.h !== h;
  const old = refImage.get(); if (old) URL.revokeObjectURL(old.url);
  refImage.set({ name: file.name, w, h, box, url: URL.createObjectURL(file),
    text: `${file.name ? file.name + ': ' : ''}${w}×${h} px` + (trimmed ? ` · parte visible ${box.w}×${box.h} px en (${box.x}, ${box.y})` : '') });
}

/* copy values; the sprite is re-placed / rebuilt by the usual pipeline */
function useSize(all) {
  const ref = refImage.get(); if (!ref) return;
  const { box } = ref, notes = [], vals = { tw: box.w, th: box.h };
  if (settings.get('lock')) { vals.lock = false; notes.push('«Mantener proporción» se ha desactivado para usar ancho y alto exactos.'); }
  if (all) Object.assign(vals, { cw: ref.w, chh: ref.h, fx: box.x - Math.floor((ref.w - box.w) / 2), fy: box.y + box.h });
  settings.setMany(vals, false);
  const done = all ? `Copiado de la referencia: sprite ${box.w}×${box.h} px en un lienzo de ${ref.w}×${ref.h} px.` : `Tamaño copiado de la referencia: ${box.w}×${box.h} px.`;
  if (S.rgba) pipeline.sprite([done, ...notes].join(' '));
  else { ensureCanvas(); showMsg([done, ...notes].join(' ')); }
  project.touch();
}

function clear() { const old = refImage.get(); if (old) URL.revokeObjectURL(old.url); refImage.set(null); }

export const reference = { load, useSize, clear };
