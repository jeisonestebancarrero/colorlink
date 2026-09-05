/**
 * Asistente con modelo de lenguaje — Edge Function
 * ============================================================
 * Redacta la respuesta del asistente de la tienda usando un modelo, pero
 * SIEMPRE sobre datos que ya se consultaron en el sistema.
 *
 * Por qué pasa por aquí y no por el navegador:
 *
 *   1. LA LLAVE. Una llave de API en el paquete JavaScript se la lleva
 *      cualquiera que abra las herramientas del navegador, y se le factura al
 *      dueño hasta que la cancele. La llave vive en `app_settings.ai_api_key`,
 *      con el SELECT revocado, y solo se lee aquí.
 *
 *   2. EL CONTEXTO. Los datos que ve el modelo se leen CON LA SESIÓN DE QUIEN
 *      PREGUNTA, no con la llave de servicio: así RLS sigue mandando y es
 *      imposible que el asistente cuente el pedido de otro. Es la diferencia
 *      entre un asistente y una fuga de datos.
 *
 * Y la regla de fondo: al modelo NO se le pregunta por hechos. Se le pasan los
 * datos ya consultados y se le pide que los redacte. Un modelo suelto sobre un
 * catálogo de pinturas afirma rendimientos y precios con total seguridad, y
 * aquí eso significa un cliente comprando cuatro galones de menos para una
 * fachada.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS } from '../_shared/cors.ts';

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

interface Turno { autor: 'CLIENTE' | 'ASISTENTE'; texto: string }

/**
 * Las instrucciones del modelo.
 *
 * Lo importante no es que suene amable, es lo que tiene PROHIBIDO: inventar
 * cifras. Todo lo que puede afirmar está en el contexto que se le entrega.
 */
