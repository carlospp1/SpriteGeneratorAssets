import { TooltipLayer } from '../forja/components/Tooltip.jsx';
import { AnalizadorPage } from '../forja/features/analizador/AnalizadorPage.jsx';

/* «Analizador» está hecho con las piezas de Forja (pasos, paneles, campos), así que va dentro de un contenedor
   .forja con sus estilos. Lleva su propia capa de ayudas: la de Forja está oculta mientras tanto. */
export default function Analizador() {
  return (
    <div className="forja">
      <header>
        <h1>Analizador</h1>
        <p className="hint">Compara un personaje nuevo con tus Pokémon y te dice de qué tamaño debería ser su sprite y cómo llamarlo.</p>
      </header>
      <div className="page app" id="page-an">
        <AnalizadorPage />
      </div>
      <TooltipLayer />
    </div>
  );
}
