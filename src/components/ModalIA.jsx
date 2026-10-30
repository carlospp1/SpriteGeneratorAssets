import { useEffect, useRef } from 'react';
import { useValue } from '../forja/state/signal.js';
import { tareaIA, cancelarTareas } from '../forja/features/source/tareasIA.js';

/* Full-screen window while an AI job runs (background, selection, front / back, line art), with an animated
   AI emblem and a close button that cancels the job. */
export default function ModalIA() {
  const tarea = useValue(tareaIA);
  const boton = useRef(null);
  useEffect(() => {
    if (!tarea) return;
    boton.current?.focus();
    const esc = e => { if (e.key === 'Escape') cancelarTareas(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [!!tarea]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!tarea) return null;
  return (
    <div className="modal-ia" role="dialog" aria-modal="true" aria-labelledby="modal-ia-texto">
      <div className="modal-ia-caja">
        <button ref={boton} type="button" className="modal-ia-cerrar" onClick={cancelarTareas}
          aria-label="Cancelar lo que está haciendo la IA" title="Cancelar (Esc)">×</button>
        <AnimacionIA />
        <p id="modal-ia-texto" className="modal-ia-texto" aria-live="polite">{tarea.texto}</p>
        <p className="modal-ia-nota">{tarea.nota || 'Funciona en este ordenador. Pulsa × o Esc para cancelar.'}</p>
      </div>
    </div>
  );
}

/* the animated AI emblem: a glowing core with a pulsing neural network and sparks orbiting around it */
function AnimacionIA() {
  const nodos = [[60, 22], [96, 40], [98, 80], [60, 98], [24, 80], [22, 40]];
  return (
    <svg className="anim-ia" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="ia-nucleo" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#fff6d6" />
          <stop offset="45%" stopColor="#ffb347" />
          <stop offset="100%" stopColor="#e4572e" />
        </radialGradient>
        <linearGradient id="ia-anillo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#2fd3ff" />
        </linearGradient>
      </defs>
      <g className="anim-ia-red">
        {nodos.map(([x, y], i) => (
          <g key={i}>
            <line x1="60" y1="60" x2={x} y2={y} />
            <line x1={x} y1={y} x2={nodos[(i + 1) % nodos.length][0]} y2={nodos[(i + 1) % nodos.length][1]} />
            <circle cx={x} cy={y} r="4.5" style={{ animationDelay: `${i * 0.18}s` }} />
          </g>
        ))}
      </g>
      <circle className="anim-ia-anillo" cx="60" cy="60" r="52" />
      <circle className="anim-ia-nucleo" cx="60" cy="60" r="15" fill="url(#ia-nucleo)" />
      <g className="anim-ia-orbita">
        <path d="M60 2 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" />
        <path d="M112 76 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" />
        <path d="M10 92 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" />
      </g>
    </svg>
  );
}
