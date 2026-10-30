import { sinTinteFondo } from '../../engine/refinarFondo.js';

// El diseño son siempre dos figuras como mucho (front y back): las dos masas mayores, o la mayor partida en dos si
// las vistas se tocan; lo demás son piezas sueltas. La segunda tiene que medir al menos esta fracción de la mayor: si no, la imagen tiene una sola figura
// (y la segunda masa sería un texto o un icono).
const FRACCION_FIGURA = 0.2;
// Una pieza suelta (hoja, flor, brillo) es parte del diseño si está a esta distancia de una figura como
// mucho (fracción del lado mayor de la imagen). Lo que queda más lejos es «basura» de la hoja: títulos,
// textos, iconos, muestras de color, líneas… y se descarta.
const CERCANIA = 0.015;
// Piezas de menos píxeles se descartan (motas de ruido).
const PIEZA_MIN = 12;
// Margen transparente alrededor de cada recorte.
const MARGEN = 4;
const UMBRAL = 128;
/* the picture's colour at p, without the background's tint where the edge is half transparent */
const color = (data, p, a, fondo) => (fondo
  ? [sinTinteFondo(data[p * 4], fondo[0], a), sinTinteFondo(data[p * 4 + 1], fondo[1], a), sinTinteFondo(data[p * 4 + 2], fondo[2], a)]
  : [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]);

/** Zonas conectadas (8 vecinos) de la máscara: etiqueta por píxel y caja/área de cada zona. */
function componentes(mascara, W, H) {
  const etiqueta = new Int32Array(W * H).fill(-1);
  const zonas = [];
  const pila = new Int32Array(W * H);
  for (let inicio = 0; inicio < W * H; inicio++) {
    if (mascara[inicio] < UMBRAL || etiqueta[inicio] !== -1) continue;
    const z = { id: zonas.length, area: 0, x0: W, y0: H, x1: 0, y1: 0 };
    let n = 0;
    pila[n++] = inicio;
    etiqueta[inicio] = z.id;
    while (n) {
      const p = pila[--n];
      const x = p % W;
      const y = (p / W) | 0;
      z.area++;
      if (x < z.x0) z.x0 = x;
      if (x > z.x1) z.x1 = x;
      if (y < z.y0) z.y0 = y;
      if (y > z.y1) z.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx;
          if (mascara[q] >= UMBRAL && etiqueta[q] === -1) {
            etiqueta[q] = z.id;
            pila[n++] = q;
          }
        }
      }
    }
    zonas.push(z);
  }
  return { etiqueta, zonas };
}

// Líneas de la hoja (cuadrícula, divisores, guías): tramos horizontales o verticales de al menos esta fracción
// del ancho (o alto) y de este grosor como mucho (fracción del lado mayor). Los cruces de la cuadrícula se saltan.
const LINEA_LARGO = 0.1;
const LINEA_GROSOR = 0.004;
// Si las dos vistas se tocan, la máscara se adelgaza hasta este radio (fracción del lado mayor) buscando que se
// partan; las dos partes tienen que ser parecidas (en área y en alto) y estar una al lado de la otra.
const ADELGAZAR_MAX = 0.25;
const FRACCION_PARTIDA = 0.35;
const ALTO_PARECIDO = 0.65;  // las dos vistas de una hoja miden casi lo mismo de alto
// Agujeros cerrados dentro de una figura de menos de esta fracción de su área se rellenan.
const AGUJERO_MAX = 0.004;

/** La máscara sin las líneas rectas y finas de la hoja (0 donde había línea). */
function sinLineas(mascara, W, H) {
  const g = Math.max(3, Math.round(Math.max(W, H) * LINEA_GROSOR));
  const on = (p) => mascara[p] >= UMBRAL;
  // grosor de cada píxel en vertical y en horizontal (largo del tramo de máscara que lo contiene)
  const alto = new Uint16Array(W * H), ancho = new Uint16Array(W * H);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; ) {
      if (!on(y * W + x)) { y++; continue; }
      let y1 = y; while (y1 < H && on(y1 * W + x)) y1++;
      for (let k = y; k < y1; k++) alto[k * W + x] = Math.min(65535, y1 - y);
      y = y1;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; ) {
      if (!on(y * W + x)) { x++; continue; }
      let x1 = x; while (x1 < W && on(y * W + x1)) x1++;
      for (let k = x; k < x1; k++) ancho[y * W + k] = Math.min(65535, x1 - x);
      x = x1;
    }
  const quitar = new Uint8Array(W * H);
  // a lo largo de una fila (o columna): tramos de píxeles finos, que pueden saltar huecos de hasta g (los cruces)
  const tramos = (n, largo, idx, fino) => {
    let ini = -1, ult = -1;
    const cerrar = () => { if (ini >= 0 && ult - ini + 1 >= largo) for (let k = ini; k <= ult; k++) if (on(idx(k))) quitar[idx(k)] = 1; };
    for (let k = 0; k < n; k++) {
      const p = idx(k);
      if (on(p) && fino(p)) {
        if (ini >= 0 && k - ult - 1 > g) { cerrar(); ini = -1; }
        if (ini < 0) ini = k;
        ult = k;
      } else if (ini >= 0 && k - ult > g) { cerrar(); ini = -1; }
    }
    cerrar();
  };
  const largoH = Math.max(20, Math.round(W * LINEA_LARGO)), largoV = Math.max(20, Math.round(H * LINEA_LARGO));
  for (let y = 0; y < H; y++) tramos(W, largoH, (k) => y * W + k, (p) => alto[p] <= g);
  for (let x = 0; x < W; x++) tramos(H, largoV, (k) => k * W + x, (p) => ancho[p] <= g);
  const salida = Uint8ClampedArray.from(mascara);
  for (let p = 0; p < W * H; p++) if (quitar[p]) salida[p] = 0;
  return salida;
}

