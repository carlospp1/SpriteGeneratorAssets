/* Separar figuras: a design sheet (front and back views on a plain background, with titles, texts and colour
   swatches around) becomes one transparent PNG per view. It reuses the generator's pieces on its own state,
   like the line art: image + crop, background removal with points / zones / brushes / AI clicks, the source
   canvas and its tools.
   Each view can be cut by hand: freehand around it, or with clicks that the AI turns into the exact shape of the
   figure. A view cut by hand is that zone (any shape, so tails or leaves that cross the other view are no
   problem); the other view stays exactly as it was until it is cut too. The working image keeps the original
   size (up to 2048 px) because the figures are cut from it. */
import { createImage, loadImage } from '../../engine/image.js';
import { createBg } from '../../engine/background.js';
import { settings, SEP_IDS } from '../../state/settings.js';
import { createSignal, createValue } from '../../state/signal.js';
import { createSourceView } from '../source/view.js';
import { createSourceTools } from '../source/tools.js';
import { crearHistorial } from '../source/historial.js';
import { leerIA, guardarIA } from '../source/cacheIA.js';
import { mascaraParaPagina, fondoGuardado, mascaraGuardada } from '../source/iaFondo.js';
import { segmentar } from '../source/iaSam.js';
import { notificar } from '../source/notificaciones.js';
import { download } from '../../app/files.js';
import { separarFiguras, figuraEnZona, quitarHuecos, candidatas, fondoEnZona } from './figuras.js';
import { elegirVistas } from './ia.js';
import { imageIn } from '../../components/ui.jsx';

const LADO_MAX = 2048;
const ROLES = ['front', 'back'];
const otro = rol => (rol === 'front' ? 'back' : 'front');

/* same shape as the generator state, so the shared components can work on it */
export const F = {
  img: null, source: null, frame: null, w: 0, h: 0, rgba: null, lab: null, mask: null, edits: null,
  bgSeeds: [], markers: [], tool: 'none', view: 'cut', drag: null, cropDraft: null, selected: null, colorMap: {},
  maxSide: (w, h) => Math.min(LADO_MAX, Math.max(w, h)),
  nombre: 'figuras',
  figuras: [], cajas: [], mapa: null,   // left to right: the cut-outs, where they are, figure of each pixel
  // views cut by hand: { zona: 1/0 per pixel, lazo: [[x, y]…] (freehand), rect: {x0, y0, x1, y1} (rectangle) or
  // puntos: [{x, y, dentro}] (AI clicks) }
  vistas: { front: null, back: null },
  // a view not cut by hand keeps the figure it had when the other one was cut: { recorte, caja, dentro, ver, suave }
  congeladas: { front: null, back: null },
  lazoDraft: null, vistasFrame: null,   // the freehand line being drawn; the crop the views belong to
  rectDrag: null,                       // the rectangle being drawn or adjusted: { rol, h, b0, x0, y0, b }
  maskVer: 0,                           // grows with every change of the background
  fijo: null,                           // with views cut by hand the roles are given: true = the front is the right one
  manual: null,                         // chosen by clicking «Marcar»: true = the front is the right one (null: not chosen)
  iaDerecha: null, iaImg: null,         // the same, decided by the AI (once per picture / crop); null: not decided
  iaFrame: null,
  // what the AI chose looking at the whole sheet: a point of the front and one of the back (in working pixels)
  elegidas: null
};
export const sepSignal = createSignal();      // lists, tools and buttons
export const figSignal = createSignal();      // the figures or which one is the front changed
export const sepMsg = createValue('');
const msg = t => sepMsg.set(t || '');
const $v = id => settings.get('sep-' + id);

/* ---------- front / back ---------- */
export const NOMBRES = [['Front', 'front'], ['Back', 'back']];
/* the front is the right-hand figure: views cut by hand first, then the clicks of «Marcar», then the AI, else
   the usual order (left = front) */
export const frenteDerecha = () => F.fijo ?? F.manual ?? F.iaDerecha ?? false;
export const origen = () => (F.fijo != null ? 'recorte' : F.manual != null ? 'mano' : F.iaDerecha != null ? 'ia' : 'orden');
/* role of the figure at position i (left to right): 0 front, 1 back */
export const papel = i => (frenteDerecha() ? 1 - i : i);
const hayVistas = () => !!(F.vistas.front || F.vistas.back);
/* figure i (left to right) gets role p (0 front, 1 back) */
function elegir(i, p) {
  if (F.figuras.length !== 2 || papel(i) === p) return;
  if (hayVistas()) { cambiarRoles(); return; }   // the views cut by hand say which is which: swap them
  F.manual = (i === 1) === (p === 0);
  figSignal.bump(); view.draw(); historial.schedule(); sesion.guardar();
}
function intercambiar() {
  if (F.figuras.length !== 2) return;
  if (hayVistas()) { cambiarRoles(); return; }
  F.manual = !frenteDerecha(); figSignal.bump(); view.draw(); historial.schedule(); sesion.guardar();
}
function cambiarRoles() {
  F.vistas = { front: F.vistas.back, back: F.vistas.front };
  F.congeladas = { front: F.congeladas.back, back: F.congeladas.front };
  sepSignal.bump(); schedule(0); historial.schedule();
}

