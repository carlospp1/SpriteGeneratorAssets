/* The «Separar figuras» page: upload + crop (plus cutting the front and the back with the AI or freehand, or
   a click on each), the same background step as the generator and the line art (on its own state), the
   original with its tools, and one transparent PNG per view. */
import { useEffect, useRef } from 'react';
import { useSignal, useValue } from '../../state/signal.js';
import { Step } from '../../components/Step.jsx';
import { SettingCheck, SettingRange } from '../../components/fields.jsx';
import { Panel, Segmented } from '../../components/ui.jsx';
import { DockZoom } from '../../components/Zoom.jsx';
import { SourceProvider, SourceStage, ViewToggle, ToolButton, useSource } from '../source/components.jsx';
import { UploadStep, BackgroundStep } from '../source/steps.jsx';
import { F, view, tools, bg, sepSignal, figSignal, sepMsg, separar, NOMBRES, papel, origen, HINTS_PAPEL } from './separar.js';
import './separar.css';

const source = { S: F, view, tools, bg, signal: sepSignal, ajustarMas: () => separar.ajustarHuecos() };

const BG_TEXTS = {
  subject: 'diseño',
  tip: 'El fondo se detecta desde los bordes de la imagen. Aquí puedes afinar qué es fondo y qué es diseño, como en el Generador.',
  remove: 'Desmárcalo si la imagen no tiene un fondo liso que quitar. Los puntos, zonas y pinceles siguen funcionando.',
  tol: 'Cuánto puede diferenciarse un color del fondo para seguir contando como fondo. Súbelo si queda fondo pegado al diseño; bájalo si se come partes claras del diseño.',
  global: 'Al marcar un punto de fondo, borra también ese mismo tono en cualquier parte de la imagen aunque no esté conectado. En la lista puedes cambiarlo en cada punto.',
  undo: 'Quita el último punto o zona que marcaste.',
  clear: 'Elimina todos los puntos, zonas y todo lo pintado con los pinceles.'
};

export function SepararPage() {
  // the keyboard and Ctrl+V are listened to in separar.js (while this page's canvas is on screen)
  useEffect(() => {
    view.draw();
    separar.restaurarSesion();   // after reloading: the picture and the work on it come back
  }, []);

  return (
    <SourceProvider value={source}>
      <aside>
        <SubirStep />
        <BackgroundStep n={2} acc="s2" prefix="sep-" t={BG_TEXTS}
          advanced={<SettingCheck id="sep-holes" label="Quitar huecos cerrados del color del fondo"
            tip="Con tolerancia: quita el fondo que queda encerrado dentro del diseño (entre las patas, dentro de la cola…). Los huecos pequeños, como los brillos de los ojos, se respetan." />} />
        <Step n={3} acc="s3" title="Figuras" tip="Cada figura grande del diseño sale en su propio PNG transparente. Los trozos sueltos pegados a una figura (hojas, pétalos) van con ella; lo que está lejos (títulos, textos, iconos, muestras de color) se descarta.">
          <SettingRange id="sep-smooth" label="Suavizado del borde"
            tip="Funde el borde de cada figura con la transparencia para que no quede dentado. 0 = borde duro (pixel art); súbelo para un borde más suave." />
          <p className="hint">Se buscan solas las dos vistas (front y back), aunque se toquen; se descartan la cuadrícula, las líneas, la sombra del suelo, los textos y los trozos sueltos lejanos. Si solo hay una figura no se genera nada.</p>
        </Step>
      </aside>
      <main>
        <SourcePanel />
        <FigurasPanel />
      </main>
    </SourceProvider>
  );
}

/* 1 · Sube y recorta: the generator's upload and crop, plus cutting the front and the back (AI or freehand) and marks */
function SubirStep() {
  return (
    <UploadStep n={1} acc="s1" id="sep-drop" ariaLabel="Subir hoja de diseño" onFile={separar.loadFile}
      tip="Carga la hoja de diseño: las vistas del personaje (front y back) sobre un fondo liso. Títulos, textos, iconos y muestras de color se descartan solos."
      dropHint="o haz clic para elegirla, o pégala con Ctrl+V (PNG, JPG, WEBP)."
      hint="«Recortar» recorta toda la hoja. Para decir qué figura es cada vista, recorta el front y el back a mano alzada o con un rectángulo."
      after={<FrontBackTools />} />
  );
}

