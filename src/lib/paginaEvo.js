/**
 * La página de evoluciones: un diseño propio, no la ficha del tipo. Marco y escenario en pixel art con los
 * colores del tipo, las etapas en columnas sobre pedestales, cómo evoluciona entre ellas y un recuadro de texto
 * abajo. Sin evoluciones, un solo pedestal: «Etapa única».
 * Una etapa puede tener varias formas (se evoluciona a una u otra): van una encima de otra, cada una en su
 * carril, y la forma que viene de ella en la etapa siguiente sigue en su mismo carril. Con una sola forma por
 * etapa, una fila de pedestales con un haz de luz (el de este Pokémon, más intenso).
 * El decorado se pinta a 1 px de lienzo y se amplía; sprites y textos se pintan ya a escala K.
 */
import { LIENZO } from '../data/campos';
import { colorTextoInsignia } from '../data/tipos';
import { FORMAS, forma, medir, placa, texto } from './pixel';
import { aclarar, alto, ancho, rgb } from './sprites';

const { w: W, h: H } = LIENZO;
const OSCURO = '#0f0b07';
const CREMA = '#f4ecc2';

/** Medidas de la página, en px de lienzo. */
export const EVO = {
  cielo: [36, 193], // de dónde a dónde va el escenario
  suelo: 146, // centro de los pedestales: ahí apoyan los pies
  descripcion: { x: 15, y: 201, w: 186, h: 56 },
};
const CAJA = { 1: [96, 78], 2: [84, 92], 3: [58, 84] }; // máximo ancho y alto de los sprites según cuántas etapas
const RADIO = { 1: 40, 2: 32, 3: 25 }; // radio de los pedestales
const ETIQUETAS = ['BÁSICO', 'FASE 1', 'FASE 2'];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

const centros = (n) => Array.from({ length: n }, (_, i) => 8 + (200 * (i + 0.5)) / n);
const ARRIBA = 47, ABAJO = 192;   // con varios carriles: de dónde a dónde van

/**
 * Dónde va cada forma. Carriles: tantos como formas tiene la etapa que más tiene. Las formas de la primera etapa
 * van centradas; las de las siguientes, alrededor de la forma de la que vienen, sin pisarse.
 * Devuelve { R, ancho y alto (máximos de un sprite), puestos: [etapa][forma] → { cx, suelo } }.
 */
