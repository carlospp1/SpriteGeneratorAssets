import { TooltipLayer } from '../forja/components/Tooltip.jsx';
import { SepararPage } from '../forja/features/separar/SepararPage.jsx';

/* «Separar figuras» está hecho con las piezas de Forja (pasos, fondo, pinceles, zoom), así que va dentro de
   un contenedor .forja con sus estilos. Lleva su propia capa de ayudas: la de Forja está oculta mientras tanto. */
export default function SepararFiguras() {
  return (
    <div className="forja">
      <header>
        <h1>Separar figuras</h1>
        <p className="hint">Saca cada vista de una hoja de diseño (front y back) en su propio PNG transparente.</p>
      </header>
      <div className="page app" id="page-sep">
        <SepararPage />
      </div>
      <TooltipLayer />
    </div>
  );
}
