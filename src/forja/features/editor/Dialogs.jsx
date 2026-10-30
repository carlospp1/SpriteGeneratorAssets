/* The editor's dialogs. Which one is open (and with what) lives in dialogVal (store.js). */
import { useEffect, useState } from 'react';
import { useValue } from '../../state/signal.js';
import { Dialog } from '../../components/ui.jsx';
import { RangeField, SelectField, CheckField } from '../../components/fields.jsx';
import { O } from '../../engine/editor/ops.js';
import * as U from './store.js';
import { keySections } from './commands.js';

const useDlg = id => { const d = useValue(U.dialogVal); return d && d.id === id ? d : null; };
/* runs init(d) each time the dialog opens */
const useOnOpen = (d, init) => { useEffect(() => { if (d) init(d); }, [d]); };   // eslint-disable-line react-hooks/exhaustive-deps

function Buttons({ onOk, ok = 'OK' }) {
  return <div className="pair"><button type="button" onClick={U.closeDialog}>Cancelar</button><button type="button" className="primary" onClick={onOk}>{ok}</button></div>;
}
function Num({ id, label, value, onChange, min, max }) {
  return <label className="field" htmlFor={id}>{label}<input type="number" id={id} min={min} max={max} value={value} onChange={e => onChange(e.target.value)} /></label>;
}
function Sel({ id, label, value, onChange, options }) { return <SelectField id={id} label={label} value={value} onChange={onChange} options={options} />; }

/* live preview: computed from the layer as it was when the dialog opened */
function LiveDialog({ id, title, hint, fields, compute, label }) {
  const d = useDlg(id);
  const defs = fields.map(f => f.def);
  const [vals, setVals] = useState(defs);
  useOnOpen(d, () => { setVals(defs); U.preview(compute(U.live.base, ...defs)); });
  const change = (i, v) => { const nv = vals.slice(); nv[i] = v; setVals(nv); U.preview(compute(U.live.base, ...nv)); };
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title={title} id={id}>
      {hint && <p className="hint">{hint}</p>}
      {fields.map((f, i) => <RangeField key={f.id} id={f.id} label={f.label} value={vals[i]} min={f.min} max={f.max} def={f.def} onChange={v => change(i, v)} />)}
      <Buttons onOk={() => U.applyLive(label)} />
    </Dialog>
  );
}

function CanvasSizeDialog() {
  const d = useDlg('dlgCanvas');
  const [w, setW] = useState(''), [h, setH] = useState(''), [anchor, setAnchor] = useState('c');
  useOnOpen(d, p => { setW(p.w); setH(p.h); });
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title="Tamaño de lienzo" id="dlgCanvas">
      <p className="hint">El dibujo no se escala: se añade o se recorta espacio alrededor.</p>
      <div className="pair"><Num id="cvW" label="Anchura (px)" value={w} onChange={setW} min={1} max={4096} /><Num id="cvH" label="Altura (px)" value={h} onChange={setH} min={1} max={4096} /></div>
      <Sel id="cvAnchor" label="Ancla" value={anchor} onChange={setAnchor} options={[['c', 'Centro'], ['b', 'Abajo en el centro (pies en su sitio)'], ['tl', 'Arriba a la izquierda']]} />
      <Buttons onOk={() => U.applyCanvasSize(w, h, anchor)} />
    </Dialog>
  );
}

function ImageSizeDialog() {
  const d = useDlg('dlgImageSize');
  const [w, setW] = useState(''), [h, setH] = useState(''), [lock, setLock] = useState(true), [ratio, setRatio] = useState(1);
  useOnOpen(d, p => { setW(p.w); setH(p.h); setRatio(p.w / p.h); });
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title="Tamaño de imagen" id="dlgImageSize">
      <p className="hint">Escala todo el dibujo sin suavizar (vecino más próximo), como se hace en pixel art.</p>
      <div className="pair">
        <Num id="isW" label="Anchura (px)" value={w} min={1} max={4096} onChange={v => { setW(v); if (lock) setH(Math.max(1, Math.round(+v / ratio))); }} />
        <Num id="isH" label="Altura (px)" value={h} min={1} max={4096} onChange={v => { setH(v); if (lock) setW(Math.max(1, Math.round(+v * ratio))); }} />
      </div>
      <CheckField id="isLock" label="Restringir proporciones" checked={lock} onChange={setLock} />
      <Buttons onOk={() => U.applyImageSize(w, h)} />
    </Dialog>
  );
}

