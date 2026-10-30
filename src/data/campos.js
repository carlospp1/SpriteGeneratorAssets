import LAYOUT from './layout.json';

export { LAYOUT };

export const LIENZO = LAYOUT.lienzo;
export const ESCALA_EXPORT = LAYOUT.lienzo.escala_instagram;

export const FUENTES = {
  ps: { family: '"Press Start 2P"', weight: 400 },
  px: { family: '"Pixelify Sans"', weight: 600 },
};

/** Niveles de zoom del personaje: x1 = 1 px de la imagen por px de lienzo (pixel art nítido). */
export const ZOOMS = [0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8];

const textoInsignia = (insignia) => {
  const t = LAYOUT.texto_en_insignia;
  return { x: insignia.x + t.dx, y: insignia.y + t.dy, w: t.w, h: t.h };
};

/**
 * Campos de texto editables sobre la ficha.
 * size/min: tamaño de fuente máximo y mínimo en px de lienzo; se reduce hasta que el texto cabe.
 * Los campos t1/t2 no tienen color fijo: depende del tipo (ver colorTextoInsignia).
 */
export const CAMPOS = [
  { clave: 'nombre', etiqueta: 'Nombre', font: 'ps', size: 8, min: 4, color: '#3a2414', placeholder: 'NOMBRE', maxLength: 20 },
  { clave: 'especie', etiqueta: 'Especie', font: 'px', size: 8, min: 5, color: '#f4ecc2', placeholder: 'Pokémon especie', maxLength: 34 },
  { clave: 't1', etiqueta: 'Texto del tipo 1', font: 'px', size: 8, min: 5, maxLength: 12, caja: textoInsignia(LAYOUT.insignia_tipo_1) },
  { clave: 't2', etiqueta: 'Texto del tipo 2', font: 'px', size: 8, min: 5, maxLength: 12, caja: textoInsignia(LAYOUT.insignia_tipo_2) },
  { clave: 'altura', etiqueta: 'Altura', font: 'px', size: 8, min: 4, color: '#f4ecc2', placeholder: '0,0 m', maxLength: 9 },
  { clave: 'peso', etiqueta: 'Peso', font: 'px', size: 8, min: 4, color: '#f4ecc2', placeholder: '0 kg', maxLength: 9 },
  { clave: 'numero_dex', etiqueta: 'Número de Pokédex', font: 'px', size: 8, min: 5, color: '#f8eccc', placeholder: '000', maxLength: 5 },
  { clave: 'descripcion', etiqueta: 'Descripción', font: 'px', size: 7, min: 5, color: '#3a2414', placeholder: 'Descripción de la Pokédex…', maxLength: 160, multilinea: true },
].map((c) => ({ ...c, caja: c.caja ?? LAYOUT.campos[c.clave] }));
