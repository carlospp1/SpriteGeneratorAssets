import { useEffect, useRef, useState } from 'react';
import { LAYOUT, LIENZO } from '../data/campos';
import { posicion } from '../lib/estilo';

const F = LAYOUT.fondo;

// Delta de rueda acumulado que equivale a un nivel de zoom (los trackpads envían muchos eventos pequeños).
const DELTA_POR_PASO = 100;

/** Zona transparente sobre la ventana del fondo: arrastrar mueve al personaje y la rueda cambia el zoom. */
export function PersonajeArrastre({ personaje, fichaRef, onMover, onZoom }) {
  const ref = useRef(null);
  const inicio = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);

  // React registra onWheel como pasivo y no deja hacer preventDefault (la página haría scroll).
  useEffect(() => {
    const zona = ref.current;
    let acumulado = 0;
    const alGirar = (e) => {
      e.preventDefault();
      acumulado += e.deltaY;
      if (Math.abs(acumulado) < DELTA_POR_PASO) return;
      onZoom(acumulado < 0 ? 1 : -1);
      acumulado = 0;
    };
    zona.addEventListener('wheel', alGirar, { passive: false });
    return () => zona.removeEventListener('wheel', alGirar);
  }, [onZoom]);

  const soltar = () => {
    inicio.current = null;
    setArrastrando(false);
  };

  return (
    <div
      ref={ref}
      className={`arrastre${arrastrando ? ' activo' : ''}`}
      style={posicion(F)}
      title="Arrastra para mover al personaje · rueda para hacer zoom"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        inicio.current = { px: e.clientX, py: e.clientY, x: personaje.x, y: personaje.y };
        setArrastrando(true);
      }}
      onPointerMove={(e) => {
        const i = inicio.current;
        if (!i) return;
        const k = LIENZO.w / fichaRef.current.clientWidth; // px de pantalla → px de lienzo
        onMover(i.x + (e.clientX - i.px) * k, i.y + (e.clientY - i.py) * k);
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
    />
  );
}
