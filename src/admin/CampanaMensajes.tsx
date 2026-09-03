import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useMensajes } from '../context/MensajesContext';

/**
 * Campana de mensajes del portal interno.
 *
 * Usa las MISMAS funciones de base que la de la tienda: el criterio de acceso
 * está dentro, así que al personal le cuenta lo de todos los pedidos que puede
 * atender —incluidas las notas internas, que el cliente ni ve— y al cliente lo
 * suyo. No hacía falta una segunda implementación.
 *
 * El número no baja al desplegar la lista: solo al abrir la conversación, que
 * es lo que hace el `Chatter` del pedido. Mirar no es atender.
 */
export const CampanaMensajes: React.FC<{
  /** Lleva al pedido, donde está el hilo. */
  onAbrirPedido: (numero: string) => void;
  /** `barra` para la cabecera del tablero, `lateral` para la barra azul. */
  variante?: 'barra' | 'lateral';
}> = ({ onAbrirPedido, variante = 'barra' }) => {
  const { conversaciones, total } = useMensajes();
  const [abierto, setAbierto] = useState(false);

  const enAzul = variante === 'barra';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={total > 0 ? `Mensajes: ${total} sin leer` : 'Mensajes'}
        className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
          enAzul
            ? 'text-blue-100 hover:text-white hover:bg-white/10'
            : 'text-blue-100/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <MessageSquare className="w-5 h-5" />
        {total > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 bg-amber-400 text-slate-950
                           text-[10px] font-black rounded-full flex items-center justify-center
                           ring-2 ring-[#002D5C]">
            {/* Por encima de nueve el número deja de importar y no cabe. */}
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {abierto && (
        <>
          {/* Capa para cerrar al pulsar fuera. */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl
                          border border-slate-200 py-2 z-50 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100">
              <h3 className="text-xs font-extrabold text-slate-900">Mensajes de clientes</h3>
              <p className="text-[10px] text-slate-500">
                {total > 0
                  ? 'Se marcan leídos al abrir la conversación'
                  : 'No hay nada sin responder'}
              </p>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {conversaciones.length === 0 ? (
                <p className="text-center py-6 text-xs text-slate-400">
                  Sin mensajes pendientes
                </p>
              ) : (
                conversaciones.map((c) => (
                  <button
                    key={c.orderId}
                    onClick={() => { setAbierto(false); onAbrirPedido(c.numero); }}
                    className="w-full p-3 text-left hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0 min-w-5 h-5 px-1.5 bg-[#004F9F] text-white
                                       text-[10px] font-black rounded-full flex items-center justify-center">
                        {c.sinLeer}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-slate-800">{c.numero}</span>
                        <span className="block text-[11px] text-slate-600 leading-snug line-clamp-2">
                          {c.ultimo}
                        </span>
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
