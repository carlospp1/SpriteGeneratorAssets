/** Piezas de pixel art pintadas en px de lienzo multiplicados por K (siempre bloques enteros). */
import { fuenteCSS } from './texto';

// Formas: '1' color principal, '2' color de brillo, '.' vacío.
export const FORMAS = {
  chispa: ['.1.', '121', '.1.'],
  estrella: ['..1..', '..1..', '11211', '..1..', '..1..'],
  flecha: ['1.....', '121...', '12221.', '122221', '12221.', '121...', '1.....'],
};

/** Dibuja una forma; borde: color de un contorno de 1 px por fuera, o null. */
export function forma(ctx, K, filas, x, y, c1, c2, borde = null) {
  if (borde) {
    const lleno = (i, j) => filas[j]?.[i] !== undefined && filas[j][i] !== '.';
    ctx.fillStyle = borde;
    for (let j = -1; j <= filas.length; j++) {
      for (let i = -1; i <= filas[0].length; i++) {
        if (!lleno(i, j) && (lleno(i - 1, j) || lleno(i + 1, j) || lleno(i, j - 1) || lleno(i, j + 1))) ctx.fillRect((x + i) * K, (y + j) * K, K, K);
      }
    }
  }
  filas.forEach((fila, j) => {
    [...fila].forEach((ch, i) => {
      if (ch === '.') return;
      ctx.fillStyle = ch === '1' ? c1 : c2;
      ctx.fillRect((x + i) * K, (y + j) * K, K, K);
    });
  });
}

/** Rectángulo con borde de 1 px de lienzo y las esquinas recortadas. */
export function placa(ctx, K, { x, y, w, h }, fondo, borde) {
  ctx.fillStyle = borde;
  ctx.fillRect(x * K, (y + 1) * K, w * K, (h - 2) * K);
  ctx.fillRect((x + 1) * K, y * K, (w - 2) * K, h * K);
  ctx.fillStyle = fondo;
  ctx.fillRect((x + 1) * K, (y + 1) * K, (w - 2) * K, (h - 2) * K);
}

/* max: ancho máximo en px de lienzo (si no cabe, el texto se estrecha) */
export function texto(ctx, K, cadena, cx, cy, { font = 'px', tam = 6, color, max }) {
  ctx.font = fuenteCSS(font, tam * K);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(cadena, Math.round(cx * K), Math.round(cy * K) + (font === 'ps' ? K * 0.5 : 0), max ? max * K : undefined);
}

export function medir(ctx, K, cadena, { font = 'px', tam = 6 }) {
  ctx.font = fuenteCSS(font, tam * K);
  return ctx.measureText(cadena).width / K;
}

/** Halo de luz: un círculo que se deshace en tramas hacia fuera. */
export function aura(ctx, K, cx, cy, r, color) {
  ctx.fillStyle = color;
  const x0 = Math.floor(cx - r), y0 = Math.floor(cy - r);
  for (let y = y0; y <= cy + r; y++) {
    for (let x = x0; x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      let alfa = 0;
      if (d < 0.55) alfa = 0.32;
      else if (d < 0.8) alfa = (x + y) % 2 ? 0 : 0.32;
      else if (d < 1) alfa = x % 2 || y % 2 ? 0 : 0.3;
      if (!alfa) continue;
      ctx.globalAlpha = alfa;
      ctx.fillRect(x * K, y * K, K, K);
    }
  }
  ctx.globalAlpha = 1;
}
