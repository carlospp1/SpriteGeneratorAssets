import { CAMPOS, LAYOUT, ZOOMS } from '../data/campos';
import { TIPOS } from '../data/tipos';
import { imagenDesdeArchivo } from '../lib/imagen';
import { datosDeArchivo } from '../lib/datosArchivo';
import BotonArchivo from './BotonArchivo';

const CAMPO_NOMBRE = CAMPOS.find((c) => c.clave === 'nombre');

const ALINEAR = [
  ['izquierda', 'Izquierda', 'Pega el personaje al borde izquierdo del fondo.'],
  ['centro', 'Centro', 'Centra el personaje en horizontal dentro del fondo.'],
  ['derecha', 'Derecha', 'Pega el personaje al borde derecho del fondo.'],
  ['arriba', 'Arriba', 'Pega el personaje arriba del fondo.'],
  ['medio', 'Medio', 'Centra el personaje en vertical dentro del fondo.'],
  ['abajo', 'Abajo', 'Pone los pies del personaje en el borde de abajo del fondo.'],
];

export default function PanelControles({ estado, tipo1, acciones, onError }) {
  const { personaje } = estado;

  // Envuelve los manejadores de archivo para avisar si la imagen no se puede leer.
  const conImagen = (fn) => (archivo) => imagenDesdeArchivo(archivo).then(fn).catch(onError);

  // Al subir el personaje rellena nombre y número de Pokédex a partir del nombre del archivo.
  const subirPersonaje = (archivo) =>
    imagenDesdeArchivo(archivo)
      .then((img) => {
        acciones.ponerPersonaje(img);
        const { nombre, numero } = datosDeArchivo(archivo.name);
        if (nombre) acciones.cambiarTexto('nombre', nombre.slice(0, CAMPO_NOMBRE.maxLength));
        if (numero) acciones.cambiarTexto('numero_dex', numero);
      })
      .catch(onError);

  return (
    <>
      <div className="fila">
        <label className="etiqueta" htmlFor="tipo1">Tipo principal</label>
        <select id="tipo1" value={estado.tipo1} onChange={(e) => acciones.elegirTipo1(e.target.value)}>
          {TIPOS.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
        </select>
        <div className="rejilla-tipos" aria-label="Tipos">
          {TIPOS.map((t) => (
            <button
              key={t.clave}
              type="button"
              title={t.nombre}
              aria-pressed={t.clave === estado.tipo1}
              onClick={() => acciones.elegirTipo1(t.clave)}
            >
              <img src={t.icono} alt={t.nombre} />
            </button>
          ))}
        </div>
      </div>

      {tipo1.fondos.length > 1 && (
        <div className="fila">
          <label className="etiqueta" htmlFor="escenario">Escenario</label>
          <select id="escenario" value={estado.fondoIdx} onChange={(e) => acciones.elegirEscenario(+e.target.value)}>
            {tipo1.fondos.map((f, i) => <option key={f.nombre} value={i}>{f.nombre}</option>)}
          </select>
        </div>
      )}

      <div className="fila">
        <label className="etiqueta" htmlFor="tipo2">Tipo secundario</label>
        <select id="tipo2" value={estado.tipo2} onChange={(e) => acciones.elegirTipo2(e.target.value)}>
          <option value="">Ninguno</option>
          {TIPOS.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
        </select>
      </div>

      <div className="fila">
        <span className="etiqueta">Personaje</span>
        <div className="dos">
          <BotonArchivo etiqueta="Subir personaje" onArchivo={subirPersonaje}>Subir</BotonArchivo>
          <button className="btn ghost" type="button" disabled={!personaje} onClick={() => acciones.ponerPersonaje(null)}>Quitar</button>
        </div>
        <p className="pista">
          PNG con fondo transparente. Arrástralo sobre la ficha para moverlo; usa la rueda del ratón para el zoom.
        </p>
        {personaje && (
          <>
            <span className="etiqueta" style={{ marginTop: 10 }}>Zoom</span>
            <div className="zoom">
              <button
                className="btn ghost"
                type="button"
                aria-label="Reducir zoom"
                disabled={personaje.zoom === ZOOMS[0]}
                onClick={() => acciones.zoomPersonaje(-1)}
              >
                −
              </button>
              <output aria-live="polite">x{personaje.zoom}</output>
              <button
                className="btn ghost"
                type="button"
                aria-label="Aumentar zoom"
                disabled={personaje.zoom === ZOOMS.at(-1)}
                onClick={() => acciones.zoomPersonaje(1)}
              >
                +
              </button>
            </div>
            <span className="etiqueta" style={{ marginTop: 10 }}>Posición en el fondo</span>
            <div className="alinear" role="group" aria-label="Alinear el personaje en el fondo">
              {ALINEAR.map(([donde, texto, ayuda]) => (
                <button key={donde} className="btn ghost" type="button" title={ayuda} onClick={() => acciones.alinearPersonaje(donde)}>
                  {texto}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="fila">
        <span className="etiqueta">Fondo y marco propios (opcional)</span>
        <div className="dos">
          <BotonArchivo
            etiqueta="Cambiar fondo"
            onArchivo={conImagen((img) => acciones.ponerFondo(img.src))}
          >
            Fondo
          </BotonArchivo>
          <BotonArchivo etiqueta="Cambiar marco" accept="image/png" onArchivo={conImagen((img) => acciones.ponerMarco(img.src))}>
            Marco
          </BotonArchivo>
        </div>
        <p className="pista">
          Sustituyen los del tipo actual hasta que cambies de tipo. El fondo se recorta centrado para cubrir la ventana.
          Marco: PNG {LAYOUT.lienzo.w} × {LAYOUT.lienzo.h} con la ventana transparente.
        </p>
      </div>
    </>
  );
}
