/* Form fields. Each one comes in two forms: a plain controlled field (value / onChange) and a Setting*
   version bound to a setting of the store by its id (limits and default from the schema). */
import { useEffect, useRef, useState } from 'react';
import { settings, useSettings, SCHEMA } from '../state/settings.js';
import { Lbl } from './Tooltip.jsx';

const REPEAT_DELAY = 400, REPEAT_EVERY = 70;
const decimals = step => ((step != null && step !== 'any' ? String(step) : '1').split('.')[1] || '').length;

/* − / + button: hold to repeat; click without pointer (keyboard) steps once */
function StepButton({ dir, name, disabled, onStep }) {
  const timer = useRef(null);
  const stop = () => { clearTimeout(timer.current); clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  return (
    <button type="button" className="step-btn" disabled={disabled} aria-label={(dir < 0 ? 'Bajar ' : 'Subir ') + name}
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.preventDefault(); onStep(dir);
        timer.current = setTimeout(() => { timer.current = setInterval(() => onStep(dir), REPEAT_EVERY); }, REPEAT_DELAY);
      }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onClick={e => { if (e.detail === 0) onStep(dir); }}>{dir < 0 ? '−' : '+'}</button>
  );
}

/* the editable number next to a slider's label: typing past the slider's end extends it (up to hard limits) */
function NumBox({ id, value, onCommit, min, max, name }) {
  const [text, setText] = useState(null);   // what is being typed (null: show the value)
  const commit = () => { if (text == null) return; const ok = text.trim() !== '' && onCommit(+text); setText(null); return ok; };
  return (
    <input type="number" className="num" id={id} step="any" aria-label={name + ' (valor)'}
      min={Number.isFinite(min) ? min : undefined} max={Number.isFinite(max) ? max : undefined}
      value={text ?? value} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      onClick={e => e.stopPropagation()} />
  );
}

/* label.row: text (+ info), value box (reset ↺ + editable number) and − slider + below.
   min / max: the slider's range; hardMin / hardMax: how far typing and the buttons can go.
   def: default value (shows ↺ when different); auto: the value is set automatically (greyed). */
export function RangeField({ id, label, tip, value, onChange, min, max, step = 1, hardMin = min, hardMax = max, def, auto, className = '', disabled, style }) {
  const name = String(label).trim().toLowerCase();
  const v = +value, latest = useRef(v); latest.current = v;
  const dec = decimals(step);
  const set = n => {
    n = +Math.min(hardMax, Math.max(hardMin, +n)).toFixed(dec);
    if (!Number.isFinite(n) || n === latest.current) return false;
    latest.current = n; onChange(n); return true;
  };
  const stepBy = dir => set(latest.current + dir * (+step || 1));
  const showReset = def != null;
  return (
    <label className={'row' + (auto ? ' auto' : '') + (className ? ' ' + className : '')} htmlFor={id} style={style}>
      <Lbl tip={tip}>{label}</Lbl>
      {showReset ? (
        <span className="valbox">
          <button type="button" className={'reset' + (+def !== v ? ' on' : '')} aria-label={'Restablecer ' + name}
            data-tip={`Volver al valor por defecto (${def}).`} onClick={e => { e.preventDefault(); e.stopPropagation(); set(def); }}>↺</button>
          <NumBox id={id + 'Out'} value={value} onCommit={set} min={hardMin} max={hardMax} name={name} />
        </span>
      ) : <NumBox id={id + 'Out'} value={value} onCommit={set} min={hardMin} max={hardMax} name={name} />}
      <div className="stepper">
        <StepButton dir={-1} name={name} disabled={disabled || v <= hardMin} onStep={stepBy} />
        <input type="range" id={id} min={min} max={max} step={step} value={Number.isFinite(v) ? v : 0} disabled={disabled}
          onChange={e => set(e.target.value)} />
        <StepButton dir={1} name={name} disabled={disabled || v >= hardMax} onStep={stepBy} />
      </div>
    </label>
  );
}

