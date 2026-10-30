/* The pixel editor page, laid out like Photoshop: menu bar · options bar (full width) · tools | canvas |
   panels. It renders the children of #page-edit (a CSS grid, see editor.css), so it returns a fragment.
   The document, tools and actions live outside React (engine/editor, store.js); this is their face. */
import { useEffect, useRef } from 'react';
import { useSignal, useValue } from '../../state/signal.js';
import { useDocumentEvent, useFilePicker, imageIn } from '../../components/ui.jsx';
import { OpenWindowButton } from '../../components/FloatingWindows.jsx';
import { D } from '../../engine/editor/doc.js';
import { nav } from '../../app/nav.js';
import { view } from './view.js';
import * as U from './store.js';
import { onKeyDown, onKeyUp, onBlur } from './commands.js';
import { MenuBar } from './MenuBar.jsx';
import { OptionsBar } from './OptionsBar.jsx';
import { ToolBar } from './ToolBar.jsx';
import { SidePanels } from './Panels.jsx';
import { EditorDialogs } from './Dialogs.jsx';
import './editor.js';   // registers the floating window and the «page shown» hook

function Stage() {
  useSignal(U.sig.struct);
  const stage = useRef(null), canvas = useRef(null);
  useEffect(() => {
    const detach = view.attach(stage.current, canvas.current);
    if (nav.is('edit')) U.shown();
    return detach;
  }, []);
  const hasFile = e => [...e.dataTransfer.items].some(i => i.kind === 'file');
  return (
    <div className="ed-stage" id="edStage" ref={stage}
      onDragOver={e => { if (hasFile(e)) { e.preventDefault(); stage.current.classList.add('drop'); } }}
      onDragLeave={() => stage.current.classList.remove('drop')}
      onDrop={e => { stage.current.classList.remove('drop'); const f = imageIn(e.dataTransfer); if (f) { e.preventDefault(); U.addImageLayer(f, U.baseName(f)); } }}>
      <canvas id="edCanvas" tabIndex={0} aria-label="Lienzo del editor" ref={canvas} />
      <div className="ed-empty" id="edEmpty" hidden={D.has()}>
        <p>Todavía no hay nada que editar.</p>
        <div className="pair">
          <button type="button" className="primary" id="edFromGen" onClick={() => U.importFromGenerator()}>Traer el sprite del generador</button>
          <button type="button" id="edNewBlank" onClick={U.openNew}>Nuevo documento…</button>
        </div>
        <p className="hint">También puedes arrastrar una imagen aquí o pegarla con Ctrl+V.</p>
      </div>
    </div>
  );
}

function StatusBar() {
  useSignal(U.sig.struct);
  const st = useValue(U.statusVal), msg = useValue(U.msgVal), zoom = useValue(U.zoomVal);
  return (
    <div className="ed-status">
      <span id="edPos">{st ? st[0] : '–'}</span><span id="edColorAt">{st ? st[1] : ''}</span>
      <span id="edDocSize">{D.has() ? `${D.w} × ${D.h} px · ${D.layers.length} ${D.layers.length === 1 ? 'capa' : 'capas'}` : ''}</span>
      <span className="ed-msg" id="edMsg" role="status">{msg}</span>
      <span className="ed-keys" title="Espacio + arrastrar: mover la vista · Rueda del ratón: zoom · Alt + clic: cuentagotas · Ayuda > Atajos de teclado: todos los atajos">Espacio: mover · Rueda: zoom · Alt+clic: color</span>
      <OpenWindowButton type="edview" tip="Abre otra vista del dibujo en una ventana flotante con su propio zoom, que se actualiza mientras dibujas (Ventana > Nueva ventana).">⧉ Nueva ventana</OpenWindowButton>
      <div className="ed-zoom">
        <button type="button" id="edZoomOut" aria-label="Reducir" data-tip="Reducir (Ctrl + −). También con la rueda del ratón." onClick={() => view.zoomStep(-1)}>−</button>
        <span id="edZoomVal">{zoom * 100}%</span>
        <button type="button" id="edZoomIn" aria-label="Aumentar" data-tip="Aumentar (Ctrl + +). También con la rueda del ratón." onClick={() => view.zoomStep(1)}>+</button>
        <button type="button" id="edFit" data-tip="Encajar en pantalla (Ctrl+0)." onClick={() => view.fit()}>Ajustar</button>
      </div>
    </div>
  );
}

export function EditorPage() {
  const noPanels = useValue(U.panelsHidden);
  // Tab (Vista > Ocultar paneles): the grid of #page-edit loses its panels column
  useEffect(() => {
    const page = document.getElementById('page-edit'); if (page) page.classList.toggle('no-panels', noPanels);
  }, [noPanels]);
  useDocumentEvent('keydown', onKeyDown);
  useDocumentEvent('keyup', onKeyUp);
  useEffect(() => { addEventListener('blur', onBlur); return () => removeEventListener('blur', onBlur); }, []);
  // images pasted from the system become a layer (or the document)
  useDocumentEvent('paste', e => {
    if (!nav.is('edit')) return;
    const t = e.target; if (t.closest && t.closest('input, textarea, [contenteditable]')) return;
    const f = imageIn(e.clipboardData);
    if (f) { e.preventDefault(); U.addImageLayer(f); }
  });
  // Archivo > Abrir imagen como capa
  const [fileInput, pick] = useFilePicker('image/*', files => U.addImageLayer(files[0], U.baseName(files[0])));
  useEffect(() => { U.hooks.pickImage = pick; }, [pick]);
  return (
    <>
      <MenuBar />
      <OptionsBar />
      <ToolBar />
      <div className="ed-center">
        <Stage />
        <StatusBar />
      </div>
      <SidePanels />
      {fileInput}
      <EditorDialogs />
    </>
  );
}

export default EditorPage;