function NewDialog() {
  const d = useDlg('dlgNew');
  const [w, setW] = useState(64), [h, setH] = useState(64), [bg, setBg] = useState('transparent');
  useOnOpen(d, p => { setW(p.w); setH(p.h); });
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title="Nuevo documento" id="dlgNew">
      <div className="pair"><Num id="nwW" label="Anchura (px)" value={w} onChange={setW} min={1} max={4096} /><Num id="nwH" label="Altura (px)" value={h} onChange={setH} min={1} max={4096} /></div>
      <Sel id="nwBg" label="Contenido de fondo" value={bg} onChange={setBg} options={[['transparent', 'Transparente'], ['white', 'Blanco'], ['bg', 'Color de fondo']]} />
      <p className="hint">Sustituye el documento actual (puedes deshacerlo con Ctrl+Z si no has guardado otro).</p>
      <Buttons ok="Crear" onOk={() => U.applyNew(w, h, bg)} />
    </Dialog>
  );
}

function FillDialog() {
  const d = useDlg('dlgFill');
  const [what, setWhat] = useState('fg'), [keep, setKeep] = useState(false);
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title="Rellenar" id="dlgFill">
      <Sel id="flWhat" label="Contenido" value={what} onChange={setWhat} options={[['fg', 'Color frontal'], ['bg', 'Color de fondo'], ['clear', 'Transparente']]} />
      <CheckField id="flKeep" label="Conservar transparencia" checked={keep} onChange={setKeep} />
      <p className="hint">Rellena la selección (o toda la capa si no hay selección).</p>
      <Buttons onOk={() => { U.closeDialog(); U.fillWith(U.colorOf(what), keep, 'Rellenar'); }} />
    </Dialog>
  );
}

function StrokeDialog() {
  const d = useDlg('dlgStroke');
  const [w, setW] = useState(1), [color, setColor] = useState('fg'), [pos, setPos] = useState('inside');
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title="Contornear" id="dlgStroke">
      <div className="pair">
        <Num id="stW" label="Anchura (px)" value={w} onChange={setW} min={1} max={64} />
        <Sel id="stColor" label="Color" value={color} onChange={setColor} options={[['fg', 'Color frontal'], ['bg', 'Color de fondo']]} />
      </div>
      <Sel id="stPos" label="Posición" value={pos} onChange={setPos} options={[['inside', 'Interior'], ['center', 'Centro'], ['outside', 'Exterior']]} />
      <Buttons onOk={() => U.applyStroke(color, w, pos)} />
    </Dialog>
  );
}

function OffsetDialog() {
  const d = useDlg('dlgOffset');
  const [x, setX] = useState(0), [y, setY] = useState(0), [wrap, setWrap] = useState(true);
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title="Desplazamiento" id="dlgOffset">
      <div className="pair"><Num id="ofX" label="Horizontal (px)" value={x} onChange={setX} /><Num id="ofY" label="Vertical (px)" value={y} onChange={setY} /></div>
      <CheckField id="ofWrap" label="Dar la vuelta (lo que sale por un lado entra por el otro, para patrones)" checked={wrap} onChange={setWrap} />
      <Buttons onOk={() => U.applyOffset(x, y, wrap)} />
    </Dialog>
  );
}

function OutlineDialog() {
  const d = useDlg('dlgOutline');
  const [color, setColor] = useState('auto'), [diag, setDiag] = useState(false);
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title="Contorno automático" id="dlgOutline">
      <p className="hint">Añade un contorno de 1 px alrededor de lo pintado en la capa activa (o dentro de la selección).</p>
      <Sel id="olColor" label="Color" value={color} onChange={setColor} options={[['auto', 'Tono oscuro del borde (contorno de color)'], ['fg', 'Color frontal']]} />
      <CheckField id="olDiag" label="Incluir esquinas en diagonal" checked={diag} onChange={setDiag} />
      <Buttons onOk={() => U.applyOutline(color, diag)} />
    </Dialog>
  );
}

