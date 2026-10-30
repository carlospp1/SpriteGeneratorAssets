/* El analizador: dada la imagen de un personaje nuevo, 5 IAs locales (CLIP B/32, CLIP B/16, SigLIP, DINOv2 y ViT)
   la comparan con 50 Pokémon al azar de assets/pokemons (dentro de los filtros); el parecido que se usa es el
   promedio de las cinco. Propone el tamaño de sprite (como el del Pokémon elegido, con la proporción del nuevo),
   si es un front o un back, y el nombre: nombre_widht_Npx_height_Npx_front.png.
   La categoría (normal / pseudo / legendario y la etapa) se lee del nombre del archivo si está etiquetado
   (_1_3, _pseudo_2_3, _legendary_1_1…); si no, de la carpeta. Los sprites de assets/pokemons están a zoom x2. */
import { createBg } from '../../engine/background.js';
import { loadImage } from '../../engine/image.js';
import { empezarTarea, cancelado } from '../source/tareasIA.js';
import { leerIA, guardarIA, huella } from '../source/cacheIA.js';
import { MODELO_IDS } from './modelos.js';

export const ZOOM_CATALOGO = 2;   // los sprites de assets/pokemons están a x2
const LADO_IA = 224;
const ALFA_MIN = 8;
const claveCatalogo = id => `analizador|v5|${id}|catalogo`;
const claveTextos = id => `analizador|v5|${id}|textos`;
const ETIQUETAS = [
  'the front view of a cartoon creature, its face and eyes are visible',
  'the back view of a cartoon creature seen from behind, no face visible'
];

const RUTAS = import.meta.glob('../../../assets/pokemons/**/*.{png,PNG}', { eager: true, query: '?url', import: 'default' });

/* ---------- la IA (en un worker) ---------- */
let worker = null, siguiente = 0;
const pendientes = new Map();
function parar() {
  if (worker) { worker.terminate(); worker = null; }
  for (const p of pendientes.values()) p.reject(cancelado());
  pendientes.clear();
}
/* vectores de CLIP: { imagenes: [ImageData] } o { textos: [string] }. alAvanzar(hechas) mientras trabaja */
function preguntar(msg, tarea, alAvanzar) {
  if (!worker) {
    worker = new Worker(new URL('./ia.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: m }) => {
      if (m.tipo === 'progreso') {
        for (const p of pendientes.values()) p.tarea.texto(m.texto || `Descargando las IAs que comparan imágenes (solo la primera vez): ${(m.hecho / 1e6).toFixed(0)} / ${(m.total / 1e6).toFixed(0)} MB`);
        return;
      }
      const p = pendientes.get(m.id); if (!p) return;
      if (m.tipo === 'avance') { p.alAvanzar?.(m.hechas); return; }
      pendientes.delete(m.id);
      if (m.tipo === 'hecho') p.resolve(m.porModelo); else p.reject(new Error(m.mensaje));
    };
    worker.onerror = e => { for (const p of pendientes.values()) p.reject(new Error(e.message || 'la IA no ha podido arrancar')); pendientes.clear(); };
  }
  const id = ++siguiente;
  return new Promise((resolve, reject) => {
    pendientes.set(id, { resolve, reject, tarea, alAvanzar });
    worker.postMessage({ id, ...msg });
  });
}

/* ---------- recortes ---------- */
/* el recuadro de lo que es sprite: es(i) dice si el píxel i lo es. null si no hay nada */
function recuadro(w, h, es) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (es(y * w + x)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/* lo que es sprite, recortado a su recuadro y sobre blanco (CLIP no sabe de transparencias), a lo sumo LADO_IA */
function figuraIA(rgba, w, es, r) {
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  const cx = c.getContext('2d'), id = cx.createImageData(r.w, r.h);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const i = (r.y0 + y) * w + r.x0 + x, o = (y * r.w + x) * 4, a = es(i) ? rgba[i * 4 + 3] / 255 : 0;
    for (let k = 0; k < 3; k++) id.data[o + k] = Math.round(rgba[i * 4 + k] * a + 255 * (1 - a));
    id.data[o + 3] = 255;
  }
  cx.putImageData(id, 0, 0);
  const k = Math.min(1, LADO_IA / Math.max(r.w, r.h)), out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(r.w * k)); out.height = Math.max(1, Math.round(r.h * k));
  const ox = out.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(c, 0, 0, out.width, out.height);
  return ox.getImageData(0, 0, out.width, out.height);
}
function pixeles(img) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  return cx.getImageData(0, 0, c.width, c.height).data;
}
const cargarUrl = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('no se pudo leer ' + url)); i.src = url; });

