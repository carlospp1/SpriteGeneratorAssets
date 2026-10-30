/* The settings of the generator and the line art (every slider, box and field of their forms), in one store.
   Fields only show and change these values; the pipelines subscribe and recompute what each setting affects.
   Advanced mode: while off, sliders use their basic range (schema.basic) and advanced-only settings count
   with their default (see the generator's readSettings). */
import { useSyncExternalStore } from 'react';
import { GEN, LINE, SEP, AN } from './schema.js';
import { prefs } from './signal.js';

export const SCHEMA = { ...GEN, ...LINE, ...SEP, ...AN };
export const GEN_IDS = Object.keys(GEN);
export const LINE_IDS = Object.keys(LINE);
export const SEP_IDS = Object.keys(SEP);
export const AN_IDS = Object.keys(AN);

const ui = prefs('forja.ui', { adv: false, acc: {} });
const values = {};
for (const [id, s] of Object.entries(SCHEMA)) values[id] = s.def;
let advanced = !!ui.data.adv, version = 0, focused = null;
const subs = new Set(), listeners = new Set();
let snapshot = { values: { ...values }, advanced, version };

function emit(ids, fire) {
  version++;
  snapshot = { values: { ...values }, advanced, version };
  subs.forEach(f => f());
  if (fire) listeners.forEach(f => f(ids));
}

/* ---------- limits ---------- */
const inf = (v, d) => v === 'inf' ? d : v;
const decimals = s => ((s.step != null && s.step !== 'any' ? String(s.step) : '1').split('.')[1] || '').length;
/* the range typing can reach: the basic range while advanced options are off, else the hard limits */
function hardRange(id) {
  const s = SCHEMA[id];
  if (!advanced && s.basic) return [s.basic[0] ?? -Infinity, s.basic[1] ?? Infinity];
  const lo = s.hardMin != null ? inf(s.hardMin, -Infinity) : s.min ?? -Infinity;
  const hi = s.hardMax != null ? inf(s.hardMax, Infinity) : s.max ?? Infinity;
  return [lo, hi];
}
/* the slider's own range: its usual range (or the basic one), stretched to show values beyond it */
function sliderRange(id, v) {
  const s = SCHEMA[id], [lo, hi] = hardRange(id);
  let min = s.min ?? 0, max = s.max ?? 100;
  if (!advanced && s.basic) { if (s.basic[0] != null) min = s.basic[0]; if (s.basic[1] != null) max = s.basic[1]; }
  const n = +v;
  if (Number.isFinite(n)) { min = Math.max(lo, Math.min(min, n)); max = Math.min(hi, Math.max(max, n)); }
  return [min, max];
}
/* a number value put inside the limits that apply now (and rounded to the slider's step) */
function clampNum(id, v) {
  const n = +v; if (!Number.isFinite(n)) return null;
  const [lo, hi] = hardRange(id);
  return +Math.min(hi, Math.max(lo, n)).toFixed(decimals(SCHEMA[id]));
}

/* ---------- values ---------- */
const sameVal = (a, b) => a === b || (typeof a !== 'boolean' && typeof b !== 'boolean' && a !== '' && b !== '' && Number.isFinite(+a) && +a === +b);
function isDefault(id) { const s = SCHEMA[id]; return s.type === 'color' ? String(values[id]).toLowerCase() === String(s.def).toLowerCase() : sameVal(values[id], s.def); }

export const settings = {
  get: id => values[id],
  /* numeric value (number fields may hold what is being typed) */
  num(id, d = 0) { const v = parseFloat(values[id]); return Number.isFinite(v) ? v : d; },
  def: id => SCHEMA[id].def,
  isDefault,
  /* set one value. fire = false only updates the fields (no recomputing): values set from code that the
     pipeline already takes into account. Sliders are kept inside their limits. */
  set(id, v, fire = true) {
    if (!(id in SCHEMA)) return false;
    if (SCHEMA[id].type === 'range') { v = clampNum(id, v); if (v == null) return false; }
    if (values[id] === v) return false;
    values[id] = v; emit([id], fire);
    return true;
  },
  /* several at once (opening a design, undo): one notification */
  setMany(obj, fire = true) {
    const ids = [];
    for (const [id, v0] of Object.entries(obj)) {
      if (!(id in SCHEMA)) continue;
      let v = v0;
      if (SCHEMA[id].type === 'check') v = !!v;
      else if (SCHEMA[id].type === 'range') { const n = +v; if (!Number.isFinite(n)) continue; v = n; }   // may lie beyond the slider's usual range
      if (values[id] !== v) { values[id] = v; ids.push(id); }
    }
    if (ids.length) emit(ids, fire);
    return ids.length;
  },
  /* back to the defaults; returns how many changed */
  reset(ids) {
    const changed = ids.filter(id => !isDefault(id));
    for (const id of changed) values[id] = SCHEMA[id].def;
    if (changed.length) emit(changed, true);
    return changed.length;
  },
  /* the values of a list of ids (to save them) */
  pick(ids) { const o = {}; for (const id of ids) o[id] = values[id]; return o; },
  hardRange, sliderRange, clampNum,
  /* the field being typed in: values set from code leave it alone */
  setFocused(id) { focused = id; },
  isFocused: id => focused === id,
  advanced: () => advanced,
  setAdvanced(on, fire = true) {
    on = !!on; if (on === advanced) return;
    advanced = on; ui.data.adv = on; ui.save();
    emit([], fire);
  },
  /* fn(ids) after values change by the user (not for fire = false) */
  listen(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  snapshot: () => snapshot,
  /* remembered open / closed steps (accordions) */
  accOpen: (key, d = true) => key in ui.data.acc ? !!ui.data.acc[key] : d,
  setAccOpen(key, open) { ui.data.acc[key] = open; ui.save(); }
};

export function useSettings() { return useSyncExternalStore(settings.subscribe, settings.snapshot); }
export function useSetting(id) {
  const snap = useSettings();
  return [snap.values[id], v => settings.set(id, v)];
}
export const useAdvanced = () => useSettings().advanced;
