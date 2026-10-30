/* The current design: its name and saved state, saving / opening (browser, computer, the working session
   that survives reloading), the generator's settings as stored in a design, and the «Mis diseños» library. */
import { createSignal, createValue } from '../../state/signal.js';
import { settings, GEN_IDS, SCHEMA } from '../../state/settings.js';
import { loadImage } from '../../engine/image.js';
import { nav } from '../../app/nav.js';
import { store, designFile, readDesignFile, fileBase } from './db.js';
import { download } from '../../app/files.js';
import { S, image, view, genSignal, spriteSignal, showMsg, kInfo } from '../generator/state.js';
import { pipeline } from '../generator/pipeline.js';
import { spriteCanvas } from '../generator/output.js';
import { spriteLines } from '../generator/spriteLines.js';
import { history } from '../generator/history.js';
import { reference } from '../generator/reference.js';
import { refreshWindows } from '../../components/FloatingWindows.jsx';
import { editor } from '../editor/editor.js';
import { lineArt } from '../lineart/lineart.js';
import { notificar } from '../source/notificaciones.js';

/* ---------- generator settings as stored in a design ---------- */
/* every named field of the generator page, except the ones about how you work (ui) */
const DESIGN_IDS = GEN_IDS.filter(id => !SCHEMA[id].ui);
export function readGenSettings() {
  const o = settings.pick(DESIGN_IDS);
  for (const id of DESIGN_IDS) if (typeof o[id] === 'number') o[id] = String(o[id]);   // stored as the form had them
  o.__advanced = settings.advanced();   // which settings counted when this was made
  o.__v = 6;                            // v2: independent canvas height in basic mode; v3: automatic materials; v4: merge similar colours; v5: contrast lines; v6: dark coloured outlines
  return o;
}
/* fire = false: only the fields change (the caller recomputes) */
export function applyGenSettings(o, fire = false) {
  o = { ...o };
  // switch mode first, so values are not clamped to the basic ranges by mistake
  if ('__advanced' in o) settings.setAdvanced(!!o.__advanced, false);
  if (!o.__v && !o.__advanced && o.cw != null) o = { ...o, chh: o.cw };   // older basic designs had a square canvas
  if ((o.__v || 0) < 3 && !('kAuto' in o)) o = { ...o, kAuto: false };     // older designs: the number they had
  if ((o.__v || 0) < 4 && !('mergeDE' in o)) o = { ...o, mergeDE: 0 };     // older designs: no colour merging
  if ((o.__v || 0) < 5 && !('lineKeep' in o)) o = { ...o, lineKeep: false }; // older designs: lines as before
  if ('lineArtTint' in o && !('laColor' in o)) o = { ...o, laColor: o.lineArtTint ? 'inner' : 'line' };   // the old «inner lines in the zone colour» box
  const vals = {};
  for (const id of DESIGN_IDS) if (id in o) vals[id] = o[id];
  settings.setMany(vals, fire);
}
const DEFAULTS = Object.fromEntries(DESIGN_IDS.map(id => [id, SCHEMA[id].def]));   // "new design" keeps whatever mode the user is in

/* ---------- current design ---------- */
const P = { id: null, created: 0, dirty: false, quiet: 0 };
export const designName = createValue('Sin título');
export const designStatus = createValue({ text: '', dirty: false });
export const libSignal = createSignal();
export const libMsg = createValue('');
const currentName = () => designName.get().trim() || 'Sin título';
function status(text) { designStatus.set({ text: text || (P.dirty ? 'Sin guardar' : P.id ? 'Guardado' : ''), dirty: P.dirty }); }
function touch() { if (P.quiet) return; saveSession(); if (P.dirty) return; P.dirty = true; status(); }
function rename(name) { designName.set(name); touch(); }
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const hasContent = () => !!S.img || editor.has() || lineArt.has();

function thumbnail() {
  const src = editor.has() ? editor.canvas(1) : S.sprite ? spriteCanvas(1) : lineArt.canvas();
  if (!src) return null;
  // sprites are enlarged by whole steps without smoothing; big pictures (line art) are reduced smoothly
  const big = Math.max(src.width, src.height) > 160, s = big ? 160 / Math.max(src.width, src.height) : Math.max(1, Math.floor(160 / Math.max(src.width, src.height)));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(src.width * s)); c.height = Math.max(1, Math.round(src.height * s));
  const x = c.getContext('2d'); x.imageSmoothingEnabled = big; x.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
