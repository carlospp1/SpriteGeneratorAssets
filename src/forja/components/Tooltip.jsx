/* Info tooltips. Any button, field or select with a data-tip attribute shows it on hover or keyboard focus
   (one TooltipLayer for the whole app); labels, headings and other text get an "i" button (InfoTip) that
   shows it on hover or click, so it also works on touch screens. */
import { useEffect, useRef, useState } from 'react';

const CONTROL = 'button[data-tip], input[data-tip], select[data-tip]';

export function TooltipLayer() {
  const [tip, setTip] = useState(null);   // { el, text }
  const box = useRef(null);
  const anchor = useRef(null);

  useEffect(() => {
    const show = el => { anchor.current = el; setTip({ el, text: el.dataset.tip, at: Date.now() }); el.setAttribute('aria-describedby', 'tip'); };
    const hide = () => { if (anchor.current) anchor.current.removeAttribute('aria-describedby'); anchor.current = null; setTip(null); };
    const over = e => {
      const el = e.target.closest && e.target.closest(CONTROL);
      if (el && el !== anchor.current && el.dataset.tip) show(el);
    };
    const out = e => {
      const el = anchor.current; if (!el) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      if (e.target.closest && e.target.closest(CONTROL) === el && !el.matches(':focus-visible')) hide();
    };
    // keyboard focus shows it too, except on text fields where it would cover what you type
    const focus = e => { const el = e.target.closest && e.target.closest(CONTROL); if (el && el.dataset.tip && el.matches(':focus-visible') && el.tagName !== 'INPUT') show(el); };
    const blur = e => { if (e.target === anchor.current) hide(); };
    const key = e => { if (e.key === 'Escape') hide(); };
    const down = e => { if (anchor.current && !anchor.current.contains(e.target)) hide(); };
    const click = e => { const b = e.target.closest && e.target.closest('button.info'); if (b) { e.preventDefault(); e.stopPropagation(); show(b); } };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down);
    document.addEventListener('click', click, true);
    const follow = () => { if (anchor.current) setTip(t => t && { ...t }); };
    addEventListener('scroll', follow, true); addEventListener('resize', follow);
    return () => {
      document.removeEventListener('mouseover', over); document.removeEventListener('mouseout', out);
      document.removeEventListener('focusin', focus); document.removeEventListener('focusout', blur);
      document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down);
      document.removeEventListener('click', click, true);
      removeEventListener('scroll', follow, true); removeEventListener('resize', follow);
    };
  }, []);

  // place it under its element (above when there is no room), inside the window
  useEffect(() => {
    const t = box.current; if (!tip || !t || !tip.el.isConnected) return;
    const a = tip.el.getBoundingClientRect(), r = t.getBoundingClientRect(), M = 8;
    let x = a.left + a.width / 2 - r.width / 2, y = a.bottom + 6;
    if (y + r.height > innerHeight - M) y = a.top - r.height - 6;
    t.style.left = Math.max(M, Math.min(innerWidth - r.width - M, x)) + 'px';
    t.style.top = Math.max(M, y) + 'px';
  }, [tip]);

  return <div id="tip" ref={box} className="tip" role="tooltip" hidden={!tip}>{tip && tip.text}</div>;
}

/* the "i" button next to a label or heading */
export function InfoTip({ text }) {
  if (!text) return null;
  return <button type="button" className="info" aria-label="Más información" data-tip={text}>i</button>;
}

/* text with its info button, kept together in grid / flex layouts */
export function Lbl({ children, tip }) {
  if (!tip) return children;
  return <span className="lbl">{children}<InfoTip text={tip} /></span>;
}
