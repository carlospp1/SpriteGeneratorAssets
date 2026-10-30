/* Forja comparte la página con otras herramientas: mientras no es la que se ve, sus atajos de teclado y el
   pegado de imágenes (que escuchan en todo el documento) no deben hacer nada. */
let activa = true;
export const forjaActiva = () => activa;
export const setForjaActiva = (v) => { activa = v; };
