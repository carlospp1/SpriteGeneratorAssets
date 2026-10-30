/* The pieces of a page that works on a picture with the source tools (the generator and the line art):
   tool buttons, crop buttons, lists of background points and marks, the source canvas with its views. Each
   page gives its own state and tools through <SourceProvider value={...}>. */
import { createContext, useContext, useEffect } from 'react';
import { hex } from '../../engine/color.js';
import { useSignal } from '../../state/signal.js';
import { Toggle, Segmented } from '../../components/ui.jsx';
import { HINTS, MARK_NAMES, ZONE_COLORS, sameSel } from './tools.js';

/* value = { S, view, tools, bg, signal } */
const Ctx = createContext(null);
export const SourceProvider = Ctx.Provider;
export function useSource() {
  const c = useContext(Ctx);
  useSignal(c.signal);   // lists, tool buttons and crop buttons follow the state
  return c;
}

/* a tool button (Recortar toggles crop mode) */
export function ToolButton({ tool, tip, className, children }) {
  const { S, tools } = useSource();
  return <Toggle pressed={S.tool === tool} tip={tip} className={className} data-tool={tool} onClick={() => tools.toggleTool(tool)}>{children}</Toggle>;
}

/* the hint under a group of tools: what the selected tool does, if it is one of this step's */
export function ToolHint({ tools: own, children }) {
  const { S } = useSource();
  return <p className="hint tool-hint">{own.includes(S.tool) ? HINTS[S.tool] : children}</p>;
}

/* Recortar / Imagen completa / Aplicar recorte */
export function CropTools() {
  const { tools } = useSource();
  return (
    <div className="tools" role="group" aria-label="Recorte">
      <ToolButton tool="crop" tip="Modo recorte: verás la imagen completa. Arrastra un rectángulo con la zona que quieres conservar; luego puedes arrastrar sus esquinas y lados para ajustarlo, o moverlo desde dentro.">Recortar</ToolButton>
      <button type="button" disabled={!tools.canResetCrop()} onClick={tools.cropReset} data-tip="Deshace el recorte y vuelve a trabajar con la imagen entera.">Imagen completa</button>
      <button type="button" className="primary wide" disabled={!tools.canApplyCrop()} onClick={tools.cropApply} data-tip="Confirma el rectángulo y recorta la imagen.">Aplicar recorte</button>
    </div>
  );
}

/* one row of a list: the item (click to select it) and its «Quitar» button */
function Item({ sel, label, swatch, onRemove, children }) {
  const { S, tools } = useSource();
  const on = sameSel(sel, S.selected);
  return (
    <li className={on ? 'sel' : undefined}>
      {swatch}
      <button type="button" className="item" aria-pressed={on} onClick={() => tools.pick(sel)}>{label}</button>
      {children}
      <button type="button" onClick={onRemove}>Quitar</button>
    </li>
  );
}

/* background points, «not background» points and removed zones */
export function SeedList() {
  const { S, tools, bg } = useSource();
  let nPt = 0, nCut = 0, nKeep = 0;
  return (
    <ul className="marks">
      {S.bgSeeds.map((sd, i) => {
        const sel = { kind: 'seed', i }, remove = () => tools.removeSeed(i);
        if (sd.type === 'cut') return <Item key={i} sel={sel} label={'Zona quitada ' + (++nCut)} onRemove={remove} swatch={<i className="swatch cut" aria-hidden="true" />} />;
        if (sd.type === 'keep') return <Item key={i} sel={sel} label={'No es fondo ' + (++nKeep)} onRemove={remove} swatch={<i className="swatch keep" style={{ background: hex(bg.seedColor(sd)) }} />} />;
        return (
          <Item key={i} sel={sel} label={'Fondo ' + (++nPt)} onRemove={remove} swatch={<i className="swatch" style={{ background: hex(bg.seedColor(sd)) }} />}>
            <button type="button" className="mini" aria-pressed={!!sd.global} title="Quitar también ese tono en toda la imagen" onClick={() => tools.toggleGlobal(i)}>Todo el tono</button>
          </Item>
        );
      })}
    </ul>
  );
}

/* sprite marks: eyes, dark strokes, shines and colour zones (with their number of colours) */
export function MarkList() {
  const { S, tools } = useSource();
  return (
    <ul className="marks">
      {S.markers.map((m, i) => (
        <Item key={i} sel={{ kind: 'mark', i }} label={MARK_NAMES[m.type] + ' ' + (i + 1)} onRemove={() => tools.removeMark(i)}>
          {m.type === 'zone' && (
            <label className="mini-field">
              <input type="number" min={2} step={1} defaultValue={m.colors || ZONE_COLORS} aria-label={'Colores de la zona ' + (i + 1)}
                onChange={e => { if (+e.target.value >= 2) tools.zoneColors(i, e.target.value); }}
                onBlur={e => { tools.zoneColors(i, e.target.value); e.target.value = S.markers[i] ? S.markers[i].colors : ''; }}
                onKeyDown={e => { if (e.key === 'Enter') tools.zoneColors(i, e.target.value); }} />
              {' '}colores
            </label>
          )}
        </Item>
      ))}
    </ul>
  );
}

/* Sin fondo / Silueta / Original */
export function ViewToggle({ subject = 'personaje' }) {
  const { S, tools } = useSource();
  return (
    <Segmented label="Vista del original" value={S.view} onChange={tools.setView} items={[
      { value: 'cut', label: 'Sin fondo', tip: `Muestra solo lo que se considera ${subject}.` },
      { value: 'sil', label: 'Silueta', tip: `Muestra el ${subject} en un color plano; útil para ver huecos o restos de fondo.` },
      { value: 'orig', label: 'Original', tip: 'Muestra la imagen tal cual, con su fondo.' }
    ]} />
  );
}

/* the stage with the source canvas: the tools work on it; empty text until there is a picture.
   canvasRef / stageRef: shared with its DockZoom. onDropFile: a picture dropped on it (optional). */
export function SourceStage({ id, className = 'stage', empty, canvasId, onDropFile, canvasRef, stageRef }) {
  const { S, view, tools } = useSource();
  useEffect(() => { view.attach(canvasRef.current); return () => view.attach(null); }, [view, canvasRef]);
  const has = !!S.img;
  const drop = onDropFile ? {
    onDragOver: e => { e.preventDefault(); e.currentTarget.classList.add('drop-on'); },
    onDragLeave: e => e.currentTarget.classList.remove('drop-on'),
    onDrop: e => { e.preventDefault(); e.currentTarget.classList.remove('drop-on'); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) onDropFile(f); }
  } : {};
  return (
    <div className={className} id={id} ref={stageRef} {...drop}>
      <div className="empty" hidden={has}>{empty}</div>
      <canvas id={canvasId} ref={canvasRef} hidden={!has} {...tools.pointer} />
    </div>
  );
}