/** Distancia (en píxeles, aproximada) de cada píxel de la máscara al fondo más cercano. */
function distancias(mascara, W, H) {
  const d = new Float32Array(W * H);
  const INF = 1e9, D = Math.SQRT2;
  for (let p = 0; p < W * H; p++) d[p] = mascara[p] >= UMBRAL ? INF : 0;
  const v = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x; if (!d[p]) continue;
      d[p] = Math.min(d[p], v(x - 1, y) + 1, v(x, y - 1) + 1, v(x - 1, y - 1) + D, v(x + 1, y - 1) + D);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const p = y * W + x; if (!d[p]) continue;
      d[p] = Math.min(d[p], v(x + 1, y) + 1, v(x, y + 1) + 1, v(x + 1, y + 1) + D, v(x - 1, y + 1) + D);
    }
  return d;
}

/**
 * Los núcleos de las figuras (hasta dos): listas de píxeles. Si las dos mayores zonas ya están separadas, son ellas;
 * si no, la máscara se adelgaza poco a poco hasta que la figura mayor se parte en dos vistas parecidas, una al
 * lado de la otra. Si no se parte, hay una sola figura.
 */
function buscarNucleos(mascara, W, H, etiqueta, zonas) {
  const orden = [...zonas].sort((a, b) => b.area - a.area);
  const mayor = orden[0];
  if (vistas(mayor, orden[1], FRACCION_FIGURA)) return pixeles(etiqueta, [mayor.id, orden[1].id], W * H);
  // una sola zona grande: ¿son dos vistas que se tocan?
  return partirZona(mascara, W, H, etiqueta, mayor) || pixeles(etiqueta, [mayor.id], W * H);
}

/* los píxeles de cada una de las zonas ids */
function pixeles(et, ids, n) {
  const listas = ids.map(() => []);
  for (let p = 0; p < n; p++) { const k = ids.indexOf(et[p]); if (k >= 0) listas[k].push(p); }
  return listas;
}

/* una zona que son dos vistas que se tocan: se adelgaza hasta que se parte en dos vistas parecidas, una al lado
   de la otra; devuelve los núcleos de las dos (listas de píxeles) o null si no se parte */
function partirZona(mascara, W, H, etiqueta, zona) {
  // only inside the zone's box (its nearest background is always inside it or just outside)
  const { x0, y0 } = zona, w = zona.x1 - x0 + 1, h = zona.y1 - y0 + 1;
  const local = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (etiqueta[(y + y0) * W + x + x0] === zona.id) local[y * w + x] = 255;
  const d = distancias(local, w, h), tope = Math.max(W, H) * ADELGAZAR_MAX;
  const fina = new Uint8ClampedArray(w * h);
  for (let r = 1; r <= tope; r = Math.ceil(r * 1.5)) {
    for (let p = 0; p < w * h; p++) fina[p] = d[p] > r ? 255 : 0;
    const c = componentes(fina, w, h), o = c.zonas.sort((a, b) => b.area - a.area);
    if (!o[1]) { if (!o[0]) break; continue; }
    if (vistas(o[0], o[1], FRACCION_PARTIDA))
      return pixeles(c.etiqueta, [o[0].id, o[1].id], w * h).map((l) => l.map((p) => (((p / w) | 0) + y0) * W + (p % w) + x0));
  }
  return null;
}

// Lo que la IA mira en la imagen entera para elegir el front y el back: las zonas de al menos esta fracción de
// la mayor (como mucho estas), y la mayor partida en sus dos vistas si son dos que se tocan.
const CANDIDATA_MIN = 0.03;
const MAX_CANDIDATAS = 24;
// Recuadros (detalles, fotos, paneles): zonas que llenan casi toda su caja. No son una vista del personaje.
const RECUADRO = 0.85;
// Una candidata más ancha que esto (respecto a su alto) puede ser dos vistas que se tocan: se intenta partir.
const ANCHA = 0.8;

/* caja y área de una lista de píxeles */
function zonaDe(lista, W, H) {
  const c = { area: lista.length, x0: W, y0: H, x1: -1, y1: -1 };
  for (const p of lista) { const x = p % W, y = (p / W) | 0; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y; }
  return c;
}

