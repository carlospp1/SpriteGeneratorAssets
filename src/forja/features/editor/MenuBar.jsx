/* The editor's menu bar (Archivo, Edición, Imagen…): opens on click, moves to the next menu on hover
   while one is open, arrow keys move around, Esc closes. Items are built from the commands each time a
   menu opens, so labels (Deshacer …), checks and disabled states are current. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDocumentEvent } from '../../components/ui.jsx';
import { MENUS, C, run, nice, labelOf, isEnabled } from './commands.js';
import { menuOpen } from './store.js';

export function MenuBar() {
  const [openIdx, setOpenIdx] = useState(-1);
  const openedAt = useRef(0), focusFirst = useRef(false), bar = useRef(null), btns = useRef([]), menus = useRef([]);
  useEffect(() => { menuOpen.set(openIdx >= 0); }, [openIdx]);
  useEffect(() => () => menuOpen.set(false), []);

  const openMenu = (i, focus) => {
    if (openIdx !== i) openedAt.current = Date.now();
    focusFirst.current = focus; setOpenIdx(i);
  };
  const closeMenus = silent => {
    if (!silent && openIdx >= 0 && bar.current.contains(document.activeElement)) btns.current[openIdx].focus();
    setOpenIdx(-1);
  };
  // keep the open menu inside the window and focus its first item when opened from the keyboard
  useLayoutEffect(() => {
    const m = menus.current[openIdx]; if (!m) return;
    m.style.left = '';
    const r = m.getBoundingClientRect(); if (r.right > innerWidth - 4) m.style.left = (innerWidth - 4 - r.right) + 'px';
    if (focusFirst.current) { focusFirst.current = false; const f = m.querySelector('.ed-menu-item:not(:disabled)'); if (f) f.focus(); }
  }, [openIdx]);
  useDocumentEvent('pointerdown', e => { if (openIdx >= 0 && !bar.current.contains(e.target)) closeMenus(true); });

  const barKeys = e => {
    if (openIdx < 0) return;
    const items = [...menus.current[openIdx].querySelectorAll('.ed-menu-item:not(:disabled)')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = items.length; if (n) items[(i + (e.key === 'ArrowDown' ? 1 : n - 1) + (i < 0 && e.key === 'ArrowUp' ? 1 : 0)) % n].focus(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); openMenu((openIdx + (e.key === 'ArrowRight' ? 1 : MENUS.length - 1)) % MENUS.length, true); }
    else if (e.key === 'Tab') closeMenus(true);
  };

  return (
    <div className="ed-menubar" id="edMenubar" role="menubar" aria-label="Menú del editor" ref={bar} onKeyDown={barKeys}>
      {MENUS.map(([name, items], i) => (
        <div className="ed-menu-wrap" key={name}>
          <button type="button" className={'ed-menu-btn' + (openIdx === i ? ' open' : '')} role="menuitem" aria-haspopup="menu" aria-expanded={openIdx === i}
            ref={el => { btns.current[i] = el; }}
            // a click on the open menu's title closes it, unless it was opened a moment ago by moving onto it
            onClick={() => (openIdx === i && Date.now() - openedAt.current > 400 ? closeMenus() : openMenu(i, false))}
            onPointerEnter={() => { if (openIdx >= 0 && openIdx !== i) openMenu(i, false); }}
            onKeyDown={e => {
              if (openIdx >= 0) return;
              if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(i, true); }
              else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); btns.current[(i + (e.key === 'ArrowRight' ? 1 : MENUS.length - 1)) % MENUS.length].focus(); }
            }}>{name}</button>
          <div className="ed-menu" role="menu" aria-label={name} hidden={openIdx !== i} ref={el => { menus.current[i] = el; }}>
            {openIdx === i && items.map((id, k) => {
              if (id === '-') return <div key={k} className="ed-menu-sep" role="separator" />;
              if (id[0] === '#') return <div key={k} className="ed-menu-head" role="presentation">{id.slice(1)}</div>;
              const c = C[id], checked = c.checked ? !!c.checked() : null;
              return (
                <button key={id} type="button" className="ed-menu-item" role={c.checked ? 'menuitemcheckbox' : 'menuitem'}
                  aria-checked={c.checked ? checked : undefined} disabled={!isEnabled(c)}
                  onClick={() => { closeMenus(); run(id); }}>
                  <span className="chk" aria-hidden="true">{checked ? '✓' : ''}</span>
                  <span className="lbl">{labelOf(c).trim()}</span>
                  <kbd>{c.keys[0] ? nice(c.keys[0]) : ''}</kbd>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