/* a small "type a number" dialog (askNumber) */
function NumberDialog() {
  const d = useDlg('dlgNum');
  const [v, setV] = useState(1);
  useOnOpen(d, p => { setV(p.value); requestAnimationFrame(() => { const i = document.getElementById('numVal'); if (i) i.select(); }); });
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title={d ? d.title : ''} id="dlgNum">
      <label className="field" htmlFor="numVal"><span>{d ? d.label : ''}</span>
        <input type="number" id="numVal" min={d ? d.min : 1} value={v} onChange={e => setV(e.target.value)} /></label>
      <Buttons onOk={() => { const n = +v, done = d && d.done; U.closeDialog(); if (done && Number.isFinite(n)) done(n); }} />
    </Dialog>
  );
}

function ExportDialog() {
  const d = useDlg('dlgExport');
  const [s, setS] = useState('1');
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title="Exportar como PNG" id="dlgExport">
      <p className="hint">Todas las capas visibles, con el nombre del diseño.</p>
      <Sel id="edExportScale" label="Escala (sin suavizar)" value={s} onChange={setS} options={[1, 2, 3, 4, 6, 8, 16].map(n => [String(n), '×' + n])} />
      <Buttons ok="Exportar" onOk={() => U.exportPng(+s)} />
    </Dialog>
  );
}

function KeysDialog() {
  const d = useDlg('dlgKeys');
  return (
    <Dialog open={!!d} onClose={U.closeDialog} title="Atajos de teclado" id="dlgKeys" className="dlg-wide">
      <p className="hint">Los mismos que en Photoshop. El navegador se reserva Ctrl+N, Ctrl+T, Ctrl+W y Ctrl+Mayús+N, así que aquí son Ctrl+Alt+N (nuevo), Ctrl+Alt+T (transformación libre) y Ctrl+Alt+Mayús+N (nueva capa), igual que las variantes de Photoshop.</p>
      <div className="keys-grid" id="keysList">
        {d && keySections().map(([title, rows]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>{rows.map(([k, what], i) => [<dt key={'k' + i}>{k}</dt>, <dd key={'d' + i}>{what}</dd>])}</dl>
          </section>
        ))}
      </div>
      <div className="pair"><span /><button type="button" className="primary" onClick={U.closeDialog}>Cerrar</button></div>
    </Dialog>
  );
}

export function EditorDialogs() {
  return (
    <>
      <LiveDialog id="dlgAdjust" title="Tono/saturación" label="Tono/saturación" hint="Se aplica a la capa activa (o solo a la selección). La vista previa es en directo."
        fields={[{ id: 'adjH', label: 'Tono', min: -180, max: 180, def: 0 }, { id: 'adjS', label: 'Saturación', min: -100, max: 100, def: 0 }, { id: 'adjL', label: 'Luminosidad', min: -100, max: 100, def: 0 }]}
        compute={(b, h, s, l) => O.adjust(b, h, s, l)} />
      <LiveDialog id="dlgBC" title="Brillo/contraste" label="Brillo/contraste"
        fields={[{ id: 'bcB', label: 'Brillo', min: -100, max: 100, def: 0 }, { id: 'bcC', label: 'Contraste', min: -100, max: 100, def: 0 }]}
        compute={(b, br, co) => O.brightnessContrast(b, br, co)} />
      <LiveDialog id="dlgPosterize" title="Posterizar" label="Posterizar"
        fields={[{ id: 'postN', label: 'Niveles por canal', min: 2, max: 16, def: 4 }]}
        compute={(b, n) => O.posterize(b, n)} />
      <CanvasSizeDialog />
      <ImageSizeDialog />
      <NewDialog />
      <FillDialog />
      <StrokeDialog />
      <OffsetDialog />
      <OutlineDialog />
      <NumberDialog />
      <ExportDialog />
      <KeysDialog />
    </>
  );
}
