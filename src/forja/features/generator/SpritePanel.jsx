/* The sprite: zoomed preview (drag it, or the arrow keys, to place it on the canvas; while retouching the
   line art's lines it is painted on instead), size and colours, the palette and the downloads. Also the
   «Tamaño real» panel. */
import { useEffect, useRef, useState } from 'react';
import { useSignal, useValue } from '../../state/signal.js';
import { settings, useSettings } from '../../state/settings.js';
import { Panel, placeNear, useDocumentEvent } from '../../components/ui.jsx';
import { SelectField, SettingSelect } from '../../components/fields.jsx';
import { useSwatchMerge } from '../../components/PaletteMerge.jsx';
import { OpenWindowButton } from '../../components/FloatingWindows.jsx';
import { pageEnabled } from '../../app/env.js';
import { nav } from '../../app/nav.js';
import { S, spriteSignal, genMsg, showMsg } from './state.js';
import { readSettings } from './settings.js';
import { spriteCanvas, paletteModel, setColor, colorsSettled, mergeColors, saveSprite, REMOVED } from './output.js';
import { spriteLines } from './spriteLines.js';
import { moveSprite } from './pipeline.js';
import { history } from './history.js';
import { project } from '../project/project.js';
import { editor } from '../editor/editor.js';
import { comparar, comparacion } from './comparar.js';

const PREVIEW_MAX = 2;   // the sprite box is as big as the ×2 view; bigger zooms scroll inside it
const ZOOMS = [1, 2, 3, 4, 6, 8, 12, 16].map(z => [String(z), '×' + z]);

