import { LAYOUT, LIENZO, ESCALA_EXPORT as K } from '../data/campos';
import { cargarImagen } from './imagen';
import { pintarEscena } from './escena';
import { fuenteCSS, partirLineas, INTERLINEADO } from './texto';

/**
 * Pinta una página de la ficha en un canvas a escala de exportación (1080×1350).
 * @param {object} ficha
 * @param {string} ficha.fondo
 * @param {string} ficha.marco
 * @param {(string|null)[]} ficha.insignias  [tipo 1, tipo 2]
 * @param {object} ficha.escena             lo que va en la ventana del fondo (ver pintarEscena)
 * @param {object[]} ficha.textos            [{ campo, texto, tamano, color }]
 */
export async function renderizarFicha({ fondo, marco, insignias, escena, textos }) {
  await Promise.all([
    document.fonts.load('400 40px "Press Start 2P"'),
    document.fonts.load('600 40px "Pixelify Sans"'),
  ]).catch(() => {});

  const [imgFondo, imgMarco, ...imgInsignias] = await Promise.all(
    [fondo, marco, ...insignias].map((src) => (src ? cargarImagen(src) : null)),
  );

  const c = document.createElement('canvas');
  c.width = LIENZO.w * K;
  c.height = LIENZO.h * K;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const dibujar = (img, { x, y, w, h }) => ctx.drawImage(img, x * K, y * K, w * K, h * K);

  const F = LAYOUT.fondo;
  // El fondo cubre la ventana sin deformarse: se recorta centrado (como object-fit: cover).
  // (La página de evoluciones no lleva fondo ni marco: su escena ocupa toda la ficha.)
  if (imgFondo) {
    const escala = Math.max(F.w / imgFondo.naturalWidth, F.h / imgFondo.naturalHeight);
    const sw = F.w / escala;
    const sh = F.h / escala;
    ctx.drawImage(
      imgFondo,
      (imgFondo.naturalWidth - sw) / 2, (imgFondo.naturalHeight - sh) / 2, sw, sh,
      F.x * K, F.y * K, F.w * K, F.h * K,
    );
  }

  pintarEscena(ctx, K, escena);

  if (imgMarco) dibujar(imgMarco, { x: 0, y: 0, w: LIENZO.w, h: LIENZO.h });
  if (imgInsignias[0]) dibujar(imgInsignias[0], LAYOUT.insignia_tipo_1);
  if (imgInsignias[1]) dibujar(imgInsignias[1], LAYOUT.insignia_tipo_2);

  ctx.textBaseline = 'middle';
  for (const { campo, texto, tamano, color } of textos) {
    if (!texto) continue;
    const { x, y, w, h } = campo.caja;
    const s = tamano * K;
    const fuente = fuenteCSS(campo.font, s);
    ctx.font = fuente;
    ctx.fillStyle = color;
    if (campo.multilinea) {
      ctx.textAlign = 'left';
      const lh = s * INTERLINEADO;
      partirLineas(texto, (w - 4) * K, fuente).forEach((linea, i) =>
        ctx.fillText(linea, (x + 2) * K, (y + 1) * K + lh * (i + 0.5)),
      );
    } else {
      ctx.textAlign = 'center';
      // Press Start 2P queda medio píxel más alta que en la previsualización.
      const ajuste = campo.font === 'ps' ? K * 0.5 : 0;
      ctx.fillText(texto, (x + w / 2) * K, (y + h / 2) * K + ajuste);
    }
  }
  return c;
}

/** nombre-imperia.png, o nombre-imperia-2-shiny.png para una página del carrusel. */
export function nombreArchivo(nombre, pagina = '') {
  const base = (nombre || '').trim().toLowerCase().replace(/[^a-z0-9ñáéíóú]+/gi, '-') || 'ficha';
  return `${base}-imperia${pagina ? `-${pagina}` : ''}.png`;
}

/** tipo: formato del archivo (PNG por defecto; JPG y WEBP se guardan a calidad alta). */
export function descargarCanvas(canvas, nombre, tipo = 'image/png') {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('No se pudo generar la imagen'));
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, tipo, 0.95);
  });
}
