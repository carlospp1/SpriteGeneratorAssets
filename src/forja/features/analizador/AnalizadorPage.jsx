/* «Analizador»: sube un personaje nuevo y la IA lo compara con tus Pokémon (assets/pokemons) para proponer su
   tamaño de sprite, si es front o back y el nombre del archivo. La imagen se trabaja con las mismas herramientas
   que el resto de Forja (recortar, quitar el fondo, puntos, pinceles, IA por clic, zoom, deshacer): lo que quede
   como dibujo es lo que se mide y se compara. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Step } from '../../components/Step.jsx';
import { Panel, Segmented, imageIn } from '../../components/ui.jsx';
import { DockZoom } from '../../components/Zoom.jsx';
import { useSignal } from '../../state/signal.js';
import { SourceProvider, SourceStage, ViewToggle } from '../source/components.jsx';
import { UploadStep, BackgroundStep } from '../source/steps.jsx';
import { A, view, tools, bg, anSignal, figSignal, estadoAn, figuraActual } from './estado.js';
import { notificar } from '../source/notificaciones.js';
import { esCancelacion } from '../source/tareasIA.js';
import { download } from '../../app/files.js';
import { figuraCanvas, analizar, tamañoComo, nombreArchivo } from './analizador.js';
import './analizador.css';

const source = { S: A, view, tools, bg, signal: anSignal };
const BG_TEXTS = {
  subject: 'personaje',
  tip: 'El tamaño se mide sin el fondo: solo lo que quede como personaje. Quita el fondo por tolerancia o con IA y corrige lo que haga falta.',
  remove: 'Desmárcalo si la imagen ya no tiene fondo que quitar (por ejemplo, un PNG transparente).',
  tol: 'Cuánto puede diferenciarse un color del fondo (desde los bordes) para seguir contando como fondo. Súbelo si queda fondo; bájalo si se come partes del personaje.',
  global: 'Al marcar un punto de fondo, borra también ese mismo tono en cualquier parte de la imagen aunque no esté conectado.',
  undo: 'Quita el último punto o zona que marcaste.',
  clear: 'Elimina todos los puntos, zonas y todo lo pintado con los pinceles.'
};

/* what you can say about the new Pokémon (none marked = any) */
const TIPOS = [['normal', 'Normal'], ['pseudo', 'Pseudolegendario'], ['legendario', 'Legendario'], ['singular', 'Singular'], ['mega', 'Mega'], ['gmax', 'Gigamax']];
const LINEAS = [[1, 'Única'], [2, '2 etapas'], [3, '3 etapas']];
const ETAPAS = [[1, '1.ª'], [2, '2.ª'], [3, '3.ª']];

/* a group of buttons that can be pressed together; nothing pressed means «cualquiera» */
function Opciones({ titulo, tip, opciones, valor, onChange, desactivado }) {
  const alternar = v => { const n = new Set(valor); n.has(v) ? n.delete(v) : n.add(v); onChange(n); };
  return (
    <fieldset className="an-filtro" disabled={desactivado}>
      <legend data-tip={tip}>{titulo}</legend>
      <div className="an-opciones">
        {opciones.map(([v, t]) => <button key={v} type="button" aria-pressed={valor.has(v)} onClick={() => alternar(v)}>{t}</button>)}
      </div>
    </fieldset>
  );
}