/* las candidatas, como listas de píxeles (de mayor a menor); partir: solo se intenta partir en dos esas zonas (ids) */
function listaCandidatas(mascara, W, H, etiqueta, zonas, partir = null) {
  const orden = [...zonas].sort((a, b) => b.area - a.area);
  const recuadro = (z) => z.area >= (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1) * RECUADRO;
  const sinRecuadros = orden.filter((z) => !recuadro(z));
  const mayor = sinRecuadros[0];
  if (!mayor) return [];
  const elegidas = sinRecuadros.filter((z) => z.area >= mayor.area * CANDIDATA_MIN && z.area >= PIEZA_MIN).slice(0, MAX_CANDIDATAS);
  const listas = pixeles(etiqueta, elegidas.map((z) => z.id), W * H);
  // the wide ones may be two views that touch: each split in its two views, each with the pixels closer to it
  const salida = [];
  elegidas.forEach((z, k) => {
    if (z.x1 - z.x0 < (z.y1 - z.y0) * ANCHA || z.area < mayor.area * 0.3 || (partir && !partir.has(z.id))) { salida.push(listas[k]); return; }
    const partes = partirZona(mascara, W, H, etiqueta, z);
    if (partes) {
      const { cerca } = repartir(mascara, W, H, partes), dos = [[], []];
      for (const p of listas[k]) if (cerca[p] >= 0) dos[cerca[p]].push(p);
      // already shared out they must still look like two views (two wings of one figure do not)
      if (vistas(zonaDe(dos[0], W, H), zonaDe(dos[1], W, H), FRACCION_FIGURA)) { salida.push(...dos); return; }
    }
    salida.push(listas[k]);
  });
  return salida;
}

/**
 * Todo lo que hay en la imagen que podría ser el front o el back (personajes, pero también textos, iconos…), para
 * que la IA lo mire y elija. Cada una: su recorte (fondo transparente), su caja, su área y un punto suyo.
 * @returns {{ recorte: ImageData, caja: {x0,y0,x1,y1}, area: number, punto: [number, number] }[]}
 */
export function candidatas(img, mascaraOriginal) {
  const { data, width: W, height: H } = img;
  const mascara = sinLineas(mascaraOriginal, W, H);
  const { etiqueta, zonas } = componentes(mascara, W, H);
  if (!zonas.length) return [];
  return listaCandidatas(mascara, W, H, etiqueta, zonas).map((lista) => {
    const c = zonaDe(lista, W, H);
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, recorte = new ImageData(w, h);
    for (const p of lista) {
      const o = (((p / W) | 0) - c.y0) * w + (p % W) - c.x0;
      recorte.data.set([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]], o * 4);
      recorte.data[o * 4 + 3] = (data[p * 4 + 3] * mascara[p]) / 255;
    }
    const m = lista[lista.length >> 1];
    return { recorte, caja: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }, area: c.area, punto: [m % W, (m / W) | 0] };
  });
}

/* los núcleos de las figuras elegidas por la IA: la candidata que contiene cada punto (o la más cercana) */
function nucleosDePuntos(mascara, W, H, etiqueta, zonas, puntos) {
  // only the zones under the points can hold a view split in two: the others are not tried (it is slow)
  const pixel = ([x, y]) => Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)));
  const partir = new Set(puntos.map((pt) => etiqueta[pixel(pt)]).filter((z) => z >= 0));
  const listas = listaCandidatas(mascara, W, H, etiqueta, zonas, partir), de = new Int32Array(W * H).fill(-1);
  listas.forEach((l, i) => { for (const p of l) de[p] = i; });
  const cajas = listas.map((l) => zonaDe(l, W, H));
  const indice = puntos.map(([x, y]) => {
    const p = pixel([x, y]);
    if (de[p] >= 0) return de[p];
    let mejor = -1, dmin = Infinity;
    cajas.forEach((c, i) => { const d = Math.hypot(Math.max(0, c.x0 - x, x - c.x1), Math.max(0, c.y0 - y, y - c.y1)); if (d < dmin) { dmin = d; mejor = i; } });
    return mejor;
  });
  if (indice.some((i) => i < 0) || new Set(indice).size !== indice.length) return null;
  // the other candidates (other views, poses, close-ups) belong to no figure
  return { nucleos: indice.map((i) => listas[i]), otras: listas.filter((_, i) => !indice.includes(i)) };
}

/* dos zonas ({ area, x0, y0, x1, y1 }) son el front y el back si se parecen en tamaño y alto y están una al lado
   de la otra: no un ala o una cola sueltas, ni una parte encima de otra */
function vistas(a, b, fraccion) {
  if (!a || !b) return false;
  if (a.area < b.area) [a, b] = [b, a];
  if (b.area < a.area * fraccion) return false;
  const solape = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), ha = a.y1 - a.y0, hb = b.y1 - b.y0;
  return solape <= Math.min(a.x1 - a.x0, b.x1 - b.x0) * 0.5 && Math.min(ha, hb) >= Math.max(ha, hb) * ALTO_PARECIDO;
}

/** Reparte la máscara entre los núcleos: cada píxel va con el núcleo al que llega antes sin salir de la máscara. */
function repartir(mascara, W, H, nucleos, bloqueo = null) {
  const cerca = new Int32Array(W * H).fill(-1), cola = new Int32Array(W * H);
  let fin = 0;
  nucleos.forEach((lista, i) => { for (const p of lista) { cerca[p] = i; cola[fin++] = p; } });
  for (let ini = 0; ini < fin; ini++) {
    const p = cola[ini], x = p % W;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
      if (q < 0 || q >= W * H || cerca[q] !== -1 || mascara[q] < UMBRAL || (bloqueo && bloqueo[q])) continue;
      cerca[q] = cerca[p]; cola[fin++] = q;
    }
  }
  return { cerca };
}

