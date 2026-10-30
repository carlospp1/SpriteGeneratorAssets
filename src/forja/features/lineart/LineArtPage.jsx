/* The line art page: the same upload / crop / background steps as the generator (on its own state), the
   settings of the lines and the finish, the original and the result. */
import { useEffect, useRef, useState } from 'react';
import { useSignal, useValue } from '../../state/signal.js';
import { useSettings, settings } from '../../state/settings.js';
import { Step } from '../../components/Step.jsx';
import { SettingRange, SettingCheck, SettingSelect, SettingColor } from '../../components/fields.jsx';
import { Panel, Segmented, useDocumentEvent, imageIn } from '../../components/ui.jsx';
import { DockZoom } from '../../components/Zoom.jsx';
import { pageEnabled } from '../../app/env.js';
import { nav } from '../../app/nav.js';
import { SourceProvider, SourceStage, ViewToggle } from '../source/components.jsx';
import { UploadStep, BackgroundStep } from '../source/steps.jsx';
import { L, view, tools, bg, lineSignal, resultSignal, lineMsg, lineInfo, lineArt } from './lineart.js';
import { ESTILOS_IA } from './iaLineart.js';
import { REFS, PROMPT_UI } from './referencias.js';

const source = { S: L, view, tools, bg, signal: lineSignal, ajustarMas: r => lineArt.ajustarLineas(r) };
const RES = [['0.25', '25 %'], ['0.5', '50 %'], ['0.75', '75 %'], ['1', '100 % (original)'], ['1.5', '150 %'], ['2', '200 %'], ['3', '300 %']];

const BG_TEXTS = {
  subject: 'dibujo',
  tip: 'El fondo se detecta desde los bordes de la imagen y queda transparente. Aquí puedes afinar qué es fondo y qué es dibujo.',
  remove: 'Desmárcalo si la imagen no tiene un fondo que quitar (por ejemplo, una escena completa): se dibujarán las líneas de toda la imagen. Los puntos y pinceles siguen funcionando.',
  tol: 'Cuánto puede diferenciarse un color del fondo para seguir contando como fondo. Súbelo si queda fondo; bájalo si se come partes del dibujo.',
  global: 'Al marcar un punto de fondo, borra también ese mismo tono en cualquier parte de la imagen aunque no esté conectado, por ejemplo el hueco entre un brazo y el cuerpo. En la lista puedes cambiarlo en cada punto.',
  undo: 'Quita el último punto o zona que marcaste.',
  clear: 'Elimina todos los puntos, zonas y todo lo pintado con los pinceles.'
};

