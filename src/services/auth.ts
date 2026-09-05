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

/**
 * Servicio de autenticación respaldado por Supabase Auth.
 *
 * Sustituye la implementación simulada que vivía en services/api.ts y
 * conserva EXACTAMENTE la misma firma pública, de modo que AuthContext y las
 * páginas no requieren reescritura.
 *
 * MÓDULO 1: las contraseñas nunca se almacenan ni se registran aquí.
 * Supabase Auth (auth.users) es la única autoridad de credenciales.
 */

/** Permisos del usuario actual, calculados en el servidor por public.my_access(). */
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
  companies: { name: string } | null;
}

/** Lo que devuelve un registro: el usuario y si quedó a la espera de aprobación. */
export interface ResultadoRegistro {
  user: User;
  vinculacionPendiente: boolean;
}

/** Se consulta una sola vez: la configuración no cambia dentro de una sesión. */
let proveedoresCache: Record<string, boolean> | null = null;

const PROFILE_SELECT =
  'id, email, first_name, last_name, phone, city, client_type, company_id, avatar_url, created_at, companies(name)';

/**
 * Traduce errores técnicos a mensajes presentables (MÓDULO 44).
 * El detalle interno se envía a la consola; al usuario solo le llega una
 * frase accionable, nunca una violación de constraint en crudo.
 */
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