// Sombras y restos pegados a la figura: del color del fondo, algo más oscuros (hasta esta diferencia de
// luminosidad Lab) y casi sin otro tono; en la parte de abajo de la figura (esta fracción de su alto) o finos.
const SOMBRA_OSCURA = 38;
const SOMBRA_TONO = 12;
const SOMBRA_ABAJO = 0.35;

const lab = (r, g, b) => {
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), y = f(R * 0.2126 + G * 0.7152 + B * 0.0722), z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

/** El color más repetido en el borde de la imagen (el fondo de la hoja). */
function colorDeFondo(data, W, H) {
  const cuenta = new Map();
  let mejor = [255, 255, 255], max = 0;
  const ver = (p) => {
    const k = ((data[p * 4] >> 3) << 10) | ((data[p * 4 + 1] >> 3) << 5) | (data[p * 4 + 2] >> 3);
    const n = (cuenta.get(k) || 0) + 1; cuenta.set(k, n);
    if (n > max) { max = n; mejor = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]; }
  };
  for (let x = 0; x < W; x++) { ver(x); ver((H - 1) * W + x); }
  for (let y = 1; y < H - 1; y++) { ver(y * W); ver(y * W + W - 1); }
  return mejor;
}

/** Quita (de figuraDe y de la máscara) la sombra del suelo y los restos finos del color del fondo que tocan fuera. */
function quitarSombras(mascara, figuraDe, data, W, H, n, fondo) {
  const [L0, a0, b0] = lab(fondo[0], fondo[1], fondo[2]);
  const g = Math.max(3, Math.round(Math.max(W, H) * LINEA_GROSOR));
  const d = distancias(mascara, W, H);
  const cajas = Array.from({ length: n }, () => ({ y0: H, y1: -1 }));
  for (let p = 0; p < W * H; p++) { const f = figuraDe[p]; if (f < 0) continue; const y = (p / W) | 0; if (y < cajas[f].y0) cajas[f].y0 = y; if (y > cajas[f].y1) cajas[f].y1 = y; }
  const corte = cajas.map((c) => c.y1 - (c.y1 - c.y0) * SOMBRA_ABAJO);
  const puede = (p) => {
    const f = figuraDe[p];
    if (f < 0 || (p / W | 0) < corte[f] && d[p] > g) return false;
    const [L, a, b] = lab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]), oscura = L0 - L;
    return oscura >= -3 && oscura <= SOMBRA_OSCURA && Math.hypot(a - a0, b - b0) <= SOMBRA_TONO;
  };
  const fuera = new Uint8Array(W * H), cola = new Int32Array(W * H);
  let fin = 0;
  for (let p = 0; p < W * H; p++) {
    if (figuraDe[p] < 0) continue;
    const x = p % W;
    const toca = (x > 0 && figuraDe[p - 1] < 0) || (x < W - 1 && figuraDe[p + 1] < 0) || (p >= W && figuraDe[p - W] < 0) || (p < W * (H - 1) && figuraDe[p + W] < 0);
    if (toca && puede(p)) { fuera[p] = 1; cola[fin++] = p; }
  }
  for (let ini = 0; ini < fin; ini++) {
    const p = cola[ini], x = p % W;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W])
      if (q >= 0 && q < W * H && !fuera[q] && puede(q)) { fuera[q] = 1; cola[fin++] = q; }
  }
  for (let p = 0; p < W * H; p++) if (fuera[p]) { figuraDe[p] = -1; mascara[p] = 0; }
}

/** Rellena (en figuraDe) los agujeros cerrados pequeños de cada figura; devuelve 1 en los píxeles rellenados.
    Lo que se quitó a propósito (quitado: puntos de fondo, «todo el tono», zonas, pinceles, huecos) no se rellena. */