function genRecord() {
  const f = S.frame;
  return S.img ? {
    source: S.source, frame: { x: f.x, y: f.y, w: f.w, h: f.h },
    markers: S.markers.map(m => ({ ...m })), bgSeeds: S.bgSeeds.map(s => ({ ...s })),
    edits: S.edits ? S.edits.slice() : null, view: S.view, colorMap: { ...S.colorMap }, lineColorMap: { ...S.lineColorMap }, lineEdits: spriteLines.serialize(),
    retoques: (S.retoques || []).map(r => ({ ...r })), matsMano: (S.matsMano || []).map(t => ({ ...t }))
  } : null;
}
function buildRecord() {
  return {
    id: P.id, name: currentName(), created: P.created, updated: Date.now(),
    thumb: thumbnail(), settings: readGenSettings(), gen: genRecord(),
    editor: editor.serialize(), line: lineArt.serialize()
  };
}

async function save(asNew) {
  if (!hasContent()) { status('Nada que guardar todavía'); return false; }
  if (asNew || !P.id) {
    if (asNew && P.id) designName.set(currentName() + ' (copia)');
    P.id = newId(); P.created = Date.now();
  }
  try {
    await store.put(buildRecord());
    P.dirty = false; status('Guardado ✓'); setTimeout(() => status(), 2000); saveSession(true);
    if (nav.is('lib')) libSignal.bump();
    return true;
  } catch (e) {
    status('No se pudo guardar'); notificar('No se pudo guardar el diseño en este navegador: ' + (e && e.message || e));
    return false;
  }
}

/* back to a freshly opened page: no image anywhere (previews, floating windows, editor panels, reference) */
function resetAll() {
  image.clear(); applyGenSettings(DEFAULTS); S.retoques = []; S.matsMano = [];
  S.view = 'cut';
  view.draw(); genSignal.bump(); spriteSignal.bump();
  reference.clear();
  kInfo.set({ auto: '', used: '' });
  editor.clear(); lineArt.clear(); showMsg('');
  ['original', 'sprite', 'real', 'edview'].forEach(refreshWindows);
}
const confirmDiscard = () => !P.dirty || confirm('Hay cambios sin guardar en el diseño actual. ¿Continuar y descartarlos?');

function newDesign() {
  if (!confirmDiscard()) return;
  P.quiet++; resetAll(); P.quiet--;
  P.id = null; P.created = 0; P.dirty = false; designName.set('Sin título'); status();
  history.reset();
  saveSession(true);
  nav.go('gen');
}

/* where to show an opened design: the pixel editor, else the generator, else line art */
const pageOf = rec => rec.editor ? 'edit' : !rec.gen && rec.line ? 'line' : 'gen';

/* put a saved record (a design or the working session) on screen */
async function loadInto(rec) {
  P.quiet++;
  try {
    resetAll();
    applyGenSettings(rec.settings || {});
    if (rec.gen && rec.gen.source) {
      const img = await loadImage(rec.gen.source);
      image.restore(img, rec.gen.source, rec.gen);
      S.colorMap = { ...(rec.gen.colorMap || {}) }; S.lineColorMap = { ...(rec.gen.lineColorMap || {}) };
      S.retoques = (rec.gen.retoques || []).map(r => ({ ...r }));
      S.matsMano = (rec.gen.matsMano || []).map(t => ({ ...t }));
      spriteLines.retouchesReplaced();
      S.view = rec.gen.view || 'cut';
      genSignal.bump();
      pipeline.mask();
    }
    if (rec.editor) editor.load(rec.editor);
    if (rec.line) await lineArt.load(rec.line);
    lineArt.follow();   // a design without line art (or of another picture) takes the generator's
  } catch (e) {
    notificar('No se pudo abrir el diseño: ' + (e && e.message || e));
  } finally { P.quiet--; }
}
async function open(id) {
  if (P.id === id && !P.dirty) { nav.go('gen'); return; }
  if (!confirmDiscard()) return;
  const rec = await store.get(id); if (!rec) return;
  await loadInto(rec);
  P.id = rec.id; P.created = rec.created; P.dirty = false; designName.set(rec.name); status();
  history.reset();
  nav.go(pageOf(rec));
  saveSession(true);
}

/* ---------- working session: survives reloading the page ----------
   A copy of what is on screen (saved or not) is kept a moment after every change and restored on load. */
