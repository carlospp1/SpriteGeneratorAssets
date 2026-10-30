/* The pixel editor's shared namespace (the old Forge.ed): doc (D), ops (O), tools, tool state and options.
   The engine never touches the DOM: the viewport (E.view) and the UI hooks (E.ui) are set by
   src/features/editor; until then they are harmless no-ops, so the document works without a page. */
const noop = () => {};
export const E = {
  onChange: null,
  emit() { if (E.onChange) E.onChange(); },
  replacePreview: null,
  view: {
    invalidate: noop, schedule: noop, fit: noop, setZoom: noop, zoomStep: noop, setSpace: noop, setTool: noop,
    centerOn: noop, visibleRect: () => ({ x: 0, y: 0, w: 0, h: 0 }), viewCenter: () => [0, 0],
    lastComposite: () => null, compositeCanvas: () => null, state: { zoom: 8, ox: 0, oy: 0 }, resize: noop
  },
  ui: { colorsChanged: noop, contentChanged: noop, status: noop, zoomChanged: noop, drawNav: noop }
};