function rellenarAgujeros(figuraDe, W, H, n, quitado = null) {
  const relleno = new Uint8Array(W * H), visto = new Uint8Array(W * H), cola = new Int32Array(W * H);
  for (let f = 0; f < n; f++) {
    let area = 0;
    for (let p = 0; p < W * H; p++) if (figuraDe[p] === f) area++;
    visto.fill(0);
    // lo que no es de la figura y se alcanza desde el borde de la imagen es fuera; lo demás, agujeros
    let fin = 0;
    const meter = (p) => { if (!visto[p] && figuraDe[p] !== f) { visto[p] = 1; cola[fin++] = p; } };
    for (let x = 0; x < W; x++) { meter(x); meter((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { meter(y * W); meter(y * W + W - 1); }
    for (let ini = 0; ini < fin; ini++) {
      const p = cola[ini], x = p % W;
      if (x > 0) meter(p - 1); if (x < W - 1) meter(p + 1); if (p >= W) meter(p - W); if (p < W * (H - 1)) meter(p + W);
    }
    for (let p0 = 0; p0 < W * H; p0++) {
      if (visto[p0] || figuraDe[p0] === f) continue;
      const zona = [p0]; visto[p0] = 1;
      for (let k = 0; k < zona.length; k++) {
        const p = zona[k], x = p % W;
        for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W])
          if (q >= 0 && q < W * H && !visto[q] && figuraDe[q] !== f) { visto[q] = 1; zona.push(q); }
      }
      if (zona.length <= area * AGUJERO_MAX) for (const p of zona) if (!quitado?.[p]) { figuraDe[p] = f; relleno[p] = 1; }
    }
  }
  return relleno;
}

/**
 * Separa las figuras de la imagen en recortes independientes con fondo transparente,
 * ordenadas de izquierda a derecha.
 * @param {ImageData} img
 * @param {Uint8ClampedArray} mascara  255 = figura, 0 = fondo (valores intermedios: borde suave)
 * @param {{ suavizado: number, fondo?: number[] }} opciones  radio (px) del suavizado del borde (0 = sin suavizar);
 *   fondo: color del fondo, para quitar su tinte del borde
 * @returns {{ recortes: ImageData[], cajas: {x0,y0,x1,y1}[], mapa: Int32Array }} de izquierda a derecha;
 *   cajas: dónde está cada figura en la imagen; mapa: índice de figura de cada píxel (-1 = ninguna)
 */
export function separarFiguras(img, mascaraOriginal, { suavizado = 0, fondo = null, puntos = null, quitado = null }) {
  const { data, width: W, height: H } = img;
  // lo que la máscara tiene de líneas de la hoja (cuadrícula, divisores, guías) no es de ninguna figura
  const mascara = sinLineas(mascaraOriginal, W, H);
  const { etiqueta, zonas } = componentes(mascara, W, H);
  if (!zonas.length) return { recortes: [], cajas: [], mapa: new Int32Array(W * H).fill(-1) };

  // los núcleos de las dos figuras: separadas, las dos zonas mayores; si se tocan (una cola que roza la otra
  // vista, una sombra común), se adelgaza la máscara hasta que se parten en dos
  // (o las que la IA eligió mirando la imagen entera: puntos = un punto del front y otro del back)
  const deIA = puntos && nucleosDePuntos(mascara, W, H, etiqueta, zonas, puntos);
  const nucleos = deIA ? deIA.nucleos : buscarNucleos(mascara, W, H, etiqueta, zonas);
  const bloqueo = deIA ? new Uint8Array(W * H) : null;
  if (deIA) for (const l of deIA.otras) for (const p of l) bloqueo[p] = 1;
  const figuras = nucleos.map((_, i) => ({ id: -1 - i }));
  const { cerca: dueño } = repartir(mascara, W, H, nucleos, bloqueo);
  if (nucleos.length === 2 && !deIA) {
    // ya repartidas, las dos tienen que seguir pareciendo dos vistas (dos alas de una sola figura no lo son)
    const z = [0, 1].map(() => ({ area: 0, x0: W, y0: H, x1: -1, y1: -1 }));
    for (let p = 0; p < W * H; p++) {
      const f = dueño[p]; if (f < 0) continue;
      const c = z[f], x = p % W, y = (p / W) | 0;
      c.area++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
    }
    if (!vistas(z[0], z[1], FRACCION_FIGURA)) { for (let p = 0; p < W * H; p++) if (dueño[p] === 1) dueño[p] = 0; nucleos.pop(); figuras.pop(); }
  }
  const grupo = new Int32Array(zonas.length).fill(-1); // zona -> índice de figura (-1 = descartada)
  const propio = new Int32Array(W * H).fill(-1);       // píxel -> figura, por dentro de las zonas de los núcleos
  for (let p = 0; p < W * H; p++) if (etiqueta[p] !== -1 && dueño[p] !== -1) propio[p] = dueño[p];
  for (let p = 0; p < W * H; p++) if (propio[p] !== -1 || (bloqueo && bloqueo[p])) grupo[etiqueta[p]] = -2;   // zona ya repartida (o de otra vista)
  // dónde empieza y acaba cada figura en alto: lo que queda por encima de su cabeza o debajo de sus pies
  // (títulos, rótulos, nombres) no es suyo
  const pies = new Int32Array(nucleos.length).fill(-1), cabeza = new Int32Array(nucleos.length).fill(H);
  for (let p = 0; p < W * H; p++) {
    const f = propio[p]; if (f === -1) continue;
    const y = (p / W) | 0; if (y > pies[f]) pies[f] = y; if (y < cabeza[f]) cabeza[f] = y;
  }

  // Distancia a la figura más cercana, solo hasta el límite de cercanía (búsqueda en anchura desde sus píxeles).
  const limite = Math.max(6, Math.round(Math.max(W, H) * CERCANIA));
  const cerca = new Int32Array(W * H).fill(-1);
  const dist = new Uint16Array(W * H);
  const cola = new Int32Array(W * H);
  let fin = 0;
  for (let p = 0; p < W * H; p++) {
    if (propio[p] !== -1) {
      cerca[p] = propio[p];
      cola[fin++] = p;
    }
  }
  for (let ini = 0; ini < fin; ini++) {
    const p = cola[ini];
    if (dist[p] >= limite) continue;
    const x = p % W;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
      if (q < 0 || q >= W * H || cerca[q] !== -1) continue;
      cerca[q] = cerca[p];
      dist[q] = dist[p] + 1;
      cola[fin++] = q;
    }
  }
  // Cada pieza va con la figura a la que tiene el píxel más cercano; si ninguno está a tiro, se descarta.
  const mejor = new Uint16Array(zonas.length).fill(65535);
  for (let p = 0; p < W * H; p++) {
    const z = etiqueta[p];
    if (z === -1 || zonas[z].area < PIEZA_MIN || grupo[z] === -2 || cerca[p] === -1) continue;
    const medio = (zonas[z].y0 + zonas[z].y1) / 2;
    if (medio > pies[cerca[p]] || medio < cabeza[cerca[p]]) continue;
    if (dist[p] < mejor[z]) {
      mejor[z] = dist[p];
      grupo[z] = cerca[p];
    }
  }

  // Los bordes semitransparentes (máscara < 128) se quedan con la figura del vecino etiquetado.
  const figuraDe = new Int32Array(W * H).fill(-1);
  for (let p = 0; p < W * H; p++) figuraDe[p] = propio[p] !== -1 ? propio[p] : etiqueta[p] !== -1 && grupo[etiqueta[p]] >= 0 ? grupo[etiqueta[p]] : -1;
  // lo que toca el fondo y es del color del fondo algo oscurecido (la sombra en el suelo, restos de la cuadrícula)
  quitarSombras(mascara, figuraDe, data, W, H, figuras.length, fondo || colorDeFondo(data, W, H));
  // la silueta, entera: los agujeritos cerrados dentro de cada figura (brillos de los ojos, motas que la IA o la
  // tolerancia dejaron a medias) se rellenan; los huecos de verdad (entre las patas) son mayores y se quedan
  const relleno = rellenarAgujeros(figuraDe, W, H, figuras.length, quitado);
  for (let pasada = 0; pasada < 2; pasada++) {
    const antes = figuraDe.slice();
    for (let p = 0; p < W * H; p++) {
      if (antes[p] !== -1 || mascara[p] === 0 || mascaraOriginal[p] === 0) continue;
      const x = p % W;
      const vecinos = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W];
      for (const q of vecinos) if (q >= 0 && q < W * H && antes[q] !== -1) { figuraDe[p] = antes[q]; break; }
    }
  }

  const cajas = figuras.map(() => ({ x0: W, y0: H, x1: -1, y1: -1 }));
  for (let p = 0; p < W * H; p++) {
    const f = figuraDe[p];
    if (f === -1) continue;
    const x = p % W;
    const y = (p / W) | 0;
    const c = cajas[f];
    if (x < c.x0) c.x0 = x;
    if (x > c.x1) c.x1 = x;
    if (y < c.y0) c.y0 = y;
    if (y > c.y1) c.y1 = y;
  }

  const base = Uint8ClampedArray.from(mascara);
  for (let p = 0; p < W * H; p++) if (relleno[p]) base[p] = 255;
  const alfa = suavizarBorde(base, W, H, suavizado);
  const recortes = cajas.map((c, f) => {
    const w = c.x1 - c.x0 + 1 + MARGEN * 2;
    const h = c.y1 - c.y0 + 1 + MARGEN * 2;
    const out = new ImageData(w, h);
    for (let y = c.y0; y <= c.y1; y++)
      for (let x = c.x0; x <= c.x1; x++) {
        const p = y * W + x;
        if (figuraDe[p] !== f) continue;
        const m = alfa[p];
        const o = ((y - c.y0 + MARGEN) * w + (x - c.x0 + MARGEN)) * 4;
        out.data.set(color(data, p, m, fondo), o);
        out.data[o + 3] = relleno[p] ? data[p * 4 + 3] : (data[p * 4 + 3] * m) / 255;
      }
    return { recorte: out, caja: c, f, cx: (c.x0 + c.x1) / 2 };
  });
  recortes.sort((a, b) => a.cx - b.cx);
  const orden = new Int32Array(figuras.length);
  recortes.forEach((r, i) => (orden[r.f] = i));
  for (let p = 0; p < W * H; p++) if (figuraDe[p] !== -1) figuraDe[p] = orden[figuraDe[p]];
  return { recortes: recortes.map((r) => r.recorte), cajas: recortes.map((r) => r.caja), mapa: figuraDe };
}