export function disposicion(etapas) {
  const n = etapas.length, R = Math.max(...etapas.map((e) => e.formas.length));
  const carriles = [];
  etapas.forEach((e, i) => {
    const c = e.formas.length;
    let pos;
    if (i === 0) pos = e.formas.map((_, j) => (R - c) / 2 + j);
    else {
      // hijas de cada forma anterior, repartidas alrededor de ella
      const hijas = new Map();
      e.formas.forEach((f, j) => hijas.set(f.de, [...(hijas.get(f.de) || []), j]));
      pos = new Array(c);
      for (const [de, js] of hijas) js.forEach((j, k) => { pos[j] = carriles[i - 1][de] - (js.length - 1) / 2 + k; });
      // sin pisarse (al menos un carril entre dos) y dentro de los carriles
      const orden = pos.map((y, j) => [y, j]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (let k = 1; k < orden.length; k++) orden[k][0] = Math.max(orden[k][0], orden[k - 1][0] + 1);
      const sobra = Math.max(0, orden.at(-1)[0] - (R - 1)), falta = Math.max(0, -orden[0][0]);
      for (const o of orden) pos[o[1]] = o[0] - sobra + falta;
    }
    carriles.push(pos);
  });
  const xs = centros(n);
  if (R === 1) return { R, ancho: CAJA[n][0], alto: CAJA[n][1], puestos: etapas.map((_, i) => [{ cx: xs[i], suelo: EVO.suelo }]) };
  const fila = (ABAJO - ARRIBA) / R;
  return {
    // más estrechos que en una sola fila: entre columna y columna va la flecha
    R, ancho: Math.min(CAJA[n][0], (200 / n) * 0.55), alto: fila - 19,
    puestos: carriles.map((pos, i) => pos.map((y) => ({ cx: xs[i], suelo: Math.round(ARRIBA + fila * (y + 1) - 17) }))),
  };
}

/** Tonos del tipo, del más oscuro al más claro. */
const paleta = (c) => ({
  noche: aclarar(c, -0.84), oscuro: aclarar(c, -0.6), medio: aclarar(c, -0.3), base: c, claro: aclarar(c, 0.35), brillo: aclarar(c, 0.65),
});

/**
 * Tamaño común de la línea: el mayor con el que caben todas (así se nota cómo crecen). Múltiplo de 1/K
 * para que en la descarga cada píxel del sprite sea un bloque entero.
 */
export function zoomEvo(etapas, K, paso = 0) {
  const { ancho: bw, alto: bh } = disposicion(etapas);
  const ms = etapas.flatMap((e) => e.formas.filter((f) => f.img).map((f) => Math.floor(Math.min((bw * K) / ancho(f.img), (bh * K) / alto(f.img)))));
  const m = ms.length ? Math.min(...ms) : K;
  return Math.max(1, m + paso) / K;
}

/* ---------- el decorado, a 1 px de lienzo ---------- */

const decorados = new Map();
/* pedestales: [{ cx, suelo, r, mio }]; haces: con una sola fila, el haz de luz sobre cada pedestal */
function decorado(color, pedestales, haces) {
  const clave = `${color} ${haces} ${JSON.stringify(pedestales)}`;
  if (decorados.has(clave)) return decorados.get(clave);

  const datos = new ImageData(W, H);
  const rgbs = new Map();
  const pon = (x, y, hex) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    let c = rgbs.get(hex);
    if (!c) rgbs.set(hex, (c = rgb(hex)));
    datos.data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
  };
  const rect = (x0, y0, w, h, hex) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) pon(x, y, hex);
  };
  const p = paleta(color);

  // marco: borde oscuro, dos tonos del tipo con un filo claro y otra vez oscuro por dentro
  rect(0, 0, W, H, OSCURO);
  rect(1, 1, W - 2, H - 2, p.oscuro);
  rect(3, 3, W - 6, H - 6, p.base);
  rect(4, 4, W - 8, H - 8, p.claro);
  rect(5, 5, W - 10, H - 10, OSCURO);

  // cabecera y franja de abajo
  rect(6, 6, W - 12, 28, p.noche);
  rect(6, 6, W - 12, 1, p.oscuro);
  const [c0, c1] = EVO.cielo;
  rect(6, c0 - 2, W - 12, 1, p.base);
  rect(6, c0 - 1, W - 12, 1, p.claro);
  rect(6, c1 + 1, W - 12, 1, p.claro);
  rect(6, c1 + 2, W - 12, 1, p.base);
  rect(6, c1 + 3, W - 12, H - c1 - 9, p.noche);

  // escenario: degradado tramado de un tono medio del tipo (arriba) a casi negro (abajo)
  const tonos = [aclarar(color, -0.3), aclarar(color, -0.48), aclarar(color, -0.64), aclarar(color, -0.8)];
  for (let y = c0; y <= c1; y++) {
    const t = ((y - c0) / (c1 - c0)) * (tonos.length - 1);
    const i = Math.min(tonos.length - 2, Math.floor(t)), f = t - i;
    for (let x = 6; x < W - 6; x++) pon(x, y, f * 16 > BAYER[y % 4][x % 4] ? tonos[i + 1] : tonos[i]);
  }

  // haz de luz que baja sobre cada pedestal, tramado y más denso cerca del suelo
  if (haces) pedestales.forEach(({ cx, suelo, r, mio }) => {
    const media = r - 5;
    for (let y = c0; y < suelo; y++) {
      const d = ((y - c0) / (suelo - c0)) ** 1.3 * (mio ? 0.8 : 0.42);
      for (let x = Math.floor(cx - media); x <= cx + media; x++) {
        const e = 1 - Math.abs(x + 0.5 - cx) / media;
        if (d * Math.min(1, e * 1.6) * 16 > BAYER[y % 4][x % 4]) pon(x, y, mio ? p.brillo : p.claro);
      }
    }
  });

  // pedestales: tapa elíptica clara, lateral en tono medio y contorno oscuro
  pedestales.forEach(({ cx, suelo, r, mio }) => {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const u = (x + 0.5 - cx) / r;
      if (Math.abs(u) > 1) continue;
      const e = Math.sqrt(1 - u * u);
      const arriba = Math.round(suelo - 4 * e), abajo = Math.round(suelo + 4 * e);
      pon(x, arriba - 1, OSCURO);
      for (let y = arriba; y <= abajo; y++) {
        const dentro = (u * r) ** 2 / (r - 4) ** 2 + ((y + 0.5 - suelo) / 2.6) ** 2 < 1;
        pon(x, y, dentro && mio ? p.brillo : y === arriba ? p.brillo : p.claro);
      }
      for (let y = abajo + 1; y <= abajo + 5; y++) pon(x, y, (x + y) % 2 && y === abajo + 5 ? OSCURO : p.medio);
      pon(x, abajo + 6, OSCURO);
    }
  });

  // recuadro del texto, en crema como el de la ficha
  const { x: dx, y: dy, w: dw, h: dh } = EVO.descripcion;
  rect(dx - 2, dy - 2, dw + 4, dh + 4, OSCURO);
  rect(dx - 1, dy - 1, dw + 2, dh + 2, '#efe4bf');
  rect(dx - 1, dy - 1, dw + 2, 1, '#d6c79a');

  // remaches en las esquinas
  const remache = ['..1..', '.121.', '12221', '.121.', '..1..'];
  for (const [x, y] of [[0, 0], [W - 5, 0], [0, H - 5], [W - 5, H - 5]]) {
    remache.forEach((fila, j) => [...fila].forEach((ch, k) => ch !== '.' && pon(x + k, y + j, ch === '1' ? '#c99a2e' : '#ffe27a')));
  }

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d').putImageData(datos, 0, 0);
  decorados.set(clave, c);
  return c;
}

