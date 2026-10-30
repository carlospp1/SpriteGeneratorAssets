/* Baja a public/modelos los ONNX q8 (quantized) de las IAs de Forja, para no pedirlos a Hugging Face
   cada vez que se abre el analizador, Separar o el recorte por clic. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'public', 'modelos');

const REPOS = [
  'Xenova/clip-vit-base-patch32',
  'Xenova/clip-vit-base-patch16',
  'Xenova/siglip-base-patch16-224',
  'Xenova/dinov2-small',
  'Xenova/vit-base-patch16-224',
  'Xenova/slimsam-77-uniform'
];

function haceFalta(p) {
  const n = p.replace(/\\/g, '/');
  if (n === 'README.md' || n === '.gitattributes' || n.startsWith('.')) return false;
  if (n.endsWith('.onnx')) return n.endsWith('_quantized.onnx');
  return /\.(json|txt|model|jinja)$/i.test(n);
}

async function arbol(repo) {
  const url = `https://huggingface.co/api/models/${repo}/tree/main?recursive=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${repo}: no se pudo listar (${r.status})`);
  const data = await r.json();
  return data.filter(x => x.type === 'file' && haceFalta(x.path));
}

async function bajar(repo, file) {
  const dest = path.join(DEST, repo, file.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size === file.size) return 'ok';
  const url = `https://huggingface.co/${repo}/resolve/main/${file.path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${repo}/${file.path}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return (buf.length / 1e6).toFixed(1) + ' MB';
}

console.log('destino', DEST);
for (const repo of REPOS) {
  console.log('\n', repo);
  const files = await arbol(repo);
  for (const f of files) {
    try {
      const r = await bajar(repo, f);
      console.log(' ', r === 'ok' ? 'ya estaba' : r, f.path);
    } catch (e) {
      console.log('  fallo', f.path, e.message);
    }
  }
}
console.log('\nlisto');
