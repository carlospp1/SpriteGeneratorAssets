/* The editor's side panels, each a <details> remembered open or closed: Navegador (the whole drawing and
   the visible area, plus the real size), Muestras (the drawing's colours), Capas and Historia. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSignal } from '../../state/signal.js';
import { Lbl } from '../../components/Tooltip.jsx';
import { useAccordion, accordions } from '../../components/Step.jsx';
import { RangeField, SelectField, CheckField } from '../../components/fields.jsx';
import { useSwatchMerge } from '../../components/PaletteMerge.jsx';
import { hex } from '../../engine/color.js';
import { D } from '../../engine/editor/doc.js';
import { O } from '../../engine/editor/ops.js';
import { view } from './view.js';
import * as U from './store.js';

function Section({ acc, id, title, tip, extra, children }) {
  const open = useAccordion(acc, true);
  return (
    <details className="ed-sec" open={open} data-acc={acc} id={id}
      onToggle={e => { const o = e.currentTarget.open; if (o !== open) accordions.set(acc, o); }}>
      <summary><h2><Lbl tip={tip}>{title}</Lbl>{extra}</h2></summary>
      <div className="ed-sec-body">{children}</div>
    </details>
  );
}

/* ---------- Navegador ---------- */
function NavigatorPanel() {
  const drag = useRef(false);
  const go = e => {
    const nav = e.currentTarget, r = nav.getBoundingClientRect(), s = +nav.dataset.scale || 1;
    view.centerOn((e.clientX - r.left) / s * (nav.width / r.width), (e.clientY - r.top) / s * (nav.height / r.height));
  };
  return (
    <Section acc="e-nav" id="edSecNav" title="Navegador" tip="Todo el dibujo en pequeño; el recuadro es lo que estás viendo. Haz clic o arrastra en él para moverte.">
      <canvas id="edNav" className="ed-nav" aria-label="Navegador: clic para ir a esa zona" ref={el => U.registerCanvas('nav', el)}
        onPointerDown={e => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); go(e); }}
        onPointerMove={e => { if (drag.current) go(e); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }} />
      <div className="ed-real"><span className="hint">Tamaño real</span><canvas id="edPrev1" ref={el => U.registerCanvas('prev', el)} /></div>
    </Section>
  );
}

/* ---------- Muestras ---------- */
function SwatchesPanel() {
  const ver = useSignal(U.sig.thumbs);
  const groups = useMemo(() => (D.has() ? O.documentGroups() : []), [ver]);   // eslint-disable-line react-hooks/exhaustive-deps
  const count = groups.reduce((n, g) => n + g.colors.length, 0);
  const merge = useSwatchMerge((dragged, target, keep) => U.mergeSwatches(dragged, target, keep));
  const picker = useRef(null), from = useRef(null);
  useEffect(() => {
    const p = picker.current;
    const change = () => { if (from.current) { U.replaceSwatch(from.current, p.value); from.current = null; } };
    p.addEventListener('change', change);
    return () => p.removeEventListener('change', change);
  }, []);
  const openSwap = c => { from.current = c; const p = picker.current; p.value = hex(c); try { p.showPicker(); } catch { p.click(); } };
  return (
    <Section acc="e-sw" id="edSecSwatches" title="Muestras"
      tip="Los colores que usa el dibujo, por familia y de oscuro a claro. Clic: frontal. Clic derecho: fondo. Doble clic: cambiar ese color en todo el dibujo. Arrastra uno sobre otro para fusionarlos."
      extra={<> <span id="edPalCount" className="hint">{count ? '· ' + count + (count === 1 ? ' color' : ' colores') : ''}</span></>}>
      <div className="ed-palette" id="edPalette" {...merge}>
        {groups.map((g, i) => (
          <div className="pal-row" key={i} title={g.name} aria-label={g.name}>
            {g.colors.map(c => {
              const h = hex(c);
              return (
                <button key={h} type="button" className="pal" style={{ background: h }} title={h} aria-label={'Color ' + h} data-color={h} draggable
                  onClick={() => U.setColor('primary', c)}
                  onContextMenu={e => { e.preventDefault(); U.setColor('secondary', c); }}
                  onDoubleClick={() => openSwap(c)} />
              );
            })}
          </div>
        ))}
      </div>
      <input type="color" id="edSwapPicker" className="visually-hidden" tabIndex={-1} aria-hidden="true" ref={picker} />
    </Section>
  );
}