const image = createImage(F), bg = createBg(F);
export const view = createSourceView({ S: F, onDraw: dibujar });

/* ---------- the figures ---------- */
/* the mask for cutting: the AI's soft edge where its answer stands, fully opaque where it was retouched */
const mascaraActual = () => {
  const m = new Uint8ClampedArray(F.mask.length), ia = $v('bgRemove') && $v('bgAI') ? fondoGuardado(F) : null;
  for (let i = 0; i < m.length; i++) m[i] = F.mask[i] ? (ia && ia.mask[i] ? ia.alfa[i] : 255) : 0;
  return m;
};
const opcionesRecorte = () => ({ suavizado: settings.num('sep-smooth', 1), fondo: ($v('bgRemove') && $v('bgAI') && fondoGuardado(F)?.fondo) || null });
function figures() {
  if (!F.rgba || !F.mask) return;
  const img = { data: F.rgba, width: F.w, height: F.h }, mascara = mascaraActual();
  const opciones = opcionesRecorte();
  if (hayVistas()) figurasAMano(img, mascara, opciones);
  else {
    // the two views the AI found looking at the whole sheet (once it has looked), else the two biggest things
    const el = F.elegidas && F.iaImg === F.img && F.iaFrame === F.frame ? F.elegidas : null;
    const r = separarFiguras(img, mascara, { ...opciones, puntos: el ? [el.frente, el.espalda] : null, quitado: F.quitado });
    F.figuras = r.recortes; F.cajas = r.cajas; F.mapa = r.mapa; F.fijo = null;
    F.congeladas = { front: null, back: null };
    if (el && r.recortes.length === 2) F.iaDerecha = figuraEn(el.frente) === 1;
  }
  figSignal.bump(); view.draw(); sesion.guardar();
  // the AI looks at the whole sheet by itself, once per picture / crop, to find the front and the back
  if (F.mask && (F.iaImg !== F.img || F.iaFrame !== F.frame)) elegirConIA(img, mascara);
}
/* the figure (left to right) at a point, or the one whose box is closest */
function figuraEn([x, y]) {
  const px = Math.max(0, Math.min(F.w - 1, Math.round(x))), py = Math.max(0, Math.min(F.h - 1, Math.round(y)));
  const i = F.mapa ? F.mapa[py * F.w + px] : -1;
  if (i >= 0) return i;
  const d = b => Math.hypot(Math.max(0, b.x0 - px, px - b.x1), Math.max(0, b.y0 - py, py - b.y1));
  return d(F.cajas[0]) <= d(F.cajas[1]) ? 0 : 1;
}

/* ---------- front / back by the AI, looking at the whole sheet ---------- */
async function elegirConIA(img, mascara) {
  const pic = F.img, frame = F.frame;
  F.iaImg = pic; F.iaFrame = frame; F.iaDerecha = null; F.elegidas = null;
  // everything on the sheet that could be a view: creatures, but also texts, icons, swatches
  const cands = candidatas(img, mascara);
  if (cands.length < 2) return;   // only one thing: one figure, nothing to choose
  try {
    const r = await elegirVistas(cands);
    if (F.img !== pic || F.frame !== frame) return;
    if (!r) { notificar('La IA no ve dos personajes en la imagen: se usan las dos figuras más grandes.', 'aviso'); return; }
    F.elegidas = { frente: cands[r.frente].punto, espalda: cands[r.espalda].punto };
    sesion.guardar();
    schedule(0);
  } catch (e) {
    if (F.img !== pic || F.frame !== frame) return;
    // cancelled: this picture keeps the two biggest figures in the usual order (it is not asked again); a failure:
    // shown, asked next time
    if (e.name === 'AbortError') notificar('Cancelado: se usan las dos figuras más grandes, front y back por posición (izquierda = front).', 'aviso');
    else { F.iaImg = null; notificar('La IA no ha podido buscar el front y el back: ' + e.message); }
  }
}
let timer = 0;
const schedule = (delay = 60) => { clearTimeout(timer); timer = setTimeout(figures, delay); };