export function SpritePanel() {
  const ver = useSignal(spriteSignal), msg = useValue(genMsg), adv = useSettings().advanced;
  useValue(comparacion);
  const cmp = comparar.activa(), antes = cmp && cmp.viendo === 'antes';
  const stage = useRef(null), canvas = useRef(null), drag = useRef(null);
  const [info, setInfo] = useState({ size: '–' });
  const [pop, setPop] = useState(null);   // { raws, now, layer, anchor }
  useSignal(spriteLines.tool);

  // draw the preview whenever the sprite (or how it is shown) changes
  useEffect(() => {
    const oc = canvas.current;
    if (!S.sprite) { oc.getContext('2d').clearRect(0, 0, oc.width, oc.height); setInfo({ size: '–' }); return; }
    // comparing with the sprite from before «Ajustar automáticamente»: that one is shown as it was
    const c1 = antes ? cmp.antes : spriteCanvas(1), CW = c1.width, CH = c1.height, z = readSettings().zoom;
    stage.current.style.width = CW * PREVIEW_MAX + 'px'; stage.current.style.height = CH * PREVIEW_MAX + 'px';
    oc.width = CW; oc.height = CH; oc.style.width = CW * z + 'px'; oc.style.height = CH * z + 'px';
    oc.getContext('2d').clearRect(0, 0, CW, CH); oc.getContext('2d').drawImage(antes ? c1 : spriteLines.preview(c1), 0, 0);
    setInfo({ size: antes ? CW + '×' + CH + ' (antes)' : S.sprite.TW + '×' + S.sprite.TH + ' px en ' + CW + '×' + CH, c1 });
  }, [ver, cmp, antes]);
  // the line art's lines can be retouched on the preview
  useEffect(() => spriteLines.attach(canvas.current), []);

  /* drag the sprite in the preview (or use the arrow keys on it) to place it on the canvas */
  const num = id => settings.num(id, 0);
  const pointer = {
    onPointerDown: e => {
      if (!S.sprite || e.button !== 0 || spriteLines.active() || antes) return;   // retouching lines instead, or looking at the old one
      e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus();
      drag.current = { x: e.clientX, y: e.clientY, fx: num('fx'), fy: num('fy'), k: e.currentTarget.width / e.currentTarget.getBoundingClientRect().width };
      e.currentTarget.classList.add('dragging');
    },
    onPointerMove: e => { const d = drag.current; if (d) moveSprite(d.fx + (e.clientX - d.x) * d.k, d.fy + (e.clientY - d.y) * d.k); },
    onPointerUp: e => { if (!drag.current) return; drag.current = null; e.currentTarget.classList.remove('dragging'); project.touch(); history.schedule(); },
    onKeyDown: e => {
      const a = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!a || !S.sprite) return;
      e.preventDefault(); const s = e.shiftKey ? 10 : 1;
      moveSprite(num('fx') + a[0] * s, num('fy') + a[1] * s); project.touch(); history.schedule();
    }
  };
  pointer.onPointerCancel = pointer.onPointerUp;

  /* generator -> editor */
  const toEditor = () => {
    if (!S.sprite) { showMsg('Primero sube una imagen y genera el sprite.'); return; }
    if (!editor.has()) editor.importFromGenerator(false);
    else if (confirm('El editor ya tiene un diseño. ¿Actualizar su capa «Sprite generado» con este sprite?\n\nCancelar = ir al editor sin cambiar nada.')) editor.importFromGenerator(false);
    nav.go('edit');
  };

  const pal = S.sprite ? paletteModel() : { count: 0, rows: [] };
  const zoomTip = 'Ampliación de la vista previa. No afecta a la descarga.';
  return (
    <Panel id="panSprite" title="Sprite" tip="El resultado en pixel art. Se actualiza solo con cada cambio. Con zoom mayor que ×2, desplázate dentro del recuadro."
      head={<>
        <SettingSelect id="zoom" label="Zoom" tip={zoomTip} options={ZOOMS} style={{ flexDirection: 'row', alignItems: 'center', gap: '.4rem' }} />
        <OpenWindowButton type="sprite" tip="Abre una copia de «Sprite» en una ventana flotante que puedes mover, cambiar de tamaño y ampliar. Esta vista se queda donde está; puedes abrir varias." />
      </>}>
      {cmp && (
        <div className="comparar" role="group" aria-label="Comparar con el sprite de antes del ajuste automático">
          <button type="button" aria-pressed={antes} onClick={() => comparar.ver('antes')} data-tip="Muestra el sprite tal como estaba antes de «✨ Ajustar automáticamente».">Antes</button>
          <button type="button" aria-pressed={!antes} onClick={() => comparar.ver('despues')} data-tip="Muestra el sprite con los ajustes nuevos.">Después</button>
          <button type="button" onClick={comparar.volver} data-tip="Vuelven todos los ajustes de antes del ajuste automático (se puede deshacer con Ctrl+Z).">Quedarme con el de antes</button>
          <button type="button" className="comparar-cerrar" aria-label="Cerrar la comparación" onClick={comparar.cerrar} data-tip="Se queda el nuevo y desaparece la comparación.">✕</button>
          <p className="hint comparar-cambios">{(l => (l.length ? 'Cambió: ' + l.join(' · ') : 'El ajuste no cambió ningún valor: lo de antes ya era lo mejor de las 4 pruebas.'))(comparar.cambios())}</p>
        </div>
      )}
      <div className="stage out-stage" ref={stage}>
        <canvas id="outCanvas" ref={canvas} width={160} height={160} tabIndex={0} aria-label="Sprite en el lienzo: arrástralo o usa las flechas para cambiar su posición"
          style={{ cursor: spriteLines.active() ? 'crosshair' : undefined }} {...pointer} />
      </div>
      <div className="stats"><span>Tamaño <b>{info.size}</b></span><span>Colores <b>{S.sprite ? pal.count : '–'}</b></span></div>
      <Palette rows={pal.rows} onPick={(it, anchor) => setPop({ ...it, anchor })} />
      <p className="hint pal-hint">Agrupados por familia y de oscuro a claro; los de las líneas del Line art van aparte, en «Líneas». Clic en un color para cambiarlo; arrástralo sobre otro para fusionarlos.</p>
      {pageEnabled('edit') && <button type="button" className="primary" onClick={toEditor} data-tip="Lleva el sprite al editor de píxeles para retocarlo a mano con lápiz, capas, selección, etc.">Editar píxeles →</button>}
      <div className="pair">
        <button type="button" onClick={() => saveSprite(1)} data-tip="Descarga el sprite a su tamaño real, píxel a píxel. El archivo lleva el nombre de la imagen que subiste.">Descargar PNG</button>
        <button type="button" onClick={() => saveSprite(2)} data-tip="Descarga el sprite al doble de su tamaño: cada píxel pasa a ser un bloque de 2×2 (sprite de 2×2 en vez de 1×1), sin suavizar. El lienzo también mide el doble.">Descargar ×2 (píxeles 2×2)</button>
      </div>
      <button type="button" onClick={() => saveSprite(readSettings().dlScale)} data-tip="Descarga el sprite ampliado y sin suavizar (×4; con opciones avanzadas eliges la escala).">{adv ? 'Descargar ampliado' : 'Descargar PNG ×4'}</button>
      <SettingSelect id="dlScale" className="adv" inline label="Escala de la descarga ampliada" tip="Cuántas veces se amplía el PNG de «Descargar ampliado». Cada píxel se convierte en un bloque de N×N."
        options={[2, 3, 4, 6, 8, 12, 16, 32].map(z => [String(z), '×' + z])} />
      <p className="msg" role="status">{msg}</p>
      {pop && <ColorPopover pop={pop} onClose={() => { setPop(null); colorsSettled(); }} />}
    </Panel>
  );
}