export function LineArtPage() {
  const info = useValue(lineInfo), vals = useSettings().values;
  useEffect(() => nav.onShown(p => { if (p === 'line') { lineArt.follow(); view.draw(); } }), []);
  useDocumentEvent('keydown', e => { if (nav.is('line')) { lineArt.teclaHistorial(e); tools.keyDown(e); } });
  // Ctrl+V on this page: the pasted image is the one to work on
  useDocumentEvent('paste', e => {
    if (!nav.is('line')) return;
    const t = e.target; if (t.closest && t.closest('input, textarea, [contenteditable]')) return;
    const f = imageIn(e.clipboardData);
    if (!f) { lineMsg.set('Lo copiado no es una imagen. Copia la imagen en sí (clic derecho > Copiar imagen) y vuelve a pegar.'); return; }
    e.preventDefault(); lineArt.loadFile(f);
  });
  return (
    <SourceProvider value={source}>
      <aside>
        <UploadStep n={1} acc="l1" id="la-drop" ariaLabel="Subir imagen para el line art" onFile={lineArt.loadFile}
          tip="Carga la ilustración a color. Se convertirá en un dibujo de solo líneas, con el interior en blanco y sin fondo, listo para colorear. Si trae cosas alrededor, recórtala."
          dropHint="o haz clic para elegirla, o pégala con Ctrl+V (PNG, JPG, WEBP). Se carga también en el Generador: los dos usan siempre la misma imagen."
          hint="Si la imagen trae cosas que no te interesan, recórtala para quedarte solo con el dibujo."
          before={<button type="button" disabled={!pageEnabled('gen')} onClick={lineArt.fromGenerator}
            data-tip="El Line art ya usa siempre la imagen del Generador. Esto vuelve a copiar su recorte y sus retoques del fondo, por si los has cambiado en el Generador (se pierden los retoques del fondo hechos aquí).">Copiar recorte y fondo del Generador</button>}
          after={<>
            <SettingSelect id="la-res" inline label="Tamaño del resultado" options={RES}
              tip="Tamaño del line art respecto a la imagen original (o a su recorte). Por defecto sale al mismo tamaño; puedes reducirlo o ampliarlo." />
            <p className="hint">{info.res}</p>
          </>} />
        <BackgroundStep n={2} acc="l2" prefix="la-" t={BG_TEXTS} />
        <Step n={3} acc="l3" title="Ajusta las líneas" tip="Qué se convierte en línea: los cambios de color del dibujo, sus trazos oscuros y el contorno de la silueta.">
          <SettingSelect id="la-aiStyle" inline label="Estilo de la IA" options={ESTILOS_IA}
            tip="Para la pestaña «IA» del resultado. Contorno: trazos gruesos y limpios, ideal para colorear. Anime: trazos finos con más detalle. Si «Elegir estilo según las referencias» está marcado, la IA prueba los dos y se queda con el que más se parece a las referencias." />
          <ReferenciasEstilo />
          <p className="hint">Los ajustes de abajo son de la pestaña «Herramienta». El fondo, el contorno exterior y el acabado se aplican a las dos.</p>
          <SettingRange id="la-detail" label="Detalle" tip="Cuántos cambios de color se convierten en línea. Bajo: solo las separaciones claras (pelo, ropa, piel). Alto: también sombras y detalles pequeños." />
          <SettingRange id="la-smooth" label="Suavizado" tip="Suaviza la imagen antes de buscar líneas. Súbelo si salen muchas rayitas por texturas, ruido o degradados; bájalo para conservar detalles finos." />
          <SettingCheck id="la-thin" label="Afinar las líneas" tip="Reduce cada trazo a su línea central de 1 px y la vuelve a dibujar con el grosor de abajo: líneas finas y limpias aunque el dibujo (o la IA) las tenga gruesas. Vale para las dos pestañas, Herramienta e IA." />
          <SettingRange id="la-width" label="Grosor de las líneas" tip="Grosor de las líneas interiores, en píxeles. Con «Afinar las líneas», el grosor exacto de todas las líneas (también las de la IA)." />
          <SettingRange id="la-outline" label="Grosor del contorno exterior" tip="Grosor del contorno de la silueta, en píxeles. 0 = sin contorno exterior propio. Solo cuando se quita el fondo." />
          <SettingCheck id="la-ink" label="Conservar los trazos oscuros del dibujo" tip="Mantiene las líneas negras u oscuras que ya trae el dibujo con su grosor original, en vez de rodearlas con dos líneas." />
          <SettingRange id="la-inkSens" label="Sensibilidad de los trazos oscuros" style={{ opacity: vals['la-ink'] ? undefined : 0.5 }} tip="Cuánto más oscuro que lo que lo rodea tiene que ser un trazo para conservarlo. Alto: también trazos suaves." />
          <SettingRange id="la-min" label="Quitar trazos cortos (px)" tip="Borra las líneas sueltas más cortas que estos píxeles (motas y rayitas de ruido). 0 conserva todo." />
        </Step>
        <Step n={4} acc="l4" title="Acabado" tip="Cómo se pinta el resultado.">
          <SettingColor id="la-color" inline label="Color de las líneas" tip="Color de todas las líneas." />
          <SettingCheck id="la-aa" label="Bordes suaves" tip="Bordes de las líneas suavizados (antialias). Desmárcalo para píxeles duros, útil si luego vas a rellenar con el bote de pintura sin tolerancia." />
          <SettingCheck id="la-fill" label="Rellenar el interior de blanco" tip="Pinta de blanco el interior del personaje; fuera de la silueta sigue siendo transparente. Útil para colorear en digital sobre otro fondo." />
        </Step>
      </aside>
      <main>
        <SourcePanel />
        <ResultPanel />
      </main>
    </SourceProvider>
  );
}

