/* The generator page: the settings column (steps 1 to 6) and the views (original, sprite, real size, with the canvas settings). */
import { useRef, useState } from 'react';
import { useSignal, useValue } from '../../state/signal.js';
import { settings, useSettings, GEN_IDS, SCHEMA } from '../../state/settings.js';
import { Step, accordions, useAnyOpen } from '../../components/Step.jsx';
import { SettingRange, SettingCheck, SettingSelect, SettingNumber, SettingColor } from '../../components/fields.jsx';
import { Panel, DropZone, Segmented, useDocumentEvent } from '../../components/ui.jsx';
import { Lbl } from '../../components/Tooltip.jsx';
import { DockZoom } from '../../components/Zoom.jsx';
import { registerWindowType, OpenWindowButton } from '../../components/FloatingWindows.jsx';
import { pageEnabled } from '../../app/env.js';
import { nav } from '../../app/nav.js';
import { S, view, bg, genSignal, spriteSignal, kInfo, showMsg } from './state.js';
import { tools } from './source.js';
import { loadFile, confirmReplace, sizeChanged, placeCommitted, fitCanvas, align, newSeed, pipeline } from './pipeline.js';
import { previewCanvas, spriteCanvas } from './output.js';
import { spriteLines } from './spriteLines.js';
import { history, historyState } from './history.js';
import { reference, refImage } from './reference.js';
import { SourceProvider, SourceStage, ToolButton, MarkList, ViewToggle } from '../source/components.jsx';
import { UploadStep, BackgroundStep } from '../source/steps.jsx';
import { SpritePanel, RealPanel } from './SpritePanel.jsx';
import { crearAccionesRetoque, NOMBRES_RETOQUE } from './retoques.js';
import { paletaConIA } from './reducirIA.js';
import { ajustarSprite } from './autoSprite.js';
import { comparar } from './comparar.js';
import { estadoMateriales } from './materialesIA.js';
import { materiales, materialSel } from './materiales.js';
import { lab2rgb } from '../../engine/color.js';
import { showSprite } from './output.js';
import { project } from '../project/project.js';
import { lineArt, resultSignal as lineResultSignal } from '../lineart/lineart.js';

/* the generator's views can be opened as floating windows */
registerWindowType('original', { title: 'Original', page: 'gen', zoom: 'fit', smooth: true, size: [520, 460],
  src: () => { const c = view.canvas; return !c || !S.img || !c.width ? null : c; }, empty: 'Sube una imagen para verla aquí.' });
registerWindowType('sprite', { title: 'Sprite', page: 'gen', zoom: 4, size: [420, 440],
  src: () => S.sprite ? previewCanvas() : null, empty: 'Todavía no hay sprite.',
  attach: c => spriteLines.attach(c) });   // the line art's lines can be retouched here too
registerWindowType('real', { title: 'Tamaño real', page: 'gen', zoom: 1, size: [340, 300],
  src: () => S.sprite ? spriteCanvas(1) : null, empty: 'Todavía no hay sprite.' });

const source = { S, view, tools, bg, signal: genSignal, ajustarMas: ajustarSprite, alAjustar: comparar.empezar };
const STEP_KEYS = ['g1', 'g2', 'g3', 'g4', 'g4l'];
const DESIGN_IDS = GEN_IDS.filter(id => !SCHEMA[id].ui);

export function GeneratorPage() {
  const asideRef = useRef(null), ph = useRef({ w: 340, h: 0 });
  const [wide, setWide] = useState(false);
  const toggleWide = () => {
    const el = asideRef.current;
    if (el && !wide) { const r = el.getBoundingClientRect(); ph.current = { w: r.width, h: r.height }; }
    setWide(v => !v);
  };
  // keyboard: marks on the canvas, retouching lines, undo / redo (only while this page is shown)
  useDocumentEvent('keydown', e => {
    if (!nav.is('gen')) return;
    tools.keyDown(e); spriteLines.keyDown(e); history.keyDown(e);
  });
  /* Ctrl+V with an image copied anywhere (browser, screenshot, another program): it becomes the image to work on.
     In the generator and in «Mis diseños» (the pixel editor pastes it as a new layer instead; line art takes it itself). */
  useDocumentEvent('paste', e => {
    if (nav.is('edit') || nav.is('line')) return;
    const t = e.target; if (t.closest && t.closest('input, textarea, [contenteditable]')) return;
    const f = [...(e.clipboardData ? e.clipboardData.files : [])].find(x => x.type.startsWith('image/'));
    if (!f) {
      if (e.clipboardData && [...e.clipboardData.types].includes('text/plain')) showMsg('Lo copiado no es una imagen. Copia la imagen en sí (clic derecho > Copiar imagen) y vuelve a pegar.');
      return;
    }
    e.preventDefault();
    if (!confirmReplace()) return;
    nav.go('gen');
    loadFile(f);
    showMsg('Imagen pegada.');
  });
  const lines = pageEnabled('line');
  return (
    <SourceProvider value={source}>
      {wide && <div className="aside-ph" style={{ width: ph.current.w }} aria-hidden="true" />}
      <aside ref={asideRef} className={wide ? 'aside-float' : undefined}>
        <AsideTop wide={wide} onWide={toggleWide} />
        <UploadStep n={1} acc="g1" id="drop" ariaLabel="Subir imagen" onFile={loadFile}
          tip="Carga la ilustración del personaje. Si trae cosas alrededor (texto, otros personajes, marcos), recórtala para trabajar solo con lo que te interesa."
          dropHint="o haz clic para elegirla, o pégala con Ctrl+V (PNG, JPG, WEBP)"
          hint="Si la imagen trae cosas que no te interesan, recórtala para quedarte solo con el personaje." />
        <BackgroundStep n={2} acc="g2" t={BG_TEXTS} tip={BG_TEXTS.tip} options={<BackgroundOptions />} advanced={<BackgroundAdvanced />} />
        <DetailsStep n={3} />
        <SpriteStep n={4} />
        {lines && <LinesStep n={5} />}
        <RetoquesStep n={lines ? 6 : 5} />
      </aside>
      <main>
        <OriginalPanel />
        <SpritePanel />
        <RealPanel><CanvasStep /></RealPanel>
      </main>
    </SourceProvider>
  );
}

