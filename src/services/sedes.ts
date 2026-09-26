import { supabase } from '../lib/supabase';

/**
 * Sedes permitidas (frontera de seguridad, aplicada por RLS con `puede_ver_sede`)
 * frente a sede activa (filtro de pantalla en el navegador). Aquí solo se consulta.
 */

export interface SedePermitida {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string;
  /** Referencia estable para `imagenPunto()`; el uuid cambia con cada siembra. */
  externalRef: string | null;
  /** Foto subida desde el portal; tiene prioridad sobre la del proyecto. */
  imageUrl: string | null;
}

export interface AsignacionDeUsuario {
  userId: string;
  /** Vacío = sin restricción. */
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
  /** Se resuelve con `sedes_permitidas()` en el servidor para que el selector no ofrezca sedes ajenas. */
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

  /** Si el usuario está restringido a algunas sedes. */
  async estoyRestringido(): Promise<boolean> {
    const { data, error } = await supabase.rpc('tiene_sedes_restringidas');
    if (error) {
      console.warn('[sedes] estoyRestringido:', error.message);
      return false;
    }
    return data === true;
  },

  // Administración: exige `users.manage`

  /** Sedes activas para la pantalla de asignación. */
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

  /** Asignación actual de varios usuarios. */
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

  /** Lista vacía = sin restricción. Se borra y reinserta: son pocas filas. */
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
