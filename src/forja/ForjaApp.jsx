/* Forja de sprites inside the unified app: header (title, section tabs, project bar), the pages, and what floats
   over them (tooltips, floating windows, the palette merge window). Disabled sections (.env) have no tab and are
   never shown. Line art lives as a tab of the Forja (same picture, same designs, same session), not as a
   top-level tool in the app menu. */
import { useEffect } from 'react';
import './styles/styles.css';
import './styles/editor.css';
import { setForjaActiva } from './app/activa.js';
import { PAGES } from './app/env.js';
import { nav, usePage } from './app/nav.js';
import { useAdvanced } from './state/settings.js';
import { TooltipLayer } from './components/Tooltip.jsx';
import { MergePopover } from './components/PaletteMerge.jsx';
import { FloatingWindows } from './components/FloatingWindows.jsx';
import { ProjectBar } from './features/project/ProjectBar.jsx';
import { project } from './features/project/project.js';
import { GeneratorPage } from './features/generator/GeneratorPage.jsx';
import { LineArtPage } from './features/lineart/LineArtPage.jsx';
import { EditorPage } from './features/editor/EditorPage.jsx';
import { LibraryPage } from './features/library/LibraryPage.jsx';

/* each section of the app's menu: its title and its tabs (the first one is where it opens) */
export const SECCIONES = {
  forja: { titulo: 'Forja de sprites', tabs: [['gen', 'Generador'], ['line', 'Line art'], ['edit', 'Editor de píxeles'], ['lib', 'Mis diseños']] }
};
/* the section a Forja page belongs to («Mis diseños» stays in the current one) */
export const seccionDe = page => (page === 'lib' ? null : 'forja');

/* activa: Forja is on screen (it stays mounted while hidden so nothing is lost); seccion: 'forja' | 'lineart';
   onSeccion(s): a design or the session opened a page of the other section (e.g. a line art design) */
export default function ForjaApp({ activa = true, seccion = 'forja', onSeccion }) {
  const page = usePage(), adv = useAdvanced();
  useEffect(() => { setForjaActiva(activa); }, [activa]);
  // the working session comes back after reloading the page
  useEffect(() => { nav.go(nav.current()); project.restoreSession(); }, []);
  // a page of the other section opened by itself (a design, the session): the app's menu follows it
  useEffect(() => nav.onShown(p => { const s = seccionDe(p); if (activa && s && s !== seccion && onSeccion) onSeccion(s); }), [activa, seccion, onSeccion]);
  const on = p => PAGES.includes(p);
  const tabs = (SECCIONES[seccion] || SECCIONES.forja).tabs.filter(([p]) => on(p));
  // switching section in the app's menu: open its own page (unless «Mis diseños» is open)
  useEffect(() => {
    if (!activa) return;
    if (!tabs.some(([p]) => p === nav.current())) nav.go(tabs[0][0]);
  }, [activa, seccion]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    // advanced options: the .adv parts of the forms are shown with the show-adv class (see styles.css)
    <div className={`forja${adv ? ' show-adv' : ''}`} hidden={!activa}>
      <header>
        <h1>{(SECCIONES[seccion] || SECCIONES.forja).titulo}</h1>
        <nav className="tabs" role="tablist" aria-label="Secciones">
          {tabs.map(([p, label]) => (
            <button key={p} type="button" role="tab" aria-selected={page === p} onClick={() => nav.go(p)}>{label}</button>
          ))}
        </nav>
        <ProjectBar />
      </header>
      {on('gen') && <div className="page app" id="page-gen" hidden={page !== 'gen'}><GeneratorPage /></div>}
      {on('edit') && <div className="page editor" id="page-edit" hidden={page !== 'edit'}><EditorPage /></div>}
      {on('line') && <div className="page app line" id="page-line" hidden={page !== 'line'}><LineArtPage /></div>}
      {on('lib') && <div className="page lib" id="page-lib" hidden={page !== 'lib'}><LibraryPage /></div>}
      <FloatingWindows page={page} />
      <MergePopover />
      <TooltipLayer />
    </div>
  );
}
