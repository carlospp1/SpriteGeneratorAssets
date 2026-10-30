import { useValue } from '../forja/state/signal.js';
import { notificaciones, cerrarNotificacion } from '../forja/features/source/notificaciones.js';

const ICONO = { error: '⚠', aviso: 'ℹ', ok: '✓' };

/* errors and notices in the top-right corner (they close by themselves or with ×) */
export default function Notificaciones() {
  const lista = useValue(notificaciones);
  return (
    <div className="notificaciones" aria-live="assertive">
      {lista.map(n => (
        <div key={n.id} className={'notificacion ' + n.tipo} role={n.tipo === 'error' ? 'alert' : 'status'}>
          <span className="notificacion-icono" aria-hidden="true">{ICONO[n.tipo]}</span>
          <p>{n.texto}</p>
          <button type="button" onClick={() => cerrarNotificacion(n.id)} aria-label="Cerrar aviso">×</button>
        </div>
      ))}
    </div>
  );
}
