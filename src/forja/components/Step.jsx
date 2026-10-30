/* A step of a settings column: a <details> accordion that remembers whether it is open. Changes are undone with
   Ctrl+Z / Ctrl+Y (there is no «reset this step» button). */
import { useSyncExternalStore } from 'react';
import { settings } from '../state/settings.js';
import { Lbl } from './Tooltip.jsx';

/* ---------- open / closed accordions, remembered per browser ---------- */
const accSubs = new Set();
let accVer = 0;
const accEmit = () => { accVer++; accSubs.forEach(f => f()); };
export const accordions = {
  isOpen: (key, d = true) => settings.accOpen(key, d),
  set(key, open) { settings.setAccOpen(key, open); accEmit(); },
  setMany(keys, open) { for (const k of keys) settings.setAccOpen(k, open); accEmit(); },
  subscribe(f) { accSubs.add(f); return () => accSubs.delete(f); }
};
export const useAccordion = (key, d = true) => {
  useSyncExternalStore(accordions.subscribe, () => accVer);
  return accordions.isOpen(key, d);
};

/* is any of these accordions open? */
export const useAnyOpen = keys => {
  useSyncExternalStore(accordions.subscribe, () => accVer);
  return keys.some(k => accordions.isOpen(k));
};

/* n: the number shown before the title; acc: key to remember it open / closed; tip: help of the title */
export function Step({ n, title, tip, acc, defaultOpen = true, className = 'step', children }) {
  const open = useAccordion(acc, defaultOpen);
  return (
    <details className={className} open={open} data-acc={acc}
      onToggle={e => { const o = e.currentTarget.open; if (o !== open) accordions.set(acc, o); }}>
      <summary><h2>{n != null && <><span className="n">{n}</span> </>}<Lbl tip={tip}>{title}</Lbl></h2></summary>
      <div className="step-body">
        {children}
      </div>
    </details>
  );
}
