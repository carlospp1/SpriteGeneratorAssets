/* The options bar: what the current tool can do (one line of fixed height, so changing tool never moves
   the canvas), or the free transform's buttons while it is active. */
import { useEffect, useState } from 'react';
import { useSignal, useValue } from '../../state/signal.js';
import { RangeField, CheckField, SelectField, NumberField } from '../../components/fields.jsx';
import { Toggle } from '../../components/ui.jsx';
import { E } from '../../engine/editor/E.js';
import { T } from '../../engine/editor/tools.js';
import { TOOL } from './tooldefs.js';
import { sig, toolVal, transformInfo, setOpt, setSize, toggleOpt } from './store.js';

const BRUSH = 'pencil eraser shade dither line rect ellipse';
const SELECT = 'marquee ellipseSel lasso polyLasso wand';
const SELMODES = [['replace', 'Nueva', 'Nueva selección', 'Nueva selección.'], ['add', '+ Añadir', 'Añadir a la selección', 'Añadir a la selección (o mantén Mayús).'],
  ['sub', '− Restar', 'Restar de la selección', 'Restar de la selección (o mantén Alt).'], ['and', '∩ Intersecar', 'Intersecar con la selección', 'Quedarse con lo común (o mantén Mayús + Alt).']];
const clampTol = v => Math.max(0, Math.min(255, +v || 0));

