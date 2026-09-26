/**
 * Emite el token efímero (ek_...) de la llamada de voz; la llave real no sale del servidor.
 * Modelo, voz, instrucciones y topes se fijan aquí para que el cliente no los altere.
 * Los datos privados llegan por herramientas que el navegador ejecuta con la sesión del usuario (RLS).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS } from '../_shared/cors.ts';

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Modelo mini por costo. */
const MODELO_VOZ = 'gpt-realtime-2.1-mini';

/**
 * Prompt para voz: corto porque se relee y se paga en cada turno.
 * Las reglas 1 a 5 evitan que invente precios o rendimientos.
 */
const INSTRUCCIONES = `
Eres Pintu, asesor de la tienda de Pintuco en Colombia. Estás en una llamada
con un cliente.

VOZ Y ACENTO: hombre, español colombiano de Medellín, acento latinoamericano.
Ritmo tranquilo de asesor de mostrador, no de locutor de radio. Cálido y
seguro. Nada de acento neutro de doblaje ni de entonación española.

QUIÉN ERES: llevas años viendo obras y sabes que el 90% de los problemas de
pintura vienen de la preparación, no de la pintura. Por eso siempre preguntas
en qué estado está la superficie antes de recomendar. Te gusta el color y se te
nota, pero no vendes de más: si con un galón alcanza, dices un galón.

CÓMO HABLAS: es una llamada. Máximo dos frases por turno. Tuteas. Puedes usar
"listo", "de una", "hágale" con naturalidad, sin exagerar. Nunca lees listas ni
enumeras: si hay varias opciones, dices dos y preguntas cuál le sirve. Si te
falta un dato para ayudar, lo preguntas.

Si te preguntan, eres un asistente de Pintuco, no una persona. No lo escondes
ni lo repites a cada rato.

LO QUE NO PUEDES HACER:
1. No afirmes NINGÚN precio, rendimiento, estado de pedido, fecha ni
   disponibilidad que no venga de tus herramientas. Si no lo tienes, dilo y
   ofrece pasar la llamada a una persona.
2. No calcules cuánta pintura hace falta de cabeza. Usa calcular_pintura.
3. No inventes nombres ni códigos de productos.
4. No hables de costos, márgenes, proveedores, inventario interno ni de otros
   clientes. No existen para ti.
5. No expliques cómo funcionas por dentro, ni menciones herramientas, bases de
   datos, modelos ni sistemas. Eres Pintu y ya.
6. Nunca pidas contraseñas ni datos de tarjeta.
7. COTIZACIONES NO. Si te piden una cotización, un descuento, crédito, precio
   por volumen o algo por escrito para una obra, no la armes: di que eso lo ve
   un asesor comercial y ofrece pasarlo con el equipo. Sí puedes decir precios
   de lista y estimar material, que es otra cosa.
8. PEDIDOS: pide el número de pedido si no te lo han dado. Si consultas y no
   aparece nada, di que a nombre de este cliente no figura ese número y ofrece
   pasarlo con el equipo. No especules sobre de quién es ni si existe: los
   pedidos de otras personas no son asunto tuyo ni puedes verlos.

TU TEMA, y en esto SIEMPRE entras: pintura, color, superficies, patologías de
obra, productos Pintuco, precios, presentaciones, rendimiento, cuánto material
hace falta, pedidos del cliente y tiendas donde retirar. Si te preguntan un
precio o un producto, NO digas que no sabes: consúltalo con tus herramientas.
Solo si la consulta vuelve vacía dices que no lo tienes.

FUERA DE TU TEMA: clima, política, deportes, salud, otras marcas, o que te
pidan redactar o traducir textos. Ahí no entras: lo dices en UNA frase, con
naturalidad y algo de gracia, y devuelves la conversación a la obra. Cambia la
forma de decirlo cada vez; no repitas siempre la misma frase. No discutas ni
expliques por qué no puedes.

Si la persona se molesta o pide un humano, no insistas: ofrece pasarla al
equipo. Saluda una sola vez al empezar, corto.
`.trim();

