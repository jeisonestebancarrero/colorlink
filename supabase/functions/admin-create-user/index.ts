/**
 * Alta de personal interno — Edge Function
 * ============================================================
 * Crear un usuario en Supabase Auth exige la clave `service_role`, que jamás
 * puede estar en el navegador. Por eso el alta pasa por aquí.
 *
 * El personal interno NO se autorregistra: lo crea un administrador, que
 * define sus roles en el mismo acto. Al usuario se le envía un enlace para
 * que fije su propia contraseña, de modo que ni el administrador la conoce.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES_VALIDOS = [
  'CLIENTE', 'CLIENTE_B2B', 'ASESOR', 'TECNICO', 'ADMINISTRADOR',
  'BODEGA', 'DESPACHO', 'FACTURACION', 'TESORERIA', 'CONTABILIDAD',
  'SERVICIO_CLIENTE', 'MARKETING', 'GERENCIA',
];

interface Peticion {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  city?: string;
  roles: string[];
  /** Si no se envía, se genera una temporal y se pide cambiarla. */
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

  // La comprobación de administrador la hace la base, no este código.
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
  const invalidos = p.roles.filter((r) => !ROLES_VALIDOS.includes(r));
  if (invalidos.length > 0) {
    return respuesta(
      { success: false, error: { code: 'VALIDATION', message: `Rol no reconocido: ${invalidos.join(', ')}` } },
      422
    );
  }

  const admin = createClient(url, service);

  // Contraseña temporal robusta si el administrador no fija una: es
  // preferible a una previsible, y de todos modos el usuario la cambiará.
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
      city: p.city?.trim() ?? '',
      client_type: 'Profesional',
      // Sin `company`: el personal interno no genera empresa propia.
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

  // El trigger handle_new_user ya otorgó CLIENTE. Se añaden los del alta.
  const filas = p.roles
    .filter((r) => r !== 'CLIENTE')
    .map((r) => ({ user_id: nuevoId, role: r, granted_by: solicitante.id }));

  if (filas.length > 0) {
    const { error: errorRoles } = await admin.from('user_roles').insert(filas);
    if (errorRoles) {
      // Un usuario sin sus roles no sirve de nada: se revierte el alta para
      // no dejar una cuenta a medias.
      console.error('[admin-create-user] roles', errorRoles.message);
      await admin.auth.admin.deleteUser(nuevoId);
      return respuesta(
        { success: false, error: { code: 'ROLE_ASSIGN_FAILED', message: 'No fue posible asignar los roles.' } },
        500
      );
    }
  }

  await admin.from('audit_logs').insert({
    user_id: solicitante.id,
    action: 'USER_CREATED',
    entity: 'auth.users',
    entity_id: nuevoId,
    metadata: { email: p.email, roles: p.roles },
  });

  return respuesta({
    success: true,
    data: {
      id: nuevoId,
      email: p.email,
      roles: p.roles,
      // Solo se devuelve si la generó el sistema, para que el administrador
      // pueda entregarla. Si el admin fijó una, no se hace eco de ella.
      temporaryPassword: p.password?.trim() ? null : temporal,
    },
    message: 'Usuario creado correctamente',
  }, 201);
});
