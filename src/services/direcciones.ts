import { supabase } from '../lib/supabase';

/**
 * Direcciones del cliente y sedes de la empresa.
 *
 * Son dos cosas distintas a propósito. Una constructora despacha a la obra
 * —una dirección suelta que puede cambiar cada mes— o a una de sus sedes, que
 * son fijas y las administra la empresa. Meterlas en la misma tabla obligaría
 * a elegir una sola de las dos formas de despachar.
 *
 * Nada de esto se lee sin sesión: la dirección de una persona es dato
 * personal, y `carts`/`customer_addresses` niegan el acceso anónimo.
 */

export interface DireccionCliente {
  id: string;
  label: string;
  addressLine: string;
  municipalityCode: string;
  municipalityName: string;
  departmentName: string;
  neighborhoodName: string | null;
  neighborhoodId: string | null;
  notes: string | null;
  isDefault: boolean;
}

export interface SedeEmpresa {
  id: string;
  name: string;
  addressLine: string;
  municipalityCode: string;
  municipalityName: string;
  departmentName: string;
  neighborhoodName: string | null;
  neighborhoodId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  isDefault: boolean;
}

/** Un solo `select` para las dos: la ciudad y el barrio vienen del diccionario. */
const SELECT_UBIC =
  'municipalities ( name, departments ( name ) ), neighborhoods ( name )';

interface FilaUbic {
  municipality_code: string;
  neighborhood_id: string | null;
  municipalities: { name: string; departments: { name: string } | null } | null;
  neighborhoods: { name: string } | null;
}

const ubic = (f: FilaUbic) => ({
  municipalityCode: f.municipality_code,
  neighborhoodId: f.neighborhood_id,
  municipalityName: f.municipalities?.name ?? '',
  departmentName: f.municipalities?.departments?.name ?? '',
  neighborhoodName: f.neighborhoods?.name ?? null,
});

function fallo(contexto: string, mensaje: string): Error {
  console.error(`[direcciones] ${contexto}:`, mensaje);
  if (/customer_addresses_linea_no_vacia/.test(mensaje)) {
    return new Error('La dirección es demasiado corta. Escríbela completa.');
  }
  if (/company_branches_nombre_unico/.test(mensaje)) {
    return new Error('Ya tienes una sede con ese nombre.');
  }
  if (/una_principal/.test(mensaje)) {
    return new Error('Ya hay otra marcada como principal.');
  }
  if (/violates row-level security|permission denied/i.test(mensaje)) {
    return new Error('No tienes permiso para hacer ese cambio.');
  }
  return new Error('No fue posible guardar. Inténtalo nuevamente.');
}

export interface DatosDireccion {
  label: string;
  addressLine: string;
  municipalityCode: string;
  neighborhoodId: string | null;
  notes?: string | null;
  isDefault?: boolean;
}

