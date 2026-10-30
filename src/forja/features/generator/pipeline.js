/* The generator's processing pipeline (mask -> clusters -> sprite -> output), what each setting has to
   recompute, uploading a picture and the actions of the size / canvas steps. */
import { settings, SCHEMA } from '../../state/settings.js';
import { loadImage } from '../../engine/image.js';
import { S, bg, clusters, sprite, view, image, genSignal, spriteSignal, showMsg, genMsg, kInfo } from './state.js';
import { readSettings, tooBig, ensureCanvas, fitSize, place, spriteW, spriteH } from './settings.js';
import { showSprite } from './output.js';
import { history } from './history.js';
import { project } from '../project/project.js';
import { lineArt } from '../lineart/lineart.js';
import { mascaraParaPagina } from '../source/iaFondo.js';
import { pageEnabled } from '../../app/env.js';
import { materialesIA } from './materialesIA.js';
import { hayContorno } from './retoques.js';
import { materialSel } from './materiales.js';

export const pipeline = {
  /* recompute background from scratch: the flood from the borders with the tolerance or, with «Quitar el fondo
     con IA», the AI's mask (worked out once per picture), with the zones and brush / AI-click retouches on top.
     Until the AI has finished there is no mask (and no sprite yet). */
  mask() {
    if (!S.rgba) return;
    const o = readSettings();
    if (o.remove && o.ai) {
      o.aiMask = mascaraParaPagina(S, () => { pipeline.mask(); showSprite(); });
      if (o.aiMask === null) { S.mask = null; S.sprite = null; view.draw(); showSprite(); return; }   // the AI is working
      if (o.aiMask === false) { o.remove = false; o.aiMask = null; }   // cancelled: the background stays
    }
    bg.compute(o);
    pipeline.maskEdited();
  },
  /* the mask changed: materials and size depend on it */
  maskEdited() {
    S.clusters = null;
    fitSize(true);
    view.draw();
    pipeline.sprite();
  },
  sprite(note) {
    if (!S.rgba || !S.mask) return;
    if (!bg.bbox()) { showMsg('No queda nada del personaje. Baja la tolerancia del fondo o quita puntos de fondo.'); return; }
    const grew = ensureCanvas(), o = readSettings(), big = tooBig(o);
    if (big) { showMsg(big); return; }
    if (!S.clusters) {
      // «Detectar materiales» with AI: until it answers, the count by colours; then the sprite is made again
      if (o.kAuto && !S.matsMano.length) o.kIA = materialesIA(S, o.kSens, () => { if (settings.get('kAuto')) { S.clusters = null; pipeline.sprite(); } });
      clusters.build(o);
    }
    showMsg([typeof note === 'string' && note, grew && `El lienzo se ha ampliado a ${o.CW}×${o.CH} px para que quepa el sprite.`].filter(Boolean).join(' '));
    showDetected();
    S.sprite = sprite.generate(o);
    if (S.sprite && S.sprite.note) showMsg([genMsg.get(), S.sprite.note].filter(Boolean).join(' '));
    showSprite();
    project.touch();
    history.schedule();
  }
};

/* automatic materials: show the detected count in the slider (without counting as a manual change) */
function showDetected() {
  const auto = !!settings.get('kAuto'), det = S.clusters && S.clusters.detected;
  const used = S.clusters && S.clusters.K, asked = S.clusters && S.clusters.requested;
  const fewer = used && asked && used < asked ? `, ${used} distinto${used === 1 ? '' : 's'}` : '';
  if (S.clusters?.mano) {   // chosen by hand: «Materiales» and the detection are not used
    kInfo.set({ auto: '', used: `Has elegido los materiales a mano (${S.clusters.K}): «Materiales» y la detección no se usan hasta que pulses «Volver a automáticos».` });
    return;
  }
  kInfo.set({
    auto: auto && det ? `(${det} ${S.clusters.porIA ? 'según la IA' : 'por colores'}${fewer})` : '',
    used: !auto && used && asked && used < asked ? `Se usan ${used} materiales: los colores no dan para ${asked} distintos (ajusta «Fusionar colores parecidos» si quieres más).` : ''
  });
  if (auto && det) settings.set('k', det, false);
}

/* ---------- what each setting recomputes: the background mask, the materials, or only the sprite ---------- */
const MASK = ['bgRemove', 'bgAI', 'tol', 'bgDrift', 'bgFrame', 'bgIsland', 'alphaMin', 'bgGlobalTol'];
const CLUSTERS = ['lineKeep', 'lineContrast', 'k', 's', 'lk', 'lWeight', 'shadeSat', 'outDark', 'outSat', 'outMaxL', 'outBlack', 'kIter', 'seed', 'kAuto', 'kSens', 'mergeDE'];
const SPRITE = ['laFuente', 'ln', 'cl', 'colOut', 'outline', 'cellCov', 'lnStrong', 'spurs', 'speck', 'eyeK', 'eyeRare',
  'shineColor', 'dotAuto', 'dotColor', 'useLineArt', 'laAmount', 'laThin', 'laEdge', 'laPerfect', 'laGaps', 'laSmooth', 'laMinPiece'];