/* each view cut by hand comes from its zone; the other one stays as it was (frozen) */
function figurasAMano(img, mascara, opciones) {
  const resultado = [];
  for (const rol of ROLES) {
    const v = F.vistas[rol], c = F.congeladas[rol];
    if (v) {
      const r = figuraEnZona(img, mascara, zonaSinFondo(img, v), opciones);
      if (r) resultado.push({ rol, ...r });
    } else if (c) {
      // untouched while the background is the same; if the background changed, the same pixels again
      if (c.ver === F.maskVer && c.suave === opciones.suavizado) resultado.push({ rol, recorte: c.recorte, caja: c.caja, dentro: c.dentro });
      else {
        const r = figuraEnZona(img, mascara, c.dentro, opciones);
        if (r) { resultado.push({ rol, ...r }); F.congeladas[rol] = { ...r, ver: F.maskVer, suave: opciones.suavizado }; }
      }
    }
  }
  resultado.sort((a, b) => (a.caja.x0 + a.caja.x1) - (b.caja.x0 + b.caja.x1));   // left to right, as on the sheet
  F.figuras = resultado.map(v => v.recorte); F.cajas = resultado.map(v => v.caja);
  F.fijo = resultado.length === 2 ? resultado[0].rol === 'back' : null;
  F.mapa = new Int32Array(F.w * F.h).fill(-1);
  resultado.forEach((v, i) => { for (let p = 0; p < F.mapa.length; p++) if (v.dentro[p]) F.mapa[p] = i; });
}

/* the zone of a view cut by hand (freehand, rectangle or AI clicks) without the background inside it, with the
   same «Quitar el fondo» and «Tolerancia del fondo» of step 2 (from the edge of the cut inwards, plus the closed
   holes when «Quitar huecos cerrados» is on). With the background AI on, its mask already did it. */
function zonaSinFondo(img, v) {
  const tol = +$v('tol');
  if (!$v('bgRemove') || $v('bgAI') || !(tol > 0)) return v.zona;
  const clave = tol + '|' + !!$v('holes') + '|' + F.maskVer;
  if (v.sinFondo && v.sinFondo.clave === clave) return v.sinFondo.zona;
  const fondo = fondoEnZona(img, v.zona, tol, { huecos: !!$v('holes'), edits: F.edits });
  const zona = new Uint8Array(v.zona.length);
  for (let p = 0; p < zona.length; p++) zona[p] = v.zona[p] && !fondo[p] ? 1 : 0;
  v.sinFondo = { clave, zona };
  return zona;
}

/* a view of role rol is now cut by hand: the other one keeps the figure it has now */
function ponerVista(rol, vista) {
  const o = otro(rol);
  if (!F.vistas[o] && !F.congeladas[o]) {
    const i = F.figuras.findIndex((_, k) => NOMBRES[papel(k)][1] === o);
    if (i >= 0 && F.mapa) {
      const dentro = new Uint8Array(F.w * F.h);
      for (let p = 0; p < dentro.length; p++) if (F.mapa[p] === i) dentro[p] = 1;
      F.congeladas[o] = { recorte: F.figuras[i], caja: F.cajas[i], dentro, ver: F.maskVer, suave: settings.num('sep-smooth', 1) };
    }
  }
  F.vistas = { ...F.vistas, [rol]: vista };
  F.manual = null;
  sepSignal.bump(); schedule(0); historial.schedule();
}
function quitarVistas() {
  F.vistas = { front: null, back: null }; F.congeladas = { front: null, back: null }; F.lazoDraft = null;
  sepSignal.bump(); schedule(0); historial.schedule();
}

