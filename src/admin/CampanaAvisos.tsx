import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { avisoInternoService, type AvisoInterno } from '../services/backoffice';

/**
 * Campana de avisos del portal interno.
 *
 * Va SEPARADA de la de mensajes, igual que en la tienda: un aviso se lee y se
 * archiva —«te asignaron una obra»—, un mensaje espera respuesta. Mezclarlos
 * haría que una asignación tapara una pregunta de un cliente sin contestar.
 *
 * Estos avisos existían desde siempre en `notifications` con destinatarios
 * internos —`assign_to_project` avisa a quien se asigna una obra,
 * `handle_new_user` a quien administra una empresa— pero el portal no los
 * mostraba en ninguna parte: llegaban a la base y nadie los veía.
 *
 * Aquí sí se marca leído al ABRIR el aviso, no al desplegar la lista: es una
 * notificación individual, no una conversación, y quedarían todas marcadas de
 * una pasada solo por mirar el número.
 */
export const CampanaAvisos: React.FC<{
  /** Para llevar a la obra o al pedido del que habla el aviso. */
  onIr?: (ruta: string, id?: string) => void;
}> = ({ onIr }) => {
  const [avisos, setAvisos] = useState<AvisoInterno[]>([]);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setAvisos(await avisoInternoService.listar());
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  /* La campana muestra PENDIENTES, no historial: con los leídos dentro, el
     aviso nuevo se pierde entre los ya atendidos y se deja de abrir. */
  const pendientes = avisos.filter((a) => !a.leido);
  const sinLeer = pendientes.length;

  const abrirAviso = async (a: AvisoInterno) => {
    setAbierto(false);
    if (!a.leido) {
      await avisoInternoService.marcarLeido(a.id);
      setAvisos((lista) => lista.map((x) => (x.id === a.id ? { ...x, leido: true } : x)));
    }
    if (a.projectId) onIr?.('/proyectos', a.projectId);
  };

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={sinLeer > 0 ? `Avisos: ${sinLeer} sin leer` : 'Avisos'}
        className="relative p-2 rounded-lg text-blue-100/80 hover:text-white hover:bg-white/10
                   transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {sinLeer > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 bg-rose-500 text-white
                           text-[10px] font-black rounded-full flex items-center justify-center
                           ring-2 ring-[#002D5C]">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl
                          border border-slate-200 py-2 z-50 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold text-slate-900">Avisos</h3>
              {sinLeer > 0 && (
                <button
                  onClick={async () => {
                    await avisoInternoService.marcarTodosLeidos();
                    setAvisos((l) => l.map((x) => ({ ...x, leido: true })));
                  }}
                  className="text-[11px] text-[#004F9F] font-bold hover:underline cursor-pointer"
                >
                  Marcar leídos
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {pendientes.length === 0 ? (
                <p className="text-center py-6 text-xs text-slate-400">
                  {avisos.length > 0 ? 'Estás al día.' : 'No tienes avisos'}
                </p>
              ) : (
                pendientes.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => void abrirAviso(a)}
                    className="w-full p-3 text-left hover:bg-slate-50 cursor-pointer
                               transition-colors bg-blue-50/40"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-[#004F9F]" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-slate-800">{a.titulo}</span>
                        <span className="block text-[11px] text-slate-600 leading-snug line-clamp-2">
                          {a.mensaje}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          {fecha(a.creadoEn)}
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