/**
 * Una figura recortada a mano alzada: lo que es figura (máscara ≥ 128) dentro de la zona dibujada, ajustado a
 * su tamaño. La zona puede tener cualquier forma, así que rodea colas u hojas que se cruzan con la otra figura.
 * @param {ImageData} img
 * @param {Uint8ClampedArray} mascara  255 = figura, 0 = fondo
 * @param {Uint8Array} zona  1 = dentro de lo dibujado (mismo tamaño que la imagen)
 * @param {{ suavizado: number, fondo?: number[] }} opciones
 * @returns {{ recorte: ImageData, caja: {x0,y0,x1,y1}, dentro: Uint8Array } | null}  null si dentro no hay nada
 */
export function figuraEnZona(img, mascara, zona, { suavizado = 0, fondo = null }) {
  const { data, width: W, height: H } = img;
  const dentro = new Uint8Array(W * H);
  const c = { x0: W, y0: H, x1: -1, y1: -1 };
  for (let p = 0; p < W * H; p++) {
    if (!zona[p] || !mascara[p]) continue;
    dentro[p] = 1;
    const x = p % W;
    const y = (p / W) | 0;
    if (x < c.x0) c.x0 = x;
    if (x > c.x1) c.x1 = x;
    if (y < c.y0) c.y0 = y;
    if (y > c.y1) c.y1 = y;
  }
  if (c.x1 < 0) return null;
  // el suavizado se calcula solo con esta figura, para que el borde del corte también quede suave
  const propia = new Uint8ClampedArray(W * H);
  for (let p = 0; p < W * H; p++) if (dentro[p]) propia[p] = mascara[p];
  const alfa = suavizarBorde(propia, W, H, suavizado);
  const w = c.x1 - c.x0 + 1 + MARGEN * 2;
  const h = c.y1 - c.y0 + 1 + MARGEN * 2;
  const out = new ImageData(w, h);
  for (let y = c.y0; y <= c.y1; y++)
    for (let x = c.x0; x <= c.x1; x++) {
      const p = y * W + x;
      if (!dentro[p]) continue;
      const o = ((y - c.y0 + MARGEN) * w + (x - c.x0 + MARGEN)) * 4;
      out.data.set(color(data, p, alfa[p], fondo), o);
      out.data[o + 3] = (data[p * 4 + 3] * alfa[p]) / 255;
    }
  return { recorte: out, caja: c, dentro };
}