export function OptionsBar() {
  const tool = useValue(toolVal), tf = useValue(transformInfo);
  useSignal(sig.opts);
  const t = tf ? '__transform' : tool, o = E.opts;
  const on = list => list.split(' ').includes(t);
  return (
    <div className="ed-options" id="edOptions" role="group" aria-label="Opciones de la herramienta">
      <span className="ed-tool-name" id="edToolName" aria-live="polite">{TOOL[tool].name}</span>
      <span className="ed-gap" />
      {/* brush tools */}
      {on(BRUSH) && <RangeField id="edSize" className="ed-size" label="Tamaño" tip="Tamaño del pincel en píxeles. Atajos: [ y ] (o < y >)."
        value={o.size} min={1} max={16} hardMax={64} onChange={setSize} />}
      {on('pencil') && <CheckField id="edPP" label="Pixel perfect" tip="Evita los «codos» de las líneas de 1 px al dibujar a mano, para que queden limpias."
        checked={o.pixelPerfect} onChange={v => setOpt('pixelPerfect', v)} />}
      {on('shade') && <SelectField id="edShadeMode" inline label="Rango" value={o.shadeMode} onChange={v => setOpt('shadeMode', v)}
        tip="Clic izquierdo hace esto; clic derecho o Alt hace lo contrario. Las luces tiran a amarillo y las sombras a azul/violeta, como en el pixel art clásico."
        options={[['dodge', 'Sobreexponer (aclarar)'], ['burn', 'Subexponer (oscurecer)']]} />}
      {on('shade') && <CheckField id="edShadePal" label="Usar colores del dibujo" checked={o.shadePalette} onChange={v => setOpt('shadePalette', v)}
        tip="Al aclarar u oscurecer, salta al color más parecido que ya existe en el dibujo, sin inventar colores nuevos." />}
      {on('rect ellipse') && <CheckField id="edShapeFill" label="Relleno" tip="Dibuja la figura rellena en vez de solo el borde."
        checked={o.shapeFill} onChange={v => setOpt('shapeFill', v)} />}
      {/* selection tools */}
      {on(SELECT) && (
        <div className="seg ed-selmode" role="group" aria-label="Modo de selección">
          {SELMODES.map(([m, text, aria, tip]) => <Toggle key={m} pressed={o.selMode === m} aria-label={aria} tip={tip} onClick={() => setOpt('selMode', m)}>{text}</Toggle>)}
        </div>
      )}
      {on('wand') && <TolField id="edWandTol" value={o.wandTol} onCommit={v => setOpt('wandTol', v)}
        tip="Cuánto pueden diferenciarse los colores (0 a 255) para entrar en la selección. 0 = solo el mismo color exacto." />}
      {on('wand') && <CheckField id="edWandContig" label="Contiguo" checked={o.wandContiguous} onChange={v => setOpt('wandContiguous', v)}
        tip="Solo la zona conectada al punto. Desmárcalo para seleccionar ese color en todo el dibujo." />}
      {on('wand picker') && <CheckField id="edSampleAll" label="Muestrear todas las capas" checked={o.sampleAll} onChange={v => setOpt('sampleAll', v)}
        tip="Usa lo que se ve (todas las capas visibles) en vez de solo la capa activa." />}
      {on('polyLasso') && <span className="hint">Clic: añadir punto · doble clic o Intro: cerrar · Retroceso: quitar punto · Esc: cancelar</span>}
      {on('marquee ellipseSel lasso') && <span className="hint">Arrastrar dentro: mover la selección · Ctrl + arrastrar: mover los píxeles</span>}
      {/* paint bucket */}
      {on('fill') && <TolField id="edFillTol" value={o.fillTol} onCommit={v => setOpt('fillTol', v)}
        tip="Cuánto pueden diferenciarse los colores (0 a 255) para rellenarse. 0 = solo el mismo color exacto." />}
      {on('fill') && <CheckField id="edContig" label="Contiguo" checked={o.contiguous} onChange={v => setOpt('contiguous', v)}
        tip="Solo la zona conectada. Desmárcalo para cambiar ese color en toda la capa." />}
      {/* move / crop / zoom / hand */}
      {on('move') && <span className="hint">Arrastrar: mover la capa o la selección · Alt + arrastrar: duplicar · flechas: 1 px (Mayús: 10) · 1–0: opacidad de la capa</span>}
      {on('crop') && <span className="hint">Arrastra el área que se queda · Intro o doble clic: recortar · Esc: cancelar</span>}
      {on('crop') && <button type="button" id="edCropApply" className="primary" onClick={() => T.applyCrop()}>✓ Recortar</button>}
      {on('crop') && <button type="button" id="edCropCancel" aria-label="Cancelar el recorte" onClick={() => T.escape()}>✕</button>}
      {on('zoom') && <span className="hint">Clic: acercar · Alt + clic: alejar</span>}
      {on('hand') && <span className="hint">Arrastra para mover la vista (también Espacio + arrastrar)</span>}
      {on('picker') && <span className="hint">Clic: color frontal · clic derecho: color de fondo</span>}
      {/* free transform (shown while it is active) */}
      {tf && (
        <span className="ed-transform" id="edTransformBar">
          <b>Transformación libre</b>
          <span className="hint" id="edTransformSize">{tf}</span>
          <button type="button" data-tip="Voltear horizontal" onClick={() => T.transformTurn('flipH')}>↔</button>
          <button type="button" data-tip="Voltear vertical" onClick={() => T.transformTurn('flipV')}>↕</button>
          <button type="button" data-tip="Rotar 90° antihorario" onClick={() => T.transformTurn('rotL')}>⟲</button>
          <button type="button" data-tip="Rotar 90° horario" onClick={() => T.transformTurn('rotR')}>⟳</button>
          <button type="button" className="primary" data-tip="Aplicar (Intro)" onClick={() => T.endTransform(true)}>✓</button>
          <button type="button" data-tip="Cancelar (Esc)" onClick={() => T.endTransform(false)}>✕</button>
        </span>
      )}
      <span className="ed-spacer" />
      {on(BRUSH + ' fill') && <Toggle pressed={o.mirrorX} onClick={() => toggleOpt('mirrorX')} id="edMirrorX"
        tip="Simetría horizontal: lo que dibujas se repite reflejado en el otro lado.">Simetría ↔</Toggle>}
      {on(BRUSH + ' fill') && <Toggle pressed={o.mirrorY} onClick={() => toggleOpt('mirrorY')} id="edMirrorY"
        tip="Simetría vertical: lo que dibujas se repite reflejado arriba/abajo.">Simetría ↕</Toggle>}
    </div>
  );
}

/* tolerance 0–255: typed freely, clamped when left */
function TolField({ id, value, onCommit, tip }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <NumberField id={id} className="inline" label="Tolerancia" tip={tip} value={text} min={0} max={255}
      onChange={setText} onCommit={v => { const n = clampTol(v); setText(String(n)); onCommit(n); }} />
  );
}