export const direccionService = {
  async listar(): Promise<DireccionCliente[]> {
    const { data, error } = await supabase
      .from('customer_addresses')
      .select(`id, label, address_line, municipality_code, neighborhood_id, notes, is_default, ${SELECT_UBIC}`)
      .order('is_default', { ascending: false })
      .order('label');
    if (error) throw fallo('listar', error.message);

    return ((data ?? []) as unknown as Array<FilaUbic & {
      id: string; label: string; address_line: string;
      notes: string | null; is_default: boolean;
    }>).map((f) => ({
      id: f.id,
      label: f.label,
      addressLine: f.address_line,
      notes: f.notes,
      isDefault: f.is_default,
      ...ubic(f),
    }));
  },

  async crear(datos: DatosDireccion): Promise<DireccionCliente[]> {
    const { data: sesion } = await supabase.auth.getSession();
    const userId = sesion.session?.user?.id;
    if (!userId) throw new Error('Inicia sesión para guardar una dirección.');

    // Marcar esta como principal exige desmarcar la otra: el índice único de
    // la base solo admite una, y el error crudo no le dice nada al cliente.
    if (datos.isDefault) await this.desmarcarPrincipales();

    const { error } = await supabase.from('customer_addresses').insert({
      user_id: userId,
      label: datos.label,
      address_line: datos.addressLine,
      municipality_code: datos.municipalityCode,
      neighborhood_id: datos.neighborhoodId,
      notes: datos.notes ?? null,
      is_default: datos.isDefault ?? false,
    });
    if (error) throw fallo('crear', error.message);
    return this.listar();
  },

  async actualizar(id: string, datos: DatosDireccion): Promise<DireccionCliente[]> {
    if (datos.isDefault) await this.desmarcarPrincipales(id);

    const { error } = await supabase.from('customer_addresses').update({
      label: datos.label,
      address_line: datos.addressLine,
      municipality_code: datos.municipalityCode,
      neighborhood_id: datos.neighborhoodId,
      notes: datos.notes ?? null,
      is_default: datos.isDefault ?? false,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw fallo('actualizar', error.message);
    return this.listar();
  },

  async eliminar(id: string): Promise<DireccionCliente[]> {
    const { error } = await supabase.from('customer_addresses').delete().eq('id', id);
    if (error) throw fallo('eliminar', error.message);
    return this.listar();
  },

  /** Deja sin marca de principal a todas menos la indicada. */
  async desmarcarPrincipales(exceptoId?: string): Promise<void> {
    let q = supabase.from('customer_addresses').update({ is_default: false }).eq('is_default', true);
    if (exceptoId) q = q.neq('id', exceptoId);
    const { error } = await q;
    if (error) throw fallo('desmarcarPrincipales', error.message);
  },
};

export interface DatosSede {
  name: string;
  addressLine: string;
  municipalityCode: string;
  neighborhoodId: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  isDefault?: boolean;
}

export const sedeService = {
  /**
   * Sedes activas de la empresa del usuario.
   *
   * No recibe `company_id`: RLS ya limita las filas a la empresa de quien
   * pregunta. Pasarlo desde el navegador sería darle a elegir de qué empresa
   * lee.
   */
  async listar(): Promise<SedeEmpresa[]> {
    const { data, error } = await supabase
      .from('company_branches')
      .select(
        `id, name, address_line, municipality_code, neighborhood_id, contact_name,
         contact_phone, notes, is_default, ${SELECT_UBIC}`
      )
      .eq('status', 'ACTIVO')
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw fallo('listarSedes', error.message);

    return ((data ?? []) as unknown as Array<FilaUbic & {
      id: string; name: string; address_line: string;
      contact_name: string | null; contact_phone: string | null;
      notes: string | null; is_default: boolean;
    }>).map((f) => ({
      id: f.id,
      name: f.name,
      addressLine: f.address_line,
      contactName: f.contact_name,
      contactPhone: f.contact_phone,
      notes: f.notes,
      isDefault: f.is_default,
      ...ubic(f),
    }));
  },

  /**
   * Sedes de UNA empresa concreta. Para el portal interno.
   *
   * `listar()` no sirve ahí: RLS le deja ver al personal con `users.manage`
   * las sedes de TODOS los clientes, así que sin este filtro la pantalla de un
   * cliente mostraría las sedes de todos mezcladas.
   */
  async listarDeEmpresa(companyId: string): Promise<SedeEmpresa[]> {
    const { data, error } = await supabase
      .from('company_branches')
      .select(
        `id, name, address_line, municipality_code, neighborhood_id, contact_name,
         contact_phone, notes, is_default, ${SELECT_UBIC}`
      )
      .eq('company_id', companyId)
      .eq('status', 'ACTIVO')
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw fallo('listarDeEmpresa', error.message);

    return ((data ?? []) as unknown as Array<FilaUbic & {
      id: string; name: string; address_line: string;
      contact_name: string | null; contact_phone: string | null;
      notes: string | null; is_default: boolean;
    }>).map((f) => ({
      id: f.id,
      name: f.name,
      addressLine: f.address_line,
      contactName: f.contact_name,
      contactPhone: f.contact_phone,
      notes: f.notes,
      isDefault: f.is_default,
      ...ubic(f),
    }));
  },

  async crear(companyId: string, datos: DatosSede): Promise<SedeEmpresa[]> {
    if (datos.isDefault) await this.desmarcarPrincipales();

    const { error } = await supabase.from('company_branches').insert({
      company_id: companyId,
      name: datos.name,
      address_line: datos.addressLine,
      municipality_code: datos.municipalityCode,
      neighborhood_id: datos.neighborhoodId,
      contact_name: datos.contactName ?? null,
      contact_phone: datos.contactPhone ?? null,
      notes: datos.notes ?? null,
      is_default: datos.isDefault ?? false,
    });
    if (error) throw fallo('crearSede', error.message);
    return this.listarDeEmpresa(companyId);
  },

  async actualizar(id: string, datos: DatosSede): Promise<SedeEmpresa[]> {
    if (datos.isDefault) await this.desmarcarPrincipales(id);

    const { error } = await supabase.from('company_branches').update({
      name: datos.name,
      address_line: datos.addressLine,
      municipality_code: datos.municipalityCode,
      neighborhood_id: datos.neighborhoodId,
      contact_name: datos.contactName ?? null,
      contact_phone: datos.contactPhone ?? null,
      notes: datos.notes ?? null,
      is_default: datos.isDefault ?? false,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw fallo('actualizarSede', error.message);
    return this.listar();
  },

  /**
   * Desactivar en lugar de borrar: los pedidos ya despachados apuntan a la
   * sede, y borrarla dejaría esos pedidos sin destino en el histórico.
   */
  async desactivar(id: string): Promise<SedeEmpresa[]> {
    const { error } = await supabase
      .from('company_branches')
      .update({ status: 'INACTIVO', is_default: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw fallo('desactivarSede', error.message);
    return this.listar();
  },

  /**
   * ¿Puede quien pregunta administrar las sedes de su empresa?
   *
   * Lo decide RLS (solo OWNER y ADMIN escriben); esto se consulta para no
   * ofrecerle un botón que el servidor le va a rechazar. No es un control de
   * seguridad: la seguridad está en la política, no en ocultar el botón.
   */
  async puedoAdministrar(): Promise<boolean> {
    const { data: sesion } = await supabase.auth.getSession();
    const userId = sesion.session?.user?.id;
    if (!userId) return false;

    const { data, error } = await supabase
      .from('company_members')
      .select('company_role')
      .eq('user_id', userId)
      .eq('status', 'ACTIVO');
    if (error) {
      console.warn('[direcciones] puedoAdministrar:', error.message);
      return false;
    }
    return ((data ?? []) as Array<{ company_role: string }>)
      .some((m) => m.company_role === 'OWNER' || m.company_role === 'ADMIN');
  },

  async desmarcarPrincipales(exceptoId?: string): Promise<void> {
    let q = supabase.from('company_branches').update({ is_default: false }).eq('is_default', true);
    if (exceptoId) q = q.neq('id', exceptoId);
    const { error } = await q;
    if (error) throw fallo('desmarcarPrincipalesSede', error.message);
  },
};
