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
import { CORS } from '../_shared/cors.ts';

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
  /** Código DIVIPOLA. El disparador de alta deriva de aquí la ciudad. */
  municipalityCode?: string;
  countryCode?: string;
  roles: string[];
  /**
   * Si no se envía, se genera una temporal, se marca la cuenta para que la
   * cambie al entrar y se le manda un correo para que ponga la suya.
   */
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
      // Con el código, `handle_new_user` valida contra el diccionario y escribe
      // la ciudad con su NOMBRE OFICIAL, ignorando el texto suelto. Sin él se
      // guarda lo que venga, que es como se llenaba antes la tabla de
      // «medellin», «Medellín » y «Mede».
      city: p.city?.trim() ?? '',
      ...(p.municipalityCode?.trim() ? { municipality_code: p.municipalityCode.trim() } : {}),
      ...(p.countryCode?.trim() ? { country_code: p.countryCode.trim() } : {}),
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

  // La cuenta nace con contraseña provisional y hay que cambiarla al entrar.
  //
  // Antes el comentario de arriba decía «y se pide cambiarla», pero nada la
  // pedía: quien entraba con la temporal se quedaba con ella indefinidamente.
  // Y como esa contraseña se entrega de viva voz o por chat, seguía siendo
  // válida meses después en manos de quien hubiera visto el mensaje.
  if (!p.password?.trim()) {
    const { error: errorMarca } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', nuevoId);
    if (errorMarca) {
      // No se revierte el alta por esto: la cuenta sirve igual, solo que sin
      // la obligación. Se deja constancia para poder corregirlo.
      console.error('[admin-create-user] marca de clave temporal', errorMarca.message);
    }
  }

  // Correo de bienvenida con enlace para poner su propia contraseña.
  //
  // Antes no se enviaba NINGÚN correo: la temporal se mostraba una sola vez en
  // pantalla, y si el administrador la perdía antes de entregarla había que
  // reiniciar el acceso. Con el enlace, la persona puede entrar aunque nadie
  // le haya dicho nunca la contraseña.
  //
  // El enlace NO lleva la contraseña. Mandar una contraseña por correo la deja
  // escrita para siempre en un buzón que no controlamos.
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
    // Si el correo saliente no está configurado, el alta NO debe fallar: el
    // administrador todavía tiene la contraseña temporal en pantalla.
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
      // Solo se devuelve si la generó el sistema, para que el administrador
      // pueda entregarla. Si el admin fijó una, no se hace eco de ella.
      temporaryPassword: p.password?.trim() ? null : temporal,
      // Para que la pantalla diga la verdad sobre lo que pasó.
      correoEnviado,
      debeCambiarla: !p.password?.trim(),
    },
    message: 'Usuario creado correctamente',
  }, 201);
});