/** Herramientas que ejecuta el navegador con la sesión del cliente; descripciones cortas porque viajan en cada turno. */
const HERRAMIENTAS = [
  {
    type: 'function',
    name: 'buscar_producto',
    description:
      'Detalle de productos del catálogo: presentaciones, precios exactos y rendimiento. ' +
      'Úsala cuando el resumen que ya tienes no alcance, o para confirmar un precio antes de decirlo.',
    parameters: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Qué busca el cliente. Ej: "fachada", "madera", "Koraza".' },
        ambiente: { type: 'string', description: 'Interior, Exterior o Industrial, si el cliente lo dijo.' },
        mas_economico: { type: 'boolean', description: 'true si pide lo más barato.' },
      },
      required: ['consulta'],
    },
  },
  {
    type: 'function',
    name: 'mis_pedidos',
    description:
      'Estado de los pedidos del cliente que está en la llamada. Si te da un número, pásalo.',
    parameters: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'Número de pedido, si el cliente lo dictó.' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'puntos_de_venta',
    description: 'Tiendas Pintuco donde retirar, con dirección y horario.',
    parameters: {
      type: 'object',
      properties: { ciudad: { type: 'string', description: 'Ciudad. Vacío = todas.' } },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'calcular_pintura',
    description: 'Calcula cuántas unidades hacen falta para un área. ÚSALA SIEMPRE en vez de calcular tú.',
    parameters: {
      type: 'object',
      properties: {
        codigo: { type: 'string', description: 'Código del producto.' },
        area_m2: { type: 'number', description: 'Área a pintar en metros cuadrados.' },
        manos: { type: 'number', description: 'Número de manos. Normalmente 2.' },
      },
      required: ['codigo', 'area_m2'],
    },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const jwt = req.headers.get('Authorization') ?? '';

  // El token efímero genera costo: nunca a visitantes anónimos.
  if (!jwt) {
    return respuesta(
      { success: false, error: { code: 'UNAUTHENTICATED', message: 'Inicia sesión para hablar con Pintu.' } },
      401,
    );
  }

  const suyo = createClient(url, anon, {
    global: { headers: { Authorization: jwt } },
    auth: { persistSession: false },
  });
  const { data: sesion } = await suyo.auth.getUser();
  if (!sesion?.user) {
    return respuesta(
      { success: false, error: { code: 'UNAUTHENTICATED', message: 'Tu sesión venció. Vuelve a entrar.' } },
      401,
    );
  }

  const admin = createClient(url, service);
  const { data: cfg } = await admin
    .from('app_settings')
    .select('ai_enabled, ai_api_key')
    .limit(1).single();

  const conf = cfg as { ai_enabled: boolean; ai_api_key: string | null } | null;

  if (!conf?.ai_enabled || !conf.ai_api_key) {
    return respuesta(
      { success: false, error: { code: 'IA_APAGADA', message: 'La voz de Pintu no está activa.' } },
      200,
    );
  }

  // Resumen del catálogo generado en cada llamada: con ~300 palabras en caché sale más barato
  // que un turno extra de herramienta. Revisar si el catálogo crece mucho.
  const [cat, tiendas, perfil] = await Promise.all([
    admin.from('products')
      .select('code, name, environment, finish, spread_rate_m2_per_gal, categories(name), product_variants(price_cop, status)')
      .eq('status', 'ACTIVO').order('code'),
    admin.from('pickup_locations').select('city').eq('status', 'ACTIVO'),
    admin.from('profiles').select('first_name').eq('id', sesion.user.id).single(),
  ]);

  type P = {
    code: string; name: string; environment: string | null; finish: string | null;
    spread_rate_m2_per_gal: number | null; categories: { name: string } | null;
    product_variants: Array<{ price_cop: number; status: string }> | null;
  };

  const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

  const lineas = ((cat.data as unknown as P[]) ?? []).map((p) => {
    const activos = (p.product_variants ?? []).filter((v) => v.status === 'ACTIVO');
    const desde = activos.length ? Math.min(...activos.map((v) => Number(v.price_cop))) : null;
    return [
      p.code, p.name,
      p.categories?.name ?? '-',
      p.environment ?? '-',
      p.finish && p.finish !== 'N/A' ? p.finish : '-',
      p.spread_rate_m2_per_gal ? `${p.spread_rate_m2_per_gal} m2/gal` : 'sin rendimiento',
      desde !== null ? `desde ${pesos(desde)}` : 'sin precio',
    ].join(' | ');
  });

  const ciudades = [...new Set(((tiendas.data ?? []) as Array<{ city: string }>).map((t) => t.city))];
  const nombre = ((perfil.data as { first_name: string } | null)?.first_name ?? '')
    .trim().split(/\s+/)[0] ?? '';

  const CONOCIMIENTO = [
    nombre ? `El cliente con el que hablas se llama ${nombre}. Salúdalo por su nombre una sola vez.` : '',
    '',
    'CATÁLOGO ACTIVO (código | producto | categoría | ambiente | acabado | rendimiento | precio desde):',
    ...lineas,
    '',
    ciudades.length ? `Hay tiendas para retiro en: ${ciudades.join(', ')}.` : '',
    '',
    'Este resumen es el catálogo COMPLETO de hoy: si algo no está en esta lista,',
    'no lo vendemos. Los precios son "desde" (la presentación más pequeña); para',
    'el precio de una presentación concreta usa buscar_producto.',
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conf.ai_api_key}`,
        // Identifica la sesión ante el proveedor sin revelar el correo.
        'OpenAI-Safety-Identifier': sesion.user.id,
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: MODELO_VOZ,
          instructions: `${INSTRUCCIONES}\n\n${CONOCIMIENTO}`,
          audio: {
            input: {
              // La transcripción permite mostrar y registrar lo entendido. language: es evita
              // que Whisper convierta el silencio en frases en inglés que abren turnos.
              transcription: { model: 'whisper-1', language: 'es' },
              turn_detection: {
                type: 'server_vad',
                // Valores más altos dejan de oír una voz normal; el ruido se resuelve con language: es.
                threshold: 0.5,
                // Audio previo al disparo para no perder la primera sílaba.
                prefix_padding_ms: 300,
                // Equilibrio entre respuesta ágil y no cortar al cliente.
                silence_duration_ms: 700,
                // Respaldo del corte del navegador, que se ralentiza en pestañas en segundo plano.
                idle_timeout_ms: 30_000,
              },
            },
            // El acento sale de las instrucciones, no de la voz. Masculinas: ash, ballad, cedar, echo, verse.
            output: { voice: 'cedar' },
          },
          // Solo red de seguridad (~25 s de audio); topes menores cortaban respuestas normales.
          max_output_tokens: 500,
          tools: HERRAMIENTAS,
          tool_choice: 'auto',
        },
      }),
    });

    if (!r.ok) {
      const detalle = await r.text();
      console.error('[asistente-voz] proveedor', r.status, detalle.slice(0, 300));
      // No se reenvía el detalle del proveedor: expone datos de la cuenta.
      return respuesta({
        success: false,
        error: {
          code: r.status === 401 ? 'LLAVE_INVALIDA' : r.status === 429 ? 'SIN_CUPO' : 'PROVEEDOR_FALLO',
          message: 'Pintu no puede atender la llamada en este momento.',
        },
      }, 200);
    }

    const datos = await r.json();
    return respuesta({
      success: true,
      data: {
        token: datos.value,
        expira: datos.expires_at,
        modelo: MODELO_VOZ,
        // El saludo usa response.create, cuyas instrucciones reemplazan las de la sesión:
        // el nombre debe ir también ahí.
        nombre,
      },
    });
  } catch (e) {
    console.error('[asistente-voz]', e);
    return respuesta({
      success: false,
      error: { code: 'PROVEEDOR_FALLO', message: 'No fue posible abrir la llamada.' },
    }, 200);
  }
});