/* ---------- drawing over the original ---------- */
const colores = c => {
  const e = getComputedStyle(c);
  return { front: e.getPropertyValue('--accent').trim() || '#E4572E', back: e.getPropertyValue('--mark').trim() || '#2F6FD6' };
};
/* a tint of the zone of a view cut with the AI (made once per zone) */
function tinte(v, color) {
  if (v.tinte && v.tinte.color === color) return v.tinte.canvas;
  const c = document.createElement('canvas'); c.width = F.w; c.height = F.h;
  const x = c.getContext('2d'), id = x.createImageData(F.w, F.h);
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) || 0);
  for (let p = 0; p < v.zona.length; p++) if (v.zona[p]) id.data.set([r, g, b, 70], p * 4);
  x.putImageData(id, 0, 0);
  v.tinte = { color, canvas: c };
  return c;
}
/* a rectangle cut: tinted, with its 8 handles while its tool is on (to adjust it) */
function dibujarRect(cx, b, color, lw, asas) {
  cx.save();
  cx.globalAlpha = 0.1; cx.fillStyle = color; cx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  cx.globalAlpha = 0.95; cx.lineWidth = lw * 1.5; cx.strokeStyle = color; cx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  if (asas) {
    const s = view.geom.HANDLE * view.geom.cssScale();
    cx.globalAlpha = 1; cx.lineWidth = Math.max(1, s / 4);
    for (const [x, y] of Object.values(view.geom.boxHandles(b))) {
      cx.fillStyle = '#fff'; cx.fillRect(x - s, y - s, s * 2, s * 2); cx.strokeRect(x - s, y - s, s * 2, s * 2);
    }
  }
  cx.restore();
}
function dibujar() {
  const c = view.canvas;
  if (!c || !F.img || F.tool === 'crop' || c.width !== F.w) return;
  const cx = c.getContext('2d'), lw = Math.max(2, F.w / 400), fs = Math.max(14, F.w / 45), col = colores(c);
  for (const rol of ROLES) {
    const v = F.vistas[rol]; if (!v) continue;
    cx.save();
    if (v.lazo) {
      cx.beginPath(); v.lazo.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.closePath();
      cx.globalAlpha = 0.1; cx.fillStyle = col[rol]; cx.fill();
      cx.globalAlpha = 0.95; cx.lineWidth = lw * 1.5; cx.lineJoin = 'round'; cx.strokeStyle = col[rol]; cx.stroke();
    } else if (v.rect) {
      const b = F.rectDrag?.rol === rol && F.rectDrag.b ? F.rectDrag.b : v.rect;
      dibujarRect(cx, b, col[rol], lw, F.tool === RECT_DE[rol]);
    } else if (v.puntos) {
      if (col[rol].startsWith('#')) cx.drawImage(tinte(v, col[rol]), 0, 0);
      for (const p of v.puntos) {   // the clicks: + inside, − outside
        cx.beginPath(); cx.arc(p.x, p.y, lw * 4, 0, Math.PI * 2);
        cx.fillStyle = p.dentro ? col[rol] : '#222'; cx.fill(); cx.lineWidth = lw; cx.strokeStyle = '#fff'; cx.stroke();
      }
    }
    cx.restore();
  }
  if (F.lazoDraft && F.lazoDraft.puntos.length > 1) {
    cx.save(); cx.beginPath(); F.lazoDraft.puntos.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y)));
    cx.lineWidth = lw * 1.5; cx.lineJoin = 'round'; cx.strokeStyle = col[F.lazoDraft.rol]; cx.stroke(); cx.restore();
  }
  const d = F.rectDrag;
  if (d && d.b && !F.vistas[d.rol]?.rect) dibujarRect(cx, d.b, col[d.rol], lw, false);
  if (F.figuras.length !== 2) return;
  F.cajas.forEach((b, i) => {
    const p = papel(i), color = col[NOMBRES[p][1]], m = lw * 3;
    cx.save();
    cx.lineWidth = lw; cx.strokeStyle = color; cx.setLineDash([lw * 4, lw * 3]);
    cx.strokeRect(b.x0 - m, b.y0 - m, b.x1 - b.x0 + m * 2, b.y1 - b.y0 + m * 2);
    cx.setLineDash([]);
    const texto = NOMBRES[p][0].toUpperCase();
    cx.font = `700 ${fs}px "Nunito Sans", system-ui, sans-serif`;
    const tw = cx.measureText(texto).width, pad = fs * 0.35, y = Math.max(0, b.y0 - m - fs - pad * 2);
    cx.fillStyle = color; cx.fillRect(b.x0 - m, y, tw + pad * 2, fs + pad * 2);
    cx.fillStyle = '#fff'; cx.textBaseline = 'top'; cx.fillText(texto, b.x0 - m + pad, y + pad);
    cx.restore();
  });
}

/* ---------- background ---------- */
const pipeline = {
  mask() {
    if (!F.rgba) return;
    // the views cut by hand belong to a crop of the sheet: a new crop clears them
    if (F.frame !== F.vistasFrame) { F.vistasFrame = F.frame; F.vistas = { front: null, back: null }; F.congeladas = { front: null, back: null }; sepSignal.bump(); }
    // background by tolerance (plus the closed pockets of its colour), or the AI's mask (once per picture / crop)
    // when «Quitar el fondo con IA» is on; the zones and retouches go on top. No frame peeling: design sheets have
    // no frames, and a tight crop would peel the figures.
    const tol = +$v('tol'), remove = !!$v('bgRemove');
    const ai = remove && $v('bgAI') ? mascaraParaPagina(F, () => pipeline.mask()) : false;
    if (ai === null) { F.mask = null; F.figuras = []; figSignal.bump(); view.draw(); return; }   // the AI is working
    if (ai) bg.compute({ remove: true, aiMask: ai, island: 0.4 });
    else {
      bg.compute({ remove: remove && tol > 0, tol, drift: 3.5, frame: false, island: 0.4, alphaMin: 128, globalTol: 1.6 });
      if (remove && tol > 0 && $v('holes')) quitarHuecos(F, tol);
    }
    pipeline.maskEdited();
  },
  maskEdited() { F.maskVer++; view.draw(); schedule(); historial.schedule(); },
  sprite() {}
};
const base = createSourceTools({
  S: F, view, image, bg, pipeline, signal: sepSignal,
  brush: () => settings.num('sep-brush', 20), bgGlobal: () => !!$v('bgGlobal'), cellPx: () => 10
});

