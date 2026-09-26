import { supabase } from '../lib/supabase';

/**
 * Clientes empresa desde el portal interno: sedes y direcciones de sus usuarios.
 * Los permisos los aplica la base (`users.manage` escribe sedes, `orders.read` solo
 * lee direcciones); aquí solo se consulta para no ofrecer botones que fallarán.
 */

export interface ClienteEmpresa {
  id: string;
  name: string;
  nit: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  sedes: number;
  miembros: number;
  /** Normalmente null. */
  logoUrl: string | null;
}

/** Cliente persona natural (maestro de obra, pintor, arquitecto). */
export interface ClientePersona {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  ciudad: string | null;
  tipoDocumento: string | null;
  documento: string | null;
  /** `client_type`: Constructor, Profesional, Particular, Empresa. */
  segmento: string | null;
  fotoUrl: string | null;
  estado: string;
  pedidos: number;
  creado: string;
}

export interface DireccionDeCliente {
  id: string;
  label: string;
  addressLine: string;
  municipalityName: string;
  departmentName: string;
  neighborhoodName: string | null;
  notes: string | null;
  isDefault: boolean;
  usuario: string;
}

export interface FichaPersona {
  id: string;
  firstName: string;
  lastName: string;
  /** Solo lectura: cambiarlo lo desincronizaría de la cuenta de acceso. */
  email: string;
  phone: string;
  address: string;
  city: string;
  clientType: string;
  documentType: string;
  documentNumber: string;
  countryCode: string;
  municipalityCode: string;
  neighborhoodId: string | null;
  avatarUrl: string | null;
  status: string;
}

export interface FichaEmpresa {
  id: string;
  name: string;
  legalName: string;
  nit: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  countryCode: string;
  municipalityCode: string;
  neighborhoodId: string | null;
  logoUrl: string | null;
  status: string;
}

/** Resultado de guardar: qué cambió y a cuántos se avisó. */
export interface Resultado {
  cambios: number;
  aviso: boolean;
  avisados: number;
  detalle: string[];
}

function leerResultado(data: unknown): Resultado {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    cambios: Number(d.cambios ?? 0),
    aviso: d.aviso === true,
    avisados: Number(d.avisados ?? (d.aviso === true ? 1 : 0)),
    detalle: Array.isArray(d.detalle) ? (d.detalle as string[]) : [],
  };
}

