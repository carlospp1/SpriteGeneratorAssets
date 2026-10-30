/* Floating windows: copies of a view (the panel stays where it is) that can be moved, resized, zoomed and
   closed. Several can be open at once, also in the pixel editor (extra views of the drawing, like
   Photoshop's "new window"). They follow the original view live: its page calls refreshWindows(type).
   Each kind of window is registered by its page with registerWindowType(type, def):
   def = { title, page, zoom ('fit' or a level), smooth, size: [w, h], src() -> canvas or null, empty, attach(canvas) -> cleanup } */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createSignal, createValue, useValue } from '../state/signal.js';
import { viewPrefs, nextLevel, pct, zoomKey, raton, bajoRaton, anclaZoom } from './Zoom.jsx';

const TYPES = {};
const refreshSig = {};
const sigOf = type => refreshSig[type] || (refreshSig[type] = createSignal());
const wins = createValue([]);   // [{ key, type, n }]
let nextKey = 1, zTop = 50, cascade = 0;

export function registerWindowType(type, def) { TYPES[type] = def; }
export function refreshWindows(type) { if (wins.get().some(w => w.type === type)) sigOf(type).bump(); }
export function openWindow(type) {
  const n = wins.get().filter(w => w.type === type).length + 1;
  wins.set([...wins.get(), { key: nextKey++, type, n }]);
}
export const windowCount = () => wins.get().length;

/* the windows of every page (hidden while their page is not shown) */
export function FloatingWindows({ page }) {
  const list = useValue(wins);
  return list.map(w => <FloatingWindow key={w.key} win={w} hidden={TYPES[w.type].page !== page}
    onClose={() => wins.set(wins.get().filter(x => x !== w))} />);
}

const clampPos = (x, y, w) => [Math.max(80 - w, Math.min(innerWidth - 80, x)), Math.max(0, Math.min(innerHeight - 40, y))];
const fitZoom = (body, src) => { const b = body.getBoundingClientRect(); return Math.max(0.01, Math.min((b.width - 16) / src.width, (b.height - 16) / src.height)); };

