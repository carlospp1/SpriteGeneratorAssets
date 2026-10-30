/* The pixel editor's tools as shown in the toolbar: icons (SVG contents, 24×24), names, Photoshop letters
   and tips, and how they are grouped (null = separator). */
const svg = d => d;
export const ICON = {
  move: svg('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
  marquee: svg('<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2.5"/>'),
  ellipseSel: svg('<ellipse cx="12" cy="12" rx="8.5" ry="6.5" stroke-dasharray="3 2.5"/>'),
  lasso: svg('<path d="M12 5c-5 0-8.5 2.5-8.5 5.5S7 16 12 16s8.5-2.5 8.5-5.5S17 5 12 5z" stroke-dasharray="3 2"/><path d="M7.5 15c-1.5 2-.5 4.5 2 4.5"/>'),
  polyLasso: svg('<path d="M5 9l7-5 7 5-2.5 9h-9z" stroke-dasharray="3 2"/>'),
  wand: svg('<path d="M4 20L14 10"/><path d="M15 3v3M19.5 4.5l-2 2M21 9h-3M19.5 13.5l-2-2M10.5 4.5l2 2"/>'),
  crop: svg('<path d="M6 2v16h16"/><path d="M2 6h16v16"/>'),
  picker: svg('<path d="M14 4l6 6-3 3-6-6z"/><path d="M12 8l-7 7v4h4l7-7"/>'),
  pencil: svg('<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>'),
  dither: svg('<path class="fill" d="M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z"/>'),
  eraser: svg('<path d="M9 20h11"/><path d="M4 15l9-9 6 6-8 8H8z"/><path d="M9 10l6 6"/>'),
  fill: svg('<path d="M4 12l7-7 7 7-7 7z"/><path d="M4 12h14"/><path d="M20 15s2 2.4 2 3.8a2 2 0 0 1-4 0c0-1.4 2-3.8 2-3.8z"/>'),
  shade: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" class="fill"/>'),
  rect: svg('<rect x="4" y="6" width="16" height="12"/>'),
  ellipse: svg('<ellipse cx="12" cy="12" rx="8" ry="6"/>'),
  line: svg('<path d="M5 19L19 5"/>'),
  hand: svg('<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.4 0-3.9-1.3-5.3-3.6L4 14.6a1.5 1.5 0 0 1 2.4-1.7L8 14.5"/>'),
  zoom: svg('<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20"/><path d="M7.5 10h5M10 7.5v5"/>')
};
export const TOOL = {
  move: { name: 'Mover', key: 'V', tip: 'Mueve la capa o lo seleccionado. Alt + arrastrar: duplicar.' },
  marquee: { name: 'Marco rectangular', key: 'M', tip: 'Selección rectangular. Mayús: cuadrada o añadir · Alt: restar.' },
  ellipseSel: { name: 'Marco elíptico', key: 'M', tip: 'Selección elíptica. Mayús: círculo o añadir · Alt: restar.' },
  lasso: { name: 'Lazo', key: 'L', tip: 'Selección a mano alzada.' },
  polyLasso: { name: 'Lazo poligonal', key: 'L', tip: 'Selección por puntos: clic para cada vértice, doble clic o Intro para cerrar.' },
  wand: { name: 'Varita mágica', key: 'W', tip: 'Selecciona por color con un clic.' },
  crop: { name: 'Recortar', key: 'C', tip: 'Recorta el lienzo al rectángulo que arrastres.' },
  picker: { name: 'Cuentagotas', key: 'I', tip: 'Toma un color del dibujo.' },
  pencil: { name: 'Lápiz', key: 'B', tip: 'Dibuja píxel a píxel. Mayús + clic: línea recta desde el último punto.' },
  dither: { name: 'Tramado', key: 'B', tip: 'Pinta un damero con el color frontal y el de fondo.' },
  eraser: { name: 'Borrador', key: 'E', tip: 'Borra a transparente (con la transparencia bloqueada, pinta el color de fondo).' },
  fill: { name: 'Bote de pintura', key: 'G', tip: 'Rellena una zona del mismo color.' },
  shade: { name: 'Sobreexponer / Subexponer', key: 'O', tip: 'Aclara u oscurece desplazando el tono, como el sombreado del pixel art.' },
  rect: { name: 'Rectángulo', key: 'U', tip: 'Dibuja rectángulos. Mayús: cuadrado.' },
  ellipse: { name: 'Elipse', key: 'U', tip: 'Dibuja elipses. Mayús: círculo.' },
  line: { name: 'Línea', key: 'U', tip: 'Dibuja líneas. Mayús: 0°, 45° o 90°.' },
  hand: { name: 'Mano', key: 'H', tip: 'Mueve la vista. También: mantén Espacio.' },
  zoom: { name: 'Zoom', key: 'Z', tip: 'Clic: acercar · Alt + clic: alejar.' }
};
export const GROUPS = [['move'], ['marquee', 'ellipseSel'], ['lasso', 'polyLasso'], ['wand'], ['crop'], ['picker'], null,
  ['pencil', 'dither'], ['eraser'], ['fill'], ['shade'], ['rect', 'ellipse', 'line'], null, ['hand'], ['zoom']];
export const groupOf = t => GROUPS.find(g => g && g.includes(t));
