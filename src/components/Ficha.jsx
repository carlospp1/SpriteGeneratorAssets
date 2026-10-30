import { useEffect, useRef } from 'react';
import { ESCALA_EXPORT as K, LAYOUT, LIENZO } from '../data/campos';
import { posicion } from '../lib/estilo';
import { pintarEscena } from '../lib/escena';
import CampoTexto from './CampoTexto';
import { PersonajeArrastre } from './Personaje';

const F = LAYOUT.fondo;

const TODA = { x: 0, y: 0, ...LIENZO };

/** La escena (personaje, shiny o la página de evoluciones entera), pintada igual que en la descarga. */
function Escena({ escena, completa, fuentesListas }) {
  const ref = useRef(null);
  const r = completa ? TODA : F;
  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, r.w * K, r.h * K);
    ctx.translate(-r.x * K, -r.y * K);
    pintarEscena(ctx, K, escena);
  }, [escena, r, fuentesListas]);
  return <canvas ref={ref} className="capa" width={r.w * K} height={r.h * K} style={posicion(r)} aria-hidden="true" />;
}

/** Previsualización editable de una página de la ficha. Todas las capas se colocan en px de lienzo. */
export default function Ficha({ ficha, fuentesListas, onTexto, onMoverPersonaje, onZoomPersonaje }) {
  const ref = useRef(null);
  const [insignia1, insignia2] = ficha.insignias;
  // En la página de evoluciones el personaje va en su sitio de la fila: no se arrastra.
  const arrastrable = ficha.personaje && ficha.pagina !== 'evo';

  return (
    <div className="ficha" ref={ref}>
      {ficha.fondo && <img className="capa" src={ficha.fondo} alt="" style={{ ...posicion(F), objectFit: 'cover' }} />}
      <Escena escena={ficha.escena} completa={ficha.completa} fuentesListas={fuentesListas} />
      {ficha.marco && <img className="capa" src={ficha.marco} alt="" style={posicion(TODA)} />}
      {insignia1 && <img className="capa" src={insignia1} alt="" style={posicion(LAYOUT.insignia_tipo_1)} />}
      {insignia2 && <img className="capa" src={insignia2} alt="" style={posicion(LAYOUT.insignia_tipo_2)} />}
      {arrastrable && (
        <PersonajeArrastre
          personaje={ficha.personaje}
          fichaRef={ref}
          onMover={onMoverPersonaje}
          onZoom={onZoomPersonaje}
        />
      )}
      {ficha.textos.map((t) => (
        <CampoTexto key={t.campo.clave} {...t} onChange={(valor) => onTexto(t.campo.clave, valor)} />
      ))}
    </div>
  );
}

/** Debajo de la ficha: pasa de una página del post a otra, como en el carrusel de Instagram. */
export function Carrusel({ paginas, actual, onIr }) {
  const i = Math.max(0, paginas.findIndex((p) => p.id === actual));
  const ir = (d) => onIr(paginas[(i + d + paginas.length) % paginas.length].id);
  return (
    <nav className="carrusel" aria-label="Páginas del post">
      <button className="btn ghost flecha" type="button" aria-label="Página anterior" onClick={() => ir(-1)}>◀</button>
      <div className="carrusel-paginas">
        {paginas.map((p, n) => (
          <button key={p.id} className="btn ghost" type="button" aria-current={p.id === actual ? 'page' : undefined} onClick={() => onIr(p.id)}>
            {n + 1} · {p.titulo}
          </button>
        ))}
        <div className="puntos" aria-hidden="true">
          {paginas.map((p) => <span key={p.id} className={p.id === actual ? 'activo' : undefined} />)}
        </div>
      </div>
      <button className="btn ghost flecha" type="button" aria-label="Página siguiente" onClick={() => ir(1)}>▶</button>
    </nav>
  );
}