function FloatingWindow({ win, hidden, onClose }) {
  const T = TYPES[win.type], P = viewPrefs.data[win.type] || {};
  const el = useRef(null), body = useRef(null), canvas = useRef(null), eff = useRef(null), drag = useRef(null), ancla = useRef(null);
  const [zoom, setZoom] = useState(P.zoom != null ? P.zoom : T.zoom);
  const [label, setLabel] = useState('');
  const [empty, setEmpty] = useState(false);
  const ver = useSyncExternalStore(sigOf(win.type).subscribe, sigOf(win.type).get);
  const title = T.title + (win.n > 1 ? ' ' + win.n : '');

  const remember = (z = zoom) => {
    const e = el.current; if (!e) return;
    viewPrefs.data[win.type] = { pos: [e.offsetLeft, e.offsetTop], size: [e.offsetWidth, e.offsetHeight], zoom: z }; viewPrefs.save();
  };
  // first placement: where it was last time (or centred), cascading new ones
  const [pos] = useState(() => {
    const [w0, h0] = P.size || T.size, base = P.pos || [Math.round(innerWidth / 2 - w0 / 2), 90];
    const [x, y] = clampPos(base[0] + cascade, base[1] + cascade, w0);
    cascade = (cascade + 28) % 168;
    return { left: x, top: y, width: w0, height: h0, zIndex: ++zTop };
  });

  const draw = () => {
    const c = canvas.current, b = body.current; if (!c || !b) return;
    const src = T.src();
    const cx = b.scrollWidth > b.clientWidth ? (b.scrollLeft + b.clientWidth / 2) / b.scrollWidth : 0.5;
    const cy = b.scrollHeight > b.clientHeight ? (b.scrollTop + b.clientHeight / 2) / b.scrollHeight : 0.5;
    const before = eff.current;
    setEmpty(!src);
    if (!src) { c.width = 0; c.height = 0; setLabel(''); return; }
    if (c.width !== src.width) c.width = src.width;
    if (c.height !== src.height) c.height = src.height;
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0);
    const z = zoom === 'fit' ? fitZoom(b, src) : zoom;
    c.style.width = src.width * z + 'px'; c.style.height = src.height * z + 'px';
    c.classList.toggle('pixelated', !T.smooth || z >= 2);
    eff.current = z;
    setLabel((zoom === 'fit' ? 'Ajustado ' : '') + pct(z));
    if (before !== z) {
      if (ancla.current) ancla.current();   // zoomed at the mouse: the point under it stays there
      else { b.scrollLeft = cx * b.scrollWidth - b.clientWidth / 2; b.scrollTop = cy * b.scrollHeight - b.clientHeight / 2; }
    }
    ancla.current = null;
  };
  const drawRef = useRef(draw); drawRef.current = draw;
  useEffect(() => { drawRef.current(); }, [ver, zoom, hidden]);

  const zoomBy = (dir, mx, my) => {
    const next = nextLevel(zoom === 'fit' ? (eff.current || 1) : zoom, dir);
    if (next == null) return;
    ancla.current = mx != null && canvas.current && body.current ? anclaZoom(canvas.current, body.current, mx, my) : null;
    setZoom(next); remember(next);
  };
  const zoomRef = useRef(zoomBy); zoomRef.current = zoomBy;

  useEffect(() => {
    const e = el.current;
    const wheel = ev => { if (!ev.ctrlKey) return; ev.preventDefault(); zoomRef.current(ev.deltaY < 0 ? 1 : -1, ev.clientX, ev.clientY); };
    e.addEventListener('wheel', wheel, { passive: false });
    // Ctrl + Alt + «+» / «−» / «0» with the mouse over this window (first: it is above the views under it)
    const key = ev => {
      const k = zoomKey(ev); if (!k || ev.defaultPrevented || !bajoRaton(body.current)) return;
      ev.preventDefault();
      if (k === 'fit') { setZoom('fit'); remember('fit'); } else zoomRef.current(k, raton.x, raton.y);
    };
    document.addEventListener('keydown', key, true);
    // resizing from the corner: refit and remember
    let t;
    const ro = new ResizeObserver(() => { drawRef.current(); clearTimeout(t); t = setTimeout(() => remember(), 300); });
    ro.observe(e);
    const keep = () => { const [x, y] = clampPos(e.offsetLeft, e.offsetTop, e.offsetWidth); e.style.left = x + 'px'; e.style.top = y + 'px'; };
    addEventListener('resize', keep);
    const detach = T.attach ? T.attach(canvas.current) : null;
    return () => { e.removeEventListener('wheel', wheel); document.removeEventListener('keydown', key, true); ro.disconnect(); clearTimeout(t); removeEventListener('resize', keep); if (detach) detach(); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // move by the title bar
  const bar = {
    onPointerDown: e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { dx: e.clientX - el.current.offsetLeft, dy: e.clientY - el.current.offsetTop }; el.current.classList.add('moving');
    },
    onPointerMove: e => {
      if (!drag.current) return;
      const [x, y] = clampPos(e.clientX - drag.current.dx, e.clientY - drag.current.dy, el.current.offsetWidth);
      el.current.style.left = x + 'px'; el.current.style.top = y + 'px';
    },
    onPointerUp: () => { if (!drag.current) return; drag.current = null; el.current.classList.remove('moving'); remember(); },
    onPointerCancel: () => { drag.current = null; el.current.classList.remove('moving'); }
  };

  return (
    <div className="fwin" role="dialog" aria-label={title + ' (ventana)'} ref={el} style={pos} hidden={hidden}
      onPointerDownCapture={() => { el.current.style.zIndex = ++zTop; }}>
      <div className="fwin-bar" {...bar}>
        <span className="fwin-title">{title}</span>
        <div className="fwin-ctrl">
          <button type="button" aria-label="Alejar" data-tip="Alejar (también Ctrl + rueda del ratón, o Ctrl + Alt + − con el ratón encima)." onClick={() => zoomBy(-1)}>−</button>
          <span className="fwin-zoom">{label}</span>
          <button type="button" aria-label="Acercar" data-tip="Acercar (también Ctrl + rueda del ratón, o Ctrl + Alt + + con el ratón encima: acerca donde está el ratón)." onClick={() => zoomBy(1)}>+</button>
          <button type="button" aria-label="Ajustar a la ventana" data-tip="Ajusta la imagen al tamaño de la ventana." onClick={() => { setZoom('fit'); remember('fit'); }}>Ajustar</button>
          <button type="button" className="fwin-close" aria-label="Cerrar ventana" data-tip="Cierra esta ventana (la vista original no cambia)." onClick={() => { remember(); onClose(); }}>×</button>
        </div>
      </div>
      <div className="fwin-body" ref={body}>
        <canvas ref={canvas} hidden={empty} />
        <p className="fwin-empty hint" hidden={!empty}>{T.empty}</p>
      </div>
    </div>
  );
}

/* the "⧉ Ventana" button of a view */
export function OpenWindowButton({ type, tip, children = '⧉ Ventana' }) {
  return <button type="button" className="open-win" data-tip={tip} onClick={() => openWindow(type)}>{children}</button>;
}