/* ---------- tools of step 1 ---------- */
export const HINTS_PAPEL = {
  iafront: 'Haz clic sobre la figura del front: la IA la recorta con su forma exacta. Más clics para añadir partes que falten; Mayús + clic sobre lo que sobre para quitarlo.',
  iaback: 'Haz clic sobre la figura del back: la IA la recorta con su forma exacta. Más clics para añadir partes que falten; Mayús + clic sobre lo que sobre para quitarlo.',
  lfront: 'Dibuja a mano alzada alrededor de la figura del front, sin soltar el botón. Rodea lo que se cruce con la otra figura: se cierra solo al soltar.',
  lback: 'Dibuja a mano alzada alrededor de la figura del back, sin soltar el botón. Rodea lo que se cruce con la otra figura: se cierra solo al soltar.',
  rfront: 'Arrastra un rectángulo alrededor de la figura del front: sale recortada de ahí, sin el fondo. Luego arrastra sus esquinas o lados para ajustarlo, o desde dentro para moverlo.',
  rback: 'Arrastra un rectángulo alrededor de la figura del back: sale recortada de ahí, sin el fondo. Luego arrastra sus esquinas o lados para ajustarlo, o desde dentro para moverlo.',
  front: 'Haz clic sobre la figura que es el front (la que muestra la cara). La otra pasa a ser el back.',
  back: 'Haz clic sobre la figura que es el back (la que está de espaldas). La otra pasa a ser el front.'
};
const LAZO = { lfront: 'front', lback: 'back' }, IA = { iafront: 'front', iaback: 'back' };
const RECT = { rfront: 'front', rback: 'back' }, RECT_DE = { front: 'rfront', back: 'rback' };
const conLazo = () => F.tool in LAZO, conIA = () => F.tool in IA, conRect = () => F.tool in RECT;
const conMarca = () => F.tool === 'front' || F.tool === 'back';
const propia = () => conLazo() || conIA() || conRect() || conMarca();
const pixel = e => { const [x, y] = view.evPos(e); return [Math.max(0, Math.min(F.w - 1, x)), Math.max(0, Math.min(F.h - 1, y))]; };

/* freehand: the inside of the line drawn, as 1 / 0 per pixel */
function zonaDeLazo(lazo) {
  const c = document.createElement('canvas'); c.width = F.w; c.height = F.h;
  const x = c.getContext('2d');
  x.beginPath(); lazo.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
  x.fillStyle = '#000'; x.fill();
  const a = x.getImageData(0, 0, F.w, F.h).data, zona = new Uint8Array(F.w * F.h);
  for (let p = 0; p < zona.length; p++) zona[p] = a[p * 4 + 3] >= 128 ? 1 : 0;
  return zona;
}
function lazoDown(e) {
  view.canvas.setPointerCapture(e.pointerId);
  F.lazoDraft = { rol: LAZO[F.tool], puntos: [pixel(e)] };
  view.draw();
}
function lazoMove(e) {
  const d = F.lazoDraft; if (!d) return;
  const [x, y] = pixel(e), [lx, ly] = d.puntos[d.puntos.length - 1];
  if (Math.hypot(x - lx, y - ly) >= Math.max(2, F.w / 500)) { d.puntos.push([x, y]); view.draw(); }
}
function lazoUp() {
  const d = F.lazoDraft; if (!d) return;
  F.lazoDraft = null;
  // a line needs some area: a click or a tiny scribble is ignored
  const xs = d.puntos.map(p => p[0]), ys = d.puntos.map(p => p[1]);
  if (d.puntos.length >= 3 && Math.max(...xs) - Math.min(...xs) >= 6 && Math.max(...ys) - Math.min(...ys) >= 6)
    ponerVista(d.rol, { lazo: d.puntos, zona: zonaDeLazo(d.puntos) });
  base.select('none'); sepSignal.bump(); view.draw();
}

