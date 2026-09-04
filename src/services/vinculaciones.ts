import { supabase } from '../lib/supabase';

/**
 * Solicitudes de vinculación de un empleado a la cuenta empresarial.
 *
 * EL CASO: el jefe de compras de una constructora se registra hoy y queda como
 * OWNER de la empresa. Mañana se registra el residente de obra con el MISMO
 * NIT. El alta no lo vincula sola —bastaría acertar un NIT para entrar a ver
 * los proyectos y los precios de un tercero—, así que deja una solicitud que
 * el dueño de esa cuenta aprueba o rechaza.
 *
 * Hasta ahora esa solicitud no tenía dónde resolverse: `resolve_join_request`
 * llevaba desde el 30 de agosto en la base con cero usos y el solicitante se
 * quedaba esperando en silencio.
 *
 * QUIÉN DECIDE lo resuelve el servidor, no este archivo: el listado sale de
 * `solicitudes_de_vinculacion()`, que aplica la misma guarda que la función de
 * resolver. Si aquí se pidiera la tabla directamente, el dueño vería la fila
 * pero NO el nombre de quien pide —`profiles` no se deja leer por alguien que
 * todavía no es de la empresa— y estaría aprobando un uuid a ciegas.
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
  /** El NIT tal como lo escribió quien se registró. */
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

  // La base habla en códigos; aquí se traduce a lo que la persona tiene que
  // entender y hacer (MÓDULO 44).
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
  /**
   * Las que quien pregunta puede resolver. Devuelve vacío —no un error— para
   * quien no administra ninguna empresa: la pantalla que la usa simplemente no
   * se dibuja, y no hay por qué contarle a nadie que la función existe.
   */
  async listar(): Promise<SolicitudVinculacion[]> {
    const { data, error } = await supabase.rpc('solicitudes_de_vinculacion');
    if (error) throw fallo('listar', error.message);
    return ((data ?? []) as FilaSolicitud[]).map(aSolicitud);
  },

  /**
   * Aprobar vincula a la persona a la empresa (miembro, rol CLIENTE_B2B y su
   * perfil apuntando a la compañía) y le avisa. Rechazar también le avisa: sin
   * respuesta, quien pidió entrar no sabe si lo negaron o si nadie lo ha visto.
   *
   * Las dos cosas quedan en `audit_logs`.
   */
  async resolver(solicitudId: string, aprobar: boolean): Promise<void> {
    const { error } = await supabase.rpc('resolve_join_request', {
      _request_id: solicitudId,
      _aprobar: aprobar,
    });
    if (error) throw fallo('resolver', error.message);
  },

  /**
   * Devuelve una solicitud rechazada a pendiente.
   *
   * Rechazar era un callejón sin salida: la solicitud solo la crea el alta, así
   * que a quien se rechazara por error había que vincularlo entrando a la base.
   * Se reabre la MISMA fila —conserva su fecha y su historia— en lugar de crear
   * una nueva, para que quien vuelva a decidir vea que ya hubo un rechazo.
   */
  async reabrir(solicitudId: string): Promise<void> {
    const { error } = await supabase.rpc('reabrir_join_request', {
      _request_id: solicitudId,
    });
    if (error) throw fallo('reabrir', error.message);
  },
};
