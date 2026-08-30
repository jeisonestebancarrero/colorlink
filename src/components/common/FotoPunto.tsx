import React, { useState } from 'react';
import { Store } from 'lucide-react';
import { FONDO_MARCA, imagenPunto } from '../../assets/puntosVenta';

/**
 * Imagen de un punto de venta.
 *
 * La imagen es de la CIUDAD o del sector, no del local: sirve para ubicar de
 * un vistazo, no para reconocer la fachada. Por eso lleva el nombre de la
 * ciudad encima y nunca se presenta como «así se ve la tienda».
 *
 * Si el archivo falla al cargar, cae al fondo de marca en lugar de dejar el
 * hueco roto del navegador, que es lo peor que puede pasarle a una tarjeta.
 */
export const FotoPunto: React.FC<{
  referencia?: string | null;
  urlRemota?: string | null;
  ciudad?: string;
  className?: string;
  alto?: string;
}> = ({ referencia, urlRemota, ciudad, className = '', alto = 'h-28' }) => {
  const [fallo, setFallo] = useState(false);
  const { src, esFoto } = imagenPunto(referencia, urlRemota);
  const usaFondo = fallo || !esFoto;

  return (
    <div className={`relative overflow-hidden bg-[#00306B] ${alto} ${className}`}>
      <img
        src={fallo ? FONDO_MARCA : src}
        alt={ciudad ? `Vista de ${ciudad}` : 'Punto de venta Pintuco'}
        loading="lazy"
        onError={() => setFallo(true)}
        className={
          usaFondo
            ? 'w-full h-full object-contain p-3'
            : 'w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
        }
      />

      {!usaFondo && (
        <>
          {/* El degradado no es decoración: sin él la etiqueta blanca se
              pierde sobre las zonas claras de la foto. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-linear-to-t from-slate-900/75 via-slate-900/10 to-transparent"
          />
          {ciudad && (
            <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-white drop-shadow">
              <Store className="w-3.5 h-3.5" />
              {ciudad}
            </span>
          )}
        </>
      )}
    </div>
  );
};