/* rectangle: drawn by dragging, then adjusted from its handles (or moved from inside) while its tool is on */
const CURSORES = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' };
function rectHit(b, x, y) {
  const t = view.geom.HANDLE * 1.5 * view.geom.cssScale();
  for (const [h, [hx, hy]] of Object.entries(view.geom.boxHandles(b))) if (Math.abs(x - hx) <= t && Math.abs(y - hy) <= t) return h;
  return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 ? 'move' : null;
}
/* the box after dragging handle h by dx, dy, kept inside the image and at least 6 px a side */
function moverRect(b, h, dx, dy) {
  const MIN = 6;
  if (h === 'move') {
    dx = Math.max(-b.x0, Math.min(F.w - b.x1, dx)); dy = Math.max(-b.y0, Math.min(F.h - b.y1, dy));
    return { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy };
  }
  let { x0, y0, x1, y1 } = b;
  if (h.includes('w')) x0 = Math.max(0, Math.min(x0 + dx, x1 - MIN));
  if (h.includes('e')) x1 = Math.min(F.w, Math.max(x1 + dx, x0 + MIN));
  if (h.includes('n')) y0 = Math.max(0, Math.min(y0 + dy, y1 - MIN));
  if (h.includes('s')) y1 = Math.min(F.h, Math.max(y1 + dy, y0 + MIN));
  return { x0, y0, x1, y1 };
}
function zonaDeRect(b) {
  const zona = new Uint8Array(F.w * F.h);
  const x0 = Math.max(0, Math.floor(b.x0)), x1 = Math.min(F.w, Math.ceil(b.x1)), y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.min(F.h, Math.ceil(b.y1));
  for (let y = y0; y < y1; y++) zona.fill(1, y * F.w + x0, y * F.w + Math.max(x0, x1));
  return zona;
}
const posRect = e => { const [x, y] = view.evPos(e); return [Math.max(0, Math.min(F.w, x)), Math.max(0, Math.min(F.h, y))]; };
function rectDown(e) {
  const rol = RECT[F.tool], [x, y] = posRect(e), actual = F.vistas[rol]?.rect;
  view.canvas.setPointerCapture(e.pointerId);
  const h = actual ? rectHit(actual, x, y) : null;
  F.rectDrag = { rol, h, b0: actual, x0: x, y0: y, b: null };
}
function rectMove(e) {
  const d = F.rectDrag, [x, y] = posRect(e);
  if (!d) {   // hover: the cursor says what a drag would do
    const actual = F.vistas[RECT[F.tool]]?.rect, h = actual && rectHit(actual, x, y);
    view.canvas.style.cursor = h ? CURSORES[h] : 'crosshair';
    return;
  }
  d.b = d.h ? moverRect(d.b0, d.h, x - d.x0, y - d.y0)
    : { x0: Math.min(d.x0, x), y0: Math.min(d.y0, y), x1: Math.max(d.x0, x), y1: Math.max(d.y0, y) };
  view.draw();
}
function rectUp() {
  const d = F.rectDrag; if (!d) return;
  F.rectDrag = null;
  // a click (or a tiny box) is not a rectangle; an adjustment that did not move changes nothing
  const b = d.b && { x0: Math.round(d.b.x0), y0: Math.round(d.b.y0), x1: Math.round(d.b.x1), y1: Math.round(d.b.y1) };
  if (b && b.x1 - b.x0 >= 6 && b.y1 - b.y0 >= 6) ponerVista(d.rol, { rect: b, zona: zonaDeRect(b) });
  view.draw();
}

/* AI: every click adds a point (Shift: a point outside the figure) and the AI cuts the figure again */
async function iaDown(e) {
  const rol = IA[F.tool], [x, y] = pixel(e), img = F.img;
  const previa = F.vistas[rol]?.puntos || [];
  const puntos = [...previa, { x, y, dentro: !e.shiftKey }];
  if (!puntos.some(p => p.dentro)) { notificar('El primer clic tiene que ser sobre la figura (sin Mayús).', 'aviso'); return; }
  try {
    const zona = await segmentar(F, puntos);
    if (F.img !== img) return;
    ponerVista(rol, { puntos, zona });
  } catch (err) {
    if (err.name !== 'AbortError') notificar('La IA no ha podido recortar: ' + err.message);
  }
}

function marcar(e) {
  if (F.figuras.length !== 2) return;
  const [x, y] = pixel(e), px = Math.floor(x), py = Math.floor(y);
  // the figure under the pointer, or the one whose box is closest
  let i = F.mapa ? F.mapa[py * F.w + px] : -1;
  if (i < 0) {
    const d = b => Math.hypot(Math.max(0, b.x0 - px, px - b.x1), Math.max(0, b.y0 - py, py - b.y1));
    i = d(F.cajas[0]) <= d(F.cajas[1]) ? 0 : 1;
  }
  elegir(i, F.tool === 'front' ? 0 : 1);
  base.select('none'); sepSignal.bump();
}