/* ---------- categoría: etiquetas del nombre (_1_3, _pseudo_2_3, _legendary_1_1) y, si no hay, la carpeta ---------- */
const POR_CARPETA = {
  'etapa unica': { linea: 1, etapa: 1 },
  'primera etapa de dos': { linea: 2, etapa: 1 }, 'segunda etapa de dos': { linea: 2, etapa: 2 },
  'primera etapa': { linea: 3, etapa: 1 }, 'segunda etapa': { linea: 3, etapa: 2 }, 'tercera etapa': { linea: 3, etapa: 3 }
};
const TAG_NOMBRE = /(?:_(pseudo|legendary))?_(\d)_(\d)_(front|back)$/i;
function categoriaDeNombre(archivo) {
  const m = String(archivo).replace(/\.png$/i, '').match(TAG_NOMBRE);
  if (!m) return null;
  const kind = (m[1] || '').toLowerCase();
  const tipo = kind === 'legendary' ? 'legendario' : kind === 'pseudo' ? 'pseudo' : 'normal';
  return { tipo, linea: +m[3], etapa: +m[2], lado: m[4].toLowerCase() };
}
export function categoriaDe(carpeta, archivo) {
  const deNombre = archivo ? categoriaDeNombre(archivo) : null;
  if (deNombre) return deNombre;
  const [raiz, sub] = String(carpeta || '').toLowerCase().split('/');
  if (raiz === 'pseudolegendario' || raiz === 'psudolegendario') {
    const e = POR_CARPETA[sub] || { linea: 3, etapa: 3 };
    return { tipo: 'pseudo', linea: 3, etapa: e.etapa, lado: null };
  }
  if (raiz === 'legendario' || raiz === 'singular' || raiz === 'mega') return { tipo: raiz, linea: null, etapa: null, lado: null };
  if (raiz === 'gmax') return { tipo: 'gmax', linea: null, etapa: null, lado: null };
  const e = POR_CARPETA[raiz];
  return e ? { tipo: 'normal', ...e, lado: null } : { tipo: 'normal', linea: null, etapa: null, lado: null };
}
export function entraEnFiltros({ tipo, linea, etapa }, { tipos, lineas, etapas }) {
  if (tipos.size && !tipos.has(tipo)) return false;
  if (lineas.size && linea != null && !lineas.has(linea)) return false;
  if (etapas.size && etapa != null && !etapas.has(etapa)) return false;
  return true;
}

/* ---------- el catálogo: 50 al azar de los que entran en los filtros ---------- */
export const MUESTRA = 50;
function alAzar(lista, n) {
  if (lista.length <= n) return lista.slice();
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/* [{ archivo, nombre, carpeta (ruta dentro de pokemons, p. ej. «pseudolegendario/primera etapa»), cat, url }]:
   sale de las rutas, sin cargar ninguna imagen */
const catalogo = Object.entries(RUTAS).map(([ruta, url]) => {
  const partes = ruta.split('/'), archivo = partes.pop(), i = partes.indexOf('pokemons');
  const carpeta = partes.slice(i + 1).join('/');
  const cat = categoriaDe(carpeta, archivo);
  const nombre = archivo.replace(/\.png$/i, '').replace(TAG_NOMBRE, '');
  return { archivo, carpeta, cat, url, nombre };
});

/* lo que hace falta mirar de cada Pokémon: w, h (tamaño real del sprite sin fondo), fig y clave. Una vez por
   Pokémon (y sesión); null si el sprite está vacío */
const medidos = new Map();
function medir(p) {
  if (!medidos.has(p.url)) medidos.set(p.url, (async () => {
    const img = await cargarUrl(p.url), w = img.naturalWidth, h = img.naturalHeight, px = pixeles(img);
    const es = i => px[i * 4 + 3] >= ALFA_MIN, r = recuadro(w, h, es);
    if (!r) return null;
    const fig = figuraIA(px, w, es, r);
    return { ...p, w: Math.ceil(r.w / ZOOM_CATALOGO), h: Math.ceil(r.h / ZOOM_CATALOGO), fig, clave: huella(fig.data, fig.width, fig.height) };
  })().catch(e => { medidos.delete(p.url); throw e; }));
  return medidos.get(p.url);
}

const punto = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s;
};

let vectoresCatalogo = null, vectoresEtiquetas = null;
async function vectoresDelCatalogo(lista, tarea) {
  vectoresCatalogo ??= {};
  vectoresEtiquetas ??= {};
  for (const id of MODELO_IDS) {
    if (!vectoresCatalogo[id]) vectoresCatalogo[id] = (await leerIA(claveCatalogo(id))) || {};
    if (!vectoresEtiquetas[id]) vectoresEtiquetas[id] = (await leerIA(claveTextos(id))) || null;
  }
  const faltan = lista.filter(p => MODELO_IDS.some(id => !vectoresCatalogo[id]?.[p.clave]));
  const faltanTextos = MODELO_IDS.some(id => !vectoresEtiquetas[id]);
  if (faltan.length || faltanTextos) {
    tarea.texto('Las 5 IAs están mirando tus Pokémon…');
    const porModelo = await preguntar({ imagenes: faltan.map(p => p.fig), textos: faltanTextos ? ETIQUETAS : undefined }, tarea);
    for (const [id, r] of Object.entries(porModelo)) {
      vectoresCatalogo[id] ??= {};
      faltan.forEach((p, i) => { vectoresCatalogo[id][p.clave] = r.imagenes[i]; });
      guardarIA(claveCatalogo(id), vectoresCatalogo[id]);
      if (r.textos) { vectoresEtiquetas[id] = r.textos; guardarIA(claveTextos(id), r.textos); }
    }
  }
  return vectoresCatalogo;
}

