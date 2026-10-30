/* Undo / redo for the generator (Ctrl+Z, Ctrl+Y / Ctrl+Mayús+Z): every settled change of the design —
   marks, background points, brush strokes, crop, settings, sprite position, palette changes — becomes
   a step. Snapshots are taken a moment after things settle, so a drag or a slider move is one step. */
import { createValue } from '../../state/signal.js';
import { S, image, genSignal } from './state.js';
import { pipeline } from './pipeline.js';
import { spriteLines } from './spriteLines.js';
import { project, readGenSettings, applyGenSettings } from '../project/project.js';

const LIMIT = 100;
let stack = [], pos = -1, timer = 0, restoring = false;
/* { canUndo, canRedo } for the buttons */
export const historyState = createValue({ canUndo: false, canRedo: false });

const sameArr = (a, b) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
function snapshot() {
  if (!S.img || !S.frame) return null;
  const settings = readGenSettings(); delete settings.zoom;   // the preview zoom is not part of the design
  const f = S.frame;
  return {
    settings, frame: { x: f.x, y: f.y, w: f.w, h: f.h }, view: S.view,
    markers: S.markers.map(m => ({ ...m })), bgSeeds: S.bgSeeds.map(s => ({ ...s })), colorMap: { ...S.colorMap }, lineColorMap: { ...S.lineColorMap },
    retoques: (S.retoques || []).map(r => ({ ...r })), matsMano: (S.matsMano || []).map(t => ({ ...t })),
    lineEdits: S.lineEdits && { TW: S.lineEdits.TW, TH: S.lineEdits.TH }
  };
}
const keyOf = s => JSON.stringify([s.settings, s.frame, s.view, s.markers, s.bgSeeds, s.colorMap, s.lineColorMap, s.lineEdits, s.retoques, s.matsMano]);

function commit() {
  timer = 0;
  if (restoring) return;
  if (S.drag) { schedule(); return; }          // still dragging: wait for the end
  const s = snapshot(); if (!s) return;
  s.key = keyOf(s);
  const top = stack[pos], editsSame = top && sameArr(top.edits, S.edits);
  const la = S.lineEdits && S.lineEdits.a, laSame = top && sameArr(top.lineA, la);
  if (top && editsSame && laSame && top.key === s.key) return;
  s.edits = editsSame ? top.edits : (S.edits ? S.edits.slice() : null);   // brush edits are shared while unchanged
  s.lineA = laSame ? top.lineA : la ? la.slice() : null;                    // same for the line art retouches
  stack = stack.slice(0, pos + 1); stack.push(s);
  if (stack.length > LIMIT) stack.shift();
  pos = stack.length - 1; ui();
}
function schedule() { if (restoring || !S.img) return; clearTimeout(timer); timer = setTimeout(commit, 350); }
/* start a fresh history (new image, design opened, new design) */
function reset() { clearTimeout(timer); timer = 0; stack = []; pos = -1; commit(); ui(); }

/* delta -1 = undo, +1 = redo. A change still waiting to become a step is saved first, and only then is
   the target computed (otherwise Ctrl+Z right after a change would jump back two steps). */
function go(delta) {
  if (timer) { clearTimeout(timer); commit(); }
  const to = pos + delta;
  if (to < 0 || to >= stack.length) return;
  pos = to; const s = stack[pos];
  restoring = true;
  try {
    applyGenSettings(s.settings);
    const f = S.frame, sameFrame = f && f.x === s.frame.x && f.y === s.frame.y && f.w === s.frame.w && f.h === s.frame.h;
    if (sameFrame) {
      S.markers = s.markers.map(m => ({ ...m })); S.bgSeeds = s.bgSeeds.map(b => ({ ...b }));
      S.edits = s.edits ? new Uint8Array(s.edits) : new Uint8Array(S.w * S.h);
      S.selected = null; S.cropDraft = null;
    } else image.restore(S.img, S.source, s);
    if (s.view) S.view = s.view;
    S.colorMap = { ...s.colorMap }; S.lineColorMap = { ...(s.lineColorMap || {}) };
    S.retoques = (s.retoques || []).map(r => ({ ...r }));
    S.matsMano = (s.matsMano || []).map(t => ({ ...t }));
    S.clusters = null;
    S.lineEdits = s.lineA ? { ...s.lineEdits, a: s.lineA.slice() } : null;
    spriteLines.retouchesReplaced();
    genSignal.bump();
    pipeline.mask();
  } finally { restoring = false; }
  project.touch(); ui();
}
const ui = () => historyState.set({ canUndo: pos > 0, canRedo: pos < stack.length - 1 });

/* Ctrl+Z / Ctrl+Y / Ctrl+Mayús+Z (the generator page calls it while it is shown) */
function keyDown(e) {
  if (!(e.ctrlKey || e.metaKey)) return;
  const t = e.target;
  // text and number fields keep the browser's own undo for what is being typed
  if (t.closest && t.closest('input:not([type=checkbox]):not([type=range]):not([type=color]), select, textarea, dialog')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); go(-1); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); go(1); }
}

export const history = { schedule, reset, undo: () => go(-1), redo: () => go(1), keyDown };