export const tools = {
  ...base,
  setView: v => { base.setView(v); historial.schedule(); sesion.guardar(); },
  pointer: {
    ...base.pointer,
    onPointerDown: e => {
      if (!propia()) return base.pointer.onPointerDown(e);
      if (!F.img || e.button !== 0) return;
      if (conLazo()) lazoDown(e); else if (conRect()) rectDown(e); else if (conIA()) iaDown(e); else marcar(e);
    },
    onPointerMove: e => { if (conLazo()) lazoMove(e); else if (conRect()) rectMove(e); else if (!propia()) base.pointer.onPointerMove(e); },
    onPointerUp: e => { if (conLazo()) lazoUp(e); else if (conRect()) rectUp(e); else if (!propia()) base.pointer.onPointerUp(e); },
    onPointerCancel: e => { if (conLazo()) lazoUp(e); else if (F.rectDrag) { F.rectDrag = null; view.draw(); } else base.pointer.onPointerCancel(e); }
  }
};
export { bg };

async function loadFile(file) {
  let img;
  try { img = await loadImage(file); } catch { msg('No se pudo leer ese archivo. Prueba con un PNG o JPG.'); return; }
  F.nombre = (file.name || 'figuras').replace(/\.[^.]+$/, '');
  F.manual = null; F.lazoDraft = null; F.iaDerecha = null; F.iaImg = null; F.iaFrame = null; F.elegidas = null;
  image.start(img, file);   // a new picture: no crop, no retouches (and a new crop: no views cut by hand)
  settings.set('sep-bgAI', false, false);   // the background AI only with its checkbox, never by itself
  msg('');
  base.select('none'); sepSignal.bump(); view.draw(); pipeline.mask();
  historial.reset(); sesion.guardar();
}

/* the tolerance, «Quitar el fondo» and the closed holes redo the background */
let maskTimer = 0;
settings.listen(ids => {
  const own = ids.filter(id => id.startsWith('sep-'));
  if (!own.length) return;
  if (own.length > 1 || own.some(id => ['sep-tol', 'sep-bgRemove', 'sep-bgAI', 'sep-holes'].includes(id))) {
    clearTimeout(maskTimer);
    maskTimer = setTimeout(pipeline.mask, own.includes('sep-tol') ? 200 : 0);
  } else if (own.includes('sep-smooth')) { schedule(150); historial.schedule(); }   // only the edges of the figures change
});

/* figure i (left to right) as a PNG named after its role */
function downloadFigure(i) {
  const f = F.figuras[i]; if (!f) return;
  const c = document.createElement('canvas'); c.width = f.width; c.height = f.height;
  c.getContext('2d').putImageData(f, 0, 0);
  c.toBlob(blob => download(blob, `${F.nombre}_${NOMBRES[papel(i)][1]}.png`, msg), 'image/png');
}

/* ---------- undo / redo (Ctrl+Z, Ctrl+Y / Ctrl+Mayús+Z): every change, see source/historial.js ----------
   Besides the shared parts (settings, crop, zones, brush and AI-click retouches, view) a step keeps the views
   cut by hand and which one is the front. */
const historial = crearHistorial({
  S: F, image, ids: () => SEP_IDS,
  ocupado: () => !!(F.drag || F.lazoDraft || F.rectDrag),
  extra: {
    foto: () => ({ vistas: F.vistas, congeladas: F.congeladas, manual: F.manual }),
    poner: e => { F.vistas = e.vistas; F.congeladas = e.congeladas; F.manual = e.manual; },
    igual: (a, b) => !!a && !!b && a.vistas === b.vistas && a.congeladas === b.congeladas && a.manual === b.manual
  },
  rehacer: () => { F.vistasFrame = F.frame; base.select('none'); sepSignal.bump(); pipeline.mask(); }
});

/* «Ajustar automáticamente», the rest after the background: «Quitar huecos cerrados» on or off, whichever gives
   a mask that agrees more with what the advanced AI sees as the drawing. Only when its mask of this picture is
   already there: the button never sets the background AI to work */