/**
 * Borde suave hacia dentro: la máscara se difumina (dos pasadas de caja, casi gaussiano) y se queda con el
 * mínimo entre lo difuminado y lo original. El borde se funde sin crecer hacia el fondo, así que no aparece
 * halo del color del fondo alrededor de la figura. El borde suave que ya traiga la máscara se conserva.
 */
function suavizarBorde(mascara, W, H, radio) {
  const duro = Uint8ClampedArray.from(mascara);
  const r = Math.round(radio);
  if (r <= 0) return duro;
  const a = Float32Array.from(duro);
  const tmp = new Float32Array(W * H);
  const lado = 2 * r + 1;
  for (let pasada = 0; pasada < 2; pasada++) {
    for (let y = 0; y < H; y++) {
      let suma = 0;
      for (let x = -r; x <= r; x++) suma += a[y * W + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = suma / lado;
        suma += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let suma = 0;
      for (let y = -r; y <= r; y++) suma += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = suma / lado;
        suma += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
  }
  const salida = new Uint8ClampedArray(W * H);
  for (let p = 0; p < W * H; p++) salida[p] = Math.min(duro[p], Math.round(a[p]));
  return salida;
}

// Huecos cerrados del color del fondo (entre las patas, dentro de la cola…) se quitan si miden al menos esta
// fracción de la imagen; los más pequeños (brillos de los ojos) se respetan.
const HUECO_MIN = 0.0004;

/**
 * Quita de la máscara de Forja (S.mask: 1 figura, 0 fondo) los huecos cerrados del color del fondo, que el relleno
 * desde los bordes no alcanza. Respeta los puntos «No es fondo» y lo pintado con los pinceles.
 * @param {object} S  estado con w, h, rgba, mask, edits, bgSeeds
 * @param {number} tol  tolerancia de color (la del fondo)
 */
export function quitarHuecos(S, tol) {
  const { w: W, h: H, rgba, mask } = S;
  const t2 = tol * tol;
  const d2 = (i, j) => {
    const dr = rgba[i * 4] - rgba[j * 4], dg = rgba[i * 4 + 1] - rgba[j * 4 + 1], db = rgba[i * 4 + 2] - rgba[j * 4 + 2];
    return dr * dr + dg * dg + db * db;
  };
  // color de fondo de referencia: el más repetido en el borde
  const borde = [];
  for (let x = 0; x < W; x++) borde.push(x, (H - 1) * W + x);
  for (let y = 1; y < H - 1; y++) borde.push(y * W, y * W + W - 1);
  const cuenta = new Map();
  let ref = borde[0], max = 0;
  for (const p of borde) {
    const k = ((rgba[p * 4] >> 3) << 10) | ((rgba[p * 4 + 1] >> 3) << 5) | (rgba[p * 4 + 2] >> 3);
    const n = (cuenta.get(k) || 0) + 1; cuenta.set(k, n);
    if (n > max) { max = n; ref = p; }
  }
  const protegido = new Uint8Array(W * H);
  for (const sd of S.bgSeeds) {
    if (sd.type !== 'keep') continue;
    protegido[Math.min(H - 1, Math.max(0, Math.floor(sd.y))) * W + Math.min(W - 1, Math.max(0, Math.floor(sd.x)))] = 1;
  }
  const visto = new Uint8Array(W * H);
  for (let p0 = 0; p0 < W * H; p0++) {
    if (visto[p0] || !mask[p0] || d2(p0, ref) > t2) continue;
    const zona = [p0];
    let respetar = false;
    visto[p0] = 1;
    for (let k = 0; k < zona.length; k++) {
      const p = zona[k];
      if (protegido[p]) respetar = true;
      const x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q < 0 || q >= W * H || visto[q] || !mask[q] || d2(q, ref) > t2) continue;
        visto[q] = 1; zona.push(q);
      }
    }
    if (!respetar && zona.length >= W * H * HUECO_MIN) for (const p of zona) { mask[p] = 0; if (S.quitado) S.quitado[p] = 1; }
  }
  // lo pintado a mano manda
  const { edits } = S;
  if (edits) for (let i = 0; i < mask.length; i++) if (edits[i] === 1) mask[i] = 1; else if (edits[i] === 2) mask[i] = 0;
}