/* advanced options, accordions, undo / redo and «reset all» */
function AsideTop({ wide, onWide }) {
  const adv = useSettings().advanced, h = useValue(historyState);
  const anyOpen = useAnyOpen(STEP_KEYS);
  const resetAll = () => {
    if (DESIGN_IDS.every(settings.isDefault)) return;
    if (confirm('¿Devolver todos los ajustes del generador a sus valores por defecto? La imagen, el recorte y las marcas se mantienen.')) settings.reset(DESIGN_IDS);
  };
  return (
    <div className="aside-top">
      <button type="button" aria-pressed={wide} onClick={onWide}
        data-tip="Saca el panel de ajustes encima del resto, al doble de ancho y en dos columnas, para no tener que bajar tanto. Donde estaba queda un hueco para que las vistas no se muevan.">{wide ? 'Volver a su sitio' : 'Ampliar panel'}</button>
      <button type="button" aria-pressed={adv} onClick={() => settings.setAdvanced(!adv)}
        data-tip="Activa los ajustes finos de cada paso y los rangos ampliados. Mientras estén desactivados, el sprite se genera solo con los ajustes básicos (los avanzados no se tienen en cuenta).">{adv ? 'Ocultar opciones avanzadas' : 'Mostrar opciones avanzadas'}</button>
      <button type="button" onClick={() => accordions.setMany(STEP_KEYS, !anyOpen)} data-tip="Abre o cierra todos los pasos de una vez.">{anyOpen ? 'Contraer todo' : 'Expandir todo'}</button>
      <button type="button" disabled={!h.canUndo} onClick={history.undo} data-tip="Deshace el último cambio: marcas, puntos de fondo, pinceles, recorte, ajustes, posición o colores (Ctrl+Z).">Deshacer</button>
      <button type="button" disabled={!h.canRedo} onClick={history.redo} data-tip="Rehace lo último que deshiciste (Ctrl+Y o Ctrl+Mayús+Z).">Rehacer</button>
      <button type="button" className="wide" onClick={resetAll} data-tip="Devuelve todos los ajustes del generador a sus valores por defecto. No borra la imagen, el recorte ni las marcas.">Restablecer todos los ajustes</button>
    </div>
  );
}

const BG_TEXTS = {
  subject: 'personaje',
  tip: 'Separa al personaje del fondo. El fondo se detecta solo desde los bordes de la imagen; aquí puedes afinar el resultado.',
  remove: 'Desmárcalo para conservar la imagen entera, con su fondo (también pasa con la tolerancia en 0). Los puntos de fondo y los pinceles siguen funcionando para quitar a mano lo que quieras.',
  tol: 'Cuánto puede diferenciarse un color del fondo para seguir contando como fondo. Más alto borra más; si se come partes del personaje, bájalo. 0 = no quitar el fondo.',
  global: 'Al marcar un punto de fondo, borra también ese mismo tono en cualquier parte de la imagen aunque no esté conectado, por ejemplo el hueco entre un brazo y el cuerpo. Se aplica a los puntos nuevos; en la lista puedes cambiarlo en cada punto.',
  undo: 'Quita el último punto de fondo que marcaste.',
  clear: 'Elimina todos los puntos de fondo y todo lo pintado con los pinceles.'
};
/* «Quitar el fondo» works with the tolerance from the borders; the AI is optional */
function BackgroundOptions() {
  const { values } = useSettings(), on = !!values.bgRemove, ai = on && !!values.bgAI;
  return (
    <>
      <SettingCheck id="bgRemove" label="Quitar el fondo" tip={BG_TEXTS.remove} />
      {on && !ai && <SettingRange id="tol" label="Tolerancia del fondo" tip={BG_TEXTS.tol} />}
      {on && <SettingCheck id="bgAI" label="Quitar el fondo con IA"
        tip="En lugar de la tolerancia, una IA especializada en recortar personajes dibujados (ISNet-anime) lo quita sola. Funciona en este ordenador, sin internet." />}
    </>
  );
}
function BackgroundAdvanced() {
  return (
    <div className="adv-group adv">
      <SettingRange id="bgGlobalTol" label="Alcance del tono global" tip="Cuánto puede parecerse un color al del punto marcado para borrarse con «Quitar ese tono en toda la imagen», en múltiplos de la tolerancia." />
      <SettingRange id="bgDrift" label="Deriva del degradado" tip="Cuánto puede cambiar el fondo a lo largo de un degradado antes de dejar de contar como fondo, en múltiplos de la tolerancia. Súbelo para fondos con degradados fuertes." />
      <SettingRange id="bgIsland" label="Quitar restos sueltos (%)" tip="Borra trozos sueltos más pequeños que este porcentaje del trozo más grande (motas, restos). 0 conserva todo." />
      <SettingRange id="alphaMin" label="Opacidad mínima (PNG transparente)" tip="Solo en imágenes con transparencia: opacidad mínima (0 a 255) para que un píxel cuente como personaje." />
      <SettingCheck id="bgFrame" label="Detectar y quitar marcos" tip="Si la imagen tiene un marco o borde alrededor, lo detecta y lo quita también." />
    </div>
  );
}