const SESSION = '__session';
let sessTimer = 0, sessReady = false;
function sessionRecord() {
  return {
    id: SESSION, session: true, updated: Date.now(),
    meta: { projId: P.id, created: P.created, dirty: P.dirty, name: currentName(), page: nav.current() },
    settings: readGenSettings(), gen: genRecord(),
    editor: editor.serialize(true), line: lineArt.serialize()
  };
}
function writeSession() { sessTimer = 0; return store.put(sessionRecord()).catch(() => { /* storage full or blocked: nothing to do */ }); }
/* now = save right away (page closing, design opened); otherwise shortly after the last change */
function saveSession(now) {
  if (!sessReady) return;
  clearTimeout(sessTimer);
  if (now) writeSession(); else sessTimer = setTimeout(writeSession, 700);
}
let restoreStarted = false;
async function restoreSession() {
  if (restoreStarted) return;   // once (React runs mount effects twice while developing)
  restoreStarted = true;
  let rec = null;
  try { rec = await store.get(SESSION); } catch { /* no storage */ }
  if (rec && (rec.gen || rec.editor || rec.line || (rec.meta && rec.meta.name !== 'Sin título'))) {
    await loadInto(rec);
    const m = rec.meta || {};
    P.id = m.projId || null; P.created = m.created || 0; P.dirty = !!m.dirty; designName.set(m.name || 'Sin título'); status();
    history.reset();
    nav.go(m.page || 'gen');
  }
  sessReady = true;
}
addEventListener('pagehide', () => { if (sessTimer) writeSession(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && sessTimer) writeSession(); });

/* ---------- the computer ---------- */
/* Guardar en el equipo: the current design (saved in the browser or not) as a .forja.json file.
   Where the browser allows it, a "save as" window lets you choose the folder and the name. */
async function saveToComputer() {
  if (!hasContent()) { status('Nada que guardar todavía'); return; }
  const name = fileBase(currentName()) + '.forja.json';
  let handle = null;
  if (window.showSaveFilePicker) {
    try { handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Diseño de Forja de sprites', accept: { 'application/json': ['.json'] } }] }); }
    catch (e) { if (e && e.name === 'AbortError') return; handle = null; }   // cancelled / not allowed here: plain download
  }
  const rec = buildRecord(); rec.id = rec.id || newId(); rec.created = rec.created || Date.now();
  const blob = await designFile(rec);
  if (handle) {
    try { const w = await handle.createWritable(); await w.write(blob); await w.close(); status('Guardado en el equipo ✓'); setTimeout(() => status(), 2500); return; }
    catch { /* fall back to a download */ }
  }
  download(blob, name, t => { status(t.startsWith('Guardado') ? 'Guardado en el equipo ✓' : t); setTimeout(() => status(), 2500); });
}
/* Abrir desde el equipo: a .forja.json becomes the current design (Guardar adds it to «Mis diseños») */
async function openFromComputer(file) {
  let rec;
  try { rec = await readDesignFile(file); } catch (e) { notificar(`No se pudo abrir «${file.name}»: ${e.message || e}`); return; }
  if (!confirmDiscard()) return;
  await loadInto(rec);
  P.id = null; P.created = rec.created || Date.now(); P.dirty = false; designName.set(rec.name || 'Sin título');
  status('Abierto desde el equipo'); setTimeout(() => status(), 3000);
  history.reset();
  nav.go(pageOf(rec));
  saveSession(true);
}

/* ---------- library («Mis diseños») ---------- */
const library = {
  /* the saved designs (not the working session); throws if the browser does not allow storage */
  list: async () => (await store.all()).filter(r => !r.session),
  isCurrent: id => id === P.id,
  async importFiles(files) {
    let ok = 0;
    for (const f of files) {
      try {
        const rec = await readDesignFile(f, 'una copia');
        rec.id = newId(); rec.updated = Date.now(); rec.created = rec.created || rec.updated;
        await store.put(rec); ok++;
      } catch (e) { notificar(`No se pudo importar «${f.name}»: ${e.message || e}`); }
    }
    if (ok) libMsg.set(ok === 1 ? 'Diseño importado.' : ok + ' diseños importados.');
    libSignal.bump();
  },
  async rename(r) {
    const n = prompt('Nuevo nombre del diseño', r.name); if (!n || !n.trim()) return;
    r.name = n.trim(); await store.put(r);
    if (r.id === P.id) designName.set(r.name);
    libSignal.bump();
  },
  async duplicate(r) { await store.put({ ...r, id: newId(), name: r.name + ' (copia)', created: Date.now(), updated: Date.now() }); libSignal.bump(); },
  async export(r) { download(await designFile(r), fileBase(r.name) + '.forja.json', t => libMsg.set(t)); },
  async remove(r) {
    if (!confirm(`¿Eliminar «${r.name}»? No se puede deshacer.`)) return;
    await store.del(r.id);
    if (r.id === P.id) { P.id = null; P.dirty = true; status(); }
    libSignal.bump();
  }
};

export const project = { touch, save, saveToComputer, openFromComputer, open, newDesign, rename, name: currentName, saveSession, restoreSession, library };