async function ajustarHuecos() {
  if (!F.img || !$v('bgRemove') || $v('bgAI')) return null;
  const ia = { mask: mascaraGuardada(F) };
  if (!ia.mask) return null;
  const tol = +$v('tol'), coincide = con => {
    bg.compute({ remove: tol > 0, tol, drift: 3.5, frame: false, island: 0.4, alphaMin: 128, globalTol: 1.6 });
    if (con && tol > 0) quitarHuecos(F, tol);
    let d = 0; for (let i = 0; i < F.mask.length; i++) if (F.mask[i] !== ia.mask[i]) d++;
    return -d;
  };
  const con = coincide(true) >= coincide(false);
  if (con !== !!$v('holes')) settings.set('sep-holes', con);   // the page works the background out again
  else pipeline.mask();
  return { huecos: con };
}

/* ---------- the working session: the page comes back as it was after reloading ----------
   The picture and everything done on it (crop, retouches, views cut by hand, who is the front, settings) is
   kept in the browser a moment after every change; the AI's answers for the picture are remembered too
   (cacheIA), so coming back is instant. */
const SESION = 'sesion|separar';
const sesion = (() => {
  let timer = 0, restaurando = false;
  // the tint canvas and the zone without background are not kept
  const sinTinte = v => v && { lazo: v.lazo || null, rect: v.rect || null, puntos: v.puntos || null, zona: v.zona };
  function escribir() {
    timer = 0;
    if (!F.img || !F.frame || restaurando) return;
    const f = F.frame;
    guardarIA(SESION, {
      source: F.source, nombre: F.nombre, frame: { x: f.x, y: f.y, w: f.w, h: f.h }, view: F.view,
      ajustes: settings.pick(SEP_IDS), bgSeeds: F.bgSeeds.map(s => ({ ...s })), edits: F.edits,
      vistas: { front: sinTinte(F.vistas.front), back: sinTinte(F.vistas.back) },
      congeladas: F.congeladas, manual: F.manual, iaDerecha: F.iaDerecha, elegidas: F.elegidas
    });
  }
  return {
    guardar() { if (restaurando || !F.img) return; clearTimeout(timer); timer = setTimeout(escribir, 800); },
    /* a change still waiting is written now */
    ahora() { if (timer) { clearTimeout(timer); escribir(); } },
    async restaurar() {
      if (F.img) return;   // there is already a picture on the page
      const r = await leerIA(SESION);
      if (!r || !r.source || F.img) return;
      let img;
      try { img = await loadImage(r.source); } catch { return; }
      restaurando = true;
      try {
        F.nombre = r.nombre || 'figuras';
        // the background AI is never switched on by itself: only by ticking its checkbox
        settings.setMany({ ...(r.ajustes || {}), 'sep-bgAI': false }, false);
        image.restore(img, r.source, { frame: r.frame, markers: [], bgSeeds: r.bgSeeds || [], edits: r.edits });
        F.view = r.view || 'cut';
        F.vistas = r.vistas || { front: null, back: null };
        F.congeladas = r.congeladas || { front: null, back: null };
        F.manual = r.manual ?? null; F.iaDerecha = r.iaDerecha ?? null; F.iaImg = img; F.iaFrame = F.frame;
        F.elegidas = r.elegidas || null;
        F.vistasFrame = F.frame; F.lazoDraft = null;
        base.select('none'); sepSignal.bump(); view.draw();
      } finally { restaurando = false; }
      pipeline.mask();
      historial.reset();
    }
  };
})();
/* while the page is open the session is also written right before leaving it */
addEventListener('pagehide', () => sesion.ahora());

/* keyboard (Ctrl+Z / Ctrl+Y, Supr and arrows on marks) and Ctrl+V with an image, while this page's canvas is on
   screen. Listened to here and not in the page's effect: if this file is loaded again (hot updates while
   developing) only the copy whose canvas is on screen answers, never an old copy with an empty history. */
const enPantalla = () => !!(view.canvas && view.canvas.isConnected);
function alTeclear(e) { if (enPantalla()) { historial.keyDown(e); tools.keyDown(e); } }
function alPegar(e) {
  if (!enPantalla()) return;
  const t = e.target; if (t.closest && t.closest('input, textarea, [contenteditable]')) return;
  const f = imageIn(e.clipboardData);
  if (!f) { msg('Lo copiado no es una imagen. Copia la imagen en sí (clic derecho > Copiar imagen) y vuelve a pegar.'); return; }
  e.preventDefault(); loadFile(f);
}
document.addEventListener('keydown', alTeclear);
document.addEventListener('paste', alPegar);
if (import.meta.hot) import.meta.hot.dispose(() => {
  document.removeEventListener('keydown', alTeclear); document.removeEventListener('paste', alPegar);
});

export const separar = { restaurarSesion: () => sesion.restaurar(), ajustarHuecos, loadFile, deshacer: historial.deshacer, rehacer: historial.rehacer, keyDown: historial.keyDown, downloadFigure, elegir, intercambiar, quitarVistas, hayVistas, has: () => !!F.img };
