import React, { useEffect, useState } from 'react';
import { UserPlus, ArrowRight } from 'lucide-react';
import { vinculacionesService } from '../../services/vinculaciones';

/**
 * Aviso en el panel: «alguien está esperando que lo apruebes».
 *
 * La solicitud ya genera una notificación en la campana, pero una campana con
 * veinte avisos de pedidos no comunica que hay una persona bloqueada esperando
 * una decisión que solo este usuario puede tomar. La pantalla para resolverlo
 * vive en el perfil, y a nadie se le ocurre buscar ahí: este aviso es el
 * puente.
 *
 * Se dibuja solo si hay pendientes, así que para el 99% de los clientes no
 * existe.
 */

interface Props {
  onNavigate: (page: string) => void;
}

export const AvisoVinculaciones: React.FC<Props> = ({ onNavigate }) => {
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    let vigente = true;
    vinculacionesService.listar()
      .then((lista) => {
        if (vigente) setPendientes(lista.filter((s) => s.estado === 'PENDIENTE').length);
      })
      // Silencioso a propósito: es un aviso accesorio. Si falla, el bloque del
      // perfil sigue siendo la vía buena y ahí sí se muestra el error.
      .catch(() => undefined);
    return () => { vigente = false; };
  }, []);

  if (pendientes === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <UserPlus className="w-4 h-4 text-amber-700" />
        </div>
        <div>
          <p className="text-sm font-extrabold text-amber-900">
            {pendientes === 1
              ? 'Una persona pide unirse a tu cuenta empresarial'
              : `${pendientes} personas piden unirse a tu cuenta empresarial`}
          </p>
          <p className="text-xs text-amber-800">
            Hasta que la apruebes no ve los proyectos ni los precios de tu empresa.
          </p>
        </div>
      </div>
      <button
        onClick={() => onNavigate('profile')}
        className="shrink-0 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
      >
        Revisar solicitud{pendientes === 1 ? '' : 'es'}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