/* touch-ups of the finished sprite; the contour ones live in «Marca los detalles» */
const retoque = crearAccionesRetoque(() => { showSprite(); spriteSignal.bump(); project.touch(); history.schedule(); });

/* 3 · Marca los detalles */
function DetailsStep({ n }) {
  useSignal(spriteSignal);
  const hay = !!S.sprite;
  const b = (txt, tip, fn) => <button type="button" disabled={!hay} onClick={fn} data-tip={tip}>{txt}</button>;
  return (
    <Step n={n} acc="g3" title="Marca los detalles" tip="Ojos con más detalle y el contorno del sprite. Haz clic en una marca para seleccionarla y ajustarla.">
      <div className="tools" role="group" aria-label="Herramientas de detalle">
        <ToolButton tool="eye" tip="Arrastra un rectángulo sobre un ojo: esa zona se reconstruye con más fidelidad al original (pupila, iris y brillos). Haz clic en un ojo ya marcado y arrastra sus esquinas para cambiar su tamaño.">Ojo (detalle)</ToolButton>
        <ToolButton tool="none" tip="Sin herramienta de dibujo: solo seleccionar, mover y ajustar las marcas que ya existen.">Seleccionar marcas</ToolButton>
      </div>
      <div className="tools" role="group" aria-label="Contorno del sprite">
        {b('Contorno: 1 color', 'Todo el borde del sprite de un mismo color: un tono oscuro del color del dibujo.', () => retoque.añadir('contorno', { modo: 'uno' }))}
        {b('Contorno del color de cada zona', 'Cada tramo del borde es un tono oscuro del color del sprite que tiene al lado.', () => retoque.añadir('contorno', { modo: 'zona' }))}
      </div>
      {!hay && <p className="hint">Los contornos se aplican cuando ya hay un sprite.</p>}
      <div className="adv-group adv">
        <SettingRange id="eyeK" label="Colores por zona de detalle" tip="Máximo de colores distintos con los que se reconstruye cada zona de detalle. Más colores, más fiel al original." />
        <SettingRange id="eyeRare" label="Prioridad de rasgos pequeños" tip="Cuánto se favorecen los colores pequeños (brillos, pupila) frente al color mayoritario en las zonas de detalle. 0: gana siempre el mayoritario." />
      </div>
      <MarkList />
    </Step>
  );
}
/* 4 · Ajusta el sprite */
function SpriteStep({ n }) {
  const vals = useSettings().values, info = useValue(kInfo), iaMat = useValue(estadoMateriales);
  const [flash, setFlash] = useState(null);   // the field the proportion lock recalculated
  const sized = fromH => { const id = sizeChanged(fromH); if (id) { setFlash(id); setTimeout(() => setFlash(null), 1600); } };
  return (
    <Step n={n} acc="g4" title="Ajusta el sprite" tip="Tamaño del sprite y cómo se simplifican sus colores y líneas.">
      <div className="pair">
        <SettingNumber id="tw" label="Ancho (px)" flash={flash === 'tw'} onCommit={() => sized(false)} tip="Ancho del personaje en el sprite, en píxeles. Sin máximo: el único límite es lo que aguante el navegador." />
        <SettingNumber id="th" label="Alto (px)" flash={flash === 'th'} onCommit={() => sized(true)} tip="Alto del personaje en el sprite, en píxeles. Sin máximo: el único límite es lo que aguante el navegador." />
      </div>
      <SettingCheck id="lock" label="Mantener proporción" tip="Al cambiar el ancho o el alto, el otro se recalcula solo para no deformar al personaje (el campo recalculado se resalta). Desactívalo para elegir ancho y alto por separado." />
      <Reference />
      <SettingRange id="k" label="Materiales" auto={!!vals.kAuto}
        onUserChange={() => { if (settings.get('kAuto')) settings.set('kAuto', false); }}   // choosing it by hand turns the detection off
        tip="En cuántos grupos de color (piel, pelo, ropa…) se divide el personaje. Más materiales dan más colores distintos. Sin máximo: escribe el número que quieras. Si lo cambias, la detección automática se desactiva." />
      <SettingCheck id="kAuto" label="✨ Detectar materiales con IA" className={vals.kAuto ? 'on' : ''}
        tip="Una IA (la misma de «Selección con IA») separa al personaje en sus partes (pelo, piel, ropa…) y las que tienen colores parecidos cuentan como un mismo material. Funciona en este ordenador; la primera vez tarda unos segundos y, mientras, se cuentan por colores. Mueve «Materiales» para elegirlo tú.">
        {' '}<span className="hint">{info.auto}{vals.kAuto && iaMat ? ` · ${iaMat}` : ''}</span>
      </SettingCheck>
      <p className="hint" aria-live="polite">{info.used}</p>
      <SettingRange id="kSens" className="adv" label="Tolerancia de la detección" tip="Cuánto se tienen que diferenciar los colores de dos partes que encuentra la IA para contar como materiales distintos. Más alto: menos materiales. Más bajo: más materiales." />
      <SettingRange id="s" label="Tonos por material" tip="Cuántos tonos, de claro a oscuro, tiene cada material para dar volumen. 1 = colores planos. Sin máximo: escribe el número que quieras. Con materiales elegidos a mano, es lo que tiene cada material nuevo; los que ya están tienen los suyos." />
      <Materiales />
      <SettingCheck id="lineKeep" label="Conservar líneas oscuras junto a colores claros" tip="Los trazos oscuros que tienen al lado un color blanco o claro (contornos, pestañas, costuras) se tratan como líneas aunque no sean negro puro, y se conservan al reducir aunque sean finos, con el color de línea oscuro." />
      <SettingRange id="lineContrast" className="adv" label="Contraste mínimo de línea" tip="Cuánto más claro tiene que ser lo que hay al lado (a 3 px o menos) para que un píxel oscuro cuente como línea. Más bajo: más trazos se conservan como líneas." />
      <SettingRange id="cl" label="Limpieza de ruido" tip="Pasadas para eliminar píxeles sueltos. Más alto da zonas más uniformes pero pierde detalle. 0 = sin limpieza." />
      <SettingCheck id="colOut" label="Contornos de color (no negro)" tip="Usa un tono oscuro de cada material para el contorno en vez del color de las líneas, como en muchos sprites clásicos. Se pisa con los retoques de contorno de «Marca los detalles»: al marcar esto se quitan, y al añadir uno se desmarca esto." />
      <SettingRange id="mergeDE" label="Fusionar colores parecidos" tip="Junta los colores que se parecen tanto que apenas se distinguen (diferencia menor que este valor): materiales casi iguales pasan a ser uno, un material plano no recibe tonos de sombra inventados y la paleta final no repite colores casi idénticos. Más alto = paleta más limpia y con menos colores. 0 = no fusionar nada." />
      <div className="adv-group adv">
        <SettingCheck id="outline" label="Contorno exterior" tip="Pinta un contorno de 1 px alrededor del sprite. Desactívalo para bordes sin línea." />
        <SettingRange id="cellCov" label="Relleno mínimo por píxel (%)" tip="Qué parte de cada píxel del sprite debe ser personaje para pintarse. Más bajo engorda la silueta; más alto la adelgaza." />
        <SettingRange id="lnStrong" label="Línea segura a partir de (%)" tip="Si más de este porcentaje de un píxel es línea oscura, se pinta como línea siempre." />
        <SettingRange id="spurs" label="Quitar picos del borde" tip="Pasadas para quitar píxeles que sobresalen sueltos del borde. 0 los conserva." />
        <SettingRange id="speck" label="Quitar islas menores de (px)" tip="Borra grupos sueltos de píxeles más pequeños que esto. 0 conserva todo." />
        <SettingRange id="lWeight" label="Peso de la luz en materiales" tip="Cuánto cuenta la luminosidad, frente al tono, al agrupar colores en materiales. Bajo: zonas claras y oscuras del mismo color se juntan. Alto: se separan." />
        <SettingRange id="shadeSat" label="Saturación extra en sombras (%)" tip="Cuánta saturación extra gana cada tono más oscuro de un material." />
        <SettingRange id="outDark" label="Luz del contorno (%)" tip="Luminosidad del contorno de color respecto al tono más oscuro del material. Más bajo = contorno más oscuro." />
        <SettingRange id="outSat" label="Saturación del contorno (%)" tip="Saturación del contorno de color respecto al tono más oscuro del material." />
        <SettingRange id="outMaxL" label="Luz máxima del contorno" tip="Luz máxima que puede tener un contorno de color (0 = negro, 100 = blanco). Así el contorno es siempre un tono muy oscuro del material, aunque el material sea claro. 100 = sin límite." />
        <SettingRange id="outBlack" label="Pasar a negro si se parece (ΔE)" tip="Si el contorno de color queda tan oscuro que casi no se distingue del negro (diferencia menor que este valor), se usa el negro de las líneas. 0 = nunca." />
        <SettingRange id="kIter" label="Iteraciones de agrupación" tip="Pasadas del algoritmo que agrupa colores. Más pasadas dan grupos más estables y tardan algo más." />
        <div className="seed-row">
          <SettingNumber id="seed" label="Semilla" tip="Número de partida del agrupamiento de colores. Cambiarlo da otra combinación de materiales con los mismos ajustes." />
          <button type="button" onClick={newSeed} data-tip="Prueba otra semilla al azar.">Otra semilla</button>
        </div>
      </div>
    </Step>
  );
}

