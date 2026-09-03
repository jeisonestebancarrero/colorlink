import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { leerLineas, leerIntencion } from '../../services/carritoInvitado';

/**
 * Aviso en las pantallas de acceso y registro: el carrito que la persona armó
 * sin cuenta sigue ahí y la está esperando.
 *
 * Sin esto, quien llega desde el carrito ve un formulario de acceso sin
 * explicación y no tiene motivo para creer que su compra sobrevivió. Se lee
 * directo del almacén local (no hace falta red ni sesión) y no se muestra nada
 * si no hay nada guardado.
 */
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
