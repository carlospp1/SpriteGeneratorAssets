import { FUENTES } from '../data/campos';
import { posicion, u } from '../lib/estilo';
import { INTERLINEADO } from '../lib/texto';

export default function CampoTexto({ campo, texto, color, tamano, onChange }) {
  const { family, weight } = FUENTES[campo.font];
  const style = {
    ...posicion(campo.caja),
    fontFamily: family,
    fontWeight: weight,
    color,
    fontSize: u(tamano),
    lineHeight: campo.multilinea ? u(tamano * INTERLINEADO) : u(campo.caja.h),
  };
  const props = {
    className: 'campo',
    style,
    value: texto,
    placeholder: campo.placeholder,
    maxLength: campo.maxLength,
    'aria-label': campo.etiqueta,
    onChange: (e) => onChange(e.target.value),
  };
  return campo.multilinea ? <textarea rows={2} {...props} /> : <input {...props} />;
}
