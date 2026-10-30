import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import ForjaApp from './forja/ForjaApp';
import GeneradorFichas from './paginas/GeneradorFichas';
import ModalIA from './components/ModalIA';
import Notificaciones from './components/Notificaciones';

// «Separar figuras» se carga solo al abrirla.
const SepararFiguras = lazy(() => import('./paginas/SepararFiguras'));
const Analizador = lazy(() => import('./paginas/Analizador'));
const InvertirImagenes = lazy(() => import('./paginas/InvertirImagenes'));
const SpriteMitad = lazy(() => import('./paginas/SpriteMitad'));

const PAGINAS = [
  { id: 'forja', titulo: 'Forja de sprites', forja: 'forja' },
  // ambito: el contenedor cuyos estilos usa la página (ver vite.config.js)
  { id: 'fichas', titulo: 'Generador de fichas', Componente: GeneradorFichas, ambito: 'imperia' },
  { id: 'separar', titulo: 'Separar figuras', Componente: SepararFiguras, ambito: 'forja' },
  { id: 'analizador', titulo: 'Analizador', Componente: Analizador, ambito: 'forja' },
  { id: 'invertir', titulo: 'Invertir imágenes', Componente: InvertirImagenes, ambito: 'imperia' },
  { id: 'mitad', titulo: 'Sprite a la mitad', Componente: SpriteMitad, ambito: 'imperia' },
];

// La herramienta va en la URL (#fichas) para que recargar no te devuelva al inicio.
const paginaDeUrl = () => PAGINAS.find((p) => `#${p.id}` === location.hash)?.id ?? PAGINAS[0].id;

export default function App() {
  const [pagina, setPagina] = useState(paginaDeUrl);
  useEffect(() => {
    const alCambiar = () => setPagina(paginaDeUrl());
    addEventListener('hashchange', alCambiar);
    return () => removeEventListener('hashchange', alCambiar);
  }, []);

  const { Componente, ambito, forja } = PAGINAS.find((p) => p.id === pagina);
  // un diseño (o la sesión) abre una página de la otra sección de Forja: el menú la sigue
  const irASeccion = useCallback((s) => { location.hash = '#' + s; }, []);
  const cargando = <p className="cargando">Cargando…</p>;
  return (
    <>
      <nav className="menu" aria-label="Herramientas">
        <span className="menu-marca">Pokémon Imperia</span>
        {PAGINAS.map((p) => (
          <a key={p.id} href={`#${p.id}`} aria-current={p.id === pagina ? 'page' : undefined}>
            {p.titulo}
          </a>
        ))}
      </nav>
      <main className="vista">
        {/* Forja se queda montada aunque no se vea: guarda la imagen, el sprite y las ventanas flotantes */}
        <ForjaApp activa={!!forja} seccion={forja || 'forja'} onSeccion={irASeccion} />
        {ambito === 'imperia' && (
          <div className="imperia">
            <Suspense fallback={cargando}>
              <Componente />
            </Suspense>
          </div>
        )}
        {/* las páginas hechas con piezas de Forja traen su propio contenedor .forja */}
        {ambito === 'forja' && (
          <Suspense fallback={cargando}>
            <Componente />
          </Suspense>
        )}
      </main>
      <ModalIA />
      <Notificaciones />
    </>
  );
}
