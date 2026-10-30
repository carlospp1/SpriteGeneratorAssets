/* The generator's state and its engines. S holds the picture and everything worked out from it (big typed
   arrays live here, outside React); signals tell the components what to render again. */
import { createImage } from '../../engine/image.js';
import { createBg } from '../../engine/background.js';
import { createClusters } from '../../engine/clusters.js';
import { createSprite } from '../../engine/sprite.js';
import { createSignal, createValue } from '../../state/signal.js';
import { createSourceView } from '../source/view.js';
import { refreshWindows } from '../../components/FloatingWindows.jsx';

export const S = {
  img: null,        // original decoded image
  source: null,     // original file, kept to save the design
  frame: null,      // region of the original being worked on: {x, y, w, h} in original px, k = scale, ww×wh = working size
  w: 0, h: 0,       // working image size
  rgba: null, lab: null,
  mask: null,       // 1 = character, 0 = background
  edits: null,      // manual brush edits per pixel: 0 none, 1 force keep, 2 force remove
  bgSeeds: [],      // points the user marked as background: {x, y, global}
  markers: [],      // sprite details: eye / dot / shine
  tool: 'eye', view: 'cut', drag: null, cropDraft: null,
  selected: null,   // mark being edited: {kind: 'mark' | 'seed', i}
  colorMap: {},     // palette changes made by hand: generated '#rrggbb' -> new '#rrggbb'
  lineColorMap: {}, // colour changes of the line art's lines (their own palette row): line '#rrggbb' -> new '#rrggbb' or 'transparent'
  lineEdits: null,  // line art retouched by hand on the sprite: {TW, TH, a}, per sprite pixel 0 as generated, 1 erased, 2 drawn
  retoques: [],     // touch-ups asked with a button, applied in order on top of the sprite (see retoques.js)
  matsMano: [],     // materials chosen by hand, in order: [{ centro: Lab, tonos }] (see materiales.js); empty = automatic
  matIdx: null, clusters: null, sprite: null
};

/* gen: lists, tools and buttons of the settings column; sprite: the sprite and its palette */
export const genSignal = createSignal();
export const spriteSignal = createSignal();
/* the message under the sprite */
export const genMsg = createValue('');
export const showMsg = t => genMsg.set(t || '');
/* automatic materials: «(3 detectados)» and the note when fewer materials than asked are used */
export const kInfo = createValue({ auto: '', used: '' });

/* the line art's lines, for the sprite (set by the line art page) */
let lineArtLines = () => null;
export const setLineArtSource = fn => { lineArtLines = fn; };

export const image = createImage(S);
export const bg = createBg(S);
export const clusters = createClusters(S);
export const sprite = createSprite(S, { bbox: bg.bbox, lineArtLines: () => lineArtLines() });
export const view = createSourceView({ S, onDraw: () => refreshWindows('original') });
