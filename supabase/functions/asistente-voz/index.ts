/**
 * Pintu por voz — Edge Function
 * ============================================================
 * Emite el token EFÍMERO con el que el navegador abre la llamada con el
 * modelo. Es lo único que hace, y es todo lo que debe hacer.
 *
 * POR QUÉ EXISTE ESTA FUNCIÓN, en vez de conectar el navegador directo:
 *
 *   1. LA LLAVE NO SALE DE AQUÍ. Una llave de OpenAI en el paquete JavaScript
 *      se la lleva cualquiera que abra las herramientas del navegador y se le
 *      factura al dueño hasta que la cancele. La llave real vive en
 *      `app_settings.ai_api_key` y solo se lee con permisos de servicio. Al
 *      navegador le llega un `ek_...` que caduca en minutos y solo sirve para
 *      esta llamada.
 *   2. LA CONFIGURACIÓN TAMPOCO SE NEGOCIA EN EL CLIENTE. El modelo, la voz,
 *      las instrucciones y el tope de tokens se fijan aquí. Si el navegador
 *      pudiera elegirlos, cualquiera cambiaría `gpt-realtime-2.1-mini` por el
 *      modelo caro, o borraría las reglas que impiden que Pintu invente
 *      precios.
 *
 * LO QUE **NO** VIAJA AL MODELO: aquí no se le manda el catálogo, ni los
 * pedidos, ni nada. La API de voz es con estado y relee todo el contexto en
 * cada turno, así que un catálogo metido en las instrucciones se paga en cada
 * frase de la conversación. En su lugar se le dan HERRAMIENTAS, y las ejecuta
 * el navegador con la sesión de quien llama: RLS sigue mandando y solo viaja
 * lo que hace falta para esa pregunta.
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

/** El modelo barato. Ver el comentario de costos más abajo. */
const MODELO_VOZ = 'gpt-realtime-2.1-mini';