/* ---------- la página ---------- */

/* flecha de píxeles de (x0, y0) a (x1, y1): trazo de 2 px claro con borde oscuro y punta al final */
function flecha(ctx, K, x0, y0, x1, y1, claro) {
  const pasos = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const puntos = Array.from({ length: pasos + 1 }, (_, k) => [Math.round(x0 + ((x1 - x0) * k) / pasos), Math.round(y0 + ((y1 - y0) * k) / pasos)]);
  ctx.fillStyle = OSCURO;
  for (const [x, y] of puntos) ctx.fillRect((x - 1) * K, (y - 1) * K, 4 * K, 4 * K);
  ctx.fillStyle = claro;
  for (const [x, y] of puntos) ctx.fillRect(x * K, y * K, 2 * K, 2 * K);
  forma(ctx, K, ['1...', '11..', '121.', '1221', '121.', '11..', '1...'], Math.round(x1) + 1, Math.round(y1) - 2, OSCURO, CREMA);
}

/**
 * evo: { etapas: [{ actual, silueta, formas: [{ img, nombre, metodo, de, mia }] }], paso }
 * icono: el icono del tipo ya cargado (o null mientras carga).
 */
export function pintarPaginaEvo(ctx, K, { tipo, icono, evo }) {
  const { etapas } = evo;
  const n = etapas.length;
  const p = paleta(tipo.color);
  const { R, puestos } = disposicion(etapas);
  const r = R === 1 ? RADIO[n] : Math.round(RADIO[n] * 0.8);
  const pedestales = etapas.flatMap((e, i) => e.formas.map((f, j) => ({ ...puestos[i][j], r, mio: f.mia })));
  ctx.drawImage(decorado(tipo.color, pedestales, R === 1), 0, 0, W * K, H * K);

  // título con sombra y el icono del tipo a cada lado (Pixelify: Press Start no trae mayúsculas con tilde)
  const titulo = n === 1 ? 'ETAPA ÚNICA' : 'LÍNEA EVOLUTIVA';
  texto(ctx, K, titulo, W / 2 + 1, 21, { font: 'px', tam: 12, color: OSCURO });
  texto(ctx, K, titulo, W / 2, 20, { font: 'px', tam: 12, color: CREMA });
  if (icono) {
    ctx.drawImage(icono, 12 * K, 12 * K, 15 * K, 15 * K);
    ctx.drawImage(icono, (W - 27) * K, 12 * K, 15 * K, 15 * K);
  }

  const z = zoomEvo(etapas, K, evo.paso);
  const xs = centros(n);
  const hueco = 200 / n;
  const etiqueta = (i) => (n === 1 ? 'NO EVOLUCIONA' : ETIQUETAS[i]);
  const tono = (e) => (e.actual ? p.brillo : aclarar(CREMA, -0.25));

  // con varios carriles, la fase va arriba de cada columna
  if (R > 1) etapas.forEach((e, i) => texto(ctx, K, etiqueta(i), xs[i], ARRIBA - 5, { font: 'px', tam: 5, color: tono(e) }));

  etapas.forEach((e, i) => {
    e.formas.forEach((f, j) => {
      const { cx, suelo } = puestos[i][j];
      if (f.img) {
        const w = ancho(f.img) * z, h = alto(f.img) * z;
        ctx.drawImage(f.img, Math.round((cx - w / 2) * K), Math.round((suelo + 1 - h) * K), Math.round(w * K), Math.round(h * K));
      } else {
        // todavía sin sprite: un interrogante
        const tam = R === 1 ? 18 : 12;
        texto(ctx, K, '?', cx + 1, suelo - tam * 0.7, { font: 'ps', tam, color: OSCURO });
        texto(ctx, K, '?', cx, suelo - tam * 0.7 - 1, { font: 'ps', tam, color: p.claro });
      }
      // con una sola fila, la fase bajo el pedestal; luego la placa con el nombre (la de esta ficha, resaltada)
      if (R === 1) texto(ctx, K, etiqueta(i), cx, suelo + 14, { font: 'px', tam: 5, color: tono(e) });
      const t = { font: 'px', tam: R === 1 ? (n === 3 ? 6 : 7) : 5 };
      const pw = Math.min(hueco - 14, Math.ceil(medir(ctx, K, f.nombre, t)) + 8);
      const pl = R === 1 ? { x: Math.round(cx - pw / 2), y: suelo + 18, w: pw, h: 12 } : { x: Math.round(cx - pw / 2), y: suelo + 6, w: pw, h: 9 };
      placa(ctx, K, pl, f.mia ? tipo.color : e.silueta ? OSCURO : p.oscuro, f.mia ? p.brillo : CREMA);
      texto(ctx, K, f.nombre, cx, pl.y + pl.h / 2, { ...t, color: f.mia ? colorTextoInsignia(tipo.color) : CREMA, max: pw - 4 });
    });
  });

  // de cada forma a las que salen de ella: una flecha y cómo evoluciona (si se ha escrito)
  for (let i = 1; i < n; i++) {
    etapas[i].formas.forEach((f, j) => {
      const a = puestos[i - 1][f.de], b = puestos[i][j];
      if (R === 1) {
        const mx = (a.cx + b.cx) / 2;
        forma(ctx, K, FORMAS.flecha, Math.round(mx - 3), b.suelo + 20, p.claro, CREMA, OSCURO);
        if (!f.metodo) return;
        const t = { font: 'px', tam: 5 };
        const mw = Math.min(hueco + 10, Math.ceil(medir(ctx, K, f.metodo, t)) + 8);
        const pl = { x: Math.round(mx - mw / 2), y: b.suelo + 33, w: mw, h: 9 };
        placa(ctx, K, pl, p.noche, p.claro);
        texto(ctx, K, f.metodo, mx, pl.y + pl.h / 2, { ...t, color: CREMA, max: mw - 4 });
        return;
      }
      // varios carriles: flecha (recta o en diagonal) de una forma a la otra, a media altura de los sprites
      const x0 = a.cx + hueco * 0.3, x1 = b.cx - hueco * 0.3 - 4, y0 = a.suelo - 10, y1 = b.suelo - 10;
      flecha(ctx, K, x0, y0, x1, y1, p.claro);
      if (!f.metodo) return;
      const t = { font: 'px', tam: 5 }, mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - 6;
      texto(ctx, K, f.metodo, mx + 0.5, my + 0.5, { ...t, color: OSCURO, max: hueco * 0.6 });
      texto(ctx, K, f.metodo, mx, my, { ...t, color: CREMA, max: hueco * 0.6 });
    });
  }
}
