import { useEffect, useRef } from 'react';
import { imagenDesdeArchivo } from '../lib/imagen';
import { datosDeArchivo } from '../lib/datosArchivo';
import { aclarar, alto, ancho, recortar, silueta } from '../lib/sprites';
import { descargarCanvas } from '../lib/exportar';
import BotonArchivo from './BotonArchivo';

/** Vista pequeña de un sprite (imagen o canvas) sobre cuadros, a tamaño entero para que no se emborrone. */
function Miniatura({ img, lado = 56 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (!img) return;
    const z = Math.min(lado / ancho(img), lado / alto(img));
    const w = Math.max(1, Math.round(ancho(img) * z)), h = Math.max(1, Math.round(alto(img) * z));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round((lado - w) / 2), Math.round((lado - h) / 2), w, h);
  }, [img, lado]);
  return <canvas ref={ref} className="miniatura ajedrez" width={lado} height={lado} aria-hidden="true" />;
}

const nombreSinExtension = (n) => n.replace(/\.[^.]+$/, '');

/* ---------- Shiny ---------- */
function ControlesShiny({ estado, acciones, onError }) {
  const { shiny, personaje } = estado;
  return (
    <div className="fila">
      <span className="etiqueta">Sprite shiny</span>
      <div className="con-miniatura">
        <Miniatura img={shiny.img ?? null} />
        <div className="dos">
          <BotonArchivo etiqueta="Subir sprite shiny" onArchivo={(f) => imagenDesdeArchivo(f).then((img) => acciones.cambiarShiny({ img })).catch(onError)}>
            Subir
          </BotonArchivo>
          <button className="btn ghost" type="button" disabled={!shiny.img} onClick={() => acciones.cambiarShiny({ img: null })}>Quitar</button>
        </div>
      </div>
      <p className="pista">Ocupa el mismo sitio y zoom que el personaje de la ficha (arrástralo aquí también).</p>
      {!shiny.img && (
        <>
          <label className="etiqueta" htmlFor="tono" style={{ marginTop: 10 }}>
            Sin sprite shiny: girar el tono del personaje ({shiny.tono}°)
          </label>
          <input id="tono" type="range" min={-180} max={180} step={5} value={shiny.tono} disabled={!personaje}
            onChange={(e) => acciones.cambiarShiny({ tono: +e.target.value })} />
          <p className="pista">Un apaño para probar: cambia todos los colores a la vez. Para el post, mejor sube el shiny de verdad.</p>
        </>
      )}
    </div>
  );
}

