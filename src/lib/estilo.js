/** Convierte px de lienzo (216×270) a unidades CSS relativas al ancho de la ficha. */
export const u = (n) => `calc(${n} * var(--u))`;

export const posicion = ({ x, y, w, h }) => ({ left: u(x), top: u(y), width: u(w), height: u(h) });
