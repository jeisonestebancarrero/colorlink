/**
 * Retira los factores MFA de otro usuario (teléfono perdido); requiere service_role.
 * is_admin() exige que el administrador tenga su propio MFA; toda acción queda en audit_logs.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS } from '../_shared/cors.ts';

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

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
        error: {
          code: 'FORBIDDEN',
          message: 'Solo administración puede reiniciar la verificación en dos pasos.',
        },
      },
      403,
    );
  }

  let userId = '';
  try {
    ({ userId } = await req.json());
  } catch {
    return respuesta({ success: false, error: { code: 'BAD_REQUEST' } }, 400);
  }
  if (!userId) {
    return respuesta(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Falta el usuario' } },
      400,
    );
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: factores, error: errorLista } = await admin.auth.admin.mfa.listFactors({ userId });
  if (errorLista) {
    return respuesta(
      { success: false, error: { code: 'MFA_LIST_FAILED', message: errorLista.message } },
      500,
    );
  }

  let retirados = 0;
  for (const f of factores?.factors ?? []) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
    if (error) {
      return respuesta(
        { success: false, error: { code: 'MFA_DELETE_FAILED', message: error.message } },
        500,
      );
    }
    retirados += 1;
  }

  await admin.from('audit_logs').insert({
    user_id: solicitante.id,
    action: 'MFA_RESET',
    entity: 'auth.mfa_factors',
    entity_id: userId,
    metadata: { retirados },
  });

  return respuesta({ success: true, data: { retirados } });
});