const INSTRUCCIONES = `
Te llamas Pintu y eres el asistente de la tienda en línea de Pintuco en
Colombia. Si te preguntan quién eres, di tu nombre y aclara que no eres una
persona; nunca finjas serlo. Hablas español
colombiano, en segunda persona (tú), breve y concreto. Nunca más de cuatro
frases.

REGLAS QUE NO PUEDES ROMPER:

1. Solo puedes afirmar datos que aparezcan en el CONTEXTO que te doy. Si te
   preguntan un precio, un rendimiento, un estado de pedido o una fecha que no
   esté ahí, di que no lo tienes y ofrece pasar la conversación a una persona.
   NUNCA estimes ni supongas una cifra.
2. No inventes nombres de productos. Usa exactamente los del contexto.
3. No prometas fechas de entrega que no estén en el contexto.
4. Si te preguntan cuánta pintura hace falta, NO hagas la cuenta tú: el
   rendimiento cambia por producto y lo calcula el sistema. Pide el área y
   remite a la calculadora.
5. No pidas datos personales, contraseñas ni números de tarjeta. Nunca.
6. Si la persona está molesta o pide un humano, no insistas: ofrece pasar la
   conversación al equipo.

Si el contexto viene vacío, dilo con naturalidad en vez de inventar.
`.trim();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const jwt = req.headers.get('Authorization') ?? '';

  if (!jwt) {
    return respuesta(
      { success: false, error: { code: 'UNAUTHENTICATED', message: 'Inicia sesión.' } },
      401,
    );
  }

  let pregunta = '';
  let historial: Turno[] = [];
  try {
    const cuerpo = await req.json();
    pregunta = String(cuerpo.pregunta ?? '').trim();
    historial = Array.isArray(cuerpo.historial) ? cuerpo.historial.slice(-6) : [];
  } catch {
    return respuesta(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Petición inválida.' } },
      400,
    );
  }

  if (!pregunta) {
    return respuesta(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Escribe una pregunta.' } },
      400,
    );
  }
  // Un tope de longitud: sin él, alguien pega un libro y la factura del
  // proveedor la paga el dueño del sistema.
  if (pregunta.length > 500) pregunta = pregunta.slice(0, 500);

  // ---- La configuración y la llave: solo con permisos de servicio ----
  const admin = createClient(url, service);
  const { data: cfg } = await admin
    .from('app_settings')
    .select('ai_enabled, ai_provider, ai_model, ai_api_key')
    .limit(1).single();

  const conf = cfg as {
    ai_enabled: boolean; ai_provider: string; ai_model: string; ai_api_key: string | null;
  } | null;

  if (!conf?.ai_enabled || !conf.ai_api_key) {
    // No es un error: es el estado normal mientras no haya llave. El navegador
    // responde con el asistente de reglas, que sigue funcionando.
    return respuesta({ success: false, error: { code: 'IA_APAGADA', message: 'La IA no está activa.' } }, 200);
  }

  // ---- El contexto, leído CON LA SESIÓN DE QUIEN PREGUNTA ----
  // Aquí está la garantía: RLS aplica, así que este bloque no puede traer
  // datos de otro cliente por mucho que el modelo los pidiera.
  const suyo = createClient(url, anon, {
    global: { headers: { Authorization: jwt } },
    auth: { persistSession: false },
  });

  const [pedidos, productos, tiendas] = await Promise.all([
    suyo.from('orders')
      .select('order_number, status, total_cop, estimated_delivery_date, shipping_city')
      .order('created_at', { ascending: false }).limit(5),
    // Los nombres de estas columnas estaban MAL (`category`, `ambiente`,
    // `acabado`, `rendimiento`): ninguna existe en `products`, así que la
    // consulta fallaba y el catálogo llegaba VACÍO al modelo, con la nota de
    // que «estos son TODOS los datos disponibles». No se había notado porque
    // sin llave cargada este código nunca llegó a ejecutarse.
    suyo.from('products')
      .select('name, code, environment, finish, spread_rate_m2_per_gal')
      .eq('status', 'ACTIVO').limit(20),
    suyo.from('pickup_locations')
      .select('name, city, address, hours').eq('status', 'ACTIVO').limit(10),
  ]);

  const contexto = {
    sus_pedidos: pedidos.data ?? [],
    catalogo: productos.data ?? [],
    tiendas: tiendas.data ?? [],
    nota: 'Estos son TODOS los datos disponibles. No afirmes nada fuera de aquí.',
  };

  // ---- La llamada al proveedor ----
  const mensajes = [
    { role: 'system', content: INSTRUCCIONES },
    { role: 'system', content: `CONTEXTO (JSON):\n${JSON.stringify(contexto)}` },
    ...historial.map((t) => ({
      role: t.autor === 'CLIENTE' ? 'user' : 'assistant',
      content: String(t.texto).slice(0, 500),
    })),
    { role: 'user', content: pregunta },
  ];

  try {
    // Tope de tiempo: si el proveedor tarda, el cliente no se queda mirando
    // un punto que gira. Se cae al asistente de reglas, que responde ya.
    const reloj = AbortSignal.timeout(20_000);

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: reloj,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conf.ai_api_key}`,
      },
      body: JSON.stringify({
        model: conf.ai_model || 'gpt-4o-mini',
        messages: mensajes,
        // Temperatura baja: aquí no se quiere creatividad, se quiere que
        // repita bien lo que dice el contexto.
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    if (!r.ok) {
      const detalle = await r.text();
      console.error('[asistente-ia] proveedor', r.status, detalle.slice(0, 300));

      // El mensaje del proveedor NO se le devuelve a un cliente: suele incluir
      // pistas sobre la cuenta y la facturación.
      //
      // A un ADMINISTRADOR sí. Sin esto, «la llave no sirve» es todo lo que se
      // sabe, y las causas son muy distintas entre sí —llave revocada, cuenta
      // sin saldo, proyecto sin acceso al modelo— con arreglos igual de
      // distintos. Quedaba adivinar. Lo que se manda va con cualquier cosa con
      // forma de llave tachada, por si el proveedor la repite en su respuesta.
      let paraAdmin: string | undefined;
      try {
        const { data: esAdmin } = await suyo.rpc('is_admin');
        if (esAdmin === true) {
          paraAdmin = detalle
            .replace(/(sk-|ek_|org-)[A-Za-z0-9_-]{6,}/g, '$1<oculto>')
            .slice(0, 400);
        }
      } catch {
        /* si no se puede saber quién es, no se le cuenta nada */
      }

      return respuesta({
        success: false,
        error: {
          code: r.status === 401 ? 'LLAVE_INVALIDA'
            : r.status === 429 ? 'SIN_CUPO' : 'PROVEEDOR_FALLO',
          message: 'El asistente con IA no está disponible en este momento.',
          ...(paraAdmin ? { detalle: paraAdmin, estadoProveedor: r.status } : {}),
        },
      }, 200);
    }

    const datos = await r.json();
    const texto = datos?.choices?.[0]?.message?.content?.trim();
    if (!texto) {
      return respuesta({ success: false, error: { code: 'SIN_RESPUESTA', message: 'Sin respuesta.' } }, 200);
    }

    return respuesta({
      success: true,
      data: {
        texto,
        modelo: conf.ai_model,
        // Para que la pantalla pueda decir de dónde salió, igual que hace el
        // asistente de reglas con «Consultado en tus pedidos».
        contexto: {
          pedidos: contexto.sus_pedidos.length,
          productos: contexto.catalogo.length,
          tiendas: contexto.tiendas.length,
        },
      },
    });
  } catch (e) {
    console.error('[asistente-ia]', e);
    return respuesta({
      success: false,
      error: { code: 'PROVEEDOR_FALLO', message: 'El asistente con IA no respondió a tiempo.' },
    }, 200);
  }
});
