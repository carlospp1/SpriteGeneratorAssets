/** Sprites en canvas: medidas, recorte de los bordes transparentes, silueta y cambio de tono. */

export const ancho = (img) => img.naturalWidth || img.width;
export const alto = (img) => img.naturalHeight || img.height;

function nuevoCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function pixeles(img) {
  const c = nuevoCanvas(ancho(img), alto(img));
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

function canvasDe(datos) {
  const c = nuevoCanvas(datos.width, datos.height);
  c.getContext('2d').putImageData(datos, 0, 0);
  return c;
}

export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Mezcla un color con blanco (t > 0) o con negro (t < 0). */
export function aclarar(hex, t) {
  const destino = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return '#' + rgb(hex).map((v) => Math.round(v + (destino - v) * k).toString(16).padStart(2, '0')).join('');
}

// Los resultados se guardan por imagen: la escena se repinta a menudo (al arrastrar, al escribir).
const cache = new WeakMap();
function memo(img, clave, calcular) {
  let m = cache.get(img);
  if (!m) cache.set(img, (m = new Map()));
  if (!m.has(clave)) m.set(clave, calcular());
  return m.get(clave);
}

const UMBRAL = 8; // opacidad mínima (0-255) para que un píxel cuente como sprite

/** El sprite sin los bordes transparentes que lo rodean. */
export function recortar(img) {
  return memo(img, 'recorte', () => {
    const { width: w, height: h, data } = pixeles(img);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] <= UMBRAL) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return img;
    const c = nuevoCanvas(x1 - x0 + 1, y1 - y0 + 1);
    c.getContext('2d').drawImage(img, -x0, -y0);
    return c;
  });
}

/**
 * Silueta en pixel art: cada píxel del sprite pasa a ser de un único color.
 * contorno: color de un borde de 1 px por fuera (el canvas crece 1 px por cada lado), o null.
 */
export function silueta(img, { color = '#000000', contorno = null } = {}) {
  return memo(img, `silueta ${color} ${contorno}`, () => {
    const d = pixeles(img);
    const { width: w, height: h } = d;
    const p = contorno ? 1 : 0;
    const out = new ImageData(w + 2 * p, h + 2 * p);
    const dentro = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d.data[(y * w + x) * 4 + 3] > UMBRAL;
    const relleno = rgb(color);
    const borde = contorno && rgb(contorno);
    for (let y = -p; y < h + p; y++) {
      for (let x = -p; x < w + p; x++) {
        let c = null;
        if (dentro(x, y)) c = relleno;
        else if (borde && (dentro(x - 1, y) || dentro(x + 1, y) || dentro(x, y - 1) || dentro(x, y + 1))) c = borde;
        if (!c) continue;
        const o = ((y + p) * out.width + x + p) * 4;
        out.data.set([c[0], c[1], c[2], 255], o);
      }
    }
    return canvasDe(out);
  });
}

/** Gira el tono de todos los colores del sprite (para improvisar un shiny), sin tocar luz ni saturación. */
export function girarTono(img, grados) {
  if (!grados) return img;
  return memo(img, `tono ${grados}`, () => {
    const d = pixeles(img);
    const a = d.data;
    const giro = grados / 360;
    for (let o = 0; o < a.length; o += 4) {
      if (!a[o + 3]) continue;
      const r = a[o] / 255, g = a[o + 1] / 255, b = a[o + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, dd = max - min;
      if (!dd) continue; // gris: no tiene tono
      const s = dd / (1 - Math.abs(2 * l - 1));
      let hh = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      hh = (((hh / 6 + giro) % 1) + 1) % 1;
      const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hh * 6) % 2) - 1)), m = l - c / 2;
      const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hh * 6) % 6];
      a[o] = Math.round((r1 + m) * 255);
      a[o + 1] = Math.round((g1 + m) * 255);
      a[o + 2] = Math.round((b1 + m) * 255);
    }
    return canvasDe(d);
  });
}