/**
 * El fondo dentro de un recorte hecho a mano (a mano alzada, rectángulo o clics de IA), por tolerancia: el color
 * más repetido justo por fuera del recorte es el fondo (si el recorte llega al borde de la imagen, el de su propio
 * borde), y desde los puntos del borde del recorte de ese color se rellena hacia dentro todo lo parecido. Con huecos, también las zonas cerradas de ese color (entre las patas…).
 * Lo devuelto con el pincel («Pincel: devolver») nunca es fondo.
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} img
 * @param {Uint8Array} zona  1 dentro del recorte
 * @param {number} tol  tolerancia de color (0: no se quita nada)
 * @param {{ huecos?: boolean, edits?: Uint8Array }} opciones
 * @returns {Uint8Array}  1 donde es fondo
 */
export function fondoEnZona(img, zona, tol, { huecos = false, edits = null } = {}) {
  const { data, width: W, height: H } = img, n = W * H;
  const fondo = new Uint8Array(n);
  if (!(tol > 0)) return fondo;
  const d2 = (i, j) => {
    const dr = data[i * 4] - data[j * 4], dg = data[i * 4 + 1] - data[j * 4 + 1], db = data[i * 4 + 2] - data[j * 4 + 2];
    return dr * dr + dg * dg + db * db;
  };
  // el borde del recorte: lo de dentro que toca lo de fuera (o el borde de la imagen)
  const borde = [];
  for (let p = 0; p < n; p++) {
    if (!zona[p]) continue;
    const x = p % W, y = (p / W) | 0;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !zona[p - 1] || !zona[p + 1] || !zona[p - W] || !zona[p + W]) borde.push(p);
  }
  if (!borde.length) return fondo;
  // color de fondo de referencia: el más repetido en un anillo de 3 px por fuera del recorte (en un recorte de
  // IA su propio borde es el contorno de la figura); sin anillo, el del borde del recorte
  const anillo = [];
  for (const p of borde) {
    const x = p % W, y = (p / W) | 0;
    for (let k = 1; k <= 3; k++)
      for (const [qx, qy] of [[x - k, y], [x + k, y], [x, y - k], [x, y + k]])
        if (qx >= 0 && qy >= 0 && qx < W && qy < H && !zona[qy * W + qx]) anillo.push(qy * W + qx);
  }
  const cuenta = new Map(), muestras = anillo.length ? anillo : borde;
  let ref = muestras[0], max = 0;
  for (const p of muestras) {
    const k = ((data[p * 4] >> 3) << 10) | ((data[p * 4 + 1] >> 3) << 5) | (data[p * 4 + 2] >> 3);
    const c = (cuenta.get(k) || 0) + 1; cuenta.set(k, c);
    if (c > max) { max = c; ref = p; }
  }
  const t2 = tol * tol, lejos = (tol * DERIVA_ZONA) ** 2;
  const puede = q => zona[q] && !fondo[q] && edits?.[q] !== 1;
  // relleno desde el borde: paso a paso parecido al vecino, sin alejarse demasiado del color del fondo
  const cola = new Int32Array(n);
  let qh = 0, qt = 0;
  for (const p of borde) if (puede(p) && d2(p, ref) <= t2) { fondo[p] = 1; cola[qt++] = p; }
  while (qh < qt) {
    const p = cola[qh++], x = p % W;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p + W < n ? p + W : -1]) {
      if (q < 0 || !puede(q) || d2(p, q) > t2 || d2(q, ref) > lejos) continue;
      fondo[q] = 1; cola[qt++] = q;
    }
  }
  if (huecos) {
    // zonas cerradas del color del fondo, si no son diminutas (los brillos de los ojos se respetan)
    const visto = new Uint8Array(n);
    for (let p0 = 0; p0 < n; p0++) {
      if (visto[p0] || !puede(p0) || d2(p0, ref) > t2) continue;
      const trozo = [p0]; visto[p0] = 1;
      for (let k = 0; k < trozo.length; k++) {
        const p = trozo[k], x = p % W;
        for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p + W < n ? p + W : -1]) {
          if (q < 0 || visto[q] || !puede(q) || d2(q, ref) > t2) continue;
          visto[q] = 1; trozo.push(q);
        }
      }
      if (trozo.length >= n * HUECO_MIN) for (const p of trozo) fondo[p] = 1;
    }
  }
  return fondo;
}
// cuánto puede alejarse del color del fondo un píxel alcanzado poco a poco (× tolerancia), para los degradados
const DERIVA_ZONA = 2.5;
