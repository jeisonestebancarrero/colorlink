import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { env } from '../lib/env';
import type { ClientType, User } from '../types';
import {
  emailSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  registroEmpresaSchema,
  registroPersonaSchema,
  type RegisterInput,
  type RegistroInput,
} from '../schemas/auth';

/** Autenticación sobre Supabase Auth, única autoridad de credenciales; aquí no se guardan contraseñas. */

/** Permisos del usuario actual, calculados por public.my_access(). */
export interface AccessInfo {
  userId: string | null;
  roles: string[];
  companyIds: string[];
  isAdmin: boolean;
  isStaff: boolean;
}

export const EMPTY_ACCESS: AccessInfo = {
  userId: null,
  roles: [],
  companyIds: [],
  isAdmin: false,
  isStaff: false,
};

interface ProfileRow {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  city: string | null;
  client_type: ClientType;
  company_id: string | null;
  avatar_url: string | null;
  created_at: string;
  document_type: string | null;
  document_number: string | null;
  companies: { name: string } | null;
}

/** Usuario creado y si quedó pendiente de aprobación. */
export interface ResultadoRegistro {
  user: User;
  vinculacionPendiente: boolean;
}

/** Se consulta una vez: la configuración no cambia durante la sesión. */
let proveedoresCache: Record<string, boolean> | null = null;

const PROFILE_SELECT =
  'id, email, first_name, last_name, phone, city, client_type, company_id, avatar_url, created_at, '
  + 'document_type, document_number, companies(name)';

/** Traduce errores técnicos a mensajes accionables; el detalle va a la consola. */
function toFriendlyError(error: { message: string } | PostgrestError, contexto: string): Error {
  const raw = error.message ?? '';
  console.error(`[auth] ${contexto}:`, raw);

  const mensajes: Array<[RegExp, string]> = [
    [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/email not confirmed/i, 'Debes confirmar tu correo antes de iniciar sesión.'],
    [/user already registered|already been registered|user_already_exists/i,
      'Ya existe una cuenta con este correo electrónico. Inicia sesión o recupera tu contraseña.'],
    [/document_taken/i,
      'Ya existe una cuenta registrada con ese documento. Inicia sesión o recupera tu contraseña.'],
    [/password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
    [/rate limit|too many requests/i, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'],
    [/network|fetch failed/i, 'No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.'],
    [/provider is not enabled|unsupported provider/i,
      'El acceso con Google todavía no está configurado. Usa tu correo y contraseña.'],
  ];

  for (const [patron, mensaje] of mensajes) {
    if (patron.test(raw)) return new Error(mensaje);
  }
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

/** Fila de `profiles` → tipo `User` del frontend. */
function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    clientType: row.client_type,
    company: row.companies?.name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    city: row.city ?? '',
    documentType: row.document_type ?? undefined,
    documentNumber: row.document_number ?? undefined,
    // El frontend espera 'YYYY-MM-DD'.
    createdAt: row.created_at.split('T')[0],
    avatar: row.avatar_url ?? undefined,
  };
}

async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (error) throw toFriendlyError(error, 'fetchProfile');
  return data ? toUser(data) : null;
}

