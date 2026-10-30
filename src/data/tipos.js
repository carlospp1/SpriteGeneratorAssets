// Metadatos de cada tipo. Las imágenes se resuelven por convención de nombre
// a partir de src/assets (insignia_<clave>, icono_<clave>, marco_<clave>, fondo_<clave>[_b]).
const urls = import.meta.glob('../assets/**/*.png', { eager: true, query: '?url', import: 'default' });

const asset = (path) => {
  const url = urls[`../assets/${path}`];
  if (!url) throw new Error(`Falta el asset ${path}`);
  return url;
};

const TIPOS_BASE = [
  { clave: 'normal', nombre: 'Normal', color: '#a8a77a' },
  { clave: 'fuego', nombre: 'Fuego', color: '#ee8130' },
  { clave: 'agua', nombre: 'Agua', color: '#6390f0' },
  { clave: 'electrico', nombre: 'Eléctrico', color: '#f7d02c' },
  { clave: 'planta', nombre: 'Planta', color: '#7ac74c' },
  { clave: 'hielo', nombre: 'Hielo', color: '#96d9d6' },
  { clave: 'lucha', nombre: 'Lucha', color: '#c22e28' },
  { clave: 'veneno', nombre: 'Veneno', color: '#a33ea1' },
  { clave: 'tierra', nombre: 'Tierra', color: '#e2bf65' },
  { clave: 'volador', nombre: 'Volador', color: '#a98ff3' },
  { clave: 'psiquico', nombre: 'Psíquico', color: '#f95587', fondos: ['Templo', 'Cosmos'] },
  { clave: 'bicho', nombre: 'Bicho', color: '#a6b91a' },
  { clave: 'roca', nombre: 'Roca', color: '#b6a136' },
  { clave: 'fantasma', nombre: 'Fantasma', color: '#735797' },
  { clave: 'dragon', nombre: 'Dragón', color: '#6f35fc' },
  { clave: 'siniestro', nombre: 'Siniestro', color: '#705746' },
  { clave: 'acero', nombre: 'Acero', color: '#b7b7ce' },
  { clave: 'hada', nombre: 'Hada', color: '#d685ad' },
];

// Fondos adicionales llevan sufijo _b, _c, …
const sufijoFondo = (i) => (i === 0 ? '' : `_${String.fromCharCode(97 + i)}`);

export const TIPOS = TIPOS_BASE.map(({ clave, nombre, color, fondos = ['Principal'] }) => ({
  clave,
  nombre,
  color,
  insignia: asset(`tipos/insignia_${clave}.png`),
  icono: asset(`tipos/icono_${clave}.png`),
  marco: asset(`marcos/marco_${clave}.png`),
  fondos: fondos.map((nombreFondo, i) => ({
    nombre: nombreFondo,
    src: asset(`fondos/fondo_${clave}${sufijoFondo(i)}.png`),
  })),
}));

export const TIPOS_POR_CLAVE = Object.fromEntries(TIPOS.map((t) => [t.clave, t]));

export const TIPO_INICIAL = 'planta';

/** Texto oscuro sobre insignias claras, blanco sobre las oscuras. */
export function colorTextoInsignia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminancia = r * 0.3 + g * 0.59 + b * 0.11;
  return luminancia > 170 ? '#2a2414' : '#ffffff';
}