/** Convierte una fila de `profiles` en el tipo `User` que ya consume el frontend. */
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
    // El frontend espera 'YYYY-MM-DD', igual que en los datos demo.
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

  /**
   * Registro. La metadata viaja en `options.data` y el trigger
   * public.handle_new_user() crea perfil, rol CLIENTE y empresa propia
   * dentro de la misma transacción.
   */
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
      // Ocurre si la confirmación por correo está activada: la cuenta existe
      // pero todavía no hay sesión para leer el perfil.
      throw new Error('Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.');
    }
    return user;
  },

  /**
   * Registro bifurcado. La metadata que se envía cambia según la forma:
   * a una persona natural no se le pide NIT ni razón social, y por tanto el
   * trigger no le crea empresa.
   */
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

    // Se comprueba el documento ANTES de crear nada. Si se deja llegar hasta
    // el índice único, el alta revienta dentro del trigger y GoTrue responde
    // "Database error saving new user": la persona ve un error de servidor y
    // nunca se entera de que su cédula ya estaba registrada.
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

    // Si pidió registrar una empresa y la cuenta quedó sin empresa, es porque
    // ese NIT ya estaba registrado: el servidor dejó una solicitud de
    // vinculación en lugar de duplicar la compañía o —peor— entregarle el
    // acceso a la empresa de otro. Hay que decírselo, no dejarlo adivinando.
    const vinculacionPendiente = d.accountType === 'EMPRESA' && !user.company;

    return { user, vinculacionPendiente };
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw toFriendlyError(error, 'logout');
  },

  /**
   * Actualiza el perfil. Solo se envían las columnas que el usuario tiene
   * permitido modificar; `company_id` y `status` están excluidos a nivel de
   * GRANT en la base de datos, no solo aquí.
   */
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

    // El nombre de la empresa vive en `companies`; solo un OWNER/ADMIN de esa
    // empresa puede cambiarlo y así lo verifica la política RLS.
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

    // Cambiar el correo pasa por Supabase Auth, nunca escribiendo la columna
    // proyectada `profiles.email` directamente.
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
   * Acceso con Google.
   *
   * Redirige al consentimiento de Google y vuelve a la aplicación con la
   * sesión ya establecida. El perfil lo crea el mismo trigger
   * handle_new_user, que sabe derivar nombre y avatar de los datos que
   * entrega Google.
   *
   * No crea empresa: con Google no hay razón social declarada y no se puede
   * inventar. El usuario la completa después desde su perfil.
   */
  async signInWithGoogle(): Promise<void> {
    // Se comprueba antes de redirigir. Si el proveedor no está configurado,
    // `signInWithOAuth` manda el navegador a una página de Supabase con un
    // JSON crudo que a un cliente no le dice nada y parece un sitio roto.
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
          // Fuerza la pantalla de selección de cuenta: sin esto Google
          // reutiliza en silencio la última sesión del navegador.
          prompt: 'select_account',
        },
      },
    });
    if (error) throw toFriendlyError(error, 'signInWithGoogle');
  },

  /** Envía el correo de restablecimiento de contraseña (MÓDULO 1). */
  async requestPasswordReset(email: string): Promise<void> {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    // Sin redirectTo: el correo lleva un código, no un enlace, para que se
    // pueda pedir en el computador y leer en el celular.
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data);
    if (error) throw toFriendlyError(error, 'requestPasswordReset');
  },

  /**
   * Verifica el código de 6 dígitos y fija la contraseña nueva.
   *
   * `verifyOtp` es quien valida el código contra el que Supabase Auth generó
   * y guardó cifrado. La verificación NO se hace en el navegador: aquí no hay
   * nada que un atacante pueda saltarse cambiando el código de la página.
   *
   * Al validar el código queda abierta una sesión y la persona entra directo
   * a su cuenta. Es correcto: demostró que controla el buzón de ese correo,
   * que es exactamente la prueba que pide cualquier recuperación. No se cierra
   * la sesión a la fuerza —sería pedirle que se identifique dos veces seguidas
   * por lo mismo—; el aviso de que la contraseña cambió se lo manda Supabase
   * por correo, y ese sí sirve para detectar un cambio que no hizo ella.
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

  /**
   * ¿Esta cuenta ya tiene contraseña?
   *
   * Se pregunta al servidor y NO se deduce de las identidades que devuelve
   * `getUser()`: al ponerle contraseña a una cuenta de Google, Supabase no le
   * agrega identidad de tipo `email`. Deducirlo de ahí haría que la pantalla
   * ofreciera «crea una contraseña» eternamente y nunca pidiera la actual.
   */
  async tengoPassword(): Promise<boolean> {
    const { data, error } = await supabase.rpc('tengo_password');
    if (error) throw toFriendlyError(error, 'tengoPassword');
    return data === true;
  },

  /** Fija una contraseña nueva. Requiere sesión activa o enlace de recuperación. */
  async updatePassword(newPassword: string): Promise<void> {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    if (error) throw toFriendlyError(error, 'updatePassword');
  },

  /**
   * ¿El perfil está incompleto?
   *
   * Quien entra con Google llega sin empresa, sin teléfono y sin ciudad,
   * porque Google no entrega esos datos. Sirve para decidir si hay que
   * pedirle esa información justo después de entrar.
   *
   * Es también la forma de distinguir "ya estaba registrado" de "acaba de
   * registrarse": un usuario que ya existía tiene su perfil completo y no
   * vuelve a ver el formulario.
   */
  perfilIncompleto(user: User | null): boolean {
    if (!user) return false;

    // La razón social solo falta si el usuario dice comprar como empresa.
    // Un particular NO tiene empresa, y exigírsela lo dejaba atrapado en el
    // modal de "completa tu perfil" apenas terminaba de registrarse.
    const faltaEmpresa = user.clientType !== 'Particular' && user.company.trim() === '';

    return (
      faltaEmpresa ||
      user.phone.trim() === '' ||
      user.city.trim() === '' ||
      user.firstName.trim() === ''
    );
  },

  /**
   * Qué accesos externos están realmente habilitados en el servidor.
   *
   * GoTrue lo publica en /auth/v1/settings. Se consulta ANTES de redirigir
   * porque, si el proveedor no está configurado, la redirección lleva a una
   * página de Supabase con un JSON crudo —«Unsupported provider»— que a un
   * cliente no le dice absolutamente nada y parece que el sitio se rompió.
   *
   * El resultado se recuerda: es la misma respuesta durante toda la sesión.
   */
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
      // Sin respuesta se asume que no hay ninguno: es preferible ocultar un
      // botón que existe a mostrar uno que va a fallar.
      console.error('[auth] proveedoresHabilitados:', e);
      return {};
    }
  },

  /**
   * Con qué proveedor se abrió la sesión ('google', 'email', ...).
   * Sirve para no afirmarle a alguien que "inició sesión con Google" cuando
   * en realidad se registró con su correo.
   */
  async proveedorSesion(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    const meta = data.session?.user.app_metadata as { provider?: string } | undefined;
    return meta?.provider ?? null;
  },

  /**
   * Completa los datos que faltan tras un acceso externo.
   *
   * Pasa por una RPC y no por un UPDATE directo porque crear la empresa,
   * la membresía y otorgar el rol CLIENTE_B2B exige escribir en `user_roles`,
   * tabla que a propósito no admite escritura desde el cliente.
   */
  async completeProfile(datos: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    city?: string;
    clientType?: ClientType;
    company?: string;
    countryCode?: string;
    municipalityCode?: string;
  }): Promise<User> {
    const { error } = await supabase.rpc('complete_profile', {
      _first_name: datos.firstName ?? null,
      _last_name: datos.lastName ?? null,
      _phone: datos.phone ?? null,
      _city: datos.city ?? null,
      _client_type: datos.clientType ?? null,
      _company: datos.company ?? null,
      _country_code: datos.countryCode ?? null,
      // Con el código de municipio el servidor IGNORA `_city` y usa el nombre
      // oficial: es lo que impide que las dos columnas se contradigan.
      _municipality_code: datos.municipalityCode ?? null,
    });
    if (error) throw toFriendlyError(error, 'completeProfile');

    const { data: sesion } = await supabase.auth.getSession();
    const userId = sesion.session?.user?.id;
    if (!userId) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');

    const actualizado = await fetchProfile(userId);
    if (!actualizado) throw new Error('No fue posible cargar tu perfil.');
    return actualizado;
  },

  /**
   * Roles y empresas del usuario actual, resueltos en el servidor.
   * Solo sirve para decidir qué se MUESTRA; la autorización real es RLS.
   */
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

  /** Notifica login/logout/refresco de token para mantener el contexto en sync. */
  onAuthStateChange(callback: (userId: string | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user?.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  },
};