/* ---------- Capas ---------- */
const BLENDS = [['normal', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Trama'], ['overlay', 'Superponer'], ['darken', 'Oscurecer'],
  ['lighten', 'Aclarar'], ['difference', 'Diferencia'], ['add', 'Sobreexposición lineal (añadir)']];
const BLEND_NAME = Object.fromEntries(BLENDS);
const EyeOn = () => <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const EyeOff = () => <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2" /></svg>;
const tmp = document.createElement('canvas');

function RenameInput({ layer }) {
  const done = useRef(false);
  const finish = (ok, v) => { if (done.current) return; done.current = true; U.renameLayer(layer, ok ? v : layer.name); };
  return (
    <input className="rename" defaultValue={layer.name} aria-label="Nombre de la capa" autoFocus onFocus={e => e.target.select()}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') finish(true, e.target.value); if (e.key === 'Escape') finish(false); }}
      onBlur={e => finish(true, e.target.value)} onClick={e => e.stopPropagation()} />
  );
}

function LayersPanel() {
  const struct = useSignal(U.sig.struct), thumbVer = useSignal(U.sig.thumbs);
  const [renaming, setRenaming] = useState(null);   // layer id
  const [dropAt, setDropAt] = useState(null);       // { i, above }
  const [dragging, setDragging] = useState(-1);
  const thumbs = useRef(new Map());
  const l = D.cur(), has = D.has();
  useEffect(() => {   // layer thumbnails
    if (!D.has()) return;
    tmp.width = D.w; tmp.height = D.h;
    const tx = tmp.getContext('2d');
    for (const [i, c] of thumbs.current) {
      const ly = D.layers[i]; if (!ly || !c) continue;
      tx.putImageData(new ImageData(new Uint8ClampedArray(ly.px), D.w, D.h), 0, 0);
      const x = c.getContext('2d'), s = Math.min(32 / D.w, 32 / D.h);
      x.clearRect(0, 0, 32, 32); x.imageSmoothingEnabled = false;
      x.drawImage(tmp, (32 - D.w * s) / 2, (32 - D.h * s) / 2, D.w * s, D.h * s);
    }
  }, [struct, thumbVer]);
  const above = (e, li) => { const r = li.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; };
  const rows = [];
  for (let i = D.layers.length - 1; i >= 0; i--) {
    const ly = D.layers[i], tags = [];
    if (ly.lockAlpha) tags.push(['🔒', 'Transparencia bloqueada']);
    if (ly.blend !== 'normal') tags.push([BLEND_NAME[ly.blend].split(' ')[0], 'Modo de fusión']);
    if (ly.opacity < 1) tags.push([Math.round(ly.opacity * 100) + '%', 'Opacidad']);
    if (ly.generated) tags.push(['generado', 'Se actualiza desde el generador']);
    const cls = [i === D.active && 'active', dragging === i && 'dragging', dropAt && dropAt.i === i && (dropAt.above ? 'drop-above' : 'drop-below')].filter(Boolean).join(' ');
    rows.push(
      <li key={ly.id} className={cls || undefined} draggable={renaming !== ly.id}
        // drag to reorder, like Photoshop
        onDragStart={e => { setDragging(i); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragging(-1); setDropAt(null); }}
        onDragOver={e => { if (dragging < 0 || dragging === i) return; e.preventDefault(); const a = above(e, e.currentTarget); if (!dropAt || dropAt.i !== i || dropAt.above !== a) setDropAt({ i, above: a }); }}
        onDragLeave={() => setDropAt(d => (d && d.i === i ? null : d))}
        onDrop={e => {
          if (dragging < 0) return; e.preventDefault();
          let to = above(e, e.currentTarget) ? i + 1 : i; if (dragging < to) to--;   // the list shows the top layer first
          const from = dragging; setDragging(-1); setDropAt(null);
          U.dropLayer(from, to);
        }}>
        <button type="button" className="vis" aria-pressed={ly.visible} aria-label={(ly.visible ? 'Ocultar ' : 'Mostrar ') + ly.name}
          onClick={e => { e.stopPropagation(); U.toggleVisible(ly); }}>{ly.visible ? <EyeOn /> : <EyeOff />}</button>
        <button type="button" className="pick" aria-label={'Usar la capa ' + ly.name} aria-pressed={i === D.active}
          onClick={e => { if (e.ctrlKey || e.metaKey) { U.selectLayerPixels(ly); return; } U.activateLayer(i); }}>
          <canvas className="thumb" width={32} height={32} title="Ctrl + clic: seleccionar los píxeles de esta capa"
            ref={c => { if (c) thumbs.current.set(i, c); else thumbs.current.delete(i); }} />
          {renaming === ly.id ? <RenameInput layer={ly} key="r" />
            : <span className="name" title="Doble clic para cambiar el nombre" onDoubleClick={e => { e.stopPropagation(); setRenaming(ly.id); }}>{ly.name}</span>}
        </button>
        {tags.map(([t, title]) => <span key={title} className="tag" title={title}>{t}</span>)}
      </li>
    );
  }
  useEffect(() => { if (renaming != null && !D.layers.some(x => x.id === renaming)) setRenaming(null); });
  // a rename ends with structureChanged(): leave the input
  const lastStruct = useRef(struct);
  useEffect(() => { if (struct !== lastStruct.current) { lastStruct.current = struct; setRenaming(null); } }, [struct]);

  return (
    <Section acc="e-layers" id="edSecLayers" title="Capas"
      tip="Las capas de arriba tapan a las de abajo. Arrastra para reordenar, doble clic en el nombre para renombrar, Ctrl + clic en la miniatura para seleccionar sus píxeles.">
      <div className="ed-layer-top">
        <SelectField id="edBlend" inline label="Modo" tip="Modo de fusión: cómo se mezcla la capa con las de debajo."
          value={l ? l.blend : 'normal'} onChange={U.setBlend} options={BLENDS} />
        <RangeField id="edOpacity" label="Opacidad" tip="Opacidad de la capa activa. Con la herramienta Mover: teclas 1 a 0."
          value={l ? Math.round(l.opacity * 100) : 100} min={0} max={100} onChange={U.setOpacity} />
        <CheckField id="edLockAlpha" label="Bloquear transparencia" checked={!!(l && l.lockAlpha)} onChange={U.toggleLockAlpha}
          tip="Bloquear píxeles transparentes (/): pintas solo sobre lo que ya hay, sin salirte. Ideal para sombrear." />
      </div>
      <ul className="layers" id="edLayers">{rows}</ul>
      <div className="ed-layer-btns" role="group" aria-label="Acciones de capa">
        <button type="button" aria-label="Nueva capa" data-tip="Nueva capa (Ctrl+Alt+Mayús+N)." disabled={!has} onClick={() => U.act('Nueva capa', () => D.addLayer())}>＋</button>
        <button type="button" aria-label="Duplicar capa" data-tip="Duplicar capa (Ctrl+J sin selección)." disabled={!has} onClick={() => U.act('Duplicar capa', () => D.duplicateLayer())}>⧉</button>
        <button type="button" aria-label="Subir capa" data-tip="Hacia delante (Ctrl+])." disabled={D.active >= D.layers.length - 1} onClick={() => U.act('Hacia delante', () => D.moveLayer(1))}>▲</button>
        <button type="button" aria-label="Bajar capa" data-tip="Hacia atrás (Ctrl+[)." disabled={D.active <= 0} onClick={() => U.act('Hacia atrás', () => D.moveLayer(-1))}>▼</button>
        <button type="button" aria-label="Combinar hacia abajo" data-tip="Combinar hacia abajo (Ctrl+E)." disabled={D.active < 1} onClick={() => U.act('Combinar hacia abajo', () => D.mergeDown())}>⤓</button>
        <button type="button" aria-label="Eliminar capa" data-tip="Eliminar capa." disabled={D.layers.length < 2} onClick={U.deleteLayerAsk}>🗑</button>
      </div>
    </Section>
  );
}

/* ---------- Historia ---------- */
function HistoryPanel() {
  useSignal(U.sig.hist);
  const box = useRef(null);
  const h = D.history(), items = [['Estado inicial', 0], ...h.done.map((l, i) => [l, i + 1]), ...h.undone.map((l, i) => [l, h.pos + i + 1])];
  const shown = items.slice(Math.max(0, items.length - 60));
  useEffect(() => { const c = box.current.querySelector('.current'); if (c) c.scrollIntoView({ block: 'nearest' }); });
  return (
    <Section acc="e-hist" id="edSecHistory" title="Historia"
      tip="Cada paso que has dado. Haz clic en uno para volver a ese momento; los pasos de después quedan atenuados hasta que hagas algo nuevo.">
      <ol className="ed-history" id="edHistory" ref={box}>
        {shown.map(([label, n]) => (
          <li key={n}>
            <button type="button" className={n === h.pos ? 'current' : n > h.pos ? 'undone' : undefined} aria-current={n === h.pos ? 'step' : 'false'}
              onClick={() => U.historyGo(n)}>{label}</button>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function SidePanels() {
  return (
    <aside className="ed-side" id="edSide">
      <NavigatorPanel />
      <SwatchesPanel />
      <LayersPanel />
      <HistoryPanel />
    </aside>
  );
}
