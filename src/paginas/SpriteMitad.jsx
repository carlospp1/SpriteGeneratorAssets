import { useEffect, useMemo, useRef, useState } from 'react';
import { descargarCanvas } from '../lib/exportar';
import { analizar, reducir, aImagen, pixel, detectarBloque, colapsar } from '../lib/mitad';

const DESPLAZAMIENTOS = [[0, 0], [1, 0], [0, 1], [1, 1]];

async function leer(archivo) {
  const bmp = await createImageBitmap(archivo);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
}

/** Un canvas que pinta una ImageData a escala, con píxeles nítidos. */
function Lienzo({ imagen, zoom, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    c.width = imagen.width;
    c.height = imagen.height;
    c.getContext('2d').putImageData(imagen, 0, 0);
  }, [imagen]);
  return <canvas ref={ref} className="mitad-px" style={zoom ? { width: imagen.width * zoom } : undefined} {...props} />;
}

/* el modo y la rejilla de un sprite: los comunes, o los que detectó en él con «Automático» */
const modoDe = (it, aj) => (aj.modo === 'auto' ? (it.info.limpio ? 'directo' : 'inteligente') : aj.modo);
const despDe = (it, aj) => (aj.desp === 'auto' ? it.info.desplazamiento : DESPLAZAMIENTOS[aj.desp]);

/* el resultado de un sprite con los ajustes comunes y sus retoques, como ImageData */
function resultadoDe(it, aj, d = despDe(it, aj), conRetoques = true) {
  const r = reducir(it.base, { ...it.info, contorno: it.contorno }, d, modoDe(it, aj));
  const fondo = it.info.fondo;
  const imagen = aImagen(r.w, r.h, (i) => {
    let k = conRetoques && it.retoques.has(i) ? it.retoques.get(i) : r.claves[i];
    if (k === fondo && aj.transparente) k = 'T';
    return k;
  });
  return { ...r, imagen };
}

// escala: 'original' = la mitad ampliada ×2 al lienzo del sprite subido; 1 = la mitad tal cual
const AJUSTES = { modo: 'auto', desp: 'auto', transparente: false, escala: 'original' };

