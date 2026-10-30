import { useEffect, useMemo, useReducer, useState } from 'react';
import { CAMPOS, LAYOUT, ZOOMS } from '../data/campos';
import { TIPOS_POR_CLAVE, TIPO_INICIAL, colorTextoInsignia } from '../data/tipos';
import { PAGINAS, PAGINAS_POR_ID } from '../data/paginas';
import { tamanoAjustado } from '../lib/texto';
import { cargarImagen } from '../lib/imagen';
import { EVO } from '../lib/paginaEvo';
import { aclarar, girarTono, recortar, silueta } from '../lib/sprites';

const P = LAYOUT.personaje;
const F = LAYOUT.fondo;
const clamp = (v, min, max) => Math.round(Math.max(min, Math.min(max, v)));

/** Mayor zoom con el que la imagen cabe en el tamaño por defecto. */
function zoomInicial(img) {
  const cabe = (z) => img.naturalHeight * z <= P.alto_por_defecto && img.naturalWidth * z <= F.w;
  return [...ZOOMS].reverse().find(cabe) ?? ZOOMS[0];
}

/** Recoloca al personaje para que su centro no salga de la ventana del fondo. */
function encajar(p) {
  const mitad = (p.img.naturalHeight * p.zoom) / 2;
  return {
    ...p,
    x: clamp(p.x, F.x, F.x + F.w),
    y: clamp(p.y, F.y + mitad, F.y + F.h + mitad),
  };
}
/** Coloca al personaje respecto a la ventana del fondo (no de toda la ficha): pegado a un borde o centrado. */
function alinear(p, donde) {
  const w = p.img.naturalWidth * p.zoom;
  const h = p.img.naturalHeight * p.zoom;
  const pos = {
    izquierda: { x: F.x + w / 2 },
    centro: { x: F.x + F.w / 2 },
    derecha: { x: F.x + F.w - w / 2 },
    arriba: { y: F.y + h },
    medio: { y: F.y + (F.h + h) / 2 },
    abajo: { y: F.y + F.h },
  }[donde];
  return encajar({ ...p, ...pos });
}
const textoTipo = (clave) => (clave ? TIPOS_POR_CLAVE[clave].nombre.toUpperCase() : '');

// Cada etapa tiene de 1 a 3 formas: se evoluciona a una u otra (Pyroar macho / hembra, o tres distintas).
// Forma: su sprite, su nombre, cómo se evoluciona a ella y de qué forma de la etapa anterior viene (de).
const formaVacia = (de = 0) => ({ img: null, nombre: '', metodo: '', de });
const etapaVacia = () => ({ revelar: false, formas: [formaVacia()] });

// El único texto de la página de evoluciones: su recuadro de abajo.
const CAMPO_EVO = {
  clave: 'descripcion', etiqueta: 'Cómo evoluciona', font: 'px', size: 7, min: 5, color: '#3a2414',
  maxLength: 200, multilinea: true, caja: EVO.descripcion,
};

const estadoInicial = {
  pagina: 'ficha',
  tipo1: TIPO_INICIAL,
  tipo2: '',
  fondoIdx: 0,
  // Fondo y marco subidos por el usuario; se descartan al cambiar de tipo o escenario.
  fondoPropio: null,
  marcoPropio: null,
  personaje: null, // { img, x, y, zoom }: (x, y) es el centro de sus pies en px de lienzo
  textos: { ...Object.fromEntries(CAMPOS.map((c) => [c.clave, ''])), t1: textoTipo(TIPO_INICIAL) },
  // Textos propios de cada página (los que no se comparten con la ficha); sin clave = valor por defecto.
  textosPagina: { shiny: {}, evo: {} },
  // Shiny: su sprite; sin él se usa el del personaje con el tono girado.
  shiny: { img: null, tono: 0 },
  // Evoluciones: cuántas etapas hay (1 = no evoluciona), cuál es este Pokémon (etapa 1, 2 o 3 y, si esa etapa
  // tiene varias formas, cuál de ellas) y las formas de cada etapa. La de esta ficha usa el personaje y su nombre.
  evo: { etapas: 3, actual: 1, actualForma: 0, datos: [etapaVacia(), etapaVacia(), etapaVacia()], color: '#000000', contorno: true, paso: 0 },
};

