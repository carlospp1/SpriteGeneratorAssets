/* Downloads and file names. */
import { project } from '../features/project/project.js';
import { S, showMsg } from '../features/generator/state.js';

/* save a blob as a file; report(text) tells how it went (by default under the generator's sprite) */
export function download(blob, name, report = showMsg) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  report('Guardado: ' + name);
}

/* file name from the uploaded image (or the design name), safe for Windows/macOS */
export function fileName(suffix = '', ext = '.png') {
  const fromFile = S.source && S.source.name && String(S.source.name).replace(/\.[^.]+$/, '');
  const raw = (fromFile || project.name()).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').trim();
  const base = raw.slice(0, 160) || 'sprite';
  return base + suffix + ext;
}
