import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/* Cada herramienta trae sus estilos globales (body, button, .panel, variables --bg/--accent…) y chocarían
   entre sí. Este paso los encierra en el contenedor de su herramienta: «.forja X», «.imperia X», y lo que
   iba a :root, html o body pasa al propio contenedor. Los archivos CSS se quedan tal cual. */
const AMBITOS = [
  [path.resolve(import.meta.dirname, 'src/forja') + path.sep, '.forja'],
  [path.resolve(import.meta.dirname, 'src/styles.css'), '.imperia'],
];

function ambitoCss() {
  const encerrar = (sel, ambito) => {
    const s = sel.trim();
    const raiz = s.match(/^(:root|html|body)(?![\w-])/);
    if (raiz) return ambito + s.slice(raiz[0].length);
    return `${ambito} ${s}`;
  };
  return {
    postcssPlugin: 'ambito-css',
    Once(root) {
      const archivo = path.resolve(root.source?.input.file ?? '');
      const ambito = AMBITOS.find(([ruta]) => archivo === ruta || archivo.startsWith(ruta))?.[1];
      if (!ambito) return;
      root.walkRules((regla) => {
        if (regla.parent?.type === 'atrule' && /keyframes$/i.test(regla.parent.name)) return;
        regla.selectors = regla.selectors.map((s) => encerrar(s, ambito));
      });
    },
  };
}
ambitoCss.postcss = true;

/* The AI runs much faster on all the processor's cores, but the browser only lets WebAssembly use several
   threads on a cross-origin isolated page: these two headers make it so. «credentialless» keeps loading the
   fonts and the AI models from other sites working. */
const AISLADA = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };

export default defineConfig({
  plugins: [react()],
  base: './',
  css: { postcss: { plugins: [ambitoCss()] } },
  // El puerto de Forja de sprites: el navegador guarda «Mis diseños» y las preferencias por dirección
  // (origen), así que con otro puerto aparecerían vacíos.
  server: { port: 5173, strictPort: true, headers: AISLADA },
  preview: { port: 5173, strictPort: true, headers: AISLADA },
});
