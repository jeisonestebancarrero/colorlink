/**
 * Restablecer la contraseña de otro usuario — Edge Function
 * ============================================================
 * Un administrador necesita poder destrabar a alguien que perdió el acceso.
 * Cambiar la contraseña de otra cuenta exige la clave `service_role`, que
 * jamás puede estar en el navegador; de ahí que pase por aquí.
 *
 * Hay dos caminos, y el orden importa:
 *
 *   'correo'   — se le manda un enlace de recuperación y la persona elige su
 *                propia contraseña. Es el camino preferido: el administrador
 *                nunca llega a conocerla.
 *
 *   'temporal' — una contraseña provisional que se muestra UNA vez. La escribe
 *                el administrador o, si no la escribe, se genera. En ambos
 *                casos la cuenta queda obligada a cambiarla al entrar.
 *                Solo para cuando el correo no es alcanzable, que en obra
 *                pasa. Queda registrado en la auditoría porque, a partir de
 *                ese momento, dos personas conocen esa contraseña.
 *
 * Quién puede hacerlo lo decide la base con `is_admin()`, que a su vez exige
 * que el administrador haya superado su propio segundo factor.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/**
 * Contraseña provisional legible pero no adivinable.
 *
 * Se excluyen los caracteres que se confunden al dictarla por teléfono —O y
 * 0, l y 1, I— porque la vía de entrega real de esto es una llamada.
 */
function contrasenaTemporal(): string {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digitos = '23456789';
  const simbolos = '*-+=?';
  const alfabeto = letras + digitos + simbolos;

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let clave = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');

  // Se garantiza al menos un dígito y un símbolo: algunas políticas los
  // exigen y una temporal que el servidor rechace no sirve de nada.
  const extra = new Uint8Array(2);
  crypto.getRandomValues(extra);
  clave += digitos[extra[0] % digitos.length] + simbolos[extra[1] % simbolos.length];
  return clave;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return respuesta({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: { user: solicitante } } = await comoUsuario.auth.getUser();
  if (!solicitante) {
    return respuesta(
      { success: false, error: { code: 'UNAUTHENTICATED', message: 'Sesión requerida' } },
      401,
    );
  }

  const { data: esAdmin } = await comoUsuario.rpc('is_admin');
  if (!esAdmin) {
    return respuesta(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Solo administración puede restablecer contraseñas.' },
      },
      403,
    );
  }

  let userId = '';
  let modo = 'correo';
  /** Contraseña escrita por el administrador. Vacía = se genera una. */
  let escrita = '';
  try {
    ({ userId, modo = 'correo', password: escrita = '' } = await req.json());
  } catch {
    return respuesta({ success: false, error: { code: 'BAD_REQUEST' } }, 400);
  }

  // Si el administrador la escribe, se respeta, pero con un mínimo. Una clave
  // corta puesta a mano es peor que la generada, y la persona la va a cambiar
  // al entrar de todos modos.
  escrita = String(escrita ?? '').trim();
  if (modo === 'temporal' && escrita && escrita.length < 8) {
    return respuesta({
      success: false,
      error: {
        code: 'CLAVE_CORTA',
        message: 'La contraseña necesita al menos 8 caracteres.',
      },
    }, 400);
  }

  if (!userId) {
    return respuesta(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Falta el usuario' } },
      400,
    );
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: cuenta, error: errorCuenta } = await admin.auth.admin.getUserById(userId);
  if (errorCuenta || !cuenta?.user?.email) {
    return respuesta(
      { success: false, error: { code: 'NOT_FOUND', message: 'Ese usuario no existe.' } },
      404,
    );
  }

  if (modo === 'correo') {
    const { error } = await admin.auth.resetPasswordForEmail(cuenta.user.email);
    if (error) {
      return respuesta(
        { success: false, error: { code: 'MAIL_FAILED', message: error.message } },
        500,
      );
    }

    await admin.from('audit_logs').insert({
      user_id: solicitante.id,
      action: 'PASSWORD_RESET_EMAIL',
      entity: 'auth.users',
      entity_id: userId,
      metadata: { correo: cuenta.user.email },
    });

    return respuesta({ success: true, data: { modo: 'correo', correo: cuenta.user.email } });
  }

  // La que escribió el administrador, o una generada si no escribió ninguna.
  // Generarla es lo preferible —nadie elige una débil por comodidad— pero a
  // veces hay que dictarla por teléfono y conviene que sea pronunciable.
  const temporal = escrita || contrasenaTemporal();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: temporal });

  // Una contraseña puesta por otra persona tiene que cambiarse al entrar: se
  // entrega de viva voz o por chat, y si no se obliga sigue siendo válida
  // indefinidamente en manos de quien haya visto el mensaje.
  if (!error) {
    const { error: errorMarca } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', userId);
    if (errorMarca) {
      console.error('[admin-reset-password] marca de clave temporal', errorMarca.message);
    }
  }
  if (error) {
    return respuesta(
      { success: false, error: { code: 'UPDATE_FAILED', message: error.message } },
      500,
    );
  }

  // Se registra con nombre y fecha: a partir de aquí, dos personas conocen
  // esa contraseña, y eso tiene que quedar por escrito.
  await admin.from('audit_logs').insert({
    user_id: solicitante.id,
    action: 'PASSWORD_SET_TEMPORARY',
    entity: 'auth.users',
    entity_id: userId,
    metadata: { correo: cuenta.user.email },
  });

  return respuesta({
    success: true,
    data: { modo: 'temporal', correo: cuenta.user.email, password: temporal },
  });
});
