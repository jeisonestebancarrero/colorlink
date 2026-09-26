/**
 * Restablece la contraseña de otro usuario (service_role). 'correo' envía enlace y es lo preferido;
 * 'temporal' se muestra una vez, obliga a cambiarla y queda auditada. Autoriza is_admin() con MFA.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS } from '../_shared/cors.ts';

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Temporal aleatoria sin caracteres ambiguos (O/0, l/1, I), pensada para dictarse. */
function contrasenaTemporal(): string {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digitos = '23456789';
  const simbolos = '*-+=?';
  const alfabeto = letras + digitos + simbolos;

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let clave = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');

  // Garantiza dígito y símbolo para cumplir políticas de contraseña.
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
  /** Vacía: se genera una. */
  let escrita = '';
  try {
    ({ userId, modo = 'correo', password: escrita = '' } = await req.json());
  } catch {
    return respuesta({ success: false, error: { code: 'BAD_REQUEST' } }, 400);
  }

  // Mínimo de 8 para la escrita a mano.
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

  const temporal = escrita || contrasenaTemporal();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: temporal });

  // La puesta por otra persona debe cambiarse al entrar.
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

  // Se audita: desde aquí dos personas conocen la contraseña.
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
