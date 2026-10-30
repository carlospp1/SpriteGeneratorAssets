/* The two steps the generator and the line art share: upload + crop, and background removal. Each page
   passes its own setting ids (prefix: '' generator, 'la-' line art) and texts (subject: «personaje» or «dibujo»). */
import { Step } from '../../components/Step.jsx';
import { useSettings } from '../../state/settings.js';
import { autoFondoExperto } from './autoFondo.js';
import { DropZone } from '../../components/ui.jsx';
import { SettingCheck, SettingRange } from '../../components/fields.jsx';
import { CropTools, ToolButton, ToolHint, SeedList, useSource } from './components.jsx';
import { fondoCancelado, reintentarFondo } from './iaFondo.js';
import { tareaIA } from './tareasIA.js';
import { useValue } from '../../state/signal.js';

/* 1 · Sube y recorta la imagen. before / after: what goes before the crop tools and after the hint */
export function UploadStep({ n, acc, tip, ariaLabel, dropHint, onFile, hint, before, after, id }) {
  return (
    <Step n={n} acc={acc} title="Sube y recorta la imagen" tip={tip}>
      <DropZone id={id} ariaLabel={ariaLabel} onFile={onFile}>
        <strong>Arrastra aquí tu imagen</strong>
        <span className="hint">{dropHint}</span>
      </DropZone>
      {before}
      <CropTools />
      <ToolHint tools={['crop']}>{hint}</ToolHint>
      {after}
    </Step>
  );
}


/* «Quitar el fondo» by tolerance (default), or by the advanced AI instead (checkbox, off by default) */
function OpcionesFondo({ p, t }) {
  const vals = useSettings().values, on = !!vals[p('bgRemove')], ai = on && !!vals[p('bgAI')];
  return (
    <>
      <SettingCheck id={p('bgRemove')} label="Quitar el fondo" tip={t.remove} />
      {on && !ai && <SettingRange id={p('tol')} label="Tolerancia del fondo" tip={t.tol} />}
      {on && <SettingCheck id={p('bgAI')} label="Quitar el fondo con IA"
        tip="En lugar de la tolerancia, una IA especializada en recortar personajes dibujados (ISNet-anime) lo quita sola y luego se afina el borde con los colores de la imagen. Funciona en este ordenador, sin internet; tarda unos segundos." />}
    </>
  );
}

/* 2 · Quita el fondo: by tolerance (default) or by the advanced AI (checkbox); «Ajustar automáticamente» sets
   the values (a simple AI proposes them and four tries are judged; it never starts the background AI); points, AI clicks, brushes and
   zones fix what is left. t: the texts that change between pages; options: the page's own background controls
   (the generator has its own); advanced: the generator's advanced settings */
export function BackgroundStep({ n, acc, prefix = '', t, advanced, options, tip }) {
  const { S, tools, ajustarMas, alAjustar } = useSource();
  const p = id => prefix + id;
  // the background values first (judged by the advanced background AI), then the page's own values;
  // alAjustar (the generator's before / after) is told before and, through what it returns, after
  const ajustar = async () => {
    const fin = alAjustar?.();
    const r = await autoFondoExperto(S, prefix);
    if (ajustarMas) await ajustarMas(r?.ronda ?? 0);
    fin?.();
  };
  return (
    <Step n={n} acc={acc} title="Quita el fondo" tip={tip || t.tip}>
      {options || <OpcionesFondo p={p} t={t} />}
      <button type="button" className="primary" disabled={!S.img} onClick={ajustar}
        data-tip="Ajusta solos todos los valores de esta herramienta: primero el fondo (por tolerancia; no pone a trabajar la IA del fondo) y luego los suyos propios (los del sprite, los de las líneas…). Hace 4 pruebas y se queda con la mejor: en el sprite, una IA compara cada prueba con el dibujo original y gana la que se parece a un sprite de verdad, con el contorno y las líneas del dibujo bien marcados. Cada vez que lo pulses prueba 4 combinaciones nuevas y puede darte otra versión.">✨ Ajustar automáticamente</button>
      <div className="tools" role="group" aria-label="Retoque del fondo">
        <ToolButton tool="bg" tip="Haz clic en una zona que sigue siendo fondo y se borrará junto con todo lo que la rodea del mismo tono. Los puntos marcados se pueden arrastrar para moverlos. Atajo: Ctrl + Alt + E.">Marcar como fondo</ToolButton>
        <ToolButton tool="keep" tip={`Lo contrario de «Marcar como fondo»: haz clic en una parte del ${t.subject} que se haya borrado como fondo y se recupera junto con lo que la rodea del mismo tono. Atajo: Ctrl + Mayús + E.`}>No es fondo</ToolButton>
        <ToolButton tool="iabg" tip="Clic sobre algo que sigue ahí y es fondo (un texto, una sombra, una marca de agua…): la IA lo selecciona entero, con su forma exacta, y lo quita.">✨ IA: esto es fondo</ToolButton>
        <ToolButton tool="iakeep" tip={`Clic sobre una parte del ${t.subject} que se haya quitado como fondo: la IA la selecciona entera, con su forma exacta, y la recupera.`}>✨ IA: no es fondo</ToolButton>
        <ToolButton tool="erase" tip="Pincel para quitar a mano restos de fondo que se hayan quedado pegados.">Pincel: quitar</ToolButton>
        <ToolButton tool="restore" tip={`Pincel para recuperar partes del ${t.subject} que se hayan quitado por error.`}>Pincel: devolver</ToolButton>
      </div>
      <SettingCheck id={p('bgGlobal')} label="Quitar ese tono en toda la imagen (huecos cerrados)" tip={t.global} />
      <SettingRange id={p('brush')} label="Tamaño del pincel" tip="Radio de los pinceles «quitar» y «devolver», en píxeles de la imagen." />
      {advanced}
      <EstadoIA prefix={prefix} />
      <SeedList />
      <div className="pair">
        <button type="button" onClick={tools.undoSeed} data-tip={t.undo}>Deshacer punto</button>
        <button type="button" onClick={tools.clearSeeds} data-tip={t.clear}>Borrar retoques</button>
      </div>
    </Step>
  );
}

/* after cancelling (or a failure of) the AI that removes the background: a button to ask it again */
export function EstadoIA({ prefix = '' }) {
  const { S } = useSource();
  const vals = useSettings().values;
  useValue(tareaIA);   // shown again when an AI job ends
  // only while the background is being removed by the AI (cancelling the adjustment's judge does not count)
  if (!vals[prefix + 'bgRemove'] || !vals[prefix + 'bgAI'] || !fondoCancelado(S)) return null;
  return <button type="button" className="primary" onClick={() => reintentarFondo(S)}
    data-tip="La IA no llegó a quitar el fondo de esta imagen. Vuelve a intentarlo.">↻ Volver a quitar el fondo con IA</button>;
}