/* los materiales del sprite: los automáticos, o los elegidos a mano con «Seleccionar material» (cuántos hay y cuáles
   son), cada uno con cuántos tonos (variedades de su color) tiene */
const cambioMaterial = () => { S.clusters = null; pipeline.sprite(); };   // pipeline.sprite ya guarda el paso (Ctrl+Z)
const rgbCss = r => `rgb(${r[0]}, ${r[1]}, ${r[2]})`;
function Materiales() {
  useSignal(spriteSignal); useSignal(genSignal);
  const sel = useValue(materialSel), mats = S.clusters?.mats || [], lista = S.matsMano || [], mano = !!S.clusters?.mano;
  // a mano: todos los de la lista (aunque alguno no tenga píxeles); automáticos: los que hay
  const items = mano ? lista.map((x, i) => ({ i, m: mats[i], centro: x.centro, tonos: x.tonos }))
    : mats.map((m, i) => m && { i, m, centro: m.centro, tonos: m.tonos }).filter(Boolean);
  const actual = mano && sel != null && lista[sel] ? items[sel] : null;
  const chip = it => it.m ? rgbCss(it.m.rgb[Math.floor((it.m.rgb.length - 1) / 2)]) : rgbCss(lab2rgb(...it.centro));
  return (
    <div className="materiales">
      <div className="tools" role="group" aria-label="Materiales">
        <ToolButton tool="mat" className="wide" tip="Haz clic en cada parte del dibujo (pelo, piel, ropa…) para decir cuántos materiales hay y cuáles son: cada color nuevo es un material, y solo los colores parecidos a él se pintan con él. Un clic en un material que ya está lo selecciona para elegir sus tonos.">Seleccionar material</ToolButton>
      </div>
      {items.length > 0 && (
        <div className="mat-lista" role="group" aria-label="Materiales del sprite: haz clic en uno para elegir sus tonos">
          {items.map(it => (
            <button key={it.i} type="button" className="mat-sw" aria-pressed={actual?.i === it.i}
              onClick={() => materiales.seleccionar(actual?.i === it.i ? null : it.i, cambioMaterial)}
              title={`Material ${it.i + 1}: ${it.tonos} tono${it.tonos === 1 ? '' : 's'}. Haz clic para elegir sus tonos.`}>
              {it.m ? it.m.rgb.map((r, j) => <i key={j} style={{ background: rgbCss(r) }} />) : <i style={{ background: chip(it) }} />}
            </button>
          ))}
        </div>
      )}
      {actual ? (
        <>
          <p className="hint">Material {actual.i + 1}: <span className="mat-chip" style={{ background: chip(actual) }} />
            {actual.m ? '' : ' ahora mismo ningún píxel se parece más a él que a otro material.'}</p>
          <div className="mat-tonos">
            <label className="field">
              <Lbl tip="Cuántas variedades de su color (de claro a oscuro) tiene este material. Los demás materiales no cambian.">Tonos de este material</Lbl>
              <input type="number" min={1} max={16} value={actual.tonos}
                onChange={e => materiales.ponerTonos(Math.max(1, Math.min(16, Math.round(+e.target.value || 1))), cambioMaterial)} />
            </label>
            <button type="button" onClick={() => materiales.quitar(cambioMaterial)}
              data-tip="Quita este material: sus colores pasan al material más parecido.">Quitar material</button>
          </div>
          {actual.m && actual.m.rgb.length < actual.tonos && <p className="hint">Solo salen {actual.m.rgb.length}: este color no tiene más variación de luz en el dibujo.</p>}
        </>
      ) : null}
      {mano ? (
        <div className="mat-tonos">
          <p className="hint">{lista.length} material{lista.length === 1 ? '' : 'es'} elegido{lista.length === 1 ? '' : 's'} a mano. Con «Seleccionar material», haz clic en otra parte del dibujo para añadir otro.</p>
          <button type="button" onClick={() => materiales.automaticos(cambioMaterial)}
            data-tip="Borra la lista y vuelve a los materiales automáticos («Materiales» y «Detectar materiales con IA»).">Volver a automáticos</button>
        </div>
      ) : (
        <p className="hint">Materiales automáticos. Para elegir tú cuántos hay y cuáles son, usa «Seleccionar material» y haz clic en cada parte del dibujo, o haz clic en uno de la lista para elegir sus tonos.</p>
      )}
    </div>
  );
}

