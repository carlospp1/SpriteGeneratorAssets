/**
 * Páginas del post de Instagram (un carrusel): cada una es una imagen.
 * propios: textos que esa página tiene aparte (con su placeholder); el resto se comparte con la ficha.
 */
export const PAGINAS = [
  { id: 'ficha', titulo: 'Ficha', propios: {} },
  { id: 'shiny', titulo: 'Shiny', propios: { descripcion: 'Así luce en su forma variocolor…' } },
  // tiene su propio diseño (lib/paginaEvo.js): solo comparte con la ficha el tipo, el personaje y el nombre
  { id: 'evo', titulo: 'Evoluciones', propios: { descripcion: 'Cómo y cuándo evoluciona, o curiosidades de su línea…' } },
];

export const PAGINAS_POR_ID = Object.fromEntries(PAGINAS.map((p) => [p.id, p]));
