/**
 * Alta de personal interno por un administrador. Va en servidor porque crear usuarios
 * exige service_role; el usuario fija su contraseña por enlace.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS } from '../_shared/cors.ts';

interface Peticion {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  city?: string;
  /** Código DIVIPOLA; el trigger de alta deriva la ciudad de aquí. */
  municipalityCode?: string;
  countryCode?: string;
  roles: string[];
  /** Si falta, se genera una temporal que el usuario debe cambiar al entrar. */
  password?: string;
}

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return respuesta({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: { user: solicitante } } = await comoUsuario.auth.getUser();
  if (!solicitante) {
    return respuesta({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sesión requerida' } }, 401);
  }

  // El rol de administrador lo decide la base.
  const { data: esAdmin } = await comoUsuario.rpc('is_admin');
  if (!esAdmin) {
    return respuesta(
      { success: false, error: { code: 'FORBIDDEN', message: 'Solo administración puede crear usuarios' } },
      403
    );
  }

  let p: Peticion;
  try {
    p = await req.json();
  } catch {
    return respuesta({ success: false, error: { code: 'BAD_REQUEST', message: 'JSON inválido' } }, 400);
  }

  if (!p.email?.trim() || !p.firstName?.trim()) {
    return respuesta(
      { success: false, error: { code: 'VALIDATION', message: 'Correo y nombre son obligatorios' } },
      422
    );
  }
  if (!Array.isArray(p.roles) || p.roles.length === 0) {
    return respuesta(
      { success: false, error: { code: 'VALIDATION', message: 'Debes asignar al menos un rol' } },
      422
    );
  }
  const admin = createClient(url, service);

  // Roles válidos desde el catálogo activo, no una lista fija.
  const { data: catalogo } = await admin.from('role_meta').select('role').eq('activo', true);
  const rolesValidos = new Set(((catalogo ?? []) as { role: string }[]).map((r) => r.role));
  const invalidos = p.roles.filter((r) => !rolesValidos.has(r));
  if (invalidos.length > 0) {
    return respuesta(
      { success: false, error: { code: 'VALIDATION', message: `Rol no reconocido: ${invalidos.join(', ')}` } },
      422
    );
  }

  // Temporal aleatoria si el administrador no fija una.
  const temporal =
    p.password?.trim() ||
    `Pint-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const { data: creado, error: errorAlta } = await admin.auth.admin.createUser({
    email: p.email.trim().toLowerCase(),
    password: temporal,
    email_confirm: true,
    user_metadata: {
      first_name: p.firstName.trim(),
      last_name: p.lastName?.trim() ?? '',
      phone: p.phone?.trim() ?? '',
      // Con municipality_code, handle_new_user usa el nombre oficial y descarta este texto.
      city: p.city?.trim() ?? '',
      ...(p.municipalityCode?.trim() ? { municipality_code: p.municipalityCode.trim() } : {}),
      ...(p.countryCode?.trim() ? { country_code: p.countryCode.trim() } : {}),
      client_type: 'Profesional',
      // Sin company: el personal interno no crea empresa.
    },
  });

  if (errorAlta || !creado?.user) {
    const detalle = errorAlta?.message ?? '';
    console.error('[admin-create-user]', detalle);
    const yaExiste = /already been registered|already exists/i.test(detalle);
    return respuesta(
      {
        success: false,
        error: {
          code: yaExiste ? 'EMAIL_TAKEN' : 'CREATE_FAILED',
          message: yaExiste
            ? 'Ya existe un usuario con ese correo.'
            : 'No fue posible crear el usuario. Inténtalo nuevamente.',
        },
      },
      yaExiste ? 409 : 500
    );
  }

  const nuevoId = creado.user.id;

  // handle_new_user ya otorgó CLIENTE; se añaden los demás.
  const filas = p.roles
    .filter((r) => r !== 'CLIENTE')
    .map((r) => ({ user_id: nuevoId, role: r, granted_by: solicitante.id }));

  if (filas.length > 0) {
    const { error: errorRoles } = await admin.from('user_roles').insert(filas);
    if (errorRoles) {
      // Se revierte el alta para no dejar una cuenta sin roles.
      console.error('[admin-create-user] roles', errorRoles.message);
      await admin.auth.admin.deleteUser(nuevoId);
      return respuesta(
        { success: false, error: { code: 'ROLE_ASSIGN_FAILED', message: 'No fue posible asignar los roles.' } },
        500
      );
    }
  }

  // Obliga a cambiar la temporal al entrar: se entrega por chat y no debe seguir vigente.
  if (!p.password?.trim()) {
    const { error: errorMarca } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', nuevoId);
    if (errorMarca) {
      // No se revierte: la cuenta funciona, solo queda sin la obligación.
      console.error('[admin-create-user] marca de clave temporal', errorMarca.message);
    }
  }

  // Bienvenida con enlace para fijar contraseña; nunca se envía la contraseña por correo.
  let correoEnviado = false;
  try {
    const { error: errorEnlace } = await admin.auth.resetPasswordForEmail(
      p.email.trim().toLowerCase(),
    );
    correoEnviado = !errorEnlace;
    if (errorEnlace) {
      console.error('[admin-create-user] correo de bienvenida', errorEnlace.message);
    }
  } catch (e) {
    // Sin SMTP el alta sigue: el administrador tiene la temporal en pantalla.
    console.error('[admin-create-user] correo de bienvenida', e);
  }

  await admin.from('audit_logs').insert({
    user_id: solicitante.id,
    action: 'USER_CREATED',
    entity: 'auth.users',
    entity_id: nuevoId,
    metadata: {
      email: p.email,
      roles: p.roles,
      correo_enviado: correoEnviado,
      clave_provisional: !p.password?.trim(),
    },
  });

  return respuesta({
    success: true,
    data: {
      id: nuevoId,
      email: p.email,
      roles: p.roles,
      // Solo si la generó el sistema; la fijada por el admin no se devuelve.
      temporaryPassword: p.password?.trim() ? null : temporal,
      correoEnviado,
      debeCambiarla: !p.password?.trim(),
    },
    message: 'Usuario creado correctamente',
  }, 201);
});
