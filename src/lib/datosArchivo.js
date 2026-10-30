// Nombres de los Pokémon conocidos, sacados de los sprites de assets/pokemons (ABSOL_1.png → ABSOL).
const RUTAS = import.meta.glob('../assets/pokemons/**/*.{png,PNG}', { eager: true, query: '?url', import: 'default' });
const CONOCIDOS = [...new Set(
  Object.keys(RUTAS).map((ruta) => ruta.split('/').pop().replace(/\.[^.]+$/, '').split('_')[0].toUpperCase()),
)].sort((a, b) => b.length - a.length); // el más largo primero: KADABRA antes que ABRA

// Palabras que suelen acompañar al nombre y no forman parte de él.
const BASURA = /^(sprite|sprites|front|back|frente|espalda|shiny|female|male|gmax|mega|shadow|normal|final|copy|copia|img|image|imagen|pokemon|pokémon|hd|sd|png|gif|fondo|transparente|new|nuevo|old|edit|editado)$/i;

/** Número de Pokédex: marcado con # o Nº, al principio, o un número suelto de 3 cifras ("pikachu_025"). */
function buscarNumero(base) {
  const m =
    base.match(/(?:#|\bn[º°o]\.?)\s*(\d{1,4})\b/i) ??
    base.match(/^(\d{1,4})(?=[\s_.()-]|$)/) ??
    base.match(/(?:^|[\s_.()-])(\d{3})(?=[\s_.()-]|$)/);
  return m ? m[1].padStart(3, '0') : null;
}

/** Nombre: el Pokémon conocido que aparezca en el archivo; si no hay ninguno, la palabra más larga que no sea basura. */
function buscarNombre(base) {
  const compacto = base
    .split(/[^A-Za-z0-9]+/)
    .filter((p) => !BASURA.test(p))
    .join('')
    .toUpperCase();
  const conocido = CONOCIDOS.find((n) => compacto.includes(n.replace(/[^A-Z0-9]/g, '')));
  if (conocido) return conocido;
  const palabras = base
    .split(/[^A-Za-zÀ-ÿ]+/)
    .filter((p) => p.length > 1 && !BASURA.test(p));
  return palabras.reduce((a, b) => (b.length > a.length ? b : a), '').toUpperCase();
}

/**
 * Saca el nombre y el número de Pokédex del nombre de un archivo, descartando lo demás.
 * "sprite_025_pikachu_final (2).png" → { nombre: 'PIKACHU', numero: '025' }
 * @returns {{ nombre: string, numero: string | null }}
 */
export function datosDeArchivo(nombreArchivo) {
  const base = nombreArchivo.replace(/\.[^.]+$/, '');
  return { nombre: buscarNombre(base), numero: buscarNumero(base) };
}
