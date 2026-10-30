import { useEffect, useState } from 'react';

/** true cuando las fuentes web han cargado (las medidas de texto cambian en ese momento). */
export function useFuentesListas() {
  const [listas, setListas] = useState(false);
  useEffect(() => {
    let vivo = true;
    document.fonts.ready.then(() => vivo && setListas(true));
    return () => {
      vivo = false;
    };
  }, []);
  return listas;
}
