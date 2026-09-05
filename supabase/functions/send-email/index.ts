/**
 * Envío de correo saliente — Edge Function
 * ============================================================
 * POR QUÉ VIVE AQUÍ Y NO EN RENDER:
 * En Render la aplicación se despliega como sitio ESTÁTICO: no hay proceso
 * de servidor donde ejecutar SMTP, y aunque lo hubiera, poner credenciales
 * de correo en un frontend es impensable. Esta función corre en la
 * infraestructura de Supabase, lee la configuración con `service_role` y es
 * el único punto del sistema que conoce la contraseña de aplicación.
 *
 * Configuración: Administración → Configuración → Correo saliente.
 * Para Gmail hace falta una CONTRASEÑA DE APLICACIÓN (no la de la cuenta),
 * con verificación en dos pasos activada.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { construir, type Plantilla } from '../_shared/correos.ts';
import { LOGO_BASE64, LOGO_CID } from '../_shared/logo.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Peticion {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  orderId?: string;
  projectId?: string;
  /** true = correo de prueba disparado desde Administración. */
  esPrueba?: boolean;
  /** Para BIENVENIDA: a quién se le da la bienvenida. */
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

  // Cliente con el JWT de quien llama: sirve para saber QUIÉN pide el envío.
  const authHeader = req.headers.get('Authorization') ?? '';
  const comoUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  // La base dispara estos correos sola, con la llave de servicio. No hay
  // usuario detrás y no debe haberlo: el aviso de "pedido listo" no puede
  // depender de que alguien tenga una pestaña abierta.
  const token = authHeader.replace(/^Bearer\s+/i, '');

  /**
   * El rol que DECLARA el token.
   *
   * Un JWT lleva su carga en claro —está firmado, no cifrado— y esta función
   * corre con `verify_jwt`, así que el gateway YA comprobó la firma antes de
   * dejar pasar la llamada. Leer el rol de ahí es fiable: nadie puede
   * fabricarse un token que diga `service_role` sin la llave de firma.
   */
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

  // Antes esto era SOLO `token === serviceKey`, y era demasiado frágil.
  //
  // Un proyecto puede tener más de una llave de servicio válida, y la que el
  // administrador copia del panel no tiene por qué ser byte a byte la misma
  // que Supabase le inyecta a la función. Cuando no coincidían, la función
  // buscaba un usuario detrás de una llave de servicio, no lo encontraba y
  // respondía 401 «Sesión requerida». Como quien llamaba era la base —que
  // encola y no espera respuesta—, el fallo no dejaba rastro en ningún lado:
  // ni correo, ni error, ni registro. Costó encontrarlo leyendo la cola de
  // pg_net.
  //
  // Se conserva la comparación exacta como primer camino, más rápido y sin
  // decodificar nada, y el rol del token como el que de verdad decide.
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

  // Con plantilla, el asunto y el HTML los arma el servidor a partir de los
  // datos reales; el que llama solo dice de qué pedido se trata.
  if (!cuerpo.to || (!cuerpo.subject && !cuerpo.template)) {
    return respuesta(
      { success: false, error: { code: 'VALIDATION', message: 'Destinatario y asunto son obligatorios' } },
      422
    );
  }

  // service_role: es el único contexto autorizado a leer la contraseña SMTP.
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

  // Se exige el servidor; usuario y contraseña son opcionales para admitir
  // un relé interno sin autenticación (escenario habitual en una red
  // corporativa). Con Gmail siempre habrá credenciales.
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

  // El registro se abre ANTES de componer la plantilla.
  //
  // Estaba después, y por eso un fallo al armar el correo no dejaba rastro:
  // la función respondía 422 y se iba sin escribir nada. Desde fuera se veía
  // un correo que sencillamente no existía —ni enviado, ni fallido, ni
  // omitido—, y no había por dónde empezar a mirar. Cualquier cosa que se
  // intenta enviar tiene que quedar anotada, sobre todo si sale mal.
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

  // ── Composición desde plantilla ──────────────────────────────────────
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
    // Gmail muestra la contraseña de aplicación en cuatro bloques separados
    // por espacios ("abcd efgh ijkl mnop"). Casi todo el mundo la copia tal
    // cual, y con los espacios la autenticación falla sin decir por qué.
    const clave = (conf.smtp_password ?? '').replace(/\s+/g, '');

    // Gmail no deja enviar en nombre de otro dominio: si el remitente no es la
    // cuenta autenticada (ni un alias verificado), rechaza la conexión. Se usa
    // la cuenta real y el nombre configurado, que es lo que el destinatario ve.
    const esGmail = /gmail|googlemail/i.test(conf.smtp_host ?? '');
    const remitente =
      esGmail && conf.smtp_user ? conf.smtp_user : (conf.smtp_from_email ?? conf.smtp_user);

    const cliente = new SMTPClient({
      connection: {
        hostname: conf.smtp_host,
        // Se fuerza el 465 con Gmail. El 587 negocia STARTTLS sobre una
        // conexión ya abierta y esa negociación revienta dentro del runtime
        // de Deno ("invalid cmd"), tumbando la función entera antes de que se
        // pueda capturar el error. Con TLS directo en el 465 el envío es
        // estable, y es un puerto que Gmail admite igual.
        port: esGmail ? 465 : (conf.smtp_port ?? 465),
        tls: esGmail ? true : (conf.smtp_port ?? 465) === 465,
        // La librería se niega a enviar credenciales por un canal sin
        // cifrar, y hace bien: si no hay credenciales, se conecta sin
        // autenticar en lugar de exponerlas.
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
      // El logotipo viaja dentro del correo. Una URL remota no serviría: en
      // desarrollo apunta a 127.0.0.1 y, aun publicada, Gmail y Outlook
      // bloquean las imágenes externas hasta que el destinatario las acepta.
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
    // El detalle técnico queda en la bitácora; al usuario se le da una
    // explicación accionable, no la traza del error.
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


/**
 * Arma el correo leyendo el pedido, sus líneas, el punto de retiro y los datos
 * de la empresa. Se hace aquí y no en quien llama para que ningún correo
 * pueda decir algo distinto de lo que la base contiene.
 */
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

  // La dirección pública de la tienda sale de `internal_config`, que es lo que
  // el portal deja editar en «Entorno de correo».
  //
  // Antes se leía SOLO de la variable de entorno de la función, y en el
  // servidor nuevo esa variable no existía: todos los enlaces de todos los
  // correos —«ver mi pedido», «explorar la tienda»— salieron apuntando a
  // `http://127.0.0.1:8090`, o sea al computador de quien los recibía. Peor
  // aún, había dos fuentes para el mismo dato y la que se podía configurar no
  // era la que se usaba: cambiarla en el portal no surtía ningún efecto.
  //
  // Se conserva la variable de entorno como respaldo por si la configuración
  // todavía no se ha llenado.
  const { data: entorno } = await admin
    .from('internal_config')
    .select('site_url')
    .eq('id', 1)
    .maybeSingle();

  const sitio =
    (entorno?.site_url ?? '').trim() ||
    Deno.env.get('SITE_URL') ||
    'http://127.0.0.1:8090';

  // ── Bienvenida: no hay pedido, solo la persona ──────────────────────
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