export default function SpriteMitad() {
  // [{ id, nombre, src (la imagen subida), bloque (su tamaño de píxel), base (su dibujo: un píxel por bloque), info,
  //    contorno: Set, retoques: Map(píxel → clave pintada a mano), pincel }]
  const [lista, setLista] = useState([]);
  const [activo, setActivo] = useState(null);
  const [aj, setAj] = useState(AJUSTES);
  const [zoom, setZoom] = useState(6);
  const [aviso, setAviso] = useState('');
  const [encima, setEncima] = useState(false);
  const historias = useRef(new Map()); // id → trazos hechos a mano, para deshacer: [Map(píxel → antes)]
  const [, setPasos] = useState(0);    // para repintar los botones al deshacer
  const trazo = useRef(null);          // { id, cambios: Map(píxel → antes), retoques, clave }

  const cambiar = (id, cambios) => setLista((l) => l.map((x) => (x.id === id ? { ...x, ...(typeof cambios === 'function' ? cambios(x) : cambios) } : x)));

  const añadir = async (archivos) => {
    const imagenes = [...archivos].filter((f) => f?.type.startsWith('image/'));
    if (!imagenes.length) return setAviso('Eso no son imágenes.');
    const nuevos = [], fallos = [];
    for (const archivo of imagenes) {
      try {
        const src = await leer(archivo);
        if (src.w < 2 || src.h < 2) { fallos.push(archivo.name); continue; }
        // si ya pasó por aquí (o está dibujado con píxeles gordos), se reduce su dibujo de verdad: otra vez a la mitad
        const bloque = detectarBloque(src), base = colapsar(src, bloque);
        if (base.w < 2 || base.h < 2) { fallos.push(archivo.name); continue; }
        const info = analizar(base);
        nuevos.push({
          id: crypto.randomUUID(), nombre: archivo.name || 'sprite.png', src, bloque, base, info,
          contorno: info.contorno, retoques: new Map(),
          pincel: (info.paleta.find((p) => p.clave !== info.fondo) || info.paleta[0]).clave,
        });
      } catch {
        fallos.push(archivo.name);
      }
    }
    setLista((l) => [...l, ...nuevos]);
    if (nuevos.length) setActivo((a) => a ?? nuevos[0].id);
    setAviso(fallos.length ? `No se pudo usar: ${fallos.join(', ')}.` : '');
  };

  // pegar una imagen (Ctrl+V) mientras esta página está abierta
  useEffect(() => {
    const pegar = (e) => {
      const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (it) añadir([it.getAsFile()]);
    };
    addEventListener('paste', pegar);
    return () => removeEventListener('paste', pegar);
  }, []);

  const resultados = useMemo(() => new Map(lista.map((it) => [it.id, resultadoDe(it, aj)])), [lista, aj]);
  const it = lista.find((x) => x.id === activo) ?? null;
  const res = it && resultados.get(it.id);
  const imagenOrig = useMemo(() => {
    if (!it) return null;
    const { src } = it;
    return aImagen(src.w, src.h, (i) => { const k = pixel(src, i % src.w, (i / src.w) | 0); return k === it.info.fondo && aj.transparente ? 'T' : k; });
  }, [it?.id, aj.transparente]); // eslint-disable-line react-hooks/exhaustive-deps
  const miniaturas = useMemo(() => (it ? DESPLAZAMIENTOS.map((d) => resultadoDe(it, aj, d, false).imagen) : []), [it?.id, it?.contorno, aj]); // eslint-disable-line react-hooks/exhaustive-deps

  // cambiar algo que recalcula los resultados descarta los retoques (preguntando antes)
  const hayRetoques = (ids) => lista.some((x) => (!ids || ids.includes(x.id)) && x.retoques.size);
  const descartar = (ids) => {
    setLista((l) => l.map((x) => (!ids || ids.includes(x.id) ? { ...x, retoques: new Map() } : x)));
    for (const x of lista) if (!ids || ids.includes(x.id)) historias.current.delete(x.id);
    setPasos((n) => n + 1);
  };
  const recalcular = (fn, ids) => {
    if (hayRetoques(ids) && !confirm(`Esto vuelve a calcular ${ids ? 'este sprite' : 'todos los sprites'} y descarta sus retoques. ¿Continuar?`)) return;
    fn();
    descartar(ids);
  };
  const ajuste = (k, v, recalcula = true) => (recalcula ? recalcular(() => setAj((a) => ({ ...a, [k]: v }))) : setAj((a) => ({ ...a, [k]: v })));

  /* ---------- pintar a mano sobre el resultado del sprite abierto ---------- */
  const celda = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * res.w), y = Math.floor(((e.clientY - r.top) / r.height) * res.h);
    return x < 0 || y < 0 || x >= res.w || y >= res.h ? -1 : y * res.w + x;
  };
  const pintar = (e) => {
    const i = celda(e), t = trazo.current;
    if (i < 0 || !t) return;
    // el trazo lleva su copia de los retoques: así cada píxel parte del anterior aunque React no haya repintado
    const ant = t.retoques, actual = ant.has(i) ? ant.get(i) : res.claves[i];
    if (actual === t.clave) return;
    if (!t.cambios.has(i)) t.cambios.set(i, ant.has(i) ? ant.get(i) : undefined);
    const m = new Map(ant);
    if (t.clave === res.claves[i]) m.delete(i); else m.set(i, t.clave);
    t.retoques = m;
    cambiar(it.id, { retoques: m });
  };
  const acabar = () => {
    const t = trazo.current;
    trazo.current = null;
    if (!t?.cambios.size) return;
    const h = historias.current.get(t.id) ?? [];
    h.push(t.cambios);
    historias.current.set(t.id, h);
    setPasos((n) => n + 1);
  };
  const deshacer = (id) => {
    const ultimo = historias.current.get(id)?.pop();
    if (!ultimo) return;
    setPasos((n) => n + 1);
    cambiar(id, (x) => {
      const m = new Map(x.retoques);
      for (const [i, antes] of ultimo) { if (antes === undefined) m.delete(i); else m.set(i, antes); }
      return { retoques: m };
    });
  };
  const activoRef = useRef(activo);
  activoRef.current = activo;
  useEffect(() => {
    const tecla = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest?.('input, textarea, select') && activoRef.current) {
        e.preventDefault();
        deshacer(activoRef.current);
      }
    };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, []);

  /* ---------- descargar ---------- */
  const descargar = async (x) => {
    const r = resultados.get(x.id);
    const c = document.createElement('canvas');
    c.width = r.w;
    c.height = r.h;
    c.getContext('2d').putImageData(r.imagen, 0, 0);
    let salida = c;
    if (aj.escala === 'original') {
      // al mismo lienzo que el original, con píxeles el doble de grandes que los que tenía (2×2 si era 1×1, 4×4 si
      // era 2×2…). Cada píxel del resultado son 2 del dibujo, y cada píxel del dibujo, un bloque del original; con
      // las rejillas desplazadas, el primer bloque empieza antes del borde
      const { k, ox: bx, oy: by } = x.bloque, [ox, oy] = despDe(x, aj);
      const x0 = (bx ? bx - k : 0) - ox * k, y0 = (by ? by - k : 0) - oy * k;
      salida = document.createElement('canvas');
      salida.width = x.src.w;
      salida.height = x.src.h;
      const ctx = salida.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, x0, y0, r.w * 2 * k, r.h * 2 * k);
    }
    await descargarCanvas(salida, `${x.nombre.replace(/\.[^.]+$/, '')}.png`);   // mismo nombre que el original
  };
  const descargarTodos = async () => {
    for (const x of lista) {
      await descargar(x);
      await new Promise((r) => setTimeout(r, 150)); // el navegador corta descargas seguidas demasiado rápidas
    }
    setAviso(`${lista.length} descargados.`);
  };
  const quitar = (id) => {
    setLista((l) => l.filter((x) => x.id !== id));
    historias.current.delete(id);
    if (activo === id) setActivo(lista.find((x) => x.id !== id)?.id ?? null);
  };

  const historia = it ? historias.current.get(it.id) ?? [] : [];

  return (
    <div className="invertir mitad">
      <h1>Sprite a la mitad</h1>
      <p className="entradilla">
        Sube uno o varios sprites de pixel art y obtén versiones al 50 % sin colores mezclados. Si un sprite está hecho
        con píxeles de 2×2, se reduce sin perder nada; si no, se conserva el contorno y luego puedes retocar píxeles a
        mano. Los ajustes de abajo se aplican a todos.
      </p>

      <label className={`soltar${encima ? ' encima' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); añadir(e.dataTransfer.files); }}>
        <strong>{lista.length ? 'Añadir más sprites' : 'Suelta tus sprites aquí'}</strong>
        <span>o haz clic para elegirlos (puedes elegir varios). También puedes pegar uno con Ctrl+V. PNG recomendado.</span>
        <input type="file" accept="image/*" multiple aria-label="Subir sprites" onChange={(e) => { añadir(e.target.files); e.target.value = ''; }} />
      </label>
      <div className="aviso" role="status">{aviso}</div>

      {lista.length > 0 && (
        <>
          <div className="panel mitad-comunes">
            <label>Modo
              <select value={aj.modo} onChange={(e) => ajuste('modo', e.target.value)}>
                <option value="auto">Automático (según cada sprite)</option>
                <option value="inteligente">Inteligente</option>
                <option value="directo">Píxel directo</option>
              </select>
            </label>
            <label>Rejilla
              <select value={aj.desp} onChange={(e) => ajuste('desp', e.target.value === 'auto' ? 'auto' : +e.target.value)}>
                <option value="auto">Automática (la que mejor encaja en cada uno)</option>
                {DESPLAZAMIENTOS.map(([ox, oy], n) => <option key={n} value={n}>Desplazada {ox}, {oy}</option>)}
              </select>
            </label>
            <label>Fondo
              <select value={aj.transparente ? 't' : 'k'} onChange={(e) => ajuste('transparente', e.target.value === 't', false)}>
                <option value="k">Mantener el fondo original</option>
                <option value="t">Hacer el fondo transparente</option>
              </select>
            </label>
            <label>Descargar a
              <select value={aj.escala} onChange={(e) => ajuste('escala', e.target.value === 'original' ? 'original' : 1, false)}>
                <option value="original">El tamaño del original (×2, mismo lienzo)</option>
                <option value={1}>La mitad (1×)</option>
              </select>
            </label>
            <p className="pista">
              <b>Inteligente:</b> cada grupo de 2×2 pasa a un píxel dando prioridad al contorno en los bordes de la figura y, dentro, al color dominante.{' '}
              <b>Píxel directo:</b> toma un píxel de cada grupo, perfecto si el sprite ya era 2×2.
            </p>
          </div>

          <div className="fila-botones">
            <button className="btn" type="button" onClick={descargarTodos}>Descargar todos ({lista.length})</button>
            <button className="btn ghost" type="button" disabled={!hayRetoques()} onClick={() => { if (confirm('¿Descartar los retoques de todos los sprites?')) descartar(); }}>Descartar todos los retoques</button>
            <button className="btn ghost" type="button" onClick={() => { setLista([]); setActivo(null); historias.current.clear(); setAviso(''); }}>Quitar todos</button>
          </div>
          <ul className="mitad-lista" aria-label="Sprites subidos: haz clic en uno para verlo y retocarlo">
            {lista.map((x) => {
              const r = resultados.get(x.id);
              return (
                <li key={x.id}>
                  <button type="button" aria-pressed={x.id === activo} onClick={() => setActivo(x.id)} title={x.nombre}>
                    <span className="ajedrez"><Lienzo imagen={r.imagen} /></span>
                    <span className="mitad-nombre">{x.nombre}</span>
                    <span className="pista">
                      {x.bloque.k > 1 ? `dibujo ${x.base.w}×${x.base.h}` : `${x.src.w}×${x.src.h}`} → {r.w}×{r.h} · píxel {x.bloque.k}×{x.bloque.k} → {x.bloque.k * 2}×{x.bloque.k * 2}{x.retoques.size ? ` · ${x.retoques.size} retocados` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {it && (
        <>
          <h2 className="mitad-titulo">{it.nombre}</h2>
          <div className="mitad-vistas">
            <section className="panel">
              <h2>Original</h2>
              <p className="pista">{it.src.w} × {it.src.h} px · {it.info.paleta.length} colores</p>
              <div className="ajedrez mitad-escenario"><Lienzo imagen={imagenOrig} zoom={zoom} /></div>
            </section>
            <section className="panel">
              <h2>Resultado</h2>
              <p className="pista">
                {res.w} × {res.h} px · {modoDe(it, aj) === 'directo' ? 'píxel directo' : 'inteligente'}{it.retoques.size ? ` · ${it.retoques.size} píxeles retocados` : ''}
              </p>
              <div className="ajedrez mitad-escenario">
                <Lienzo imagen={res.imagen} zoom={zoom} className="mitad-px mitad-pintar"
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); trazo.current = { id: it.id, cambios: new Map(), retoques: it.retoques, clave: e.button === 2 ? it.info.fondo : it.pincel }; pintar(e); }}
                  onPointerMove={pintar} onPointerUp={acabar} onPointerCancel={acabar} />
              </div>
              <p className="pista">Haz clic o arrastra sobre el resultado para pintar con el color elegido. Clic derecho borra (pinta el fondo).</p>
            </section>
          </div>

          <div className="fila mitad-zoom">
            <label htmlFor="mitad-zoom" className="etiqueta">Zoom {zoom}×</label>
            <input id="mitad-zoom" type="range" min={1} max={16} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
          </div>

          <div className="mitad-controles">
            <section className="panel">
              <h2>Este sprite</h2>
              <p className={`pista ${it.bloque.k > 1 ? 'mitad-ok' : 'mitad-aviso'}`}>
                {it.bloque.k > 1
                  ? `Ya está dibujado con píxeles de ${it.bloque.k}×${it.bloque.k} (su dibujo mide ${it.base.w}×${it.base.h}): se reduce otra vez a la mitad y vuelve al mismo lienzo con píxeles de ${it.bloque.k * 2}×${it.bloque.k * 2}.`
                  : 'Está dibujado a 1 px: al reducirlo a la mitad algunos detalles se simplifican. El modo inteligente lo hace mejor; retoca lo que haga falta.'}
              </p>
              <h2>Cómo queda con cada rejilla</h2>
              <p className="pista">Las cuatro formas de agrupar sus píxeles. Elegir una la aplica a todos los sprites.</p>
              <div className="mitad-desplazamientos">
                {DESPLAZAMIENTOS.map(([ox, oy], n) => {
                  const d = despDe(it, aj);
                  return (
                    <button key={n} type="button" aria-pressed={ox === d[0] && oy === d[1]}
                      aria-label={`Rejilla desplazada ${ox} en horizontal y ${oy} en vertical`}
                      onClick={() => ajuste('desp', n)}>
                      <Lienzo imagen={miniaturas[n]} />
                      <span>{ox}, {oy}{aj.desp === 'auto' && ox === it.info.desplazamiento[0] && oy === it.info.desplazamiento[1] ? ' · auto' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <h2>Colores</h2>
              <p className="pista">Clic en un color para pintar con él. Doble clic lo marca o desmarca como contorno (punto); solo en este sprite.</p>
              <div className="mitad-muestras">
                {it.info.paleta.map((p) => (
                  <button key={p.clave} type="button" aria-pressed={p.clave === it.pincel}
                    className={`mitad-muestra${it.contorno.has(p.clave) ? ' contorno' : ''}`}
                    title={(p.clave === 'T' ? 'Transparente' : `rgb(${p.clave})`) + (p.clave === it.info.fondo ? ' · fondo' : '') + (it.contorno.has(p.clave) ? ' · contorno' : '')}
                    onClick={() => cambiar(it.id, { pincel: p.clave })}
                    onDoubleClick={() => {
                      if (p.clave === it.info.fondo) return;
                      const alternar = () => cambiar(it.id, (x) => { const n = new Set(x.contorno); if (n.has(p.clave)) n.delete(p.clave); else n.add(p.clave); return { contorno: n }; });
                      if (modoDe(it, aj) === 'inteligente') recalcular(alternar, [it.id]); else alternar();
                    }}>
                    <i style={p.clave === 'T' ? undefined : { background: `rgb(${p.clave})` }} />
                  </button>
                ))}
              </div>
              <div className="dos">
                <button className="btn ghost" type="button" disabled={!historia.length} onClick={() => deshacer(it.id)}>Deshacer</button>
                <button className="btn ghost" type="button" disabled={!it.retoques.size}
                  onClick={() => { if (confirm('¿Descartar los retoques de este sprite?')) descartar([it.id]); }}>Descartar retoques</button>
              </div>
              <div className="dos" style={{ marginTop: 10 }}>
                <button className="btn" type="button" onClick={() => descargar(it)}>Descargar este</button>
                <button className="btn ghost" type="button" onClick={() => quitar(it.id)}>Quitar este</button>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
