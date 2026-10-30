/* Undo / redo (Ctrl+Z, Ctrl+Y / Ctrl+Mayús+Z) for a page that works on a picture with the source tools (the line
   art, separar). Every settled change becomes a step: the page's settings, the crop, the zones, the brush and
   AI-click retouches (edits), the view (sin fondo / silueta / original) and whatever the page adds (extra).
   Steps are taken a moment after things settle, so a drag or a slider move is one step.
   ctx = {
     S, image, ids: () => setting ids of the page, rehacer: () => recompute the page after a step is restored,
     ocupado: () => true while something is being dragged or drawn,
     extra: { foto: () => object, poner: object => void, igual: (a, b) => boolean }   (optional)
   } */
import { settings } from '../../state/settings.js';

const LIMITE = 80;

export function crearHistorial(ctx) {
  const { S, image } = ctx;
  let pila = [], pos = -1, timer = 0, restaurando = false;

  const foto = () => {
    if (!S.img || !S.frame) return null;
    const f = S.frame;
    return {
      ajustes: settings.pick(ctx.ids()), frame: { x: f.x, y: f.y, w: f.w, h: f.h }, vista: S.view,
      bgSeeds: S.bgSeeds.map(s => ({ ...s })), edits: S.edits, extra: ctx.extra ? ctx.extra.foto() : null
    };
  };
  const mismos = (a, b) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const clave = s => JSON.stringify([s.ajustes, s.frame, s.vista, s.bgSeeds]);

  function guardar() {
    timer = 0;
    if (restaurando) return;
    if (ctx.ocupado && ctx.ocupado()) { schedule(); return; }   // still dragging: wait for the end
    const s = foto(); if (!s) return;
    s.clave = clave(s);
    const top = pila[pos], mismosEdits = top && mismos(top.edits, S.edits);
    const mismoExtra = !ctx.extra || (top && ctx.extra.igual(top.extra, s.extra));
    if (top && mismosEdits && mismoExtra && top.clave === s.clave) return;
    s.edits = mismosEdits ? top.edits : (S.edits ? S.edits.slice() : null);   // brush edits shared while unchanged
    pila = pila.slice(0, pos + 1); pila.push(s);
    if (pila.length > LIMITE) pila.shift();
    pos = pila.length - 1;
  }
  function schedule() { if (restaurando || !S.img) return; clearTimeout(timer); timer = setTimeout(guardar, 350); }
  /* a fresh history (new picture) */
  function reset() { clearTimeout(timer); timer = 0; pila = []; pos = -1; guardar(); }

  function ir(delta) {
    if (timer) { clearTimeout(timer); guardar(); }
    const a = pos + delta;
    if (a < 0 || a >= pila.length) return;
    pos = a; const s = pila[pos];
    restaurando = true;
    try {
      settings.setMany(s.ajustes, false);
      const f = S.frame, mismoFrame = f && f.x === s.frame.x && f.y === s.frame.y && f.w === s.frame.w && f.h === s.frame.h;
      if (mismoFrame) {
        S.bgSeeds = s.bgSeeds.map(b => ({ ...b }));
        S.edits = s.edits ? new Uint8Array(s.edits) : new Uint8Array(S.w * S.h);
      } else image.restore(S.img, S.source, { frame: s.frame, markers: [], bgSeeds: s.bgSeeds, edits: s.edits });
      S.view = s.vista; S.selected = null; S.cropDraft = null; S.drag = null;
      if (ctx.extra) ctx.extra.poner(s.extra);
      ctx.rehacer();
    } finally { restaurando = false; }
  }

  function keyDown(e) {
    // already answered (another listener of the same page): one step per key press
    if (!(e.ctrlKey || e.metaKey) || e.defaultPrevented) return;
    const t = e.target;
    // text and number fields keep the browser's own undo for what is being typed
    if (t.closest && t.closest('input:not([type=checkbox]):not([type=range]):not([type=color]), select, textarea, dialog')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); ir(-1); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); ir(1); }
  }

  return { schedule, reset, keyDown, deshacer: () => ir(-1), rehacer: () => ir(1), restaurando: () => restaurando };
}
