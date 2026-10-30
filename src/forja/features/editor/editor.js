/* The pixel editor's public API, used by the project (save / open / session), the generator and the
   design library. It works without the editor page mounted (session restore, thumbnails) and with the
   page disabled in .env. */
import { D } from '../../engine/editor/doc.js';
import { view } from './view.js';
import { importFromGenerator, shown, canvasAt, loadDoc, clearDoc } from './store.js';
import { registerWindowType } from '../../components/FloatingWindows.jsx';
import { nav } from '../../app/nav.js';

registerWindowType('edview', {
  title: 'Vista del dibujo', page: 'edit', zoom: 'fit', size: [420, 420],
  src: () => (D.has() ? view.compositeCanvas() : null),
  empty: 'Todavía no hay nada en el editor.'
});
nav.onShown(page => { if (page === 'edit') shown(); });

export const editor = {
  has: () => D.has(),
  /* ask: confirm before touching an existing document */
  importFromGenerator,
  /* the page has just been shown: size the view (and fit a freshly loaded document) */
  shown,
  /* peek: read without touching the document (an autosave must not drop a selection being moved) */
  serialize: peek => D.serialize(peek),
  load: data => loadDoc(data),
  clear: () => clearDoc(),
  /* every visible layer flattened, scaled without smoothing; null when there is no document */
  canvas: (scale = 1) => (D.has() ? canvasAt(scale) : null)
};