function fallo(contexto: string, mensaje: string): Error {
  console.error(`[clientes-admin] ${contexto}:`, mensaje);
  if (/FORBIDDEN/.test(mensaje)) {
    return new Error(
      'No tienes permiso para editar clientes. Se necesita «users.manage», '
      + 'que se concede desde Permisos.',
    );
  }
  if (/ES_PERSONAL/.test(mensaje)) {
    return new Error('Esa cuenta es del personal interno: edítala en Usuarios.');
  }
  if (/NOT_FOUND/.test(mensaje)) {
    return new Error('Ese cliente ya no existe.');
  }
  if (/row-level security|permission denied/i.test(mensaje)) {
    return new Error('No tienes permiso para esta operación.');
  }
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

export const clientesAdminService = {
  /** Empresas cliente con su número de sedes y usuarios. */
  async listarEmpresas(busqueda = ''): Promise<ClienteEmpresa[]> {
    let q = supabase
      .from('companies')
      .select('id, name, nit, city, phone, email, status, logo_url')
      .order('name');

    if (busqueda.trim()) {
      // Nombre y NIT están normalizados en la base: `ilike` ignora la caja y el NIT se limpia antes.
      const t = busqueda.trim();
      const nit = t.replace(/[^0-9A-Za-z-]/g, '');
      q = q.or(`name.ilike.%${t}%,nit.ilike.%${nit}%`);
    }

    const { data, error } = await q;
    if (error) throw fallo('listarEmpresas', error.message);

    const empresas = (data ?? []) as Array<{
      id: string; name: string; nit: string | null; city: string | null;
      phone: string | null; email: string | null; status: string;
      logo_url: string | null;
    }>;
    if (empresas.length === 0) return [];

    const ids = empresas.map((e) => e.id);
    const [sedes, miembros] = await Promise.all([
      supabase.from('company_branches')
        .select('company_id').in('company_id', ids).eq('status', 'ACTIVO'),
      supabase.from('company_members')
        .select('company_id').in('company_id', ids).eq('status', 'ACTIVO'),
    ]);

    const contar = (filas: Array<{ company_id: string }> | null) => {
      const m = new Map<string, number>();
      for (const f of filas ?? []) m.set(f.company_id, (m.get(f.company_id) ?? 0) + 1);
      return m;
    };
    const porSedes = contar(sedes.data as Array<{ company_id: string }> | null);
    const porMiembros = contar(miembros.data as Array<{ company_id: string }> | null);

    return empresas.map((e) => ({
      ...e,
      logoUrl: e.logo_url,
      sedes: porSedes.get(e.id) ?? 0,
      miembros: porMiembros.get(e.id) ?? 0,
    }));
  },

  /**
   * Vía `clientes_personas_naturales` porque distinguir cliente de empleado exige leer
   * `user_roles`, restringido por RLS; la función exige `is_staff()`.
   */
  async listarPersonas(busqueda = ''): Promise<ClientePersona[]> {
    const { data, error } = await supabase.rpc('clientes_personas_naturales', {
      _busqueda: busqueda.trim() || null,
    });
    if (error) throw fallo('listarPersonas', error.message);

    return ((data ?? []) as Array<Record<string, unknown>>).map((f) => ({
      id: String(f.id),
      // Un perfil recién creado puede no tener nombre.
      nombre: (f.nombre as string) ?? '',
      correo: (f.correo as string) ?? null,
      telefono: (f.telefono as string) ?? null,
      ciudad: (f.ciudad as string) ?? null,
      tipoDocumento: (f.tipo_documento as string) ?? null,
      documento: (f.documento as string) ?? null,
      segmento: (f.segmento as string) ?? null,
      fotoUrl: (f.foto_url as string) ?? null,
      estado: (f.estado as string) ?? 'ACTIVO',
      pedidos: Number(f.pedidos ?? 0),
      creado: String(f.creado ?? ''),
    }));
  },

  /** Datos completos de una persona para el formulario. */
  async fichaPersona(userId: string): Promise<FichaPersona | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone, address, city, client_type, '
        + 'document_type, document_number, country_code, municipality_code, '
        + 'neighborhood_id, avatar_url, status')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw fallo('fichaPersona', error.message);
    if (!data) return null;
    const f = data as unknown as Record<string, unknown>;
    return {
      id: String(f.id),
      firstName: (f.first_name as string) ?? '',
      lastName: (f.last_name as string) ?? '',
      email: (f.email as string) ?? '',
      phone: (f.phone as string) ?? '',
      address: (f.address as string) ?? '',
      city: (f.city as string) ?? '',
      clientType: (f.client_type as string) ?? '',
      documentType: (f.document_type as string) ?? '',
      documentNumber: (f.document_number as string) ?? '',
      countryCode: (f.country_code as string) ?? 'CO',
      municipalityCode: (f.municipality_code as string) ?? '',
      neighborhoodId: (f.neighborhood_id as string) ?? null,
      avatarUrl: (f.avatar_url as string) ?? null,
      status: (f.status as string) ?? 'ACTIVO',
    };
  },

  /** Datos completos de una empresa. */
  async fichaEmpresa(companyId: string): Promise<FichaEmpresa | null> {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, legal_name, nit, phone, email, address, city, '
        + 'country_code, municipality_code, neighborhood_id, logo_url, status')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw fallo('fichaEmpresa', error.message);
    if (!data) return null;
    const f = data as unknown as Record<string, unknown>;
    return {
      id: String(f.id),
      name: (f.name as string) ?? '',
      legalName: (f.legal_name as string) ?? '',
      nit: (f.nit as string) ?? '',
      phone: (f.phone as string) ?? '',
      email: (f.email as string) ?? '',
      address: (f.address as string) ?? '',
      city: (f.city as string) ?? '',
      countryCode: (f.country_code as string) ?? 'CO',
      municipalityCode: (f.municipality_code as string) ?? '',
      neighborhoodId: (f.neighborhood_id as string) ?? null,
      logoUrl: (f.logo_url as string) ?? null,
      status: (f.status as string) ?? 'ACTIVO',
    };
  },

  /** El aviso al cliente lo inserta la función de base en la misma transacción, no el navegador. */
  async actualizarPersona(userId: string, datos: Record<string, unknown>): Promise<Resultado> {
    const { data, error } = await supabase.rpc('actualizar_cliente_persona', {
      _user_id: userId, _datos: datos,
    });
    if (error) throw fallo('actualizarPersona', error.message);
    return leerResultado(data);
  },

  async actualizarEmpresa(companyId: string, datos: Record<string, unknown>): Promise<Resultado> {
    const { data, error } = await supabase.rpc('actualizar_cliente_empresa', {
      _company_id: companyId, _datos: datos,
    });
    if (error) throw fallo('actualizarEmpresa', error.message);
    return leerResultado(data);
  },

  /** Solo lectura: `customer_addresses` no tiene política de escritura interna. */
  async direccionesDeEmpresa(companyId: string): Promise<DireccionDeCliente[]> {
    const { data: perfiles, error: e1 } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('company_id', companyId);
    if (e1) throw fallo('direccionesDeEmpresa/perfiles', e1.message);

    const usuarios = (perfiles ?? []) as Array<{
      id: string; first_name: string; last_name: string; email: string;
    }>;
    if (usuarios.length === 0) return [];

    const { data, error } = await supabase
      .from('customer_addresses')
      .select(
        `id, user_id, label, address_line, notes, is_default,
         municipalities ( name, departments ( name ) ), neighborhoods ( name )`
      )
      .in('user_id', usuarios.map((u) => u.id))
      .order('is_default', { ascending: false });
    if (error) throw fallo('direccionesDeEmpresa', error.message);

    const nombre = new Map(usuarios.map((u) => [
      u.id,
      `${u.first_name} ${u.last_name}`.trim() || u.email,
    ]));

    return ((data ?? []) as unknown as Array<{
      id: string; user_id: string; label: string; address_line: string;
      notes: string | null; is_default: boolean;
      municipalities: { name: string; departments: { name: string } | null } | null;
      neighborhoods: { name: string } | null;
    }>).map((f) => ({
      id: f.id,
      label: f.label,
      addressLine: f.address_line,
      municipalityName: f.municipalities?.name ?? '',
      departmentName: f.municipalities?.departments?.name ?? '',
      neighborhoodName: f.neighborhoods?.name ?? null,
      notes: f.notes,
      isDefault: f.is_default,
      usuario: nombre.get(f.user_id) ?? '—',
    }));
  },

  /** Lo decide el permiso `users.manage`. */
  async puedoEditarSedes(): Promise<boolean> {
    const { data, error } = await supabase.rpc('has_permission', {
      _code: 'users.manage',
    });
    if (error) {
      console.warn('[clientes-admin] puedoEditarSedes:', error.message);
      return false;
    }
    return data === true;
  },
};