/* ---------- Evoluciones ---------- */
function ControlesEvo({ estado, tipo1, etapas, acciones, onError }) {
  const { evo } = estado;
  const contorno = evo.contorno ? aclarar(tipo1.color, 0.35) : null;
  const opciones = { color: evo.color, contorno };

  const subirForma = (i, j) => (archivo) =>
    imagenDesdeArchivo(archivo)
      .then((img) => {
        const { nombre } = datosDeArchivo(archivo.name);
        acciones.cambiarForma(i, j, { img, ...(nombre && !evo.datos[i].formas[j].nombre ? { nombre } : {}) });
      })
      .catch(onError);

  const descargarSilueta = (img, nombre) => descargarCanvas(silueta(recortar(img), opciones), `${nombre || 'sprite'}_silueta.png`);
  // herramienta suelta: cualquier PNG → su silueta, a su tamaño (sin recortar)
  const siluetaDeArchivo = (archivo) =>
    imagenDesdeArchivo(archivo)
      .then((img) => descargarCanvas(silueta(img, opciones), `${nombreSinExtension(archivo.name)}_silueta.png`))
      .catch(onError);

  return (
    <>
      <SelectoresEvo evo={evo} acciones={acciones} />

      {evo.etapas > 1 && (
        <>
          <div className="fila">
            <span className="etiqueta">Sprites de la línea</span>
            <ol className="etapas">
              {etapas.map((e, i) => {
                const etapa = evo.datos[i];
                const futura = i > evo.actual - 1;
                const anteriores = i > 0 ? etapas[i - 1].formas : [];
                return (
                  <li key={i} className={e.actual ? 'actual' : undefined}>
                    <div className="etapa-cabecera">
                      <strong>Etapa {i + 1}{e.actual ? ' · esta ficha' : futura ? ' · por venir' : ''}</strong>
                      <label>
                        Formas{' '}
                        <select value={etapa.formas.length} aria-label={`Formas de la etapa ${i + 1}`}
                          onChange={(ev) => acciones.cambiarEtapa(i, { n: +ev.target.value })}>
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      </label>
                    </div>
                    {etapa.formas.length > 1 && (
                      <p className="pista">Se evoluciona a una u otra: salen una encima de otra, y cada una sigue en su fila en la etapa siguiente.</p>
                    )}
                    {e.actual && etapa.formas.length > 1 && (
                      <label className="etapa-campo">
                        Esta ficha es la forma{' '}
                        <select value={evo.actualForma} onChange={(ev) => acciones.cambiarEvo({ actualForma: +ev.target.value })}>
                          {etapa.formas.map((_, j) => <option key={j} value={j}>{j + 1}</option>)}
                        </select>
                      </label>
                    )}
                    {etapa.formas.map((f, j) => {
                      const mia = e.actual && j === evo.actualForma;
                      const quien = `la etapa ${i + 1}${etapa.formas.length > 1 ? `, forma ${j + 1}` : ''}`;
                      return (
                        <div key={j} className="forma-etapa">
                          <Miniatura img={e.formas[j].img} />
                          <div className="etapa-datos">
                            {etapa.formas.length > 1 && <span className="pista">Forma {j + 1}</span>}
                            {mia ? (
                              <span className="pista">Es el personaje de la ficha, con su nombre.</span>
                            ) : (
                              <>
                                <input type="text" value={f.nombre} maxLength={14} placeholder="Nombre" aria-label={`Nombre de ${quien}`}
                                  onChange={(ev) => acciones.cambiarForma(i, j, { nombre: ev.target.value })} />
                                <div className="dos">
                                  <BotonArchivo etiqueta={`Subir sprite de ${quien}`} onArchivo={subirForma(i, j)}>Subir</BotonArchivo>
                                  <button className="btn ghost" type="button" disabled={!f.img} onClick={() => acciones.cambiarForma(i, j, { img: null })}>Quitar</button>
                                </div>
                              </>
                            )}
                            {i > 0 && (
                              <input type="text" value={f.metodo} maxLength={18} placeholder="Cómo evoluciona a ella: Nv. 16, Piedra…"
                                aria-label={`Cómo se evoluciona a ${quien}`} onChange={(ev) => acciones.cambiarForma(i, j, { metodo: ev.target.value })} />
                            )}
                            {anteriores.length > 1 && (
                              <label className="etapa-campo">
                                Viene de{' '}
                                <select value={Math.min(f.de, anteriores.length - 1)} onChange={(ev) => acciones.cambiarForma(i, j, { de: +ev.target.value })}>
                                  {anteriores.map((a, k) => <option key={k} value={k}>{k + 1} · {a.mia ? 'esta ficha' : evo.datos[i - 1].formas[k].nombre || `forma ${k + 1}`}</option>)}
                                </select>
                              </label>
                            )}
                            {futura && f.img && (
                              <button className="btn ghost" type="button" onClick={() => descargarSilueta(f.img, f.nombre)}>Descargar silueta</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {futura && (
                      <label className="casilla">
                        <input type="checkbox" checked={etapa.revelar} onChange={(ev) => acciones.cambiarEtapa(i, { revelar: ev.target.checked })} />
                        <span>Revelarla (sin silueta y con sus nombres; si no, sale «???»)</span>
                      </label>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="fila">
            <span className="etiqueta">Tamaño de los sprites</span>
            <div className="zoom">
              <button className="btn ghost" type="button" aria-label="Más pequeños" onClick={() => acciones.cambiarEvo({ paso: evo.paso - 1 })}>−</button>
              <output aria-live="polite">{evo.paso === 0 ? 'auto' : evo.paso > 0 ? `+${evo.paso}` : evo.paso}</output>
              <button className="btn ghost" type="button" aria-label="Más grandes" onClick={() => acciones.cambiarEvo({ paso: evo.paso + 1 })}>+</button>
            </div>
            <p className="pista">Todas al mismo tamaño de píxel, para que se note cómo crecen. «auto» es el mayor con el que caben.</p>
          </div>
        </>
      )}

      <div className="fila">
        <span className="etiqueta">Silueta</span>
        <div className="dos">
          <label className="color-campo">
            <input type="color" value={evo.color} onChange={(e) => acciones.cambiarEvo({ color: e.target.value })} />
            <span>Color</span>
          </label>
          <label className="casilla">
            <input type="checkbox" checked={evo.contorno} onChange={(e) => acciones.cambiarEvo({ contorno: e.target.checked })} />
            <span>Contorno del color del tipo</span>
          </label>
        </div>
        <BotonArchivo etiqueta="Convertir un PNG en silueta" onArchivo={siluetaDeArchivo}>Convertir un PNG en silueta</BotonArchivo>
        <p className="pista">Descarga la silueta en pixel art de cualquier sprite, a su tamaño, con este color y contorno.</p>
      </div>
    </>
  );
}

/** Ajustes de la página que se está viendo: lo propio del shiny o de las evoluciones. */
export default function PanelPaginas({ estado, tipo1, etapas, acciones, onError }) {
  const { pagina } = estado;
  if (pagina === 'ficha') return null;
  return (
    <div className="panel panel-pagina">
      {pagina === 'shiny' && <ControlesShiny estado={estado} acciones={acciones} onError={onError} />}
      {pagina === 'evo' && <ControlesEvo estado={estado} tipo1={tipo1} etapas={etapas} acciones={acciones} onError={onError} />}
    </div>
  );
}

/** Cuántas etapas tiene la línea y cuál es este Pokémon. */
function SelectoresEvo({ evo, acciones }) {
  return (
    <div className="fila dos">
      <div>
        <label className="etiqueta" htmlFor="etapas">Evoluciones</label>
        <select id="etapas" value={evo.etapas} onChange={(e) => acciones.cambiarEvo({ etapas: +e.target.value })}>
          <option value={1}>No evoluciona</option>
          <option value={2}>2 etapas</option>
          <option value={3}>3 etapas</option>
        </select>
      </div>
      <div>
        <label className="etiqueta" htmlFor="actual">Este Pokémon es</label>
        <select id="actual" value={evo.actual} disabled={evo.etapas === 1} onChange={(e) => acciones.cambiarEvo({ actual: +e.target.value })}>
          {Array.from({ length: evo.etapas }, (_, i) => <option key={i} value={i + 1}>Etapa {i + 1}</option>)}
        </select>
      </div>
    </div>
  );
}