function FrontBackTools() {
  const { S } = useSource();
  return (
    <>
      <div className="tools" role="group" aria-label="Recortar front y back">
        <ToolButton tool="iafront" tip="Clic sobre la figura del front: la IA la recorta con su forma exacta. Más clics añaden lo que falte; Mayús + clic quita lo que sobre. La primera vez descarga la IA (unos 14 MB).">✨ Front con IA</ToolButton>
        <ToolButton tool="iaback" tip="Clic sobre la figura del back: la IA la recorta con su forma exacta. Más clics añaden lo que falte; Mayús + clic quita lo que sobre.">✨ Back con IA</ToolButton>
        <ToolButton tool="lfront" tip="Dibuja a mano alzada alrededor de la figura del front: saldrá recortada de ahí, sin el fondo. Puedes rodear colas u hojas que se cruzan con la otra figura.">Recortar front ✎</ToolButton>
        <ToolButton tool="lback" tip="Dibuja a mano alzada alrededor de la figura del back: saldrá recortada de ahí, sin el fondo. Puedes rodear colas u hojas que se cruzan con la otra figura.">Recortar back ✎</ToolButton>
        <ToolButton tool="rfront" tip="Arrastra un rectángulo alrededor de la figura del front: saldrá recortada de ahí, sin el fondo. Después puedes ajustar el rectángulo desde sus esquinas y lados, o moverlo desde dentro.">Recortar front ▭</ToolButton>
        <ToolButton tool="rback" tip="Arrastra un rectángulo alrededor de la figura del back: saldrá recortada de ahí, sin el fondo. Después puedes ajustar el rectángulo desde sus esquinas y lados, o moverlo desde dentro.">Recortar back ▭</ToolButton>
        <ToolButton tool="front" tip="Haz clic sobre la figura que muestra la cara: será el front y la otra el back.">Marcar front</ToolButton>
        <ToolButton tool="back" tip="Haz clic sobre la figura que está de espaldas: será el back y la otra el front.">Marcar back</ToolButton>
        <button type="button" className="wide" disabled={!separar.hayVistas()} onClick={separar.quitarVistas}
          data-tip="Borra los recortes del front y del back (a mano o con IA): las figuras vuelven a detectarse solas.">Quitar recortes de front y back</button>
      </div>
      <p className="hint tool-hint">{HINTS_PAPEL[S.tool] || 'Si las figuras no salen bien solas (se tocan o algo las cruza), recorta el front y el back con IA, a mano alzada o con un rectángulo. Al recortar una, la otra se queda como está.'}</p>
    </>
  );
}

/* the sheet (the tools of steps 1 and 2 work here) */
function SourcePanel() {
  const canvas = useRef(null), stage = useRef(null);
  return (
    <Panel id="sepPanSrc" title="Original" tip="La hoja de diseño. Aquí es donde usas las herramientas de los pasos 1 y 2."
      head={<>
        <span className="pair">
          <button type="button" onClick={separar.deshacer} data-tip="Deshacer el último cambio (Ctrl+Z).">↶ Deshacer</button>
          <button type="button" onClick={separar.rehacer} data-tip="Rehacer lo deshecho (Ctrl+Y o Ctrl+Mayús+Z).">↷ Rehacer</button>
        </span>
        <DockZoom canvasRef={canvas} stageRef={stage} prefKey="sepSrc" label="Zoom del original" /><ViewToggle subject="diseño" />
      </>}>
      <SourceStage id="sep-srcStage" className="stage la-stage" canvasId="sep-srcCanvas" canvasRef={canvas} stageRef={stage}
        empty="Sube una hoja de diseño para separar sus figuras." onDropFile={separar.loadFile} />
    </Panel>
  );
}

/* one transparent PNG per figure */
function FigurasPanel() {
  useSignal(figSignal);
  const msg = useValue(sepMsg);
  const figs = F.img ? F.figuras : [];   // left to right, as on the sheet
  const listas = figs.length === 2;
  const de = { recorte: 'según tus recortes', mano: 'elegido a mano', ia: 'decidido por la IA', orden: 'por posición' }[origen()];
  return (
    <Panel id="sepPanOut" title="Figuras" tip="Cada figura con fondo transparente, recortada a su tamaño. Se actualizan solas con cada cambio.">
      {!F.img && <div className="empty">Aquí aparecerán las figuras separadas.</div>}
      {F.img && !listas && (
        <div className="empty">{figs.length === 1 ? 'Solo hay una figura: no hay nada que separar.' : 'No se ha encontrado ninguna figura: baja la tolerancia del fondo.'}</div>
      )}
      {listas && (
        <div className="sep-figs">
          {figs.map((f, i) => {
            const p = papel(i), nombre = NOMBRES[p][0];
            return (
              <figure key={i} className="sep-fig">
                <figcaption><b>{nombre}</b> <span>{f.width}×{f.height} px</span></figcaption>
                <FiguraCanvas figura={f} />
                <Segmented label={'Papel de la figura ' + (i ? 'derecha' : 'izquierda')} value={String(p)} onChange={v => separar.elegir(i, +v)}
                  items={[{ value: '0', label: 'Front', tip: 'Esta figura es el front (la que muestra la cara).' },
                    { value: '1', label: 'Back', tip: 'Esta figura es el back (de espaldas).' }]} />
                <button type="button" className="primary" onClick={() => separar.downloadFigure(i)}
                  data-tip="Descarga esta figura como PNG con fondo transparente.">Descargar {nombre.toLowerCase()}</button>
              </figure>
            );
          })}
        </div>
      )}
      {listas && (
        <div className="sep-orden">
          <span className="hint">Front y back {de}.</span>
          <button type="button" onClick={separar.intercambiar} data-tip="Cambia cuál es el front y cuál el back.">⇄ Intercambiar</button>
        </div>
      )}
      <p className="msg" role="status">{msg}</p>
    </Panel>
  );
}

function FiguraCanvas({ figura }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    c.width = figura.width; c.height = figura.height;
    c.getContext('2d').putImageData(figura, 0, 0);
  }, [figura]);
  return <canvas ref={ref} />;
}