/* size from a reference image */
function Reference() {
  const ref = useValue(refImage);
  return (
    <div className="ref">
      <DropZone className="ref-drop" ariaLabel="Elegir imagen de referencia para el tamaño" onFile={reference.load}
        tip="Sube o arrastra aquí un sprite o imagen que quieras imitar: se lee su tamaño y el de su parte visible (sin bordes transparentes) para copiarlos.">
        <strong>Tamaño desde una referencia</strong>
        <span className="hint">Arrastra una imagen o haz clic</span>
      </DropZone>
      {ref && (
        <div className="ref-info">
          <img src={ref.url} alt="Imagen de referencia" />
          <div className="ref-body">
            <p className="hint">{ref.text}</p>
            <div className="ref-btns">
              <button type="button" className="primary" onClick={() => reference.useSize(false)} data-tip="El sprite pasa a medir lo mismo que la parte visible de la referencia (ancho y alto exactos; desactiva «Mantener proporción»).">Usar su tamaño</button>
              <button type="button" onClick={() => reference.useSize(true)} data-tip="Copia el tamaño del personaje, el tamaño del lienzo y la posición del personaje dentro de él.">Tamaño, lienzo y posición</button>
              <button type="button" onClick={reference.clear} data-tip="Quita la imagen de referencia (no cambia los valores ya copiados).">Quitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* 5 · Líneas del Line art */
const LA_TOOLS = [
  ['move', 'Mover sprite', 'La vista previa del sprite vuelve a servir para arrastrarlo y colocarlo en el lienzo.', 'wide'],
  ['erase', 'Borrar líneas', 'Pinta sobre el sprite (con o sin zoom, también en su ventana flotante) para quitar líneas: debajo queda el color del sprite.'],
  ['stroke', 'Borrar trazo', 'Haz clic en una línea para borrar el trazo entero (todos sus píxeles unidos, solo del mismo tipo: contorno o interior). Clic derecho o Alt + clic: recuperar ese trazo entero.'],
  ['restore', 'Recuperar', 'Pinta sobre lo borrado o dibujado para dejarlo como lo trae el Line art.'],
  ['draw', 'Dibujar líneas', 'Pinta para añadir píxeles de línea donde no los hay, con el color de las líneas.']
];
function RetoquesStep({ n }) {
  useSignal(spriteSignal);
  const vals = useSettings().values, hay = !!S.sprite, lista = S.retoques || [];
  const b = (txt, tip, fn) => <button type="button" disabled={!hay} onClick={fn} data-tip={tip}>{txt}</button>;
  return (
    <Step n={n} acc="g4r" title="Retoques del sprite" tip="Técnicas de pixel art que se aplican encima del sprite con un botón. Se quedan aunque el sprite se vuelva a generar, se guardan con el diseño y se deshacen con Ctrl+Z. Los contornos están en «Marca los detalles».">
      <SettingRange id="rtParecido" label="Cuánto se parecen (para unificar)" tip="Diferencia de color máxima para juntar dos colores en uno. Más alto: junta colores más distintos." />
      <div className="tools" role="group" aria-label="Retoques de color">
        {b('Unificar colores parecidos', 'Junta en uno solo los colores casi iguales (los que se diferencian menos que «Cuánto se parecen»). Se queda el más usado de cada grupo.', () => retoque.añadir('unificar', { umbral: +vals.rtParecido }))}
        {b('Limpiar píxeles sueltos', 'Quita los píxeles aislados que no tienen ningún vecino de su color (el ruido típico al reducir): toman el color que los rodea.', () => retoque.añadir('limpiar'))}
      </div>
      <div className="rt-reducir">
        <SettingNumber id="rtColores" label="Colores" tip="Número de colores al que reducir la paleta." />
        {b('✨ Reducir a estos colores (IA)', 'Deja la paleta en ese número de colores con IA: prueba varias formas de elegirlos (dando más o menos peso a la luz, a los colores más usados, guardando el de las líneas…) y una IA compara cada resultado con el dibujo original y con el sprite; se queda con el que mejor se ve. Solo usa colores que el sprite ya tenía.', async () => {
          const n = Math.max(2, Math.round(+vals.rtColores || 8));
          const paleta = await paletaConIA(n);
          if (paleta) retoque.añadir('reducir', { n, paleta });
        })}
      </div>
      {lista.length > 0 && (
        <>
          <ol className="marks rt-lista">
            {lista.map(r => (
              <li key={r.id}>
                <span className="item">{NOMBRES_RETOQUE[r.tipo] ? NOMBRES_RETOQUE[r.tipo](r) : r.tipo}</span>
                <button type="button" onClick={() => retoque.quitar(r.id)} data-tip="Quita este retoque del sprite.">Quitar</button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={retoque.quitarTodos} data-tip="Quita todos los retoques: el sprite vuelve a verse como lo genera la herramienta.">Quitar todos los retoques</button>
        </>
      )}
      {!hay && <p className="hint">Primero sube una imagen para tener un sprite.</p>}
    </Step>
  );
}

/* whose lines go on the sprite: the line art tool's or the AI's (to compare which one looks better) */
function FuenteLineas() {
  const vals = useSettings().values;
  useSignal(lineResultSignal);   // the AI's lines may appear while this is on screen
  const ia = vals.laFuente === 'ai', hay = lineArt.hayLineasIA();
  return (
    <div className="la-fuente">
      <Segmented label="Líneas de" value={ia ? 'ai' : 'tool'} onChange={v => settings.set('laFuente', v)} items={[
        { value: 'tool', label: 'Herramienta', tip: 'Las líneas que saca la herramienta en la pestaña Line art (pestaña «Herramienta»).' },
        { value: 'ai', label: '✨ IA', tip: 'Las líneas que dibujó la IA en la pestaña Line art (pestaña «✨ IA»).' }]} />
      {ia && !hay && <p className="hint">Todavía no hay líneas de IA de esta imagen: abre la pestaña Line art y elige «✨ IA». Mientras, se usan las de la herramienta.</p>}
    </div>
  );
}

function LinesStep({ n }) {
  const vals = useSettings().values, tool = useValue(spriteLines.tool);
  useSignal(genSignal); useSignal(spriteSignal);
  const use = !!vals.useLineArt;
  return (
    <Step n={n} acc="g4l" title="Líneas del Line art" tip="Pone sobre el sprite las líneas de la pestaña Line art, reducidas a píxeles, como una capa aparte: su opacidad, su color y qué líneas quedan, borrando o recuperando sobre el sprite.">
      <SettingCheck id="useLineArt" label="Usar las líneas del Line art" tip="Pone encima del sprite las líneas de la pestaña Line art, reducidas a píxeles: solo las líneas (lo blanco queda transparente). El line art usa la misma imagen que el Generador. Con esto marcado puedes cambiar su opacidad y color, y borrarlas o recuperarlas sobre el sprite." />
      <fieldset className="la-opts" disabled={!use}>
        <legend className="visually-hidden">Ajustes de las líneas del Line art</legend>
        <FuenteLineas />
        <SettingRange id="laOpacity" label="Opacidad de las líneas (%)" tip="Cuánto tapan las líneas al sprite. 100 = líneas sólidas; más bajo, se mezclan con el color de debajo; 0 = no se ven." />
        <SettingRange id="laAmount" label="Cantidad de líneas" tip="Cuántas líneas del Line art pasan al sprite. Más alto: también las finas o que cubren poco de cada píxel. Más bajo: solo las más marcadas. Vuelve a generar el sprite." />
        <fieldset className="la-shape">
          <legend><Lbl tip="Cómo se pasan las líneas del Line art a píxeles. Cada cambio vuelve a generar el sprite; los retoques hechos a mano se mantienen.">Forma de las líneas</Lbl></legend>
          <SettingSelect id="laThin" label="Grosor" tip="«Adelgazar a 1 px» deja cada línea con un solo píxel de grosor, sin bordes dobles. «Solo el centro» quita parte del grosor de las líneas gruesas (como antes). «Grosor del Line art» las deja tan gruesas como salgan al reducir."
            options={[['thin', 'Adelgazar a 1 px'], ['ridge', 'Solo el centro de las gruesas'], ['none', 'Grosor del Line art']]} />
          <SettingCheck id="laEdge" label="Contorno en el borde de la silueta" tip="El contorno del personaje se dibuja justo en el borde de la silueta del sprite, de 1 px, en vez de usar el contorno del Line art (que al reducir suele caer un píxel hacia dentro y dejar un borde doble)." />
          <SettingCheck id="laPerfect" label="Esquinas limpias (sin escalones en L)" tip="Quita el píxel de la esquina en los escalones en forma de L, para que las curvas y diagonales queden limpias, como en el pixel art hecho a mano («pixel perfect»)." />
          <SettingCheck id="laGaps" label="Cerrar huecos de 1 px" tip="Une dos extremos de línea separados por un solo píxel, para que los trazos no queden cortados." />
          <SettingRange id="laSmooth" label="Suavizar antes de reducir (%)" tip="Antes de pasar a píxeles, mezcla cada zona con lo que tiene alrededor: líneas más continuas y suaves, con menos píxeles sueltos. 0 = sin suavizar." />
          <SettingRange id="laMinPiece" label="Quitar trozos sueltos menores de (px)" tip="Borra los trozos de línea sueltos con menos píxeles que esto (manchas, puntitos). 0 = conservarlos todos." />
        </fieldset>
        <SettingSelect id="laColor" label="Color de las líneas" tip="Color de las líneas. «Color de la zona» usa un tono oscuro del color sobre el que cae cada línea, como en los sprites con contornos de color."
          options={[['line', 'El del Line art (negro)'], ['inner', 'Interiores del color de la zona, contorno del Line art'], ['all', 'Todas del color de la zona'], ['custom', 'Un color a elegir']]} />
        {vals.laColor === 'custom' && <SettingColor id="laCustom" inline label="Color elegido" tip="Color de las líneas con «Un color a elegir»." />}
        <div className="pair">
          <SettingCheck id="laOuter" label="Contorno" tip="Las líneas del borde de la silueta." />
          <SettingCheck id="laInner" label="Líneas interiores" tip="Las líneas de dentro del personaje (pliegues, separaciones, rasgos)." />
        </div>
        <div className="tools" role="group" aria-label="Retocar las líneas sobre el sprite">
          {LA_TOOLS.map(([t, label, tip, cls]) => (
            <button key={t} type="button" className={cls} aria-pressed={tool === t} data-tip={tip} onClick={() => spriteLines.select(t)}>{label}</button>
          ))}
        </div>
        <SettingRange id="laBrush" label="Tamaño del pincel (px)" tip="Tamaño del pincel en píxeles del sprite. Atajos: [ y ]." />
        <SettingCheck id="laSolo" label="Ver solo las líneas al retocar" tip="Mientras retocas (con «Borrar líneas», «Borrar trazo», «Recuperar» o «Dibujar líneas»), la vista previa del sprite y sus ventanas flotantes muestran solo las líneas, con el sprite muy tenue debajo. Con «Mover sprite» vuelve a verse el sprite normal. No cambia la descarga." />
        <SettingCheck id="laHighlight" label="Resaltar las líneas al retocar" tip="Mientras retocas, lo que no es línea se ve más claro y las líneas borradas se marcan en rosa. Solo en la vista previa; no cambia la descarga." />
        <p className="hint" aria-live="polite">{spriteLines.HINTS[tool]}</p>
        <p className="hint" aria-live="polite">{spriteLines.stats()}</p>
        <p className="hint">Sus colores salen aparte, en la fila «Líneas» de la paleta del sprite: clic para cambiarlos o quitarlos; arrástralos sobre otro color para fusionarlos.</p>
        <div className="la-btns">
          <button type="button" onClick={() => nav.go('line')} data-tip="Abre la pestaña Line art de la Forja para generar o retocar las líneas (herramienta o IA).">Abrir Line art</button>
          <button type="button" onClick={() => { if (!S.sprite) { showMsg('Primero sube una imagen y genera el sprite.'); return; } pipeline.sprite(); showMsg(spriteLines.on() ? 'Líneas actualizadas desde el Line art.' : S.sprite.note || ''); }}
            data-tip="Vuelve a leer las líneas de la pestaña Line art y genera el sprite con ellas (se hace solo al cambiar el Line art, pero así te aseguras).">Actualizar desde el Line art</button>
          <button type="button" onClick={spriteLines.clearRetouches} data-tip="Deshace todo lo borrado y dibujado a mano: las líneas vuelven a ser las del Line art.">Quitar retoques</button>
          <button type="button" disabled={!Object.keys(S.lineColorMap || {}).length} onClick={spriteLines.resetColors} data-tip="Deshace los cambios de color hechos en la fila «Líneas» de la paleta: cada línea vuelve a su color.">Colores originales</button>
          <button type="button" onClick={spriteLines.downloadLines} data-tip="Descarga solo las líneas del sprite (con sus retoques, color y opacidad), en el lienzo y con fondo transparente.">Descargar solo líneas</button>
        </div>
      </fieldset>
    </Step>
  );
}

/* Lienzo: inside «Tamaño real», folded until opened */
function CanvasStep() {
  return (
    <Step acc="g5real" defaultOpen={false} title="Lienzo" tip="El lienzo en el que se coloca el sprite al descargarlo o al pasarlo al editor.">
      <div className="pair">
        <SettingNumber id="cw" label="Ancho del lienzo" onCommit={placeCommitted} tip="Ancho del lienzo en píxeles. Nunca es menor que el sprite: si el sprite crece, el lienzo crece con él." />
        <SettingNumber id="chh" label="Alto del lienzo" onCommit={placeCommitted} tip="Alto del lienzo en píxeles. Nunca es menor que el sprite: si el sprite crece, el lienzo crece con él." />
      </div>
      <div className="fit-row">
        <SettingNumber id="fitMargin" label="Margen (px)" tip="Espacio total que se añade alrededor del sprite al ajustar: con 10 quedan 5 px arriba, 5 abajo, 5 a la izquierda y 5 a la derecha. 0 = el lienzo mide justo lo que el sprite." />
        <button type="button" onClick={fitCanvas} data-tip="El lienzo pasa a medir lo mismo que el sprite más el margen, y el sprite queda centrado.">Ajustar al sprite</button>
      </div>
      <div className="pair">
        <SettingNumber id="fx" label="Posición x" onCommit={placeCommitted} tip="Posición horizontal: 0 es el centro del lienzo; negativo mueve el sprite a la izquierda y positivo a la derecha. También puedes arrastrar el sprite en la vista previa." />
        <SettingNumber id="fy" label="Pies en y" onCommit={placeCommitted} tip="Altura, en píxeles desde arriba del lienzo, a la que quedan los pies del personaje. También puedes arrastrar el sprite en la vista previa." />
      </div>
      <SettingCheck id="flipH" label="Voltear en horizontal" tip="Invierte el sprite de izquierda a derecha, como en un espejo, sin moverlo de su sitio. Se aplica a la vista previa, a las descargas y al pasarlo al editor." />
      <div className="align" role="group" aria-label="Alinear el sprite en el lienzo">
        {[['left', 'Izquierda', 'Pega el sprite al borde izquierdo del lienzo.'], ['hcenter', 'Centro', 'Centra el sprite en horizontal.'], ['right', 'Derecha', 'Pega el sprite al borde derecho del lienzo.'],
          ['top', 'Arriba', 'Pega el sprite arriba del lienzo.'], ['vcenter', 'Medio', 'Centra el sprite en vertical.'], ['bottom', 'Abajo', 'Pone los pies del sprite en el borde de abajo del lienzo.']]
          .map(([a, label, tip]) => <button key={a} type="button" onClick={() => align(a)} data-tip={tip}>{label}</button>)}
      </div>
      <p className="hint">También puedes arrastrar el sprite en la vista previa, o hacer clic en ella y usar las flechas (Mayús: 10 px).</p>
    </Step>
  );
}

/* the working image with the tools of steps 1 to 3 */
function OriginalPanel() {
  const canvas = useRef(null), stage = useRef(null);
  return (
    <Panel id="panOriginal" title="Original" tip="La imagen de trabajo. Aquí es donde usas las herramientas de los pasos 1 a 3."
      head={<>
        <DockZoom canvasRef={canvas} stageRef={stage} prefKey="dock" label="Zoom del original" />
        <OpenWindowButton type="original" tip="Abre una copia de «Original» en una ventana flotante que puedes mover, cambiar de tamaño y ampliar. Esta vista se queda donde está; puedes abrir varias." />
        <ViewToggle />
      </>}>
      <SourceStage id="srcStage" canvasId="srcCanvas" canvasRef={canvas} stageRef={stage} empty="Sube una imagen para empezar." />
    </Panel>
  );
}