/* one button per colour shown; merged colours are a single swatch that stands for all of them */
function Palette({ rows, onPick }) {
  const merge = useSwatchMerge((dragged, target, keep, fromBtn, toBtn) =>
    mergeColors([[fromBtn.dataset.layer || 'sprite', dragged], [toBtn.dataset.layer || 'sprite', target]], keep));
  return (
    <div className="palette" role="group" aria-label="Colores del sprite: haz clic en uno para cambiarlo" {...merge}>
      {rows.map(r => (
        <div key={r.name} className={'pal-row' + (r.cls ? ' ' + r.cls : '')}>
          <div className="pal-name" title={r.title}>{r.name}</div>
          <div className="pal-sws">{r.items.map(it => <Swatch key={it.layer + it.now + it.raws[0]} it={it} onPick={onPick} />)}</div>
        </div>
      ))}
    </div>
  );
}
function Swatch({ it, onPick }) {
  const lines = it.layer === 'lines', what = lines ? 'Línea' : 'Color';
  if (it.now === REMOVED) {   // a colour taken out: crossed out, a click opens it to bring it back
    const k = it.raws[0];
    return <button type="button" className="pal-sw removed" style={{ '--c': k }} data-color={REMOVED} data-layer={it.layer}
      title={lines ? `Línea ${k}: quitada (esas líneas no se pintan). Clic para recuperarla o cambiarla.` : `${k}: quitado (transparente). Clic para recuperarlo o cambiarlo.`}
      aria-label={lines ? `Línea ${k}, quitada: recuperar o cambiar` : `Color ${k}, quitado: recuperar o cambiar`}
      onClick={e => onPick(it, e.currentTarget)} />;
  }
  const { now, raws } = it;
  return <button type="button" className={'pal-sw' + (it.changed ? ' changed' : '')} style={{ background: now }} data-color={now} data-layer={it.layer} draggable
    title={(lines ? 'Línea ' : '') + (raws.length > 1 ? `${now} (fusión de ${raws.length} colores)` : it.changed ? `${raws[0]} → ${now}` : now)}
    aria-label={raws.length > 1 ? `${what} ${now}, fusión de ${raws.length} colores: cambiar` : `${what} ${now}: cambiar`}
    onClick={e => onPick(it, e.currentTarget)} />;
}

/* small window to change one colour (or the colours of a merge), remove it or bring back the original */
function ColorPopover({ pop, onClose }) {
  const { raws, now, layer, anchor } = pop, lines = layer === 'lines', gone = now === REMOVED;
  const box = useRef(null), input = useRef(null);
  const [val, setVal] = useState(gone ? raws[0] : now);
  useEffect(() => { placeNear(box.current, anchor); input.current.focus(); }, [anchor]);
  useDocumentEvent('keydown', e => { if (e.key === 'Escape') onClose(); });
  useDocumentEvent('pointerdown', e => { if (!box.current.contains(e.target) && !e.target.closest('.pal-sw')) onClose(); });
  return (
    <div className="pal-pop" role="dialog" aria-label={lines ? 'Cambiar un color de las líneas' : 'Cambiar un color del sprite'} ref={box}>
      <p className="pal-pop-title">{lines ? 'Cambiar color de las líneas' : 'Cambiar color'}</p>
      <div className="pal-pop-row">
        <span className="pal-chip" style={{ background: raws[0] }} title={raws.length > 1 ? `Fusión de ${raws.length} colores generados` : (lines ? 'Color de la línea ' : 'Color generado ') + raws[0]} />
        <span aria-hidden="true">→</span>
        <input type="color" ref={input} aria-label="Nuevo color" value={val} onChange={e => { setVal(e.target.value); setColor(raws, e.target.value, layer); }} />
        <span className="hint">{gone && val === raws[0] ? 'quitado' : val}</span>
      </div>
      <div className="pal-pop-btns">
        <button type="button" disabled={gone} onClick={() => { setColor(raws, REMOVED, layer); onClose(); }}
          data-tip={lines ? 'Quita las líneas de este color: no se pintan y debajo queda el sprite. Puedes recuperarlas desde la fila «Líneas» de la paleta.' : 'Quita este color del sprite: esos píxeles pasan a ser transparentes, como si fueran fondo. Puedes recuperarlo desde la fila «Quitados» de la paleta.'}>Quitar</button>
        <button type="button" onClick={() => { setColor(raws, null, layer); onClose(); }}
          data-tip={raws.length > 1 ? 'Deshace la fusión: cada color vuelve a ser el que generó el sprite.' : lines ? 'Vuelve al color que tenían las líneas.' : 'Vuelve al color que generó el sprite.'}>Original</button>
        <button type="button" className="primary" onClick={onClose}>Listo</button>
      </div>
    </div>
  );
}

/* the sprite at its real size, pixel by pixel; children: the canvas settings, under it */
export function RealPanel({ children }) {
  const ver = useSignal(spriteSignal), canvas = useRef(null);
  useEffect(() => {
    const rc = canvas.current;
    if (!S.sprite) { rc.getContext('2d').clearRect(0, 0, rc.width, rc.height); return; }
    const c1 = spriteCanvas(1);
    rc.width = c1.width; rc.height = c1.height; rc.getContext('2d').drawImage(c1, 0, 0);
  }, [ver]);
  return (
    <Panel id="panReal" title="Tamaño real" tip="El sprite a su tamaño real, píxel a píxel, tal como quedará al descargarlo."
      head={<OpenWindowButton type="real" tip="Abre una copia de «Tamaño real» en una ventana flotante que puedes mover, cambiar de tamaño y ampliar. Esta vista se queda donde está; puedes abrir varias." />}>
      <div className="actual"><canvas id="realCanvas" ref={canvas} width={160} height={160} /></div>
      {children}
    </Panel>
  );
}
