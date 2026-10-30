/** Botón que abre el selector de archivos y entrega el archivo elegido. */
export default function BotonArchivo({ children, accept = 'image/*', etiqueta, onArchivo }) {
  return (
    <label className="btn ghost archivo">
      {children}
      <input
        type="file"
        accept={accept}
        aria-label={etiqueta}
        onChange={(e) => {
          const archivo = e.target.files[0];
          e.target.value = ''; // permite volver a elegir el mismo archivo
          if (archivo) onArchivo(archivo);
        }}
      />
    </label>
  );
}
