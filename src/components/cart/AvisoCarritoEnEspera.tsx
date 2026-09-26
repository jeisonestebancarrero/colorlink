import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { leerLineas, leerIntencion } from '../../services/carritoInvitado';

/** Avisa en acceso/registro que el carrito armado sin cuenta sigue guardado (lee localStorage, sin red). */
export const AvisoCarritoEnEspera: React.FC = () => {
  const lineas = leerLineas();
  if (lineas.length === 0) return null;

  const unidades = lineas.reduce((suma, l) => suma + l.quantity, 0);
  const intencion = leerIntencion();

  return (
    <div className="mt-5 p-3.5 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5">
      <ShoppingCart className="w-4 h-4 text-[#004F9F] shrink-0 mt-0.5" />
      <div className="text-xs leading-snug">
        <p className="font-bold text-slate-900">
          Tu carrito con {unidades} {unidades === 1 ? 'producto' : 'productos'} te
          espera.
        </p>
        <p className="text-slate-600 mt-0.5">
          {intencion === 'cotizacion'
            ? 'Al entrar lo recuperamos y podrás descargar tu cotización formal.'
            : 'Al entrar lo recuperamos y podrás confirmar tu pedido.'}
        </p>
      </div>
    </div>
  );
};