export const authService = {
  async getCurrentUser(): Promise<User | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return null;
    return fetchProfile(userId);
  },

  async login(email: string, password = ''): Promise<User> {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Datos de acceso inválidos.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) throw toFriendlyError(error, 'login');

    const user = await fetchProfile(data.user.id);
    if (!user) throw new Error('Tu cuenta no tiene un perfil asociado. Contacta a soporte.');
    return user;
  },

  /** La metadata va en `options.data`; handle_new_user() crea perfil, rol y empresa en la misma transacción. */
  async register(input: RegisterInput): Promise<User> {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Datos de registro inválidos.');
    }
    const d = parsed.data;

    const { data, error } = await supabase.auth.signUp({
      email: d.email,
      password: d.password,
      options: {
        data: {
          first_name: d.firstName,
          last_name: d.lastName,
          client_type: d.clientType,
          company: d.company,
          phone: d.phone,
          city: d.city,
        },
      },
    });
    if (error) throw toFriendlyError(error, 'register');
    if (!data.user) throw new Error('No fue posible crear la cuenta. Inténtalo nuevamente.');

    const user = await fetchProfile(data.user.id);
    if (!user) {
      // Con confirmación por correo activa la cuenta existe pero aún no hay sesión.
      throw new Error('Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.');
    }
    return user;
  },

  /** Registro de persona o empresa; a una persona no se le crea empresa. */
  async registrar(entrada: RegistroInput): Promise<ResultadoRegistro> {
    const parsed =
      entrada.accountType === 'EMPRESA'
        ? registroEmpresaSchema.safeParse(entrada)
        : registroPersonaSchema.safeParse(entrada);

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Datos de registro inválidos.');
    }
    const d = parsed.data;

    const metadata: Record<string, string> =
      d.accountType === 'EMPRESA'
        ? {
            first_name: d.firstName,
            last_name: d.lastName,
            client_type: d.clientType,
            company: d.company,
            company_nit: d.companyNit,
            phone: d.phone,
            country_code: d.countryCode,
            municipality_code: d.municipalityCode,
            ...(d.neighborhoodId ? { neighborhood_id: d.neighborhoodId } : {}),
            address: d.address,
          }
        : {
            first_name: d.firstName,
            last_name: d.lastName,
            client_type: 'Particular',
            document_type: d.documentType,
            document_number: d.documentNumber,
            phone: d.phone,
            country_code: d.countryCode,
            municipality_code: d.municipalityCode,
            ...(d.neighborhoodId ? { neighborhood_id: d.neighborhoodId } : {}),
            address: d.address,
          };

    // Se valida el documento antes de crear nada: si choca con el índice único dentro
    // del trigger, GoTrue solo devuelve "Database error saving new user".
    if (d.accountType === 'PERSONA') {
      const { data: tomado, error: errorDoc } = await supabase.rpc('documento_ya_registrado', {
        _tipo: d.documentType,
        _numero: d.documentNumber,
      });
      if (errorDoc) throw toFriendlyError(errorDoc, 'documento_ya_registrado');
      if (tomado) {
        throw new Error(
          'Ya existe una cuenta registrada con ese documento. Inicia sesión o recupera tu contraseña.',
        );
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email: d.email,
      password: d.password,
      options: { data: metadata },
    });
    if (error) throw toFriendlyError(error, 'registrar');
    if (!data.user) throw new Error('No fue posible crear la cuenta. Inténtalo nuevamente.');

    const user = await fetchProfile(data.user.id);
    if (!user) {
      throw new Error('Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.');
    }

    // Empresa pedida pero cuenta sin empresa: el NIT ya existía y el servidor dejó una
    // solicitud de vinculación en lugar de dar acceso a la empresa ajena.
    const vinculacionPendiente = d.accountType === 'EMPRESA' && !user.company;

    return { user, vinculacionPendiente };
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw toFriendlyError(error, 'logout');
  },

  /** Solo columnas editables; `company_id` y `status` además están vetados por GRANT. */
  async updateUser(updates: Partial<User>): Promise<User> {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');

    const patch: Record<string, unknown> = {};
    if (updates.firstName !== undefined) patch.first_name = updates.firstName;
    if (updates.lastName !== undefined) patch.last_name = updates.lastName;
    if (updates.phone !== undefined) patch.phone = updates.phone;
    if (updates.city !== undefined) patch.city = updates.city;
    if (updates.clientType !== undefined) patch.client_type = updates.clientType;
    if (updates.avatar !== undefined) patch.avatar_url = updates.avatar;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      if (error) throw toFriendlyError(error, 'updateUser/profile');
    }

    // El nombre vive en `companies`; RLS solo deja cambiarlo a OWNER/ADMIN.
    if (updates.company !== undefined && updates.company.trim() !== '') {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userId)
        .maybeSingle<{ company_id: string | null }>();

      if (perfil?.company_id) {
        const { error } = await supabase
          .from('companies')
          .update({ name: updates.company.trim() })
          .eq('id', perfil.company_id);
        if (error) throw toFriendlyError(error, 'updateUser/company');
      }
    }

    // El correo se cambia vía Supabase Auth, nunca en `profiles.email`.
    if (updates.email !== undefined && updates.email.trim() !== '') {
      const emailValido = emailSchema.safeParse(updates.email.trim());
      if (!emailValido.success) throw new Error(emailValido.error.issues[0].message);

      if (emailValido.data !== sessionData.session?.user?.email) {
        const { error } = await supabase.auth.updateUser({ email: emailValido.data });
        if (error) throw toFriendlyError(error, 'updateUser/email');
      }
    }

    const user = await fetchProfile(userId);
    if (!user) throw new Error('No fue posible cargar el perfil actualizado.');
    return user;
  },

  /**
   * Acceso con Google; handle_new_user crea el perfil con nombre y avatar. No crea
   * empresa: el usuario la completa luego en su perfil.
   */
  async signInWithGoogle(): Promise<void> {
    // Se verifica antes de redirigir: un proveedor no configurado deja al usuario ante un JSON crudo de Supabase.
    const habilitados = await this.proveedoresHabilitados();
    if (habilitados.google === false) {
      throw new Error(
        'El acceso con Google todavía no está configurado. Entra con tu correo y contraseña.',
      );
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          // Fuerza elegir cuenta; si no, Google reutiliza la última sesión.
          prompt: 'select_account',
        },
      },
    });
    if (error) throw toFriendlyError(error, 'signInWithGoogle');
  },

  /** Envía el correo de restablecimiento de contraseña. */
  async requestPasswordReset(email: string): Promise<void> {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    // Sin redirectTo: el correo lleva un código, no un enlace, para leerlo en otro dispositivo.
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data);
    if (error) throw toFriendlyError(error, 'requestPasswordReset');
  },

  /**
   * Verifica el código de 6 dígitos con `verifyOtp` (en el servidor) y fija la clave.
   * La sesión que queda abierta es intencional: ya se probó el control del buzón.
   */
  async confirmarCodigoYCambiarPassword(
    email: string,
    codigo: string,
    nuevaPassword: string,
  ): Promise<void> {
    const correo = emailSchema.safeParse(email);
    if (!correo.success) throw new Error(correo.error.issues[0].message);

    const clave = passwordSchema.safeParse(nuevaPassword);
    if (!clave.success) throw new Error(clave.error.issues[0].message);

    const limpio = codigo.replace(/\D/g, '');
    if (limpio.length !== 6) throw new Error('El código son 6 dígitos. Revísalo e inténtalo de nuevo.');

    const { error: errorOtp } = await supabase.auth.verifyOtp({
      email: correo.data,
      token: limpio,
      type: 'recovery',
    });
    if (errorOtp) {
      console.error('[auth] verifyOtp:', errorOtp.message);
      throw new Error('El código no es válido o ya venció. Pide uno nuevo.');
    }

    const { error } = await supabase.auth.updateUser({ password: clave.data });
    if (error) throw toFriendlyError(error, 'confirmarCodigoYCambiarPassword');
  },

  /** Requiere sesión activa o enlace de recuperación. */
  async updatePassword(newPassword: string): Promise<void> {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    if (error) throw toFriendlyError(error, 'updatePassword');
  },

  /** Perfil incompleto tras un acceso externo (Google no entrega empresa, teléfono ni documento). */
  perfilIncompleto(user: User | null): boolean {
    if (!user) return false;

    // La razón social solo se exige a quien compra como empresa.
    const faltaEmpresa = user.clientType !== 'Particular' && user.company.trim() === '';

    // El documento es obligatorio para facturar y Google no lo entrega.
    return (
      faltaEmpresa ||
      user.phone.trim() === '' ||
      user.city.trim() === '' ||
      user.firstName.trim() === '' ||
      !(user.documentNumber ?? '').trim()
    );
  },

  /** Proveedores habilitados según /auth/v1/settings; se consulta antes de redirigir y se cachea. */
  async proveedoresHabilitados(): Promise<Record<string, boolean>> {
    if (proveedoresCache) return proveedoresCache;
    try {
      const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: env.VITE_SUPABASE_ANON_KEY },
      });
      if (!r.ok) return {};
      const cuerpo = (await r.json()) as { external?: Record<string, boolean> };
      proveedoresCache = cuerpo.external ?? {};
      return proveedoresCache;
    } catch (e) {
      // Sin respuesta se asume ninguno: mejor ocultar un botón que mostrar uno que falla.
      console.error('[auth] proveedoresHabilitados:', e);
      return {};
    }
  },

  /** Proveedor con que se abrió la sesión ('google', 'email', ...). */
  async proveedorSesion(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    const meta = data.session?.user.app_metadata as { provider?: string } | undefined;
    return meta?.provider ?? null;
  },

  /** Vía RPC porque asignar rol exige escribir en `user_roles`, vetada al cliente. */
  async completeProfile(datos: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    city?: string;
    clientType?: ClientType;
    company?: string;
    countryCode?: string;
    municipalityCode?: string;
    documentType?: string;
    documentNumber?: string;
  }): Promise<User> {
    const { error } = await supabase.rpc('complete_profile', {
      _first_name: datos.firstName ?? null,
      _last_name: datos.lastName ?? null,
      _phone: datos.phone ?? null,
      _city: datos.city ?? null,
      _client_type: datos.clientType ?? null,
      _company: datos.company ?? null,
      _country_code: datos.countryCode ?? null,
      // Con código de municipio el servidor ignora `_city` y usa el nombre oficial.
      _municipality_code: datos.municipalityCode ?? null,
      _document_type: datos.documentType ?? null,
      _document_number: datos.documentNumber ?? null,
    });
    if (error) throw toFriendlyError(error, 'completeProfile');

    const { data: sesion } = await supabase.auth.getSession();
    const userId = sesion.session?.user?.id;
    if (!userId) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');

    const actualizado = await fetchProfile(userId);
    if (!actualizado) throw new Error('No fue posible cargar tu perfil.');
    return actualizado;
  },

  /** Roles y empresas del usuario; solo para decidir qué se muestra, la autorización es RLS. */
  async getAccess(): Promise<AccessInfo> {
    const { data, error } = await supabase.rpc('my_access');
    if (error || !data) return EMPTY_ACCESS;

    const raw = data as {
      user_id: string | null;
      roles: string[] | null;
      company_ids: string[] | null;
      is_admin: boolean;
      is_staff: boolean;
    };

    return {
      userId: raw.user_id,
      roles: raw.roles ?? [],
      companyIds: raw.company_ids ?? [],
      isAdmin: Boolean(raw.is_admin),
      isStaff: Boolean(raw.is_staff),
    };
  },

  /** Notifica login, logout y refresco de token. */
  onAuthStateChange(callback: (userId: string | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user?.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  },
};