function reducer(estado, accion) {
  switch (accion.type) {
    case 'pagina':
      return { ...estado, pagina: accion.id };
    case 'tipo1':
      return {
        ...estado,
        tipo1: accion.clave,
        fondoIdx: 0,
        fondoPropio: null,
        marcoPropio: null,
        textos: { ...estado.textos, t1: textoTipo(accion.clave) },
      };
    case 'tipo2':
      return { ...estado, tipo2: accion.clave, textos: { ...estado.textos, t2: textoTipo(accion.clave) } };
    case 'escenario':
      return { ...estado, fondoIdx: accion.idx, fondoPropio: null };
    case 'texto': {
      // Los textos propios de la página se guardan aparte; el resto es de todas.
      const { pagina, clave, valor } = accion;
      if (clave in PAGINAS_POR_ID[pagina].propios) {
        const tp = estado.textosPagina;
        return { ...estado, textosPagina: { ...tp, [pagina]: { ...tp[pagina], [clave]: valor } } };
      }
      return { ...estado, textos: { ...estado.textos, [clave]: valor } };
    }
    case 'fondoPropio':
      return { ...estado, fondoPropio: accion.src };
    case 'marcoPropio':
      return { ...estado, marcoPropio: accion.src };
    case 'personaje': {
      const { img } = accion;
      if (!img) return { ...estado, personaje: null };
      return { ...estado, personaje: { img, x: P.centro_x, y: P.suelo_y, zoom: zoomInicial(img) } };
    }
    case 'moverPersonaje':
      return { ...estado, personaje: encajar({ ...estado.personaje, x: accion.x, y: accion.y }) };
    case 'alinearPersonaje':
      return { ...estado, personaje: alinear(estado.personaje, accion.donde) };
    case 'zoomPersonaje': {
      const i = ZOOMS.indexOf(estado.personaje.zoom) + accion.paso;
      const zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i))];
      return { ...estado, personaje: encajar({ ...estado.personaje, zoom }) };
    }
    case 'shiny':
      return { ...estado, shiny: { ...estado.shiny, ...accion.cambios } };
    case 'evo': {
      const evo = { ...estado.evo, ...accion.cambios };
      evo.actual = Math.min(evo.actual, evo.etapas);
      evo.actualForma = Math.min(evo.actualForma, evo.datos[evo.actual - 1].formas.length - 1);
      return { ...estado, evo };
    }
    case 'etapa': {
      // cambios de la etapa i: revelar, o cuántas formas tiene (n)
      const { i, cambios: { n, ...resto } } = accion;
      const datos = estado.evo.datos.map((e, k) => {
        if (k !== i) return e;
        let formas = e.formas;
        if (n) formas = Array.from({ length: n }, (_, j) => formas[j] ?? formaVacia(j));
        return { ...e, ...resto, formas };
      });
      // si había más formas que ahora, las siguientes que venían de ellas pasan a venir de la última que queda
      if (n && datos[i + 1]) {
        datos[i + 1] = { ...datos[i + 1], formas: datos[i + 1].formas.map((f) => (f.de >= n ? { ...f, de: n - 1 } : f)) };
      }
      const evo = { ...estado.evo, datos };
      if (i === evo.actual - 1) evo.actualForma = Math.min(evo.actualForma, datos[i].formas.length - 1);
      return { ...estado, evo };
    }
    case 'forma': {
      const { i, j, cambios } = accion;
      const datos = estado.evo.datos.map((e, k) => (k !== i ? e : { ...e, formas: e.formas.map((f, m) => (m === j ? { ...f, ...cambios } : f)) }));
      return { ...estado, evo: { ...estado.evo, datos } };
    }
    case 'reiniciar':
      return estadoInicial;
    default:
      throw new Error(`Acción desconocida: ${accion.type}`);
  }
}

/**
 * Las etapas de la línea evolutiva listas para pintar: cada una con sus formas, recortadas y, las que están por
 * venir, en silueta. mia: la forma que es el personaje de esta ficha.
 */
function etapasEvo(estado, tipo1) {
  const { evo, personaje, textos } = estado;
  const contorno = evo.contorno ? aclarar(tipo1.color, 0.35) : null;
  return Array.from({ length: evo.etapas }, (_, i) => {
    const actual = i === evo.actual - 1;
    const etapa = evo.datos[i];
    const enSilueta = i > evo.actual - 1 && !etapa.revelar;
    const formas = etapa.formas.map((f, j) => {
      const mia = actual && j === evo.actualForma;
      let img = mia ? personaje?.img : f.img;
      img = img ? recortar(img) : null;
      if (img && enSilueta) img = silueta(img, { color: evo.color, contorno });
      const nombre = (mia ? textos.nombre : f.nombre).trim();
      // por venir: el nombre se guarda, pero no se ve hasta revelarla
      return {
        img, mia, metodo: i > 0 ? f.metodo.trim() : '', de: Math.min(f.de, (evo.datos[i - 1]?.formas.length ?? 1) - 1),
        nombre: enSilueta ? '???' : nombre || (mia ? 'NOMBRE' : `Etapa ${i + 1}${etapa.formas.length > 1 ? String.fromCharCode(65 + j) : ''}`),
      };
    });
    return { actual, silueta: enSilueta, formas };
  });
}

/**
 * Estado de la ficha y valores derivados listos para pintar, una ficha por página del post.
 * @param {boolean} fuentesListas  fuerza a recalcular tamaños de texto cuando cargan las fuentes web.
 */