/**
 * Quién es Pintu.
 *
 * Está escrito para VOZ, no para pantalla: sin listas, sin viñetas, sin
 * markdown, frases cortas. Y está escrito para ser CORTO, porque estas
 * instrucciones se releen en cada turno de la conversación y se pagan cada
 * vez. Cada frase que sobra aquí se multiplica por toda la llamada.
 *
 * Las reglas de la 1 a la 5 no son de estilo: son las que impiden que un
 * modelo suelto sobre un catálogo de pinturas afirme un rendimiento con total
 * seguridad y un cliente compre cuatro galones de menos para su fachada.
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

/**
 * Las herramientas. Las ejecuta el NAVEGADOR con la sesión del cliente.
 *
 * Las descripciones son cortas a propósito: viajan en cada turno igual que las
 * instrucciones. Y los parámetros son pocos porque cada uno es una decisión
 * más que el modelo puede equivocar.
 */
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

  // Sin sesión no hay llamada: el token efímero cuesta dinero real en cuanto
  // se usa, así que no se le entrega a un visitante anónimo.
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

  // ─────────────────────────────────────────────────────────────────────
  // La base de conocimiento: un RESUMEN del catálogo, generado en vivo.
  // ─────────────────────────────────────────────────────────────────────
  // Aquí hay una decisión que depende del tamaño real del catálogo, y conviene
  // dejarla escrita porque se invierte si el catálogo crece.
  //
  // La API de voz relee las instrucciones en CADA turno. Por eso la regla
  // general es no meterle datos: se pagarían una y otra vez. PERO el prefijo
  // constante de una sesión se cobra como contexto en caché —$0,30 por millón
  // frente a $10—, y este catálogo cabe en unas 300 palabras.
  //
  // Con esas dos cosas juntas, meter un resumen sale MÁS BARATO que no
  // meterlo: sin él, cada «¿cuál es la más económica para exterior?» obliga a
  // una llamada a herramienta y a un turno de audio extra para contestar, y un
  // turno de audio cuesta bastante más que releer trescientas palabras en
  // caché. El resumen le deja responder de una.
  //
  // Las herramientas NO desaparecen: siguen para lo que no puede vivir aquí
  // —los pedidos, que son privados y cambian; el cálculo, que debe hacer la
  // base; y el detalle fino de presentaciones—.
  //
  // SE GENERA EN CADA LLAMADA desde la base, así que si cargan un producto,
  // una presentación o una categoría nueva, entra solo. No hay ninguna
  // referencia escrita a mano.
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
              // La transcripción de lo que dice el cliente se paga aparte,
              // pero sin ella la pantalla no puede mostrar qué entendió Pintu
              // ni queda registro de la llamada. En un sistema que se vende,
              // eso vale más que lo que cuesta.
              //
              // `language: es` no es cosmético: sin fijarlo, Whisper oye el
              // ruido de fondo de un micrófono en silencio y lo transcribe
              // como frases sueltas en inglés («Thank you.», «Now.»). Cada una
              // de esas alucinaciones abría un turno y hacía responder a
              // Pintu: audio facturado por conversar con el ruido ambiente.
              transcription: { model: 'whisper-1', language: 'es' },
              turn_detection: {
                type: 'server_vad',
                // El umbral por defecto (0.5) está bien calibrado para una
                // voz normal a un palmo del micrófono del portátil. Se probó
                // a 0.65 para frenar las alucinaciones del silencio y el
                // resultado fue que dejaba de oír a quien hablaba normal: el
                // remedio para el ruido es `language: es` en la
                // transcripción, no volver sordo al detector.
                threshold: 0.5,
                // Un poco de audio ANTES del disparo, o la primera sílaba se
                // pierde y el modelo entiende media palabra.
                prefix_padding_ms: 300,
                // El turno se cierra a los 0,7 s de que el cliente calla. Más
                // largo se siente lento; más corto lo interrumpe a mitad de
                // frase.
                silence_duration_ms: 700,
                // Corte del lado del SERVIDOR si nadie habla en 30 s. No
                // sustituye al del navegador, lo respalda: el navegador
                // ralentiza los temporizadores de una pestaña en segundo
                // plano, así que si el cliente cambia de pestaña con la
                // llamada abierta, el único que corta a tiempo es este.
                idle_timeout_ms: 30_000,
              },
            },
            // Voz masculina. Las voces del proveedor no tienen región: el
            // acento colombiano no sale de elegir la voz, sale de pedírselo
            // en las instrucciones. Si se quiere otro timbre, las válidas
            // para este modelo son alloy, ash, ballad, cedar, coral, echo,
            // marin, sage y verse; masculinas: ash, ballad, cedar, echo, verse.
            output: { voice: 'cedar' },
          },
          // Red de seguridad, NO el limitador normal.
          //
          // Quien acorta las respuestas es la instrucción de hablar en dos
          // frases; esto solo evita el monólogo si el modelo se desboca. A 200
          // y a 320 el tope se alcanzaba en respuestas normales y las cortaba
          // A MITAD DE PALABRA, que suena a llamada caída. 500 tokens de audio
          // son unos 25 segundos: de sobra para dos frases, y sigue siendo un
          // techo firme para la factura.
          max_output_tokens: 500,
          tools: HERRAMIENTAS,
          tool_choice: 'auto',
        },
      }),
    });

    if (!r.ok) {
      const detalle = await r.text();
      console.error('[asistente-voz] proveedor', r.status, detalle.slice(0, 300));
      // El mensaje del proveedor no se reenvía: suele traer pistas de la
      // cuenta y de la facturación.
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
        // El nombre viaja aparte porque el saludo se pide con un
        // `response.create` que trae sus PROPIAS instrucciones, y esas
        // SUSTITUYEN a las de la sesión: el nombre que va en el conocimiento
        // no lo ve el modelo en ese primer turno. Por eso hay que metérselo
        // ahí. Era el motivo por el que saludaba sin nombre.
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
