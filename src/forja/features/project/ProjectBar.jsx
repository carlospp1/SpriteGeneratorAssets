/* The header's project bar: the design's name, its saved state, Guardar with its menu (browser, computer,
   save as new, open from the computer) and Nuevo. Also the keyboard shortcuts for saving. */
import { useEffect, useRef, useState } from 'react';
import { useValue } from '../../state/signal.js';
import { useDocumentEvent, useFilePicker } from '../../components/ui.jsx';
import { nav } from '../../app/nav.js';
import { project, designName, designStatus } from './project.js';

let openPicker = () => {};
/* opens the «Abrir desde el equipo» file picker (also used by the pixel editor's menu) */
export const openDesignFile = () => openPicker();

export function ProjectBar() {
  const name = useValue(designName), st = useValue(designStatus);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null), justFocused = useRef(false);
  const [fileInput, pick] = useFilePicker('.json,application/json', files => project.openFromComputer(files[0]));
  useEffect(() => { openPicker = pick; }, [pick]);
  useEffect(() => { if (menu) menuRef.current.querySelector('button').focus(); }, [menu]);
  const fromMenu = fn => () => { setMenu(false); fn(); };

  useDocumentEvent('pointerdown', e => { if (menu && !e.target.closest('.save-split')) setMenu(false); });
  /* Ctrl+S anywhere; Ctrl+Mayús+S, Ctrl+Alt+S and Ctrl+Alt+O outside the pixel editor (its menus have them) */
  useDocumentEvent('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || document.querySelector('dialog[open]')) return;
    const k = e.code === 'KeyS' ? 's' : e.code === 'KeyO' ? 'o' : '';
    if (k === 's' && !e.shiftKey && !e.altKey) { e.preventDefault(); project.save(false); return; }
    if (nav.is('edit')) return;
    if (k === 's' && e.shiftKey && !e.altKey) { e.preventDefault(); project.save(true); }
    else if (k === 's' && e.altKey && !e.shiftKey) { e.preventDefault(); project.saveToComputer(); }
    else if (k === 'o' && e.altKey && !e.shiftKey) { e.preventDefault(); pick(); }
  });

  const menuKeys = e => {
    const items = [...menuRef.current.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); setMenu(false); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  };

  return (
    <div className="project">
      {/* entering the name field (click or Tab) selects the whole name, ready to type over it; the mouseup of
          that same click would put the caret back, so it is ignored once */}
      <input id="projName" value={name} aria-label="Nombre del diseño" maxLength={160} autoComplete="off"
        data-tip="Nombre del diseño. Al subir una imagen se copia el nombre del archivo. Se usa al guardarlo en «Mis diseños» y como nombre de los PNG que descargues."
        onChange={e => project.rename(e.target.value)}
        onFocus={e => { e.target.select(); justFocused.current = true; }}
        onMouseUp={e => { if (justFocused.current) { e.preventDefault(); justFocused.current = false; } }}
        onBlur={() => { justFocused.current = false; }} />
      <span className={'proj-status' + (st.dirty ? ' dirty' : '')} role="status">{st.text}</span>
      <div className="save-split">
        <button type="button" className="primary" id="projSave" onClick={() => project.save(false)}
          data-tip="Guarda el diseño en este navegador, en «Mis diseños» (Ctrl+S): la imagen, todos los ajustes, las marcas y la edición de píxeles. La flecha de al lado tiene más opciones, como guardarlo en el equipo.">Guardar</button>
        <button type="button" className="primary save-more" aria-haspopup="menu" aria-expanded={menu} aria-label="Más formas de guardar"
          data-tip="Guardar en el equipo, guardar como nuevo o abrir un diseño desde el equipo." onClick={() => setMenu(!menu)}>▾</button>
        <div className="save-menu" role="menu" aria-label="Guardar" hidden={!menu} ref={menuRef} onKeyDown={menuKeys}>
          <button type="button" role="menuitem" onClick={fromMenu(() => project.save(false))}><span>Guardar en el navegador</span><kbd>Ctrl+S</kbd></button>
          <button type="button" role="menuitem" onClick={fromMenu(project.saveToComputer)}><span>Guardar en el equipo…</span><kbd>Ctrl+Alt+S</kbd></button>
          <button type="button" role="menuitem" onClick={fromMenu(() => project.save(true))}><span>Guardar como nuevo</span><kbd>Ctrl+Mayús+S</kbd></button>
          <div className="save-sep" role="separator" />
          <button type="button" role="menuitem" onClick={fromMenu(pick)}><span>Abrir desde el equipo…</span><kbd>Ctrl+Alt+O</kbd></button>
        </div>
        {fileInput}
      </div>
      <button type="button" onClick={project.newDesign} data-tip="Empieza un diseño vacío.">Nuevo</button>
    </div>
  );
}