/* a slider bound to a setting: basic / advanced ranges, its default, extended range when typing past it */
export function SettingRange({ id, label, tip, className, auto, onUserChange, style }) {
  const snap = useSettings(), s = SCHEMA[id];
  const raw = snap.values[id], [lo, hi] = settings.hardRange(id), shown = settings.clampNum(id, raw) ?? s.def;
  const [min, max] = settings.sliderRange(id, shown);
  return (
    <RangeField id={id} label={label} tip={tip} value={shown} min={min} max={max} step={s.step ?? 1} hardMin={lo} hardMax={hi}
      def={s.def} auto={auto} className={className} style={style}
      onChange={v => { settings.set(id, v); if (onUserChange) onUserChange(v); }} />
  );
}

/* label.check: a checkbox with its text */
export function CheckField({ id, label, tip, checked, onChange, className = '', children, disabled }) {
  return (
    <label className={'check' + (className ? ' ' + className : '')}>
      <input type="checkbox" id={id} checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      {' '}<Lbl tip={tip}>{label}</Lbl>{children}
    </label>
  );
}
export function SettingCheck({ id, onUserChange, ...p }) {
  const v = useSettings().values[id];
  return <CheckField id={id} {...p} checked={v} onChange={c => { settings.set(id, c); if (onUserChange) onUserChange(c); }} />;
}

/* label.field: a select. options: [[value, text]] */
export function SelectField({ id, label, tip, value, onChange, options, className = '', inline, style, children }) {
  return (
    <label className={'field' + (inline ? ' inline' : '') + (className ? ' ' + className : '')} htmlFor={id} style={style}>
      <Lbl tip={tip}>{label}</Lbl>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      {children}
    </label>
  );
}
export function SettingSelect({ id, onUserChange, ...p }) {
  const v = useSettings().values[id];
  return <SelectField id={id} {...p} value={v} onChange={x => { settings.set(id, x); if (onUserChange) onUserChange(x); }} />;
}

/* label.field: a number field. onCommit(value) when it is left or Enter is pressed (onChange fires while typing) */
export function NumberField({ id, label, tip, value, onChange, onCommit, min, max, step, className = '', flash, onFocus, onBlur }) {
  const start = useRef(value);   // the value when the field was entered: commit only what changed (like «change»)
  const commit = v => { if (onCommit && String(v) !== String(start.current)) { start.current = v; onCommit(v); } };
  return (
    <label className={'field' + (className ? ' ' + className : '')} htmlFor={id}>
      <Lbl tip={tip}>{label}</Lbl>
      <input type="number" id={id} className={flash ? 'flash' : undefined} min={min} max={max} step={step} value={value ?? ''}
        onChange={e => onChange(e.target.value)} onFocus={e => { start.current = e.target.value; if (onFocus) onFocus(e); }}
        onBlur={e => { if (onBlur) onBlur(e); commit(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Enter') commit(e.target.value); }} />
    </label>
  );
}
/* number bound to a setting: the value follows the store unless it is being typed in */
export function SettingNumber({ id, onCommit, flash, ...p }) {
  const v = useSettings().values[id], s = SCHEMA[id];
  const min = !settings.advanced() && s.basic && s.basic[0] != null ? s.basic[0] : s.min;
  return <NumberField id={id} {...p} value={v} min={min} max={s.max} step={s.step} flash={flash}
    onChange={x => settings.set(id, x)} onFocus={() => settings.setFocused(id)}
    onBlur={() => settings.setFocused(null)} onCommit={onCommit} />;
}

/* label.field: a colour */
export function ColorField({ id, label, tip, value, onChange, className = '', inline }) {
  return (
    <label className={'field' + (inline ? ' inline' : '') + (className ? ' ' + className : '')} htmlFor={id}>
      <Lbl tip={tip}>{label}</Lbl>
      <input type="color" id={id} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}
export function SettingColor({ id, ...p }) {
  const v = useSettings().values[id];
  return <ColorField id={id} {...p} value={v} onChange={x => settings.set(id, x)} />;
}
