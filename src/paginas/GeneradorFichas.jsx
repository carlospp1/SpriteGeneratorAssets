import { useState } from 'react';
import { LIENZO, ESCALA_EXPORT } from '../data/campos';
import { useFicha } from '../hooks/useFicha';
import { useFuentesListas } from '../hooks/useFuentesListas';
import { descargarCanvas, nombreArchivo, renderizarFicha } from '../lib/exportar';
import Ficha, { Carrusel } from '../components/Ficha';
import PanelControles from '../components/PanelControles';
import PanelPaginas from '../components/PanelPaginas';

export default function GeneradorFichas() {
  const fuentesListas = useFuentesListas();
  const { estado, tipo1, paginas, ficha, fichas, etapas, acciones } = useFicha(fuentesListas);
  const [aviso, setAviso] = useState('');
  const onError = (err) => setAviso(`Error: ${err.message}`);

  // Cada página del carrusel lleva su número y nombre: ordenadas al subirlas a Instagram.
  const nombreDe = (f) => {
    const n = paginas.findIndex((p) => p.id === f.pagina) + 1;
    return nombreArchivo(estado.textos.nombre, paginas.length > 1 ? `${n}-${f.pagina}` : '');
  };
  const exportar = async (lista) => {
    setAviso(lista.length > 1 ? `Generando ${lista.length} imágenes…` : 'Generando imagen…');
    try {
      for (const f of lista) await descargarCanvas(await renderizarFicha(f), nombreDe(f));
      setAviso('Listo.');
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="contenedor">
      <section>
        <Ficha
          ficha={ficha}
          fuentesListas={fuentesListas}
          onTexto={(clave, valor) => acciones.cambiarTexto(clave, valor, ficha.pagina)}
          onMoverPersonaje={acciones.moverPersonaje}
          onZoomPersonaje={acciones.zoomPersonaje}
        />
        <Carrusel paginas={paginas} actual={ficha.pagina} onIr={acciones.irAPagina} />
      </section>
      <section>
        <h1>Pokémon Imperia<br />Generador de fichas</h1>
        <p className="entradilla">
          Cada página es una imagen del post de Instagram: la ficha, su shiny y su línea evolutiva. El tipo principal
          decide el escenario, el marco y las partículas. Escribe sobre la ficha y descarga a{' '}
          {LIENZO.w * ESCALA_EXPORT} × {LIENZO.h * ESCALA_EXPORT}.
        </p>
        <PanelPaginas estado={{ ...estado, pagina: ficha.pagina }} tipo1={tipo1} etapas={etapas} acciones={acciones} onError={onError} />
        <div className="panel">
          <PanelControles estado={estado} tipo1={tipo1} acciones={acciones} onError={onError} />
          <div className="fila dos">
            <button className="btn" type="button" onClick={() => exportar([ficha])}>Descargar esta página</button>
            <button className="btn" type="button" onClick={() => exportar(fichas)} disabled={fichas.length < 2}>
              Descargar el post ({fichas.length})
            </button>
          </div>
          <div className="aviso" role="status">{aviso}</div>
        </div>
      </section>
    </div>
  );
}
