import { useEffect, useState } from 'react';
import { descargarCanvas } from '../lib/exportar';

// Formatos que el navegador sabe volver a guardar tal cual; el resto sale en PNG.
const FORMATOS = ['image/png', 'image/jpeg', 'image/webp'];

/** La imagen volteada en horizontal (espejo), píxel a píxel. */
async function voltear(archivo) {
  const img = await createImageBitmap(archivo);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  img.close();
  return c;
}

/** Mismo nombre que el archivo subido; si su formato no se puede guardar, la extensión pasa a .png. */
function nombreDe(archivo) {
  if (FORMATOS.includes(archivo.type)) return archivo.name;
  return archivo.name.replace(/\.[^.]+$/, '') + '.png';
}

function Miniatura({ canvas }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let u = '';
    canvas.toBlob((b) => setUrl((u = URL.createObjectURL(b))));
    return () => u && URL.revokeObjectURL(u);
  }, [canvas]);
  return url ? <img src={url} alt="" /> : null;
}

export default function InvertirImagenes() {
  const [lista, setLista] = useState([]); // [{ id, archivo, canvas }]
  const [aviso, setAviso] = useState('');
  const [encima, setEncima] = useState(false);

  const añadir = async (archivos) => {
    const imagenes = [...archivos].filter((f) => f.type.startsWith('image/'));
    if (!imagenes.length) return setAviso('Eso no son imágenes.');
    setAviso(`Invirtiendo ${imagenes.length}…`);
    const nuevas = [];
    const fallos = [];
    for (const archivo of imagenes) {
      try {
        nuevas.push({ id: crypto.randomUUID(), archivo, canvas: await voltear(archivo) });
      } catch {
        fallos.push(archivo.name);
      }
    }
    setLista((l) => [...l, ...nuevas]);
    setAviso(
      `${nuevas.length} ${nuevas.length === 1 ? 'imagen invertida' : 'imágenes invertidas'}.` +
        (fallos.length ? ` No se pudo leer: ${fallos.join(', ')}.` : ''),
    );
  };

  const descargar = (it) => descargarCanvas(it.canvas, nombreDe(it.archivo), FORMATOS.includes(it.archivo.type) ? it.archivo.type : 'image/png');
  const descargarTodas = async () => {
    for (const it of lista) {
      await descargar(it);
      await new Promise((r) => setTimeout(r, 150)); // el navegador corta descargas seguidas demasiado rápidas
    }
    setAviso(`${lista.length} descargadas.`);
  };

  return (
    <div className="invertir">
      <h1>Invertir imágenes</h1>
      <p className="entradilla">
        Voltea en horizontal (como en un espejo) sprites o cualquier imagen. Sube varias a la vez: cada una se descarga
        con el mismo nombre de su archivo.
      </p>

      <label
        className={`soltar${encima ? ' encima' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); añadir(e.dataTransfer.files); }}
      >
        <strong>Arrastra aquí las imágenes</strong>
        <span>o haz clic para elegirlas (PNG, JPG, WEBP…)</span>
        <input type="file" accept="image/*" multiple aria-label="Subir imágenes para invertir"
          onChange={(e) => { añadir(e.target.files); e.target.value = ''; }} />
      </label>

      <div className="fila-botones">
        <button className="btn" type="button" disabled={!lista.length} onClick={descargarTodas}>
          Descargar todas ({lista.length})
        </button>
        <button className="btn ghost" type="button" disabled={!lista.length} onClick={() => { setLista([]); setAviso(''); }}>
          Quitar todas
        </button>
      </div>
      <div className="aviso" role="status">{aviso}</div>

      <ul className="invertidas">
        {lista.map((it) => (
          <li key={it.id}>
            <div className="ajedrez"><Miniatura canvas={it.canvas} /></div>
            <span className="nombre" title={nombreDe(it.archivo)}>{nombreDe(it.archivo)}</span>
            <span className="pista">{it.canvas.width} × {it.canvas.height}</span>
            <div className="dos">
              <button className="btn" type="button" onClick={() => descargar(it)}>Descargar</button>
              <button className="btn ghost" type="button" onClick={() => setLista((l) => l.filter((x) => x !== it))}>Quitar</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
