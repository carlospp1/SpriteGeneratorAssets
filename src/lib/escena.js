/**
 * Lo que va dentro de la ventana del fondo, entre el fondo y el marco: el personaje o, en la página Shiny,
 * su shiny con halo, destellos y la placa SHINY. La página de evoluciones tiene su propio diseño (paginaEvo.js).
 * Se usa igual en la vista previa y en la exportación.
 */
import { LAYOUT } from '../data/campos';
import { rectPersonaje } from './imagen';
import { FORMAS, aura, forma, medir, placa, texto } from './pixel';
import { pintarPaginaEvo } from './paginaEvo';

const F = LAYOUT.fondo;

function dibujar(ctx, K, img, { x, y, w, h }) {
  ctx.drawImage(img, Math.round(x * K), Math.round(y * K), Math.round(w * K), Math.round(h * K));
}

/** Página Shiny: halo dorado detrás, destellos alrededor y la placa SHINY bajo los pies. */
function pintarShiny(ctx, K, sprite) {
  const r = rectPersonaje(sprite);
  aura(ctx, K, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) / 2 + 10, '#fff1a8');
  dibujar(ctx, K, sprite.img, r);

  const destellos = [
    [r.x - 6, r.y + r.h * 0.2, 'estrella'], [r.x + r.w + 2, r.y + r.h * 0.05, 'estrella'],
    [r.x + r.w * 0.75, r.y - 7, 'chispa'], [r.x + r.w + 4, r.y + r.h * 0.6, 'chispa'],
    [r.x - 3, r.y + r.h * 0.7, 'chispa'], [r.x + r.w * 0.2, r.y - 4, 'chispa'],
  ];
  for (const [x, y, f] of destellos) forma(ctx, K, FORMAS[f], Math.round(x), Math.round(y), '#ffe35a', '#ffffff', '#5a3a00');

  // placa «SHINY» con una chispa a cada lado
  const t = { font: 'ps', tam: 5 };
  const w = Math.ceil(medir(ctx, K, 'SHINY', t)) + 20;
  const p = { x: Math.round(F.x + F.w / 2 - w / 2), y: F.y + F.h - 14, w, h: 10 };
  placa(ctx, K, p, '#2a1d06', '#ffd84a');
  forma(ctx, K, FORMAS.chispa, p.x + 3, p.y + 3, '#ffd84a', '#ffffff');
  forma(ctx, K, FORMAS.chispa, p.x + w - 6, p.y + 3, '#ffd84a', '#ffffff');
  texto(ctx, K, 'SHINY', p.x + w / 2, p.y + p.h / 2, { ...t, color: '#ffe98a' });
}

/**
 * Pinta la escena de una página. La de evoluciones ocupa toda la ficha; las demás, solo la ventana del fondo.
 * escena: { pagina, tipo, sprite: { img, x, y, zoom } | null, evo, icono }
 */
export function pintarEscena(ctx, K, escena) {
  const { pagina, sprite } = escena;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (pagina === 'evo') {
    pintarPaginaEvo(ctx, K, escena);
  } else if (sprite) {
    ctx.beginPath();
    ctx.rect(F.x * K, F.y * K, F.w * K, F.h * K);
    ctx.clip();
    if (pagina === 'shiny') pintarShiny(ctx, K, sprite);
    else dibujar(ctx, K, sprite.img, rectPersonaje(sprite));
  }
  ctx.restore();
}
