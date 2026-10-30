/**
 * «Sprite a la mitad»: un sprite de pixel art al 50 % sin colores mezclados. Si está dibujado con píxeles de 2×2
 * se reduce sin perder nada; si no, cada grupo de 2×2 pasa a un píxel dando prioridad al contorno en los bordes
 * de la figura y, dentro, al color dominante. Los colores son claves de texto: 'r,g,b' o 'T' (transparente).
 */

export const clave = (r, g, b, a) => (a < 128 ? 'T' : `${r},${g},${b}`);
export const rgbaDe = (k) => (k === 'T' ? [0, 0, 0, 0] : [...k.split(',').map(Number), 255]);
const luz = (k) => { if (k === 'T') return 999; const [r, g, b] = rgbaDe(k); return r * 0.3 + g * 0.59 + b * 0.11; };

/** El color del píxel x, y de { w, h, data }. */
export const pixel = (s, x, y) => { const i = (y * s.w + x) * 4, d = s.data; return clave(d[i], d[i + 1], d[i + 2], d[i + 3]); };

/**
 * Lo que hace falta saber del sprite: su paleta (de más a menos usado), el color de fondo (el más repetido en
 * las esquinas), el contorno (el color más oscuro que se usa bastante) y la alineación de la rejilla de 2×2 que
 * mejor encaja. limpio: estaba dibujado con píxeles de 2×2 (se reduce sin perder nada).
 */
export function analizar(s) {
  const cuenta = new Map();
  for (let i = 0; i < s.data.length; i += 4) {
    const k = clave(s.data[i], s.data[i + 1], s.data[i + 2], s.data[i + 3]);
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  }
  const paleta = [...cuenta].map(([k, n]) => ({ clave: k, n })).sort((a, b) => b.n - a.n);
  const esquinas = [[0, 0], [s.w - 1, 0], [0, s.h - 1], [s.w - 1, s.h - 1]].map(([x, y]) => pixel(s, x, y));
  const ce = {}; esquinas.forEach((k) => { ce[k] = (ce[k] || 0) + 1; });
  const fondo = Object.entries(ce).sort((a, b) => b[1] - a[1])[0][0];
  const contorno = new Set();
  const candidatos = paleta.filter((p) => p.clave !== fondo && p.clave !== 'T' && p.n >= Math.max(8, s.w * s.h * 0.01)).sort((a, b) => luz(a.clave) - luz(b.clave));
  if (candidatos.length && luz(candidatos[0].clave) < 70) contorno.add(candidatos[0].clave);
  let mejor = null;
  for (const oy of [0, 1]) for (const ox of [0, 1]) {
    let mal = 0;
    for (let y = oy; y + 1 < s.h; y += 2) for (let x = ox; x + 1 < s.w; x += 2) {
      const k = pixel(s, x, y);
      if (pixel(s, x + 1, y) !== k || pixel(s, x, y + 1) !== k || pixel(s, x + 1, y + 1) !== k) mal++;
    }
    if (!mejor || mal < mejor.mal) mejor = { ox, oy, mal };
  }
  return { paleta, fondo, contorno, desplazamiento: [mejor.ox, mejor.oy], limpio: mejor.mal === 0 };
}

/**
 * Reduce a la mitad con la rejilla desplazada (ox, oy: 0 o 1; con 1 la primera columna o fila va sola).
 * modo 'directo': un píxel de cada grupo; 'inteligente': fondo si casi todo es fondo, contorno si lo hay en el
 * borde de la figura, y si no el color que más se repite (a igualdad, el más raro del sprite: suele ser detalle).
 * Devuelve { w, h, claves }.
 */
export function reducir(s, { paleta, fondo, contorno }, [ox, oy], modo) {
  const sx = ox ? -1 : 0, sy = oy ? -1 : 0;
  const W = Math.ceil((s.w - sx) / 2), H = Math.ceil((s.h - sy) / 2);
  const claves = new Array(W * H);
  const rareza = new Map(paleta.map((p) => [p.clave, p.n]));
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const ks = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const x = sx + X * 2 + i, y = sy + Y * 2 + j;
      ks.push(x < 0 || y < 0 || x >= s.w || y >= s.h ? fondo : pixel(s, x, y));
    }
    let k;
    if (modo === 'directo') {
      // un píxel que esté dentro de la imagen: con la rejilla desplazada, el de abajo a la derecha siempre lo está
      k = sx || sy ? ks[3] : ks[0];
    } else {
      const c = new Map(); ks.forEach((q) => c.set(q, (c.get(q) || 0) + 1));
      const nf = c.get(fondo) || 0;
      let nc = 0, kc = null;
      for (const [q, n] of c) if (contorno.has(q) && n > nc) { nc = n; kc = q; }
      if (nf >= 3) k = fondo;
      else if (nc >= 2 || (nc >= 1 && nf >= 1)) k = kc;
      else {
        let resto = [...c.keys()].filter((q) => q !== fondo && !contorno.has(q));
        if (!resto.length) resto = [...c.keys()].filter((q) => q !== fondo);
        if (!resto.length) resto = [fondo];
        resto.sort((a, b) => c.get(b) - c.get(a) || rareza.get(a) - rareza.get(b));
        k = resto[0];
      }
    }
    claves[Y * W + X] = k;
  }
  return { w: W, h: H, claves };
}

/** Claves → ImageData; clavesDe(i) da la clave del píxel i (con los retoques y el fondo ya resueltos). */
export function aImagen(w, h, clavesDe) {
  const id = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) id.data.set(rgbaDe(clavesDe(i)), i * 4);
  return id;
}

/**
 * El tamaño de píxel con el que ya está dibujado el sprite (de una pasada anterior: 2×2, 4×4…): el mayor k para
 * el que todos los bloques enteros de k×k son de un solo color, con su rejilla (ox, oy: dónde empieza el primer
 * bloque entero). k = 1 si está dibujado a 1 px.
 */
export function detectarBloque(s) {
  for (const k of [16, 8, 4, 2]) {
    if (s.w < k * 2 || s.h < k * 2) continue;
    for (let oy = 0; oy < k; oy++) for (let ox = 0; ox < k; ox++) {
      let bien = true;
      for (let y = oy; y + k <= s.h && bien; y += k) for (let x = ox; x + k <= s.w && bien; x += k) {
        const c = pixel(s, x, y);
        for (let j = 0; j < k && bien; j++) for (let i = 0; i < k; i++) if (pixel(s, x + i, y + j) !== c) { bien = false; break; }
      }
      if (bien) return { k, ox, oy };
    }
  }
  return { k: 1, ox: 0, oy: 0 };
}

/**
 * El dibujo de verdad: un píxel por bloque de k×k. La rejilla empieza en x0 = ox - k (si ox > 0 el primer bloque
 * va cortado), así que el píxel X del dibujo es la columna x0 + X·k del original.
 */
export function colapsar(s, { k, ox, oy }) {
  if (k === 1) return s;
  const x0 = ox ? ox - k : 0, y0 = oy ? oy - k : 0;
  const w = Math.ceil((s.w - x0) / k), h = Math.ceil((s.h - y0) / k), data = new Uint8ClampedArray(w * h * 4);
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    // un píxel del bloque que esté dentro de la imagen (el de abajo a la derecha lo está siempre)
    const x = Math.min(s.w - 1, Math.max(0, x0 + X * k + k - 1)), y = Math.min(s.h - 1, Math.max(0, y0 + Y * k + k - 1));
    const o = (y * s.w + x) * 4;
    data.set(s.data.subarray(o, o + 4), (Y * w + X) * 4);
  }
  return { w, h, data };
}
