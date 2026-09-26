/**
 * Envío SMTP; único punto que conoce la contraseña de correo (Render solo sirve estáticos).
 * Gmail requiere contraseña de aplicación con verificación en dos pasos.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { construir, type Plantilla } from '../_shared/correos.ts';
import { LOGO_BASE64, LOGO_CID } from '../_shared/logo.ts';
import { CORS } from '../_shared/cors.ts';

interface Peticion {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  orderId?: string;
  projectId?: string;
  /** Correo de prueba lanzado desde Administración. */
  esPrueba?: boolean;
  /** Destinatario de BIENVENIDA. */
  userId?: string;
}

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return respuesta({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identifica a quien pide el envío.
  const authHeader = req.headers.get('Authorization') ?? '';
  const comoUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  // La base dispara los correos con service_role, sin usuario detrás.
  const token = authHeader.replace(/^Bearer\s+/i, '');

  /** Rol declarado en el JWT; fiable porque verify_jwt ya validó la firma en el gateway. */
  const rolDelToken = (t: string): string | null => {
    try {
      const carga = t.split('.')[1];
      if (!carga) return null;
      const base64 = carga.replace(/-/g, '+').replace(/_/g, '/');
      const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      return (JSON.parse(atob(relleno)) as { role?: string }).role ?? null;
    } catch {
      return null;
    }
  };

  // No basta comparar con serviceKey: puede haber varias llaves de servicio válidas.
  // Decide el rol del token.
  const esServicio = token === serviceKey || rolDelToken(token) === 'service_role';

  let user: { id: string } | null = null;
  if (!esServicio) {
    const { data } = await comoUsuario.auth.getUser();
    user = data.user;
    if (!user) {
      return respuesta({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sesión requerida' } }, 401);
    }
  }

  let cuerpo: Peticion;
  try {
    cuerpo = await req.json();
  } catch {
    return respuesta({ success: false, error: { code: 'BAD_REQUEST', message: 'JSON inválido' } }, 400);
  }

  // Con plantilla el servidor arma asunto y HTML; quien llama solo indica el pedido.
  if (!cuerpo.to || (!cuerpo.subject && !cuerpo.template)) {
    return respuesta(
      { success: false, error: { code: 'VALIDATION', message: 'Destinatario y asunto son obligatorios' } },
      422
    );
  }

  // Solo service_role puede leer la contraseña SMTP.
  const admin = createClient(supabaseUrl, serviceKey);

  // Un correo de prueba solo lo dispara administración.
  if (cuerpo.esPrueba && !esServicio) {
    const { data: esAdmin } = await comoUsuario.rpc('is_admin');
    if (!esAdmin) {
      return respuesta(
        { success: false, error: { code: 'FORBIDDEN', message: 'Solo administración puede enviar correos de prueba' } },
        403
      );
    }
  }

  const { data: conf, error: errorConf } = await admin
    .from('app_settings')
    .select('smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_from_name, smtp_from_email, company_name')
    .eq('id', 1)
    .single();

  // Credenciales opcionales para admitir un relé interno sin autenticación.
  if (errorConf || !conf?.smtp_host) {
    return respuesta(
      {
        success: false,
        error: {
          code: 'SMTP_NOT_CONFIGURED',
          message: 'El correo saliente no está configurado. Ve a Administración → Configuración.',
        },
      },
      409
    );
  }

  // El registro se crea antes de componer para que un fallo de plantilla quede anotado.
  const { data: registro } = await admin
    .from('email_log')
    .insert({
      to_email: cuerpo.to,
      subject: cuerpo.subject ?? '(pendiente de plantilla)',
      template: cuerpo.template ?? null,
      order_id: cuerpo.orderId ?? null,
      project_id: cuerpo.projectId ?? null,
      status: 'PENDIENTE',
    })
    .select('id')
    .single();

  if (cuerpo.template) {
    try {
      const armado = await armarDesdePlantilla(admin, cuerpo);
      cuerpo.subject = armado.asunto;
      cuerpo.html = armado.html;
      cuerpo.text = armado.texto;
      if (registro) {
        await admin.from('email_log').update({ subject: armado.asunto }).eq('id', registro.id);
      }
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      console.error('[send-email] plantilla', detalle);
      if (registro) {
        await admin
          .from('email_log')
          .update({ status: 'FALLIDO', error: `plantilla: ${detalle}` })
          .eq('id', registro.id);
      }
      return respuesta(
        { success: false, error: { code: 'TEMPLATE_FAILED', message: detalle } },
        422,
      );
    }
  }

  try {
    // Gmail muestra la contraseña en bloques con espacios que rompen la autenticación.
    const clave = (conf.smtp_password ?? '').replace(/\s+/g, '');

    // Gmail rechaza remitentes distintos a la cuenta autenticada: se usa la cuenta con el nombre configurado.
    const esGmail = /gmail|googlemail/i.test(conf.smtp_host ?? '');
    const remitente =
      esGmail && conf.smtp_user ? conf.smtp_user : (conf.smtp_from_email ?? conf.smtp_user);

    const cliente = new SMTPClient({
      connection: {
        hostname: conf.smtp_host,
        // 465 con TLS directo: STARTTLS en el 587 falla en Deno ("invalid cmd") y tumba la función.
        port: esGmail ? 465 : (conf.smtp_port ?? 465),
        tls: esGmail ? true : (conf.smtp_port ?? 465) === 465,
        // Sin credenciales se conecta sin autenticar; la librería no las enviaría sin cifrar.
        ...(conf.smtp_user && clave
          ? { auth: { username: conf.smtp_user, password: clave } }
          : {}),
      },
    });

    await cliente.send({
      from: `${conf.smtp_from_name ?? conf.company_name ?? 'Pintuco'} <${remitente}>`,
      to: cuerpo.to,
      subject: cuerpo.subject!,
      content: cuerpo.text ?? ' ',
      html: cuerpo.html,
      // Logo en línea (CID): los clientes bloquean imágenes remotas.
      attachments: cuerpo.html
        ? [{
            contentType: 'image/jpeg',
            filename: 'pintuco.jpg',
            encoding: 'base64',
            content: LOGO_BASE64,
            contentID: LOGO_CID,
          }]
        : [],
    });
    await cliente.close();

    if (registro) {
      await admin
        .from('email_log')
        .update({ status: 'ENVIADO', sent_at: new Date().toISOString() })
        .eq('id', registro.id);
    }

    return respuesta({ success: true, data: { id: registro?.id }, message: 'Correo enviado correctamente' });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    // Detalle técnico a la bitácora; al usuario, un mensaje accionable.
    if (registro) {
      await admin.from('email_log').update({ status: 'FALLIDO', error: detalle }).eq('id', registro.id);
    }
    console.error('[send-email]', detalle);

    return respuesta(
      {
        success: false,
        error: {
          code: 'SEND_FAILED',
          message: /invalid cmd|535|Username and Password/i.test(detalle)
            ? 'Gmail rechazó las credenciales. Revisa que sea una CONTRASEÑA DE APLICACIÓN (no la del correo) y que la cuenta tenga verificación en dos pasos.'
            : /timeout|connect/i.test(detalle)
              ? 'No se pudo conectar al servidor de correo. Revisa el servidor y el puerto (465 para Gmail).'
              : 'No fue posible enviar el correo. Verifica el servidor, el usuario y la contraseña de aplicación en Configuración.',
          detalle,
        },
      },
      502
    );
  }
});

/** Arma el correo desde la base para que nunca contradiga los datos del pedido. */
async function armarDesdePlantilla(
  admin: ReturnType<typeof createClient>,
  cuerpo: Peticion,
): Promise<{ asunto: string; html: string; texto: string }> {
  const { data: conf } = await admin
    .from('app_settings')
    .select('company_name, company_nit, company_address, company_city, company_phone, company_email, company_website, logo_url')
    .eq('id', 1)
    .single();

  const emisor = {
    nombre: conf?.company_name ?? 'Pintuco',
    nit: conf?.company_nit,
    direccion: conf?.company_address,
    ciudad: conf?.company_city,
    telefono: conf?.company_phone,
    email: conf?.company_email,
    web: conf?.company_website,
    logo: conf?.logo_url,
  };

  // URL pública desde internal_config (editable en el portal); la variable de entorno es respaldo.
  const { data: entorno } = await admin
    .from('internal_config')
    .select('site_url')
    .eq('id', 1)
    .maybeSingle();

  const sitio =
    (entorno?.site_url ?? '').trim() ||
    Deno.env.get('SITE_URL') ||
    'http://127.0.0.1:8090';

  // Bienvenida: no hay pedido, solo la persona.
  if (cuerpo.template === 'BIENVENIDA') {
    const { data: perfil } = await admin
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', cuerpo.userId ?? '')
      .maybeSingle();

    const nombre = perfil
      ? `${perfil.first_name ?? ''} ${perfil.last_name ?? ''}`.trim()
      : cuerpo.to.split('@')[0];

    return construir('BIENVENIDA', {
      emisor,
      destinatario: { nombre: nombre || 'cliente', email: cuerpo.to },
      sitio,
    });
  }

  if (!cuerpo.orderId) throw new Error('Esta plantilla necesita un pedido');

  const { data: pedido } = await admin
    .from('orders')
    .select(
      'order_number, status, total_cop, delivery_method, pickup_scheduled_date, user_id, ' +
      'pickup_locations ( name, address, city, phone, hours ), ' +
      'order_items ( product_name, presentation, color_name, quantity, subtotal_cop ), ' +
      'payments ( method, status, is_credit, due_date )',
    )
    .eq('id', cuerpo.orderId)
    .single();

  if (!pedido) throw new Error('Ese pedido no existe');

  const { data: perfil } = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', pedido.user_id)
    .maybeSingle();

  const punto = pedido.pickup_locations
    ? {
        nombre: pedido.pickup_locations.name,
        direccion: pedido.pickup_locations.address,
        ciudad: pedido.pickup_locations.city,
        telefono: pedido.pickup_locations.phone,
        horario: pedido.pickup_locations.hours,
      }
    : null;

  const pagos = (pedido.payments ?? []) as Array<Record<string, unknown>>;
  const pago = pagos[pagos.length - 1];

  return construir(cuerpo.template as Plantilla, {
    emisor,
    destinatario: {
      nombre: `${perfil?.first_name ?? ''} ${perfil?.last_name ?? ''}`.trim() || 'cliente',
      email: cuerpo.to,
    },
    punto,
    pedido: {
      numero: pedido.order_number,
      estado: pedido.status,
      total: Number(pedido.total_cop),
      esEnvio: pedido.delivery_method === 'ENVIO',
      fechaRetiro: pedido.pickup_scheduled_date,
      lineas: (pedido.order_items ?? []).map((l: Record<string, unknown>) => ({
        producto: String(l.product_name ?? ''),
        presentacion: (l.presentation as string) ?? null,
        color: (l.color_name as string) ?? null,
        cantidad: Number(l.quantity ?? 0),
        total: Number(l.subtotal_cop ?? 0),
      })),
    },
    pago: pago
      ? {
          medio: String(pago.method ?? ''),
          aCredito: Boolean(pago.is_credit),
          vence: (pago.due_date as string) ?? null,
        }
      : null,
    sitio,
  });
}
