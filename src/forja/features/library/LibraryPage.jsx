/* «Mis diseños»: the designs saved in this browser, as cards (open, rename, duplicate, export, delete),
   search, a new design and importing .forja.json copies. */
import { useEffect, useState } from 'react';
import { useSignal, useValue } from '../../state/signal.js';
import { useFilePicker } from '../../components/ui.jsx';
import { usePage } from '../../app/nav.js';
import { project, libSignal, libMsg, designName } from '../project/project.js';

const fmtDate = t => new Date(t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
const lib = project.library;

export function LibraryPage() {
  const ver = useSignal(libSignal), page = usePage(), msg = useValue(libMsg);
  useValue(designName);   // the card of the design being worked on shows «abierto»
  const [list, setList] = useState(null), [q, setQ] = useState(''), [usage, setUsage] = useState('');
  const [importInput, pickImport] = useFilePicker('.json,application/json', lib.importFiles, true);

  useEffect(() => {
    if (page !== 'lib') return;
    let alive = true;
    (async () => {
      let all;
      try { all = await lib.list(); }
      catch (e) { libMsg.set('Este navegador no permite guardar diseños aquí (' + (e && e.message || e) + ').'); return; }
      if (!alive) return;
      setList(all);
      if (navigator.storage && navigator.storage.estimate) {
        try { const { usage: u } = await navigator.storage.estimate(); if (alive) setUsage(all.length + (all.length === 1 ? ' diseño' : ' diseños') + ' · ' + (u / 1048576).toFixed(1) + ' MB usados'); } catch { /* optional */ }
      }
    })();
    return () => { alive = false; };
  }, [ver, page]);

  const all = list || [], needle = q.trim().toLowerCase();
  const items = all.filter(r => !needle || (r.name || '').toLowerCase().includes(needle)).sort((a, b) => b.updated - a.updated);
  const empty = !all.length ? 'Aún no has guardado ningún diseño. Ponle nombre arriba y pulsa «Guardar».' : !items.length ? 'Ningún diseño coincide con la búsqueda.' : '';
  return (
    <>
      <div className="lib-head">
        <h2>Mis diseños</h2>
        <input type="search" placeholder="Buscar por nombre" aria-label="Buscar diseños" value={q} onChange={e => setQ(e.target.value)} />
        <button type="button" className="primary" onClick={project.newDesign}>Nuevo diseño</button>
        <button type="button" onClick={pickImport} data-tip="Carga uno o varios archivos .forja.json exportados antes (desde este u otro equipo).">Importar copia…</button>
        {importInput}
        <span className="hint">{usage}</span>
      </div>
      <p className="hint lib-note">Los diseños se guardan en este navegador. Usa «Exportar» en un diseño para tener una copia en un archivo: sirve para llevarlo a otro equipo o para no perderlo si se borran los datos del navegador.</p>
      <p className="msg" role="status">{msg}</p>
      <div className="lib-grid">{items.map(r => <Card key={r.id} r={r} />)}</div>
      {list && empty && <div className="empty">{empty}</div>}
    </>
  );
}

function Card({ r }) {
  const current = lib.isCurrent(r.id);
  return (
    <article className={'card' + (current ? ' current' : '')}>
      <div className="card-thumb">{r.thumb ? <img src={r.thumb} alt="" /> : 'Sin vista previa'}</div>
      <div className="card-body">
        <h3>{r.name || 'Sin título'}</h3>
        <p className="hint">{fmtDate(r.updated) + (r.editor ? ' · con edición de píxeles' : '') + (r.line ? ' · con line art' : '') + (current ? ' · abierto' : '')}</p>
        <div className="card-btns">
          <button type="button" className="primary" onClick={() => project.open(r.id)}>Abrir</button>
          <button type="button" onClick={() => lib.rename(r)}>Renombrar</button>
          <button type="button" onClick={() => lib.duplicate(r)}>Duplicar</button>
          <button type="button" onClick={() => lib.export(r)}>Exportar</button>
          <button type="button" className="danger" onClick={() => lib.remove(r)}>Eliminar</button>
        </div>
      </div>
    </article>
  );
}
