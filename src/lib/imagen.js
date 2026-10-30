import { ancho, alto } from './sprites';

export function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = src;
  });
}

function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function imagenDesdeArchivo(file) {
  return cargarImagen(await leerArchivo(file));
}

/** Rectángulo del personaje en px de lienzo: (x, y) es el centro de sus pies. */
export function rectPersonaje({ img, x, y, zoom }) {
  const w = ancho(img) * zoom;
  const h = alto(img) * zoom;
  return { x: x - w / 2, y: y - h, w, h };
}