function promedioParecido(qv, catalogoVecs, lista) {
  const ids = MODELO_IDS.filter(id => qv[id]?.imagenes?.[0] && catalogoVecs[id]);
  const normas = ids.map(id => {
    const q = qv[id].imagenes[0];
    const sims = lista.map(p => punto(q, catalogoVecs[id][p.clave]));
    const lo = Math.min(...sims), hi = Math.max(...sims), d = hi - lo || 1;
    return sims.map(s => (s - lo) / d);
  });
  return lista.map((p, i) => {
    const vals = normas.map(n => n[i]);
    return { pokemon: p, parecido: vals.reduce((a, b) => a + b, 0) / (vals.length || 1) };
  }).sort((a, b) => b.parecido - a.parecido);
}

function promedioFront(qv) {
  const scores = [];
  for (const id of MODELO_IDS) {
    const v = qv[id]?.imagenes?.[0], t = vectoresEtiquetas?.[id] || qv[id]?.textos;
    if (!v || !t || t.length < 2) continue;
    const a = 100 * punto(v, t[0]), b = 100 * punto(v, t[1]);
    scores.push(1 / (1 + Math.exp(b - a)));
  }
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;
}

/* ---------- la imagen nueva ---------- */
/* la imagen subida y sus píxeles */
export async function leerImagen(file) {
  const img = await loadImage(file);
  return { file, w: img.naturalWidth, h: img.naturalHeight, rgba: pixeles(img) };
}
/* quita el fondo desde los bordes con la tolerancia (si la imagen ya es transparente, su transparencia) */
export function quitarFondo(im, tol) {
  const st = { w: im.w, h: im.h, rgba: im.rgba, bgSeeds: [], edits: null, mask: null };
  createBg(st).compute({ remove: true, tol, drift: 3.5, frame: false, island: 0.4, alphaMin: 128, globalTol: 1.6 });
  const mask = st.mask, es = i => mask[i] && im.rgba[i * 4 + 3] >= ALFA_MIN;
  return { mask, es, r: recuadro(im.w, im.h, es) };
}
/* la figura sin fondo, recortada, como canvas (para verla) */
export function figuraCanvas(im, f) {
  const { r } = f, c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  const cx = c.getContext('2d'), id = cx.createImageData(r.w, r.h);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const i = (r.y0 + y) * im.w + r.x0 + x, o = (y * r.w + x) * 4;
    if (!f.es(i)) continue;
    for (let k = 0; k < 4; k++) id.data[o + k] = im.rgba[i * 4 + k];
  }
  cx.putImageData(id, 0, 0);
  return c;
}

/**
 * Compara la figura con 50 Pokémon al azar de los que entran en los filtros. Cinco IAs locales; el parecido es el promedio.
 * @returns {{ parecidos: [{ pokemon, parecido }], front: number, total: number }}
 */
export async function analizar(im, f, filtros) {
  const tarea = empezarTarea('Las 5 IAs están comparando la imagen con 50 Pokémon al azar…', parar);
  try {
    const candidatos = alAzar(catalogo.filter(p => entraEnFiltros(p.cat, filtros)), MUESTRA);
    tarea.texto(`Mirando ${candidatos.length} Pokémon al azar…`);
    const lista = (await Promise.all(candidatos.map(medir))).filter(Boolean);
    const vc = await vectoresDelCatalogo(lista, tarea);
    tarea.texto('Las 5 IAs están comparando la imagen con tus Pokémon…');
    const qv = await preguntar({ imagenes: [figuraIA(im.rgba, im.w, f.es, f.r)] }, tarea);
    return { parecidos: promedioParecido(qv, vc, lista), front: promedioFront(qv), total: candidatos.length };
  } finally { tarea.fin(); }
}

/* el tamaño del Pokémon de referencia con la proporción de la figura nueva (misma superficie de recuadro) */
export function tamañoComo(ref, w, h) {
  const k = Math.sqrt((ref.w * ref.h) / (w * h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/* nombre_widht_Npx_height_Npx_front.png: el nombre del archivo subido sin «front» / «back» */
export function nombreArchivo(original, w, h, lado) {
  const base = original.replace(/\.[^.]+$/, '')
    .replace(/(^|[_\-\s.])(front|back|frente|espaldas?)(?=$|[_\-\s.])/gi, '$1')
    .replace(/[_\-\s.]+$/, '').replace(/^[_\-\s.]+/, '').replace(/[_\-\s.]{2,}/g, '_') || 'sprite';
  return `${base}_widht_${w}px_height_${h}px_${lado}.png`;
}