export function useFicha(fuentesListas) {
  const [estado, dispatch] = useReducer(reducer, estadoInicial);
  const tipo1 = TIPOS_POR_CLAVE[estado.tipo1];
  const tipo2 = estado.tipo2 ? TIPOS_POR_CLAVE[estado.tipo2] : null;
  const paginas = PAGINAS;
  // el icono del tipo, para la cabecera de la página de evoluciones
  const [icono, setIcono] = useState(null);
  useEffect(() => {
    let vivo = true;
    cargarImagen(tipo1.icono).then((img) => vivo && setIcono(img), () => {});
    return () => {
      vivo = false;
    };
  }, [tipo1.icono]);

  // Textos de cada página: los compartidos más los propios de la página. La de evoluciones solo lleva su recuadro.
  const textos = useMemo(() => {
    const colores = {
      t1: colorTextoInsignia(tipo1.color),
      t2: tipo2 && colorTextoInsignia(tipo2.color),
    };
    return Object.fromEntries(PAGINAS.map((pagina) => {
      const propios = estado.textosPagina[pagina.id] ?? {};
      const campos = pagina.id === 'evo' ? [CAMPO_EVO] : CAMPOS.filter((c) => c.clave !== 't2' || tipo2);
      return [pagina.id, campos.map((c) => {
        const propio = c.clave in pagina.propios;
        const valor = propio ? (propios[c.clave] ?? '') : estado.textos[c.clave];
        const campo = propio ? { ...c, placeholder: pagina.propios[c.clave] } : c;
        return {
          campo,
          texto: valor,
          color: colores[c.clave] ?? c.color,
          // Si está vacío se ajusta al placeholder, que es lo que se ve.
          tamano: tamanoAjustado(campo, valor || campo.placeholder || ''),
        };
      })];
    }));
    // fuentesListas no se usa dentro, pero al cargar las fuentes cambian las medidas.
  }, [estado.textos, estado.textosPagina, tipo1, tipo2, fuentesListas]);

  const { personaje, shiny } = estado;
  const spriteShiny = useMemo(() => {
    if (!personaje) return null;
    return { ...personaje, img: shiny.img ?? girarTono(personaje.img, shiny.tono) };
  }, [personaje, shiny]);
  const etapas = useMemo(() => etapasEvo(estado, tipo1), [estado.evo, personaje, estado.textos.nombre, tipo1]);

  const comun = {
    fondo: estado.fondoPropio ?? tipo1.fondos[estado.fondoIdx].src,
    marco: estado.marcoPropio ?? tipo1.marco,
    insignias: [tipo1.insignia, tipo2?.insignia ?? null],
  };
  // La de evoluciones tiene su propio marco y escenario: ocupa la ficha entera.
  const fichaDe = (id) => ({
    ...(id === 'evo' ? { completa: true, fondo: null, marco: null, insignias: [null, null] } : comun),
    pagina: id,
    personaje,
    textos: textos[id],
    escena: {
      pagina: id,
      tipo: tipo1,
      icono,
      sprite: id === 'shiny' ? spriteShiny : personaje,
      evo: id === 'evo' ? { etapas, paso: estado.evo.paso } : null,
    },
  });
  const fichas = paginas.map((p) => fichaDe(p.id));
  const ficha = fichas.find((f) => f.pagina === estado.pagina) ?? fichas[0];

  const acciones = useMemo(
    () => ({
      irAPagina: (id) => dispatch({ type: 'pagina', id }),
      elegirTipo1: (clave) => dispatch({ type: 'tipo1', clave }),
      elegirTipo2: (clave) => dispatch({ type: 'tipo2', clave }),
      elegirEscenario: (idx) => dispatch({ type: 'escenario', idx }),
      // pagina: la que se edita (sus textos propios van aparte); sin ella, los compartidos
      cambiarTexto: (clave, valor, pagina = 'ficha') => dispatch({ type: 'texto', pagina, clave, valor }),
      ponerFondo: (src) => dispatch({ type: 'fondoPropio', src }),
      ponerMarco: (src) => dispatch({ type: 'marcoPropio', src }),
      ponerPersonaje: (img) => dispatch({ type: 'personaje', img }),
      moverPersonaje: (x, y) => dispatch({ type: 'moverPersonaje', x, y }),
      alinearPersonaje: (donde) => dispatch({ type: 'alinearPersonaje', donde }),
      zoomPersonaje: (paso) => dispatch({ type: 'zoomPersonaje', paso }),
      cambiarShiny: (cambios) => dispatch({ type: 'shiny', cambios }),
      cambiarEvo: (cambios) => dispatch({ type: 'evo', cambios }),
      cambiarEtapa: (i, cambios) => dispatch({ type: 'etapa', i, cambios }),
      cambiarForma: (i, j, cambios) => dispatch({ type: 'forma', i, j, cambios }),
      reiniciar: () => dispatch({ type: 'reiniciar' }),
    }),
    [],
  );

  return { estado, tipo1, paginas, ficha, fichas, etapas, acciones };
}
