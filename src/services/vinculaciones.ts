import { supabase } from '../lib/supabase';

/**
 * Solicitudes para vincular un empleado a una empresa ya registrada con su NIT; el
 * dueño las aprueba. Se listan con `solicitudes_de_vinculacion()` porque RLS
 * impide leer el perfil de quien aún no es de la empresa.
 */

export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface SolicitudVinculacion {
  id: string;
  companyId: string;
  empresa: string;
  empresaNit: string | null;
  solicitanteId: string;
  /** Puede venir vacío: el alta con Google a veces solo trae el correo. */
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  ciudad: string | null;
  /** NIT tal como lo escribió el solicitante. */
  nitEscrito: string | null;
  estado: EstadoSolicitud;
  creada: string;
  resuelta: string | null;
  resueltaPor: string | null;
}

interface FilaSolicitud {
  id: string;
  company_id: string;
  empresa: string;
  empresa_nit: string | null;
  solicitante: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  ciudad: string | null;
  nit_escrito: string | null;
  estado: EstadoSolicitud;
  creada: string;
  resuelta: string | null;
  resuelta_por: string | null;
}

function fallo(contexto: string, mensaje: string): Error {
  console.error(`[vinculaciones] ${contexto}:`, mensaje);

  // Traduce los códigos de la base a mensajes accionables.
  if (/ALREADY_RESOLVED/i.test(mensaje)) {
    return new Error('Esta solicitud ya fue resuelta. Actualiza la lista para ver cómo quedó.');
  }
  if (/ALREADY_MEMBER/i.test(mensaje)) {
    return new Error('Esta persona ya hace parte de la empresa.');
  }
  if (/ALREADY_PENDING/i.test(mensaje)) {
    return new Error('Esta persona ya tiene una solicitud pendiente.');
  }
  if (/NOT_REJECTED/i.test(mensaje)) {
    return new Error('Solo se puede reabrir una solicitud rechazada.');
  }
  if (/REQUEST_NOT_FOUND/i.test(mensaje)) {
    return new Error('La solicitud ya no existe.');
  }
  if (/FORBIDDEN|permission denied|row-level security/i.test(mensaje)) {
    return new Error('No tienes permiso para resolver solicitudes de esta empresa.');
  }
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

function aSolicitud(f: FilaSolicitud): SolicitudVinculacion {
  return {
    id: f.id,
    companyId: f.company_id,
    empresa: f.empresa,
    empresaNit: f.empresa_nit,
    solicitanteId: f.solicitante,
    nombre: f.nombre,
    email: f.email,
    telefono: f.telefono,
    ciudad: f.ciudad,
    nitEscrito: f.nit_escrito,
    estado: f.estado,
    creada: f.creada,
    resuelta: f.resuelta,
    resueltaPor: f.resuelta_por,
  };
}

export const vinculacionesService = {
  /** Devuelve vacío, no error, para quien no administra ninguna empresa. */
  async listar(): Promise<SolicitudVinculacion[]> {
    const { data, error } = await supabase.rpc('solicitudes_de_vinculacion');
    if (error) throw fallo('listar', error.message);
    return ((data ?? []) as FilaSolicitud[]).map(aSolicitud);
  },

  /** Aprobar vincula (miembro, rol CLIENTE_B2B, perfil) y avisa; rechazar también avisa. Ambos quedan en `audit_logs`. */
  async resolver(solicitudId: string, aprobar: boolean): Promise<void> {
    const { error } = await supabase.rpc('resolve_join_request', {
      _request_id: solicitudId,
      _aprobar: aprobar,
    });
    if (error) throw fallo('resolver', error.message);
  },

  /** Reabre la misma fila rechazada para conservar su historia. */
  async reabrir(solicitudId: string): Promise<void> {
    const { error } = await supabase.rpc('reabrir_join_request', {
      _request_id: solicitudId,
    });
    if (error) throw fallo('reabrir', error.message);
  },
};
