/* The toolbar: tool groups (the small triangle = more tools: right click or hold to see them in a
   fly-out), and the foreground / background colours like Photoshop's overlapping squares. */
import { useLayoutEffect, useRef } from 'react';
import { useSignal, useValue } from '../../state/signal.js';
import { useDocumentEvent } from '../../components/ui.jsx';
import { hex, hex2rgb } from '../../engine/color.js';
import { E } from '../../engine/editor/E.js';
import { ICON, TOOL, GROUPS } from './tooldefs.js';
import { sig, toolVal, flyoutVal, groupTool, selectTool, closeFlyout, setColor, swapColors, defaultColors } from './store.js';

export const Icon = ({ t }) => <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[t] }} />;

function ToolButton({ g }) {
  const tool = useValue(toolVal), t = groupTool(g), info = TOOL[t], more = g.length > 1;
  const hold = useRef(0);
  const open = e => flyoutVal.set({ group: g, anchor: e.currentTarget.getBoundingClientRect() });
  return (
    <button type="button" className={'ed-tool' + (more ? ' has-more' : '')} data-etool={t} aria-pressed={tool === t}
      aria-label={`${info.name} (${info.key})`}
      data-tip={`${info.name} (${info.key}${more ? ', Mayús+' + info.key + ' para cambiar' : ''}). ${info.tip}${more ? ' Clic derecho o mantener pulsado: ver las demás.' : ''}`}
      onClick={() => selectTool(t)}
      onContextMenu={more ? e => { e.preventDefault(); open(e); } : undefined}
      onPointerDown={more ? e => { const ev = { currentTarget: e.currentTarget }; hold.current = setTimeout(() => open(ev), 450); } : undefined}
      onPointerUp={() => clearTimeout(hold.current)} onPointerLeave={() => clearTimeout(hold.current)} onPointerCancel={() => clearTimeout(hold.current)}>
      <Icon t={t} />
    </button>
  );
}

function Flyout() {
  const fly = useValue(flyoutVal), tool = useValue(toolVal), box = useRef(null);
  useLayoutEffect(() => {
    if (!fly) return;
    const el = box.current, r = fly.anchor;
    el.style.left = Math.min(innerWidth - el.offsetWidth - 8, r.right + 4) + 'px';
    el.style.top = Math.min(innerHeight - el.offsetHeight - 8, r.top) + 'px';
    const b = el.querySelector('button'); if (b) b.focus();
  }, [fly]);
  useDocumentEvent('pointerdown', e => { if (fly && !box.current.contains(e.target)) closeFlyout(); });
  const keys = e => {
    const items = [...box.current.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFlyout(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  };
  return (
    <div className="ed-flyout" id="edFlyout" role="menu" hidden={!fly} ref={box} onKeyDown={keys}>
      {fly && fly.group.map(t => (
        <button key={t} type="button" role="menuitemradio" aria-checked={tool === t} onClick={() => { closeFlyout(); selectTool(t); }}>
          <Icon t={t} /><span>{TOOL[t].name}</span><kbd>{TOOL[t].key}</kbd>
        </button>
      ))}
    </div>
  );
}

function FgBg() {
  useSignal(sig.colors);
  return (
    <div className="ed-fgbg" role="group" aria-label="Colores frontal y de fondo">
      <label className="fg"><input type="color" id="edPrimary" aria-label="Color frontal" data-tip="Color frontal (clic izquierdo). Clic para elegir otro."
        value={hex(E.colors.primary)} onChange={e => setColor('primary', hex2rgb(e.target.value))} /></label>
      <label className="bg"><input type="color" id="edSecondary" aria-label="Color de fondo" data-tip="Color de fondo (clic derecho). Clic para elegir otro."
        value={hex(E.colors.secondary)} onChange={e => setColor('secondary', hex2rgb(e.target.value))} /></label>
      <button type="button" id="edSwap" aria-label="Intercambiar colores" data-tip="Intercambiar color frontal y de fondo (X)." onClick={swapColors}>⇄</button>
      <button type="button" id="edDefault" aria-label="Colores por defecto" data-tip="Colores por defecto: negro y blanco (D)." onClick={defaultColors}>◩</button>
    </div>
  );
}

export function ToolBar() {
  return (
    <>
      <div className="ed-tools" id="edTools" role="toolbar" aria-label="Herramientas" aria-orientation="vertical">
        <div className="ed-toolgroups" id="edToolGroups">
          {GROUPS.map((g, i) => (g ? <ToolButton key={g[0]} g={g} /> : <span key={'s' + i} className="ed-sep" aria-hidden="true" />))}
        </div>
        <FgBg />
      </div>
      <Flyout />
    </>
  );
}