const PLACE = ['cw', 'chh', 'fy', 'fx', 'flipH'];   // canvas and position only re-place the sprite, no need to rebuild it
const LIVE = new Set(['range', 'number']);   // sliders and number fields wait a moment (they change many times)
const placed = () => { ensureCanvas(); showSprite(); if (S.sprite) { project.touch(); history.schedule(); } };
const timers = {};
const later = (key, ms, fn) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); };
const live = ids => ids.some(id => LIVE.has(SCHEMA[id] && SCHEMA[id].type));
settings.listen(ids => {
  // «Contornos de color» encendido: quita el retoque de contorno (se pisan, el borde lo pinta uno solo)
  if (ids.includes('colOut') && settings.get('colOut') && hayContorno()) {
    S.retoques = S.retoques.filter(r => r.tipo !== 'contorno');
    spriteSignal.bump();
  }
  // several settings at once (a reset) or the advanced mode switched: recompute everything once
  if (ids.length !== 1) { if (!ids.length || ids.some(id => !id.startsWith('la-') && !id.startsWith('sep-') && !id.startsWith('an-'))) { pipeline.mask(); showSprite(); } return; }
  const has = list => ids.some(id => list.includes(id));
  if (has(MASK)) later('mask', live(ids) ? 200 : 0, pipeline.mask);
  else if (has(CLUSTERS)) later('clusters', live(ids) ? 150 : 0, () => { S.clusters = null; pipeline.sprite(); });
  else if (has(SPRITE)) later('sprite', live(ids) ? 150 : 0, () => pipeline.sprite());
  if (has(PLACE)) later('place', live(ids) ? 150 : 0, placed);
  if (ids.includes('lock')) { fitSize(true); pipeline.sprite(); }
  if (ids.includes('zoom')) showSprite();
  if (ids.includes('kAuto')) showDetected();
});

/* canvas or position fields left: grow the canvas if needed and place the sprite */
export function placeCommitted() { if (ensureCanvas()) pipeline.sprite(); else placed(); }

/* sprite size: with the proportion lock the other field is recalculated; say so instead of changing it silently.
   Returns the recalculated field (to flash it) or null. */
export function sizeChanged(fromH) {
  const changed = fitSize(fromH);
  if (!S.rgba) ensureCanvas();
  let note = '';
  if (changed) note = `${changed === 'tw' ? 'Ancho' : 'Alto'} recalculado a ${settings.get(changed)} px para mantener la proporción del personaje. Desactiva «Mantener proporción» para elegir ancho y alto por separado.`;
  pipeline.sprite(note);
  if (!S.rgba && note) showMsg(note);
  return changed;
}

/* Ajustar al sprite: canvas = sprite + margin (half on each side), sprite centred */
export function fitCanvas() {
  const m = Math.max(0, Math.round(settings.num('fitMargin', 0))), TW = spriteW(), TH = spriteH(), a = Math.floor(m / 2);
  settings.setMany({ fitMargin: m, cw: TW + m, chh: TH + m, fx: 0, fy: TH + a }, false);
  placed();
  showMsg(`Lienzo ajustado al sprite: ${TW + m}×${TH + m} px${m ? ` (${a} px de margen arriba y a la izquierda, ${m - a} abajo y a la derecha)` : ''}.`);
}
/* alignment buttons */
export function align(where) {
  const o = readSettings(), cx = Math.floor((o.CW - o.TW) / 2);
  const [id, v] = { left: ['fx', -cx], hcenter: ['fx', 0], right: ['fx', o.CW - o.TW - cx],
    top: ['fy', o.TH], vcenter: ['fy', o.TH + Math.floor((o.CH - o.TH) / 2)], bottom: ['fy', o.CH] }[where];
  settings.set(id, v, false); placed();
}
/* drag the sprite in the preview, or the arrow keys on it */
export function moveSprite(fx, fy) {
  settings.setMany({ fx: Math.round(fx), fy: Math.round(fy) }, false);
  ensureCanvas(); showSprite();
}
export const spritePlace = () => { const o = readSettings(); return S.sprite ? place({ ...o, TW: S.sprite.TW, TH: S.sprite.TH }) : null; };
export function newSeed() { settings.set('seed', Math.floor(Math.random() * 100000), false); S.clusters = null; pipeline.sprite(); }

/* ---------- upload ---------- */
export async function loadFile(file) {
  let img;
  try { img = await loadImage(file); }
  catch { showMsg('No se pudo leer ese archivo. Prueba con un PNG o JPG.'); return; }
  image.start(img, file);
  S.retoques = [];   // a new picture: no touch-ups
  S.matsMano = [];   // nor materials chosen by hand
  materialSel.set(null);
  settings.set('lock', true, false);   // and «Mantener proporción» on (a reference may have switched it off)
  const base = (file.name || '').replace(/\.[^.]+$/, '').trim();
  if (base) project.rename(base);
  genSignal.bump();
  if (pageEnabled('line')) lineArt.fromGenerator();
  pipeline.mask();
  history.reset();
}
/* replacing a picture with work on it (marks, background points, brush, crop) asks first */
export function confirmReplace() {
  const work = S.img && (S.markers.length || S.bgSeeds.length || (S.edits && S.edits.some(v => v)) || !image.isFull());
  return !work || confirm('¿Usar la imagen pegada en lugar de la actual? Se quitan las marcas, puntos de fondo, pinceles y el recorte de la imagen actual.');
}