function ReferenciasEstilo() {
  return (
    <div className="la-refs-box">
      <SettingCheck id="la-aiRefs" label="Elegir estilo según las referencias" tip="Al dibujar con la IA, prueba Contorno y Anime y se queda con el que más se parece a estas referencias y al prompt de estilo (CLIP). Desmárcalo para usar solo el estilo del desplegable." />
      <p className="hint">{PROMPT_UI}</p>
      <div className="la-refs">
        {REFS.map(r => <img key={r.nombre} src={r.src} alt={r.nombre} title={r.nombre} />)}
      </div>
    </div>
  );
}

/* the colour picture the lines come from (the tools of steps 1 and 2 work here) */
function SourcePanel() {
  const canvas = useRef(null), stage = useRef(null);
  return (
    <Panel id="laPanSrc" title="Original" tip="La imagen a color de la que se sacan las líneas. Aquí es donde usas las herramientas de los pasos 1 y 2."
      head={<>
        <span className="pair">
          <button type="button" onClick={lineArt.deshacer} data-tip="Deshacer el último cambio (Ctrl+Z).">↶ Deshacer</button>
          <button type="button" onClick={lineArt.rehacer} data-tip="Rehacer lo deshecho (Ctrl+Y o Ctrl+Mayús+Z).">↷ Rehacer</button>
        </span>
        <DockZoom canvasRef={canvas} stageRef={stage} prefKey="laSrc" label="Zoom del original" /><ViewToggle subject="dibujo" />
      </>}>
      <SourceStage id="la-srcStage" className="stage la-stage" canvasId="la-srcCanvas" canvasRef={canvas} stageRef={stage}
        empty="Sube una imagen a color para convertirla en line art." onDropFile={lineArt.loadFile} />
    </Panel>
  );
}

/* the result: lines with a transparent background (over a checkerboard or over white) */
function ResultPanel() {
  const ver = useSignal(resultSignal), info = useValue(lineInfo), msg = useValue(lineMsg);
  const canvas = useRef(null), stage = useRef(null);
  const [bgView, setBgView] = useState('chk');
  const conIA = !!useSettings().values['la-ai'];
  // the page shows a copy of the result
  useEffect(() => {
    const src = lineArt.result(), c = canvas.current;
    if (c.width !== src.width) c.width = src.width;
    if (c.height !== src.height) c.height = src.height;
    if (src.width) { const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0); }
  }, [ver]);
  return (
    <Panel id="laPanOut" title="Line art" tip="El dibujo en líneas, con fondo transparente. Se actualiza solo con cada cambio."
      head={<>
        {/* which line art is shown, downloaded and used by the generator's sprite: the tool's or the AI's */}
        <Segmented label="Quién dibuja las líneas" value={conIA ? 'ia' : 'herramienta'} onChange={v => settings.set('la-ai', v === 'ia')} items={[
          { value: 'herramienta', label: 'Herramienta', tip: 'Las líneas que saca la herramienta de los cambios de color del dibujo (ajustes del paso 3).' },
          { value: 'ia', label: '✨ IA', tip: 'Las líneas que dibuja una IA mirando el dibujo, comparadas con las referencias de estilo del proyecto (line art de sprite: silueta cerrada, pocas interiores, interior blanco). La primera vez tarda unos segundos; luego se recuerdan.' }]} />
        <DockZoom canvasRef={canvas} stageRef={stage} prefKey="laOut" label="Zoom del line art" />
        <Segmented label="Ver el line art sobre" value={bgView} onChange={setBgView} items={[
          { value: 'chk', label: 'Transparente', tip: 'Muestra la transparencia como cuadros.' },
          { value: 'white', label: 'Sobre blanco', tip: 'Muestra el resultado sobre blanco, como quedaría impreso.' }]} />
      </>}>
      <div className={'stage la-stage' + (bgView === 'white' ? ' white' : '')} id="la-outStage" ref={stage}>
        <div className="empty" hidden={info.ready}>Aquí aparecerá el dibujo para colorear.</div>
        <canvas id="la-out" ref={canvas} hidden={!info.ready} />
      </div>
      <div className="stats"><span>Tamaño <b>{info.size}</b></span></div>
      <button type="button" className="primary" disabled={!info.ready} onClick={lineArt.downloadPng}
        data-tip="Descarga el line art de la pestaña elegida (Herramienta o IA) como PNG con fondo transparente. El archivo lleva el nombre del diseño.">Descargar PNG {conIA ? '(IA)' : '(herramienta)'}</button>
      <p className="msg" role="status">{msg}</p>
    </Panel>
  );
}
