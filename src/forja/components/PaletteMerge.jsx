/* Drag one palette colour onto another to merge them: a small window asks which one stays (by default the
   one dropped on, not the one dragged), OK confirms and ✕ cancels. Used by the generator's palette and the
   pixel editor's swatches. */
import { useEffect, useRef, useState } from 'react';
import { createValue, useValue } from '../state/signal.js';
import { placeNear, useDocumentEvent } from './ui.jsx';

const pending = createValue(null);   // { dragged, target, anchor, resolve }

/* dragged / target: '#rrggbb'. Resolves to the colour that stays, or null if cancelled. */
export function askMerge(dragged, target, anchor) {
  const p = pending.get(); if (p) p.resolve(null);
  return new Promise(resolve => pending.set({ dragged, target, anchor, resolve }));
}

export function MergePopover() {
  const p = useValue(pending), box = useRef(null), okRef = useRef(null);
  const [keepA, setKeepA] = useState(false);
  useEffect(() => { if (p) { setKeepA(false); placeNear(box.current, p.anchor); okRef.current.focus(); } }, [p]);
  const close = result => { if (!p) return; pending.set(null); p.resolve(result); };
  useDocumentEvent('keydown', e => {
    if (!p) return;
    if (e.key === 'Escape') { e.preventDefault(); close(null); }
    if (e.key === 'Enter' && box.current.contains(document.activeElement)) { e.preventDefault(); close(keepA ? p.dragged : p.target); }
  });
  useDocumentEvent('pointerdown', e => { if (p && !box.current.contains(e.target)) close(null); });
  return (
    <div className="pal-pop" id="palMergePop" role="dialog" aria-label="Fusionar dos colores" hidden={!p} ref={box}>
      <p className="pal-pop-title">Fusionar colores</p>
      <p className="hint">Los dos pasarán a ser uno. ¿Con cuál te quedas?</p>
      {p && (
        <div className="merge-opts" role="radiogroup" aria-label="Color que se queda">
          <label className="merge-opt"><input type="radio" name="mergeKeep" checked={keepA} onChange={() => setKeepA(true)} />
            <span className="pal-chip" style={{ background: p.dragged }} /><span className="merge-txt"><b>El que arrastras</b><span className="hint">{p.dragged}</span></span></label>
          <label className="merge-opt"><input type="radio" name="mergeKeep" checked={!keepA} onChange={() => setKeepA(false)} />
            <span className="pal-chip" style={{ background: p.target }} /><span className="merge-txt"><b>Sobre el que lo sueltas</b><span className="hint">{p.target}</span></span></label>
        </div>
      )}
      <div className="pal-pop-btns">
        <button type="button" aria-label="Cancelar la fusión" onClick={() => close(null)}>✕</button>
        <button type="button" className="primary" ref={okRef} onClick={() => close(keepA ? p.dragged : p.target)}>OK</button>
      </div>
    </div>
  );
}

/* drag-and-drop between the swatches of a palette. Returns the props for the container; each swatch is a
   draggable button with data-color. onMerge(dragged, target, keep, draggedBtn, targetBtn) */
export function useSwatchMerge(onMerge) {
  const from = useRef(null);
  const ref = useRef(onMerge); ref.current = onMerge;
  const btnOf = (e, box) => { const b = e.target.closest && e.target.closest('button'); return b && box.contains(b) ? b : null; };
  const clear = box => box.querySelectorAll('.drop-on').forEach(x => x.classList.remove('drop-on'));
  return {
    onDragStart: e => {
      const b = btnOf(e, e.currentTarget); if (!b) return;
      from.current = b; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.dataset.color);
      b.classList.add('dragging');
    },
    onDragEnd: e => { if (from.current) from.current.classList.remove('dragging'); from.current = null; clear(e.currentTarget); },
    onDragOver: e => {
      const b = btnOf(e, e.currentTarget);
      if (!from.current || !b || b === from.current) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      e.currentTarget.querySelectorAll('.drop-on').forEach(x => { if (x !== b) x.classList.remove('drop-on'); });
      b.classList.add('drop-on');
    },
    onDragLeave: e => { const b = btnOf(e, e.currentTarget); if (b) b.classList.remove('drop-on'); },
    onDrop: async e => {
      const b = btnOf(e, e.currentTarget), f = from.current;
      if (!f || !b || b === f) return;
      e.preventDefault(); b.classList.remove('drop-on');
      const dragged = f.dataset.color, target = b.dataset.color;
      from.current = null;
      if (!/^#/.test(target) || !/^#/.test(dragged)) return;   // removed (transparent) colours cannot be merged
      if (dragged.toLowerCase() === target.toLowerCase()) return;
      const keep = await askMerge(dragged, target, b);
      if (keep) ref.current(dragged, target, keep, f, b);
    }
  };
}
