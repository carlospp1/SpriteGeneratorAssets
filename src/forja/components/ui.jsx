/* Small building blocks shared by every page. */
import { useEffect, useRef, useState } from 'react';
import { Lbl } from './Tooltip.jsx';
import { forjaActiva } from '../app/activa.js';

/* a toggle button of a group of tools / views (aria-pressed) */
export function Toggle({ pressed, onClick, tip, className, children, ...rest }) {
  return <button type="button" aria-pressed={!!pressed} className={className} data-tip={tip} onClick={onClick} {...rest}>{children}</button>;
}

/* .seg: segmented buttons, one of them pressed. items: [{ value, label, tip }] */
export function Segmented({ value, onChange, items, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map(it => <Toggle key={it.value} pressed={value === it.value} tip={it.tip} onClick={() => onChange(it.value)}>{it.label}</Toggle>)}
    </div>
  );
}

/* a panel with its head (title + whatever goes next to it) */
export function Panel({ id, title, tip, head, children, className = 'panel' }) {
  return (
    <div className={className} id={id}>
      <div className="panel-head"><h2><Lbl tip={tip}>{title}</Lbl></h2>{head}</div>
      {children}
    </div>
  );
}

/* the first image file of a drop or a paste */
export const imageIn = dt => [...(dt ? dt.files : [])].find(x => x.type.startsWith('image/'));

/* a file picker hidden behind a ref: pick() opens it */
export function useFilePicker(accept, onFiles, multiple = false) {
  const ref = useRef(null);
  const input = (
    <input type="file" ref={ref} accept={accept} multiple={multiple} hidden
      onChange={e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) onFiles(files); }} />
  );
  return [input, () => ref.current && ref.current.click()];
}

/* drop zone: click / Enter / Space opens the file picker, an image can be dropped on it */
export function DropZone({ className = 'drop', ariaLabel, tip, onFile, children, accept = 'image/*', id }) {
  const [over, setOver] = useState(false);
  const [input, pick] = useFilePicker(accept, files => onFile(files[0]));
  return (
    <>
      <div className={className + (over ? ' over' : '')} id={id} tabIndex={0} role="button" aria-label={ariaLabel} data-tip={tip}
        onClick={pick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
        {children}
      </div>
      {input}
    </>
  );
}

/* a native <dialog>: open / close follow the prop; Esc or a «cancel» button call onClose */
export function Dialog({ open, onClose, title, className, children, id }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} id={id} className={className} aria-label={title} onClose={() => { if (open) onClose(); }}>
      <form method="dialog" onSubmit={e => e.preventDefault()}>
        {title && <h2>{title}</h2>}
        {children}
      </form>
    </dialog>
  );
}

/* place a floating box (fixed) under an anchor element, or above it when there is no room */
export function placeNear(box, anchor) {
  const a = anchor.getBoundingClientRect(), r = box.getBoundingClientRect(), M = 8;
  let x = a.left + a.width / 2 - r.width / 2, y = a.bottom + 8;
  if (y + r.height > innerHeight - M) y = a.top - r.height - 8;
  box.style.left = Math.max(M, Math.min(innerWidth - r.width - M, x)) + 'px';
  box.style.top = Math.max(M, y) + 'px';
}

/* run fn on document events while mounted (listeners see the latest fn), only while Forja is the tool shown */
export function useDocumentEvent(type, fn, options) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    const h = e => { if (forjaActiva()) ref.current(e); };
    document.addEventListener(type, h, options);
    return () => document.removeEventListener(type, h, options);
  }, [type]);   // eslint-disable-line react-hooks/exhaustive-deps
}
