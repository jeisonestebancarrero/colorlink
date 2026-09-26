/**
 * El modelo solo redacta sobre datos ya consultados; no se le piden hechos.
 * La llave (app_settings.ai_api_key, sin SELECT) se lee aquí; el contexto se lee con la sesión
 * del usuario para que RLS impida exponer datos ajenos.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS } from '../_shared/cors.ts';

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

interface Turno { autor: 'CLIENTE' | 'ASISTENTE'; texto: string }

/** Prompt de sistema: lo clave es que no invente cifras fuera del contexto. */
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
  // Tope de longitud para acotar el costo del proveedor.
  if (pregunta.length > 500) pregunta = pregunta.slice(0, 500);

  // Configuración y llave: solo con service_role.
  const admin = createClient(url, service);
  const { data: cfg } = await admin
    .from('app_settings')
    .select('ai_enabled, ai_provider, ai_model, ai_api_key')
    .limit(1).single();

  const conf = cfg as {
    ai_enabled: boolean; ai_provider: string; ai_model: string; ai_api_key: string | null;
  } | null;

  if (!conf?.ai_enabled || !conf.ai_api_key) {
    // Estado normal sin llave: el navegador cae al asistente de reglas.
    return respuesta({ success: false, error: { code: 'IA_APAGADA', message: 'La IA no está activa.' } }, 200);
  }

  // Contexto con la sesión del usuario: RLS impide traer datos de otro cliente.
  const suyo = createClient(url, anon, {
    global: { headers: { Authorization: jwt } },
    auth: { persistSession: false },
  });

  const [pedidos, productos, tiendas] = await Promise.all([
    suyo.from('orders')
      .select('order_number, status, total_cop, estimated_delivery_date, shipping_city')
      .order('created_at', { ascending: false }).limit(5),
    // Columnas reales de products: si la consulta falla, el modelo recibe un catálogo vacío.
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
    // Si el proveedor tarda, se cae al asistente de reglas.
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
        // Baja para que se ciña al contexto.
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    if (!r.ok) {
      const detalle = await r.text();
      console.error('[asistente-ia] proveedor', r.status, detalle.slice(0, 300));

      // El detalle del proveedor revela datos de la cuenta: solo a administradores,
      // y con todo lo que parezca una llave tachado.
      let paraAdmin: string | undefined;
      try {
        const { data: esAdmin } = await suyo.rpc('is_admin');
        if (esAdmin === true) {
          paraAdmin = detalle
            .replace(/(sk-|ek_|org-)[A-Za-z0-9_-]{6,}/g, '$1<oculto>')
            .slice(0, 400);
        }
      } catch {
        /* sin rol confirmado no se expone el detalle */
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
        // Permite a la UI indicar la fuente de la respuesta.
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
