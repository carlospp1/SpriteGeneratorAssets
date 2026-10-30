/* Zoom of views: the shared zoom levels, the remembered zoom of each view, and the zoom controls of a
   docked view (− / % / + / Ajustar, Ctrl + wheel) used by the generator's Original and the line art's views. */
import { useEffect, useRef, useState } from 'react';
import { prefs } from '../state/signal.js';

export const LEVELS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
export const pct = z => Math.round(z * 100) + '%';
/* next zoom level up (dir 1) or down (dir -1) from cur, or null */
export const nextLevel = (cur, dir) => dir > 0 ? LEVELS.find(v => v > cur * 1.01) ?? null : [...LEVELS].reverse().find(v => v < cur * 0.99) ?? null;

/* Ctrl + Alt + «+» / «−» / «0»: zoom in, out or fit the view under the mouse. Matched by the physical key too,
   because with Ctrl + Alt (AltGr) the Spanish keyboard turns «+» into «]». Returns 1, -1, 'fit' or 0. */
const MAS = ['BracketRight', 'Equal', 'NumpadAdd'], MENOS = ['Slash', 'Minus', 'NumpadSubtract'];
export function zoomKey(e) {
  if (!e.ctrlKey || !e.altKey || e.metaKey) return 0;
  if (e.key === '+' || MAS.includes(e.code)) return 1;
  if (e.key === '-' || MENOS.includes(e.code)) return -1;
  if (e.code === 'Digit0' || e.code === 'Numpad0') return 'fit';
  return 0;
}
/* where the mouse is, for the keyboard zoom: the last pointer position on the page */
export const raton = { x: -1, y: -1 };
if (typeof document !== 'undefined') document.addEventListener('pointermove', e => { raton.x = e.clientX; raton.y = e.clientY; }, { capture: true, passive: true });
export const bajoRaton = el => { if (!el || raton.x < 0 || el.offsetParent === null) return false; const r = el.getBoundingClientRect(); return raton.x >= r.left && raton.x < r.right && raton.y >= r.top && raton.y < r.bottom; };
/* the point of canvas under (mx, my) before a zoom; the function returned, called after it, scrolls box so that
   point is under the mouse again (and, where box cannot scroll any further, the boxes around it and the page) */
export function anclaZoom(canvas, box, mx, my) {
  const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return () => {};
  const fx = Math.min(1, Math.max(0, (mx - r.left) / r.width)), fy = Math.min(1, Math.max(0, (my - r.top) / r.height));
  return () => {
    for (let el = box; el; el = el === document.scrollingElement ? null : el.parentElement || document.scrollingElement) {
      const n = canvas.getBoundingClientRect(), dx = n.left + fx * n.width - mx, dy = n.top + fy * n.height - my;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) break;
      el.scrollLeft += dx; el.scrollTop += dy;
    }
  };
}

/* window positions and zooms (floating windows and docked views), remembered in this browser */
export const viewPrefs = prefs('forja.fwin', {});

/* canvasRef: the canvas shown; stageRef: its scrolling box; prefKey: where its zoom is remembered.
   smooth: photo-like view (pixelated only from ×2 up). Renders the controls; sizes the canvas itself. */
export function DockZoom({ canvasRef, stageRef, prefKey, smooth = true, label }) {
  const P = viewPrefs.data[prefKey] = viewPrefs.data[prefKey] || { zoom: 'fit' };
  const [text, setText] = useState('');
  const apply = useRef(null);
  apply.current = () => {
    const src = canvasRef.current; if (!src) return;
    const z = P.zoom;
    if (z === 'fit') { src.style.width = ''; src.style.height = ''; src.style.maxWidth = ''; src.style.maxHeight = ''; }
    else { src.style.width = src.width * z + 'px'; src.style.height = src.height * z + 'px'; src.style.maxWidth = 'none'; src.style.maxHeight = 'none'; }
    src.style.imageRendering = !smooth || (z !== 'fit' && z >= 2) ? 'pixelated' : '';
    const fit = src.width ? src.getBoundingClientRect().width / src.width : 1;
    setText(src.width && !src.hidden ? (z === 'fit' ? 'Ajustado ' : '') + pct(z === 'fit' ? fit : z) : '');
  };
  // at (mx, my): the point under the mouse stays under it (Ctrl + wheel, Ctrl + Alt + «+» / «−»)
  const zoom = (dir, mx, my) => {
    const src = canvasRef.current; if (!src) return;
    const cur = P.zoom === 'fit' ? (src.width ? src.getBoundingClientRect().width / src.width : 1) : P.zoom;
    const next = nextLevel(cur, dir); if (next == null) return;
    const anclar = mx != null && stageRef.current ? anclaZoom(src, stageRef.current, mx, my) : null;
    P.zoom = next; viewPrefs.save(); apply.current();
    if (anclar) anclar();
  };
  const fit = () => { P.zoom = 'fit'; viewPrefs.save(); apply.current(); };
  const fitRef = useRef(fit); fitRef.current = fit;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  useEffect(() => {
    const src = canvasRef.current, stage = stageRef.current; if (!src || !stage) return;
    const run = () => apply.current();
    const mo = new MutationObserver(run); mo.observe(src, { attributes: true, attributeFilter: ['width', 'height', 'hidden'] });
    const ro = new ResizeObserver(() => { if (P.zoom === 'fit') run(); }); ro.observe(stage);
    const wheel = e => { if (!e.ctrlKey) return; e.preventDefault(); zoomRef.current(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); };
    stage.addEventListener('wheel', wheel, { passive: false });
    // Ctrl + Alt + «+» / «−» / «0» with the mouse over this view
    const key = e => {
      const k = zoomKey(e); if (!k || e.defaultPrevented || !bajoRaton(stage)) return;
      e.preventDefault();
      if (k === 'fit') fitRef.current(); else zoomRef.current(k, raton.x, raton.y);
    };
    document.addEventListener('keydown', key);
    run();
    return () => { mo.disconnect(); ro.disconnect(); stage.removeEventListener('wheel', wheel); document.removeEventListener('keydown', key); };
  }, [canvasRef, stageRef]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="dock-zoom" role="group" aria-label={label}>
      <button type="button" aria-label="Alejar" data-tip="Alejar (también Ctrl + rueda del ratón, o Ctrl + Alt + − con el ratón encima)." onClick={() => zoom(-1)}>−</button>
      <span className="fwin-zoom">{text}</span>
      <button type="button" aria-label="Acercar" data-tip="Acercar (también Ctrl + rueda del ratón, o Ctrl + Alt + + con el ratón encima: acerca donde está el ratón)." onClick={() => zoom(1)}>+</button>
      <button type="button" aria-label="Ajustar al panel" data-tip="Ajusta la imagen al tamaño del panel (Ctrl + Alt + 0 con el ratón encima)." onClick={fit}>Ajustar</button>
    </div>
  );
}
