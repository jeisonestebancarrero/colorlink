import { supabase } from '../lib/supabase';

/**
 * Sedes: las permitidas de cada usuario interno y su asignación.
 *
 * DOS COSAS DISTINTAS, y confundirlas es el error clásico:
 *
 *   * SEDES PERMITIDAS — frontera de SEGURIDAD. La aplica RLS en la base
 *     (`puede_ver_sede`, ver la migración 20260902100014). Lo que no está
 *     permitido no se puede leer ni escribir, mande el navegador lo que mande.
 *   * SEDE ACTIVA — comodidad de PANTALLA. La elige la persona en el selector
 *     de la cabecera y solo acota lo que está mirando, DENTRO de lo permitido.
 *     Vive en el navegador. No es un control de acceso.
 *
 * Por eso este servicio no "aplica" ningún filtro de seguridad: solo pregunta
 * qué tiene permitido para poder ofrecerlo en el selector.
 */

export interface SedePermitida {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string;
  /**
   * Referencia estable ('store-med-poblado') con la que `imagenPunto()`
   * encuentra la foto del punto. Se usa esa y no el uuid porque el uuid cambia
   * con cada siembra de la base y dejaría las tarjetas sin imagen.
   */
  externalRef: string | null;
  /** Foto subida desde el portal. Tiene prioridad sobre la del proyecto. */
  imageUrl: string | null;
}

export interface AsignacionDeUsuario {
  userId: string;
  /** Vacío = sin restricción: ve todas las sedes. */
  locationIds: string[];
  restringido: boolean;
}

function fallo(contexto: string, mensaje: string): Error {
  console.error(`[sedes] ${contexto}:`, mensaje);
  if (/row-level security|permission denied/i.test(mensaje)) {
    return new Error('No tienes permiso para cambiar las sedes de un usuario.');
  }
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

export const sedesService = {
  /**
   * Sedes que quien pregunta puede ver.
   *
   * Se resuelve en el servidor con `sedes_permitidas()`: si el listado se
   * armara en el navegador filtrando `pickup_locations`, bastaría cambiar el
   * filtro para ofrecerse una sede ajena —aunque RLS la seguiría negando, la
   * pantalla mentiría—.
   */
  async permitidas(): Promise<SedePermitida[]> {
    const { data: ids, error } = await supabase.rpc('sedes_permitidas');
    if (error) throw fallo('permitidas', error.message);

    const lista = ((ids ?? []) as Array<string | { sedes_permitidas: string }>)
      .map((x) => (typeof x === 'string' ? x : x.sedes_permitidas));
    if (lista.length === 0) return [];

    const { data, error: e2 } = await supabase
      .from('pickup_locations')
      .select('id, name, city, address, external_ref, image_url')
      .in('id', lista)
      .order('name');
    if (e2) throw fallo('permitidas/detalle', e2.message);

    return ((data ?? []) as Array<{
      id: string; name: string; city: string; address: string;
      external_ref: string | null; image_url: string | null;
    }>).map((p) => ({
      id: p.id, nombre: p.name, ciudad: p.city, direccion: p.address,
      externalRef: p.external_ref, imageUrl: p.image_url,
    }));
  },

  /** ¿Está este usuario restringido a algunas sedes, o ve todas? */
  async estoyRestringido(): Promise<boolean> {
    const { data, error } = await supabase.rpc('tiene_sedes_restringidas');
    if (error) {
      console.warn('[sedes] estoyRestringido:', error.message);
      return false;
    }
    return data === true;
  },

  // ----------------------------------------------------------
  // Administración: exige `users.manage`
  // ----------------------------------------------------------

  /** Todas las sedes activas, para la pantalla de asignación. */
  async todas(): Promise<SedePermitida[]> {
    const { data, error } = await supabase
      .from('pickup_locations')
      .select('id, name, city, address, external_ref, image_url')
      .eq('status', 'ACTIVO')
      .order('name');
    if (error) throw fallo('todas', error.message);
    return ((data ?? []) as Array<{
      id: string; name: string; city: string; address: string;
      external_ref: string | null; image_url: string | null;
    }>).map((p) => ({
      id: p.id, nombre: p.name, ciudad: p.city, direccion: p.address,
      externalRef: p.external_ref, imageUrl: p.image_url,
    }));
  },

  /** Asignación actual de varios usuarios, para pintar la lista de personal. */
  async asignacionesDe(userIds: string[]): Promise<Map<string, string[]>> {
    if (userIds.length === 0) return new Map();
    const { data, error } = await supabase
      .from('user_pickup_locations')
      .select('user_id, location_id')
      .in('user_id', userIds);
    if (error) throw fallo('asignacionesDe', error.message);

    const m = new Map<string, string[]>();
    for (const f of (data ?? []) as Array<{ user_id: string; location_id: string }>) {
      m.set(f.user_id, [...(m.get(f.user_id) ?? []), f.location_id]);
    }
    return m;
  },

  /**
   * Fija las sedes de un usuario. Una lista VACÍA lo deja sin restricción, es
   * decir viendo todas: es el estado por defecto y hay que poder volver a él.
   *
   * Se borra y se inserta en lugar de calcular diferencias: son pocas filas y
   * el resultado es exactamente el que se pidió, sin estados intermedios raros.
   */
  async fijar(userId: string, locationIds: string[]): Promise<void> {
    const { error: eBorrar } = await supabase
      .from('user_pickup_locations').delete().eq('user_id', userId);
    if (eBorrar) throw fallo('fijar/borrar', eBorrar.message);

    if (locationIds.length === 0) return;

    const { error } = await supabase
      .from('user_pickup_locations')
      .insert(locationIds.map((location_id) => ({ user_id: userId, location_id })));
    if (error) throw fallo('fijar/insertar', error.message);
  },
};