export function AnalizadorPage() {
  const verFigura = useSignal(figSignal);
  const [res, setRes] = useState(null);
  const [elegido, setElegido] = useState(0);
  const [lado, setLado] = useState(null);
  const [msg, setMsg] = useState('');
  const [tipos, setTipos] = useState(() => new Set());
  const [lineas, setLineas] = useState(() => new Set());
  const [etapas, setEtapas] = useState(() => new Set());
  const conEtapas = !tipos.size || tipos.has('normal') || tipos.has('pseudo') || tipos.has('legendario');

  // the drawing left by the background tools (working pixels) and its size in pixels of the original illustration.
  // The illustration is not pixel art: only its proportion counts; the size in the name is the pixel art one
  const actual = useMemo(() => figuraActual(), [verFigura]);   // eslint-disable-line react-hooks/exhaustive-deps
  const im = actual && actual.im, fig = actual && actual.fig;
  const vista = useMemo(() => (fig && fig.r ? figuraCanvas(im, fig) : null), [actual]);   // eslint-disable-line react-hooks/exhaustive-deps
  const real = fig && fig.r ? { w: Math.ceil(fig.r.w / actual.k), h: Math.ceil(fig.r.h / actual.k) } : null;

  async function subir(file) {
    setRes(null); setLado(null); setElegido(0); setMsg('');
    await estadoAn.loadFile(file);
  }
  async function analizarYa() {
    if (!fig || !fig.r) return;
    const filtros = { tipos, lineas: conEtapas ? lineas : new Set(), etapas: conEtapas ? etapas : new Set() };
    try { setRes(await analizar(im, fig, filtros)); setElegido(0); setLado(null); }
    catch (e) { if (!esCancelacion(e)) notificar('La IA no ha podido analizar la imagen: ' + (e.message || e)); }
  }
  // another drawing (picture, crop, background, retouches): the previous analysis no longer applies
  useEffect(() => { setRes(null); }, [actual]);

  // Ctrl+V with an image; keyboard of the tools (Supr, arrows) and undo / redo
  useEffect(() => {
    const pegar = e => {
      const t = e.target; if (t.closest && t.closest('input, textarea, [contenteditable]')) return;
      const f = imageIn(e.clipboardData); if (f) { e.preventDefault(); subir(f); }
    };
    const tecla = e => { estadoAn.keyDown(e); tools.keyDown(e); };
    document.addEventListener('paste', pegar);
    document.addEventListener('keydown', tecla);
    view.draw();
    return () => { document.removeEventListener('paste', pegar); document.removeEventListener('keydown', tecla); };
  }, []);

  // other filters: the previous ranking no longer applies
  useEffect(() => { setRes(null); }, [tipos, lineas, etapas]);
  const parecidos = res ? res.parecidos : [];
  const ref = parecidos[elegido]?.pokemon;
  const ladoFinal = lado || (res ? (res.front >= 0.5 ? 'front' : 'back') : 'front');
  const tam = ref && real ? tamañoComo(ref, real.w, real.h) : null;
  const nombre = tam && nombreArchivo((im.file && im.file.name) || 'sprite.png', tam.w, tam.h, ladoFinal);

  return (
    <>
      <SourceProvider value={source}>
      <aside>
        <UploadStep n={1} acc="an1" id="an-drop" ariaLabel="Subir imagen" onFile={subir}
          tip="El personaje nuevo: la IA lo compara con los Pokémon de assets/pokemons. Si la imagen trae cosas alrededor, recórtala."
          dropHint="o haz clic para elegirla, o pégala con Ctrl+V (PNG, JPG, WEBP)."
          hint="Recorta para quedarte solo con el personaje." />
        <BackgroundStep n={2} acc="an2" prefix="an-" t={BG_TEXTS} />
        <Step n={3} acc="an3" title="¿Qué Pokémon es?" tip="Dile al analizador qué tipo de Pokémon es tu diseño. Saca 50 al azar de esa categoría (etiquetas del nombre _1_3 / _pseudo_2_3 / _legendary_1_1, o la carpeta). Sin marcar nada los saca de todo el catálogo.">
          <Opciones titulo="Tipo" tip="Normal, pseudolegendario, legendario, singular (mítico), megaevolución o Gigamax." opciones={TIPOS} valor={tipos} onChange={setTipos} />
          <Opciones titulo="Línea evolutiva" tip="Cuántas etapas tiene su línea: única (no evoluciona), 2 o 3." opciones={LINEAS} valor={lineas} onChange={setLineas} desactivado={!conEtapas} />
          <Opciones titulo="Etapa" tip="En qué etapa de su línea está: 1.ª (la básica), 2.ª o 3.ª." opciones={ETAPAS} valor={etapas} onChange={setEtapas} desactivado={!conEtapas} />
          {(tipos.size || lineas.size || etapas.size) > 0 && (
            <button type="button" onClick={() => { setTipos(new Set()); setLineas(new Set()); setEtapas(new Set()); }}>Quitar filtros (cualquiera)</button>
          )}
        </Step>
        <Step n={4} acc="an4" title="Analiza con IA" tip="Cinco IAs locales y gratuitas (CLIP B/32, CLIP B/16, SigLIP, DINOv2 y ViT) comparan la imagen con 50 Pokémon al azar de los filtros. El parecido que se usa es el promedio de las cinco. Funcionan en este ordenador, sin cuenta ni token. La primera vez descargan los modelos.">
          <p className="hint">5 IAs locales · promedio · 50 al azar</p>
          <button type="button" className="primary" disabled={!real} onClick={analizarYa}>✨ Analizar</button>
        </Step>
      </aside>
      <main>
        <ImagenPanel />
        {vista && (
          <Panel id="anPanFig" title="Lo que se mide" tip="El personaje sin el fondo, recortado a su tamaño: es lo que se compara con tus Pokémon.">
            <FiguraVista canvas={vista} />
            {real && <p className="an-medida">Ilustración sin fondo: {real.w}×{real.h} px. <span className="hint">No es pixel art: de ella solo cuenta su proporción.</span></p>}
          </Panel>
        )}
        {A.img && !real && <p className="msg">No queda nada del personaje: baja la tolerancia del fondo o recupera partes.</p>}
        <Panel id="anPanRes" title="Resultado" tip="Los Pokémon que más se parecen. Haz clic en otro para usar su tamaño.">
          {!res && <div className="empty">{real ? 'Pulsa «Analizar».' : 'Aquí aparecerá el resultado.'}</div>}
          {res && !ref && <div className="empty">Ningún Pokémon de tu colección entra en esos filtros. Quita alguno.</div>}
          {res && ref && <p className="hint">Comparado con {parecidos.length} Pokémon al azar (promedio de 5 IAs locales).</p>}
          {res && ref && (
            <>
              <div className="an-nombre">
                <code>{nombre}</code>
                <span className="pair">
                  <button type="button" onClick={() => navigator.clipboard.writeText(nombre).then(() => setMsg('Nombre copiado.'))}>Copiar nombre</button>
                  <button type="button" className="primary" onClick={() => download(im.file, nombre, setMsg)}
                    data-tip="Descarga la imagen subida tal cual, con este nombre.">Descargar con este nombre</button>
                </span>
              </div>
              {msg && <p className="hint">{msg}</p>}
              <p>En pixel art debería medir <b>{tam.w}×{tam.h} px</b>: el tamaño del sprite de <b>{ref.nombre}</b> ({ref.w}×{ref.h} px) con la proporción de tu diseño. Es el que va en el nombre.</p>
              <Segmented label="Front o back" value={ladoFinal} onChange={setLado}
                items={[{ value: 'front', label: 'Front', tip: 'La imagen muestra la cara.' }, { value: 'back', label: 'Back', tip: 'La imagen está de espaldas.' }]} />
              <p className="hint">La IA cree que es un {res.front >= 0.5 ? 'front' : 'back'} ({Math.round(Math.max(res.front, 1 - res.front) * 100)} %).</p>
              <div className="an-lista">
                {parecidos.map(({ pokemon: p, parecido }, i) => (
                  <button type="button" key={p.url} className="an-poke" aria-pressed={i === elegido} onClick={() => setElegido(i)}
                    data-tip={`${p.archivo}${p.carpeta ? ' · ' + p.carpeta : ''}`}>
                    <img src={p.url} alt="" loading="lazy" />
                    <b>{p.nombre}</b>
                    <span>{p.w}×{p.h} px · {Math.round(parecido * 100)} %</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Panel>
      </main>
      </SourceProvider>
    </>
  );
}

/* the picture with the tools of steps 1 and 2 (crop, points, brushes, AI clicks, zones) */
function ImagenPanel() {
  const canvas = useRef(null), stage = useRef(null);
  return (
    <Panel id="anPanImg" title="Imagen" tip="La imagen que subiste. Aquí usas las herramientas de los pasos 1 y 2."
      head={<>
        <span className="pair">
          <button type="button" onClick={estadoAn.deshacer} data-tip="Deshacer el último cambio (Ctrl+Z).">↶ Deshacer</button>
          <button type="button" onClick={estadoAn.rehacer} data-tip="Rehacer lo deshecho (Ctrl+Y o Ctrl+Mayús+Z).">↷ Rehacer</button>
        </span>
        <DockZoom canvasRef={canvas} stageRef={stage} prefKey="anSrc" label="Zoom de la imagen" /><ViewToggle subject="personaje" />
      </>}>
      <SourceStage id="an-srcStage" className="stage la-stage" canvasId="an-srcCanvas" canvasRef={canvas} stageRef={stage}
        empty="Sube una imagen para analizarla." onDropFile={f => estadoAn.loadFile(f)} />
    </Panel>
  );
}

function FiguraVista({ canvas }) {
  const caja = useRef(null);
  useEffect(() => { const c = caja.current; c.replaceChildren(canvas); }, [canvas]);
  return <div className="an-fig" ref={caja} />;
}
