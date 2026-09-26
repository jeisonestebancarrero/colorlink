import { supabase } from '../lib/supabase';
import { mensajeDeLaFuncion } from './errorDeFuncion';

/** Servicios del portal interno. Los permisos los verifica el servidor (`is_admin()`); aquí solo se piden. */

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[admin] ${contexto}:`, error.message);
  const m = error.message ?? '';
  if (/FORBIDDEN/.test(m)) return new Error('No tienes permisos para esta operación.');
  if (/LOCKOUT/.test(m))
    return new Error('No se puede retirar un permiso crítico al administrador.');
  if (/LAST_ADMIN/.test(m)) return new Error('No se puede dejar el sistema sin administrador.');
  if (/NOT_FOUND/.test(m)) return new Error('El elemento indicado no existe.');
  if (/ALREADY_ENROLLED/.test(m))
    return new Error(
      'Esta cuenta ya tiene su aplicación de códigos registrada. Usa «Reiniciar verificación» primero y después quita la exigencia.',
    );
  // Nombra la causa probable: pérdida de permisos en bloque suele ser sesión caducada o falta de MFA.
  return new Error(
    'No fue posible completar la operación. Si el problema se repite en varias pantallas, cierra sesión y vuelve a entrar.',
  );
}

// Permisos y vistas del usuario actual
export interface VistaMenu {
  code: string;
  label: string;
  icon: string | null;
  route: string;
  area: string;
  sort_order: number;
  /** Color de la muestra en el tablero (carta Pintuco). */
  color?: string | null;
  description?: string | null;
  badge?: string | null;
}

export interface MiAcceso {
  permissions: string[];
  views: VistaMenu[];
  isAdmin: boolean;
  isStaff: boolean;
}

export const accesoService = {
  async miAcceso(): Promise<MiAcceso> {
    const { data, error } = await supabase.rpc('my_permissions');
    if (error || !data) {
      return { permissions: [], views: [], isAdmin: false, isStaff: false };
    }
    const d = data as {
      permissions: string[] | null;
      views: VistaMenu[] | null;
      is_admin: boolean;
      is_staff: boolean;
    };
    return {
      permissions: d.permissions ?? [],
      views: (d.views ?? []).sort((a, b) => a.sort_order - b.sort_order),
      isAdmin: Boolean(d.is_admin),
      isStaff: Boolean(d.is_staff),
    };
  },
};

// Usuarios
export interface UsuarioAdmin {
  id: string;
  email: string;
  nombre: string;
  telefono: string | null;
  ciudad: string | null;
  empresa: string | null;
  estado: string;
  roles: string[];
  creadoEn: string;
}

export const ETIQUETA_ROL: Record<string, string> = {
  CLIENTE: 'Cliente',
  CLIENTE_B2B: 'Cliente empresa',
  ADMINISTRADOR: 'Administrador',
  ASESOR: 'Asesor comercial',
  TECNICO: 'Técnico de campo',
  BODEGA: 'Inventario y bodega',
  DESPACHO: 'Despacho y logística',
  FACTURACION: 'Facturación y cartera',
  TESORERIA: 'Tesorería',
  CONTABILIDAD: 'Contabilidad',
  SERVICIO_CLIENTE: 'Servicio al cliente',
  MARKETING: 'Marketing y contenido',
  GERENCIA: 'Gerencia y analítica',
};

interface FilaUsuario {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  city: string | null;
  status: string;
  created_at: string;
  companies: { name: string } | null;
}

export const usuarioService = {
  async listar(soloInternos = false): Promise<UsuarioAdmin[]> {
    const [{ data: perfiles, error }, { data: roles }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, first_name, last_name, phone, city, status, created_at, companies(name)')
        .order('created_at', { ascending: false }),
      supabase.from('user_roles').select('user_id, role'),
    ]);
    if (error) throw errorLegible('listar', error);

    const porUsuario = new Map<string, string[]>();
    for (const r of (roles ?? []) as Array<{ user_id: string; role: string }>) {
      porUsuario.set(r.user_id, [...(porUsuario.get(r.user_id) ?? []), r.role]);
    }

    const lista = ((perfiles ?? []) as unknown as FilaUsuario[]).map((p) => ({
      id: p.id,
      email: p.email ?? '',
      nombre: `${p.first_name} ${p.last_name}`.trim(),
      telefono: p.phone,
      ciudad: p.city,
      empresa: p.companies?.name ?? null,
      estado: p.status,
      roles: (porUsuario.get(p.id) ?? []).sort(),
      creadoEn: p.created_at,
    }));

    if (!soloInternos) return lista;
    // Interno = algún rol distinto de los de cliente.
    return lista.filter((u) =>
      u.roles.some((r) => r !== 'CLIENTE' && r !== 'CLIENTE_B2B')
    );
  },

  /** Crea personal interno vía Edge Function, porque requiere service_role. */
  async crear(datos: {
    email: string;
    firstName: string;
    lastName?: string;
    phone?: string;
    city?: string;
    municipalityCode?: string;
    countryCode?: string;
    roles: string[];
    password?: string;
  }): Promise<{
    id: string;
    temporaryPassword: string | null;
    /** Si se envió el correo para que fije su contraseña. */
    correoEnviado: boolean;
    /** Si deberá cambiar la provisional al entrar. */
    debeCambiarla: boolean;
  }> {
    const { data, error } = await supabase.functions.invoke('admin-create-user', { body: datos });

    if (error) {
      // El mensaje útil viene en el cuerpo de la respuesta de la función.
      throw new Error(await mensajeDeLaFuncion(error, 'No fue posible crear el usuario.'));
    }

    const r = data as {
      success: boolean;
      data?: {
        id: string; temporaryPassword: string | null;
        correoEnviado?: boolean; debeCambiarla?: boolean;
      };
      error?: { message: string };
    };
    if (!r.success || !r.data) throw new Error(r.error?.message ?? 'No fue posible crear el usuario.');
    return {
      id: r.data.id,
      temporaryPassword: r.data.temporaryPassword,
      correoEnviado: r.data.correoEnviado === true,
      debeCambiarla: r.data.debeCambiarla !== false,
    };
  },

  /**
   * Restablece el acceso de otra persona: por correo (preferido, el admin no conoce
   * la clave) o con una temporal, escrita o generada, que obliga a cambiarla al entrar.
   */
  async restablecerPassword(
    userId: string,
    modo: 'correo' | 'temporal',
    password?: string,
  ): Promise<{ modo: string; correo: string; password?: string }> {
    const { data, error } = await supabase.functions.invoke('admin-reset-password', {
      body: { userId, modo, password: password?.trim() || undefined },
    });

    if (error) {
      let mensaje = 'No fue posible restablecer la contraseña.';
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const cuerpo = await ctx.json();
          mensaje = cuerpo?.error?.message ?? mensaje;
        } catch {
          /* se conserva el mensaje genérico */
        }
      }
      throw new Error(mensaje);
    }

    const r = data as {
      success: boolean;
      data?: { modo: string; correo: string; password?: string };
      error?: { message: string };
    };
    if (!r.success || !r.data) {
      throw new Error(r.error?.message ?? 'No fue posible restablecer la contraseña.');
    }
    return r.data;
  },

  /**
   * Reinicia el MFA de otra persona; único camino si pierde el teléfono. Requiere
   * service_role, por eso va por la función del servidor, y queda auditado.
   */
  async reiniciarMFA(userId: string): Promise<number> {
    const { data, error } = await supabase.functions.invoke('admin-reset-mfa', {
      body: { userId },
    });

    if (error) {
      let mensaje = 'No fue posible reiniciar la verificación en dos pasos.';
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const cuerpo = await ctx.json();
          mensaje = cuerpo?.error?.message ?? mensaje;
        } catch {
          /* se conserva el mensaje genérico */
        }
      }
      throw new Error(mensaje);
    }

    const r = data as { success: boolean; data?: { retirados: number }; error?: { message: string } };
    if (!r.success) {
      throw new Error(r.error?.message ?? 'No fue posible reiniciar la verificación en dos pasos.');
    }
    return r.data?.retirados ?? 0;
  },

  /** Estado del MFA de otra persona (solo administración). */
  async estadoMFA(userId: string): Promise<{
    configurado: boolean;
    requerido: boolean;
    esInterno: boolean;
  }> {
    const { data, error } = await supabase.rpc('estado_mfa_usuario', { _user_id: userId });
    if (error) throw errorLegible('estadoMFA', error);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      configurado: Boolean(d.configurado),
      requerido: Boolean(d.requerido),
      esInterno: Boolean(d.es_interno),
    };
  },

  /** Exige o exime el MFA; eximir no retira un factor ya registrado (para eso está reiniciar). */
  async exigirMFA(userId: string, requerido: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_mfa_requerido', {
      _user_id: userId,
      _requerido: requerido,
    });
    if (error) throw errorLegible('exigirMFA', error);
  },

  async otorgarRol(userId: string, rol: string): Promise<void> {
    const { error } = await supabase.rpc('grant_role', { _user_id: userId, _role: rol });
    if (error) throw errorLegible('otorgarRol', error);
  },

  async revocarRol(userId: string, rol: string): Promise<void> {
    const { error } = await supabase.rpc('revoke_role', { _user_id: userId, _role: rol });
    if (error) throw errorLegible('revocarRol', error);
  },
};

// Permisos por rol
export interface Permiso {
  code: string;
  module: string;
  action: string;
  label: string;
  isCritical: boolean;
  sortOrder: number;
}

export interface RolConfigurable {
  codigo: string;
  etiqueta: string;
  descripcion: string | null;
  /** Los del sistema no se archivan: RLS y los disparadores dependen de ellos. */
  delSistema: boolean;
  activo: boolean;
  personas: number;
}

export interface VistaDelPortal {
  code: string;
  label: string;
  area: string;
  orden: number;
}

export interface ConfiguracionRoles {
  roles: RolConfigurable[];
  vistas: VistaDelPortal[];
  porRol: Record<string, string[]>;
}

/** Roles: alta, nombre y vistas por rol (vía `set_role_view`). */
export const rolService = {
  async configuracion(): Promise<ConfiguracionRoles> {
    const { data, error } = await supabase.rpc('configuracion_de_roles');
    if (error) throw errorLegible('configuracionRoles', error);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      roles: (d.roles ?? []) as RolConfigurable[],
      vistas: (d.vistas ?? []) as VistaDelPortal[],
      porRol: (d.porRol ?? {}) as Record<string, string[]>,
    };
  },

  /** El rol nace sin permisos ni vistas: heredarlos daría acceso de más en silencio. */
  async crear(codigo: string, etiqueta: string, descripcion?: string): Promise<string> {
    const { data, error } = await supabase.rpc('crear_rol', {
      _codigo: codigo, _etiqueta: etiqueta, _descripcion: descripcion ?? null,
    });
    if (error) {
      if (/YA_EXISTE/.test(error.message)) {
        throw new Error('Ya existe un rol con ese código.');
      }
      if (/CODIGO_INVALIDO/.test(error.message)) {
        throw new Error('El código necesita al menos 3 letras.');
      }
      throw errorLegible('crearRol', error);
    }
    return String((data as Record<string, unknown>).rol);
  },

  async actualizar(codigo: string, cambios: {
    etiqueta?: string; descripcion?: string; activo?: boolean;
  }): Promise<void> {
    const { error } = await supabase.rpc('actualizar_rol', {
      _codigo: codigo,
      _etiqueta: cambios.etiqueta ?? null,
      _descripcion: cambios.descripcion ?? null,
      _activo: cambios.activo ?? null,
    });
    if (error) {
      if (/ROL_DEL_SISTEMA/.test(error.message)) {
        throw new Error(
          'Este rol es parte del funcionamiento del sistema y no se puede archivar.',
        );
      }
      if (/ROL_EN_USO/.test(error.message)) {
        throw new Error('Hay personas con ese rol. Quítaselo antes de archivarlo.');
      }
      throw errorLegible('actualizarRol', error);
    }
  },

  /** Roles internos asignables: sistema y creados, sin archivados ni de cliente. */
  async internosActivos(): Promise<{ codigo: string; etiqueta: string }[]> {
    const { roles } = await rolService.configuracion();
    return roles
      .filter((r) => r.activo && r.codigo !== 'CLIENTE' && r.codigo !== 'CLIENTE_B2B')
      .map((r) => ({ codigo: r.codigo, etiqueta: r.etiqueta || ETIQUETA_ROL[r.codigo] || r.codigo }));
  },

  /** Concede o quita una aplicación a todo un rol. */
  async cambiarVista(rol: string, viewCode: string, visible: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_role_view', {
      _role: rol, _view_code: viewCode, _visible: visible,
    });
    if (error) throw errorLegible('cambiarVista', error);
  },
};

export interface PermisoDeUsuario {
  code: string;
  label: string;
  module: string;
  isCritical: boolean;
  /** Lo que concede su rol. */
  porRol: boolean;
  /** Excepción personal: true concede, false retira. */
  excepcion: boolean | null;
  motivo: string | null;
  /** Resultado efectivo: la excepción manda sobre el rol. */
  efectivo: boolean;
}

export const permisoService = {
  async catalogo(): Promise<Permiso[]> {
    const { data, error } = await supabase
      .from('permissions')
      .select('code, module, action, label, is_critical, sort_order')
      .order('sort_order');
    if (error) throw errorLegible('catalogo', error);
    return ((data ?? []) as Array<Record<string, string | number | boolean>>).map((p) => ({
      code: String(p.code),
      module: String(p.module),
      action: String(p.action),
      label: String(p.label),
      isCritical: Boolean(p.is_critical),
      sortOrder: Number(p.sort_order),
    }));
  },

  async matriz(): Promise<Record<string, Set<string>>> {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('role, permission_code, granted');
    if (error) throw errorLegible('matriz', error);

    const mapa: Record<string, Set<string>> = {};
    for (const f of (data ?? []) as Array<{ role: string; permission_code: string; granted: boolean }>) {
      if (!f.granted) continue;
      (mapa[f.role] ??= new Set()).add(f.permission_code);
    }
    return mapa;
  },

  /** Permisos por rol, excepción y resultado; replica la regla de `has_permission`. */
  async deUsuario(userId: string, roles: string[]): Promise<PermisoDeUsuario[]> {
    const [catalogo, matriz, { data: excepciones, error }] = await Promise.all([
      this.catalogo(),
      this.matriz(),
      supabase.from('user_permissions').select('permission_code, granted, reason').eq('user_id', userId),
    ]);
    if (error) throw errorLegible('permisosDeUsuario', error);

    const porRol = new Set<string>();
    for (const r of roles) for (const c of matriz[r] ?? []) porRol.add(c);
    const mapa = new Map<string, { granted: boolean; reason: string | null }>();
    for (const e of (excepciones ?? []) as Array<{ permission_code: string; granted: boolean; reason: string | null }>) {
      mapa.set(e.permission_code, { granted: e.granted, reason: e.reason });
    }

    return catalogo.map((p) => {
      const base = porRol.has(p.code);
      const exc = mapa.get(p.code) ?? null;
      return {
        code: p.code, label: p.label, module: p.module, isCritical: p.isCritical,
        porRol: base,
        excepcion: exc ? exc.granted : null,
        motivo: exc?.reason ?? null,
        efectivo: exc ? exc.granted : base,
      };
    });
  },

  async fijarDeUsuario(userId: string, permiso: string, concedido: boolean, motivo: string): Promise<void> {
    const { error } = await supabase.rpc('set_user_permission', {
      _user_id: userId, _permission_code: permiso, _granted: concedido, _reason: motivo,
    });
    if (error) {
      if (/SIN_MOTIVO/.test(error.message)) throw new Error('Escribe por qué esta persona tiene una excepción.');
      throw errorLegible('fijarPermisoDeUsuario', error);
    }
  },

  /** Quita la excepción y vuelve a lo que diga el rol. */
  async restablecerDeUsuario(userId: string, permiso: string): Promise<void> {
    const { error } = await supabase.rpc('clear_user_permission', {
      _user_id: userId, _permission_code: permiso,
    });
    if (error) throw errorLegible('restablecerPermisoDeUsuario', error);
  },

  async cambiar(rol: string, permiso: string, concedido: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_role_permission', {
      _role: rol,
      _permission_code: permiso,
      _granted: concedido,
    });
    if (error) throw errorLegible('cambiar', error);
  },
};

// Configuración de empresa y correo
export interface DatosEmpresa {
  company_name: string;
  company_legal_name: string | null;
  company_nit: string | null;
  company_address: string | null;
  company_city: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  logo_url: string | null;
  tax_regime: string | null;
  default_tax_rate: number;
  invoice_prefix: string;
  invoice_footer: string | null;
}

export interface EstadoSmtp {
  configured: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  from_email: string | null;
  configured_at: string | null;
}

/**
 * Cableado para que la base llame a la función de correo (URL, llave y base de
 * enlaces). Distinto del SMTP; sin él, `enviar_correo` marca todo como OMITIDO.
 */
export interface EstadoEntornoCorreo {
  functions_url: string | null;
  site_url: string | null;
  /** La llave nunca se devuelve; solo si existe. */
  tiene_llave: boolean;
  /** Solo el formato de la llave, para avisar si no es la adecuada. */
  formato_llave: 'JWT' | 'SB_SECRET' | 'SB_PUBLISHABLE' | 'DESCONOCIDO' | null;
  emails_enabled: boolean;
  allowlist: string[];
  updated_at: string | null;
}

export const configService = {
  async entornoCorreo(): Promise<EstadoEntornoCorreo> {
    const { data, error } = await supabase.rpc('estado_entorno_correo');
    if (error) throw errorLegible('entornoCorreo', error);
    return data as EstadoEntornoCorreo;
  },

  /** Llave vacía conserva la guardada: la interfaz nunca la recibe y no puede reenviarla. */
  async guardarEntornoCorreo(datos: {
    functionsUrl?: string;
    serviceKey?: string;
    siteUrl?: string;
    emailsEnabled?: boolean;
    allowlist?: string[];
  }): Promise<EstadoEntornoCorreo> {
    const { data, error } = await supabase.rpc('configurar_entorno_correo', {
      _functions_url: datos.functionsUrl ?? null,
      _service_key: datos.serviceKey ?? null,
      _site_url: datos.siteUrl ?? null,
      _emails_enabled: datos.emailsEnabled ?? null,
      _allowlist: datos.allowlist ?? null,
      _cambiar_allowlist: datos.allowlist !== undefined,
    });
    if (error) throw errorLegible('guardarEntornoCorreo', error);
    return data as EstadoEntornoCorreo;
  },

  /** Prueba el camino real (base → función con su llave), que la prueba desde el navegador se salta. */
  async probarCorreoPorLaBase(destino: string): Promise<string> {
    const { data, error } = await supabase.rpc('probar_correo_por_la_base', { _destino: destino });
    if (error) throw errorLegible('probarCorreoPorLaBase', error);
    return (data as { desde: string }).desde;
  },

  /** Últimas entradas de la bitácora, para ver dónde falló la prueba. */
  async bitacoraCorreo(desde?: string): Promise<
    { template: string | null; status: string; error: string | null; created_at: string }[]
  > {
    let q = supabase
      .from('email_log')
      .select('template,status,error,created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (desde) q = q.gte('created_at', desde);
    const { data, error } = await q;
    if (error) throw errorLegible('bitacoraCorreo', error);
    return (data ?? []) as { template: string | null; status: string; error: string | null; created_at: string }[];
  },

  async empresa(): Promise<DatosEmpresa | null> {
    const { data, error } = await supabase
      .from('app_settings')
      .select(
        'company_name, company_legal_name, company_nit, company_address, company_city, ' +
          'company_phone, company_email, company_website, logo_url, tax_regime, ' +
          'default_tax_rate, invoice_prefix, invoice_footer'
      )
      .eq('id', 1)
      .maybeSingle();
    if (error) throw errorLegible('empresa', error);
    return (data as unknown as DatosEmpresa) ?? null;
  },

  /**
   * Sube el logotipo a Storage y devuelve su URL pública. El nombre lleva marca de
   * tiempo para que navegador y CDN no sirvan el anterior.
   */
  async subirLogo(archivo: File): Promise<string> {
    if (!archivo.type.startsWith('image/')) {
      throw new Error('El logotipo tiene que ser una imagen (PNG, JPG o SVG).');
    }
    // Tope de 2 MB: un archivo mayor suele ser una foto por error y se cargaría en cada correo.
    if (archivo.size > 2 * 1024 * 1024) {
      throw new Error('El logotipo no puede pesar más de 2 MB.');
    }

    const extension = (archivo.name.split('.').pop() ?? 'png').toLowerCase();
    const ruta = `logo-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from('marca')
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
    if (error) throw errorLegible('subirLogo', error);

    const { data } = supabase.storage.from('marca').getPublicUrl(ruta);
    return data.publicUrl;
  },

  async guardarEmpresa(datos: Partial<DatosEmpresa>): Promise<void> {
    const { error } = await supabase.from('app_settings').update(datos).eq('id', 1);
    if (error) throw errorLegible('guardarEmpresa', error);
  },

  async estadoSmtp(): Promise<EstadoSmtp> {
    const { data, error } = await supabase.rpc('smtp_status');
    if (error || !data) {
      return { configured: false, host: null, port: null, user: null, from_email: null, configured_at: null };
    }
    return data as EstadoSmtp;
  },

  /** Contraseña vacía conserva la actual: la interfaz nunca puede leerla. */
  async guardarSmtp(datos: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    fromName: string;
    fromEmail: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('save_smtp_settings', {
      _host: datos.host,
      _port: datos.port,
      _secure: datos.secure,
      _user: datos.user,
      _password: datos.password,
      _from_name: datos.fromName,
      _from_email: datos.fromEmail,
    });
    if (error) throw errorLegible('guardarSmtp', error);
  },

  async enviarPrueba(destinatario: string): Promise<void> {
    if (!destinatario.trim()) {
      throw new Error('Escribe a qué correo quieres enviar la prueba.');
    }

    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        to: destinatario,
        subject: 'Prueba de correo · ColorLink Pintuco',
        html:
          '<h2>El correo saliente funciona</h2>' +
          '<p>Si recibes este mensaje, la configuración SMTP de ColorLink es correcta.</p>',
        esPrueba: true,
      },
    });

    if (error) {
      throw new Error(
        await mensajeDeLaFuncion(error, 'No fue posible enviar el correo de prueba.'),
      );
    }
    const r = data as { success: boolean; error?: { message: string } };
    if (!r.success) throw new Error(r.error?.message ?? 'No fue posible enviar el correo de prueba.');
  },
};


// Acceso a aplicaciones (por rol y por persona)
export interface Aplicacion {
  code: string;
  label: string;
  route: string;
  color: string | null;
  description: string | null;
  sortOrder: number;
}

/** Estado de una aplicación para una persona. */
export interface AccesoUsuario {
  code: string;
  label: string;
  color: string | null;
  /** Lo que concede su rol. */
  porRol: boolean;
  /** Excepción personal: true concede, false retira, null sin excepción. */
  excepcion: boolean | null;
  /** Resultado efectivo. */
  efectivo: boolean;
}

export const aplicacionService = {
  async catalogo(): Promise<Aplicacion[]> {
    const { data, error } = await supabase
      .from('app_views')
      .select('code, label, route, color, description, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw errorLegible('catalogo', error);
    return ((data ?? []) as Array<Record<string, string | number | null>>).map((v) => ({
      code: String(v.code),
      label: String(v.label),
      route: String(v.route),
      color: (v.color as string) ?? null,
      description: (v.description as string) ?? null,
      sortOrder: Number(v.sort_order ?? 0),
    }));
  },

  async matrizPorRol(): Promise<Record<string, Set<string>>> {
    const { data, error } = await supabase
      .from('role_views')
      .select('role, view_code, visible');
    if (error) throw errorLegible('matrizPorRol', error);
    const mapa: Record<string, Set<string>> = {};
    for (const f of (data ?? []) as Array<{ role: string; view_code: string; visible: boolean }>) {
      if (!f.visible) continue;
      (mapa[f.role] ??= new Set()).add(f.view_code);
    }
    return mapa;
  },

  async cambiarPorRol(rol: string, viewCode: string, visible: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_role_view', {
      _role: rol, _view_code: viewCode, _visible: visible,
    });
    if (error) throw errorLegible('cambiarPorRol', error);
  },

  /** Accesos de una persona por rol, excepción y resultado; permite excepciones individuales. */
  async deUsuario(userId: string, roles: string[]): Promise<AccesoUsuario[]> {
    const [apps, porRol, { data: excepciones }] = await Promise.all([
      this.catalogo(),
      this.matrizPorRol(),
      supabase.from('user_views').select('view_code, visible').eq('user_id', userId),
    ]);

    const concedidoPorRol = new Set<string>();
    for (const r of roles) for (const c of porRol[r] ?? []) concedidoPorRol.add(c);

    const mapaExcepciones = new Map<string, boolean>();
    for (const e of (excepciones ?? []) as Array<{ view_code: string; visible: boolean }>) {
      mapaExcepciones.set(e.view_code, e.visible);
    }

    return apps.map((a) => {
      const base = concedidoPorRol.has(a.code);
      const exc = mapaExcepciones.has(a.code) ? mapaExcepciones.get(a.code)! : null;
      return {
        code: a.code,
        label: a.label,
        color: a.color,
        porRol: base,
        excepcion: exc,
        efectivo: exc ?? base,
      };
    });
  },

  async concederAUsuario(userId: string, viewCode: string, visible: boolean, motivo?: string): Promise<void> {
    const { error } = await supabase.rpc('set_user_view', {
      _user_id: userId, _view_code: viewCode, _visible: visible, _reason: motivo ?? null,
    });
    if (error) throw errorLegible('concederAUsuario', error);
  },

  /** Quita la excepción y vuelve a lo que diga el rol. */
  async restablecerUsuario(userId: string, viewCode: string): Promise<void> {
    const { error } = await supabase.rpc('clear_user_view', {
      _user_id: userId, _view_code: viewCode,
    });
    if (error) throw errorLegible('restablecerUsuario', error);
  },
};
