import { trackingService, type PedidoCliente } from './tracking';
import { productService, storeService } from './catalog';
import { conversacionPedidoService } from './conversacion';
import { supabase } from '../lib/supabase';

/**
 * Asistente de la tienda.
 *
 * QUÉ ES Y QUÉ NO ES, porque importa: **no hay modelo de lenguaje detrás**.
 * Es un asistente de reglas que responde CONSULTANDO el sistema —los pedidos
 * de quien pregunta, el catálogo real, las tiendas reales— y que, cuando no
 * sabe, lo dice y pasa la pregunta a una persona.
 *
 * Se hizo así a propósito. Un modelo generativo sin control sobre un catálogo
 * de pinturas inventa rendimientos, precios y tiempos de entrega con total
 * seguridad, y en este negocio eso significa un cliente comprando cuatro
 * galones de menos para una fachada. Aquí, si un dato no está en la base, el
 * asistente no lo dice.
 *
 * Lo que sí sabe hacer, todo con datos verificables:
 *   · dónde va un pedido y cuándo llega;
 *   · cuánta pintura hace falta para un área (con el motor del servidor, el
 *     mismo de la calculadora, no una cuenta aparte);
 *   · qué producto sirve para una superficie, buscando en el catálogo;
 *   · dónde está la tienda más cercana y su horario;
 *   · y pasar la conversación a una persona, escribiendo en el hilo del
 *     pedido, que es donde el equipo ya la ve.
 */

/**
 * El nombre del asistente.
 *
 * Se escribe UNA vez y se usa en todas partes —cabecera, saludo, respuestas y
 * las instrucciones del modelo— para que no se contradiga a sí mismo. Cambiarlo
 * es cambiar esta línea.
 *
 * «Pintu» por lo obvio: es de Pintuco, se dice fácil y nadie lo confunde con
 * una persona, que es justo lo que se busca.
 */
export const NOMBRE = 'Pintu';

export type AutorMensaje = 'CLIENTE' | 'ASISTENTE';

export interface MensajeAsistente {
  id: string;
  autor: AutorMensaje;
  texto: string;
  /** Botones que ofrece la respuesta. */
  acciones?: AccionAsistente[];
  /** Si la respuesta salió de una consulta, de dónde. */
  fuente?: string;
  /**
   * Lista para elegir, cuando hay más de un pedido.
   *
   * Con botones no se puede: quien tiene treinta pedidos vería treinta
   * botones, y en una burbuja de 24 rem eso no cabe ni se lee. Un desplegable
   * con filtro por estado sí escala.
   */
  selector?: SelectorPedidos;
}

export interface OpcionPedido {
  numero: string;
  estado: string;
  /** En palabras, para que el desplegable se entienda sin saber los códigos. */
  descripcion: string;
  enCurso: boolean;
}

export interface SelectorPedidos {
  opciones: OpcionPedido[];
  /** Qué se pregunta al elegir uno. `{numero}` se sustituye. */
  plantilla: string;
}

export interface AccionAsistente {
  etiqueta: string;
  /** Navegar dentro de la tienda. */
  ir?: { pagina: string; param?: string };
  /** Texto que se envía como si lo hubiera escrito la persona. */
  preguntar?: string;
  /** Pasar la conversación a una persona, en el hilo de este pedido. */
  escalarA?: string;
}

let contador = 0;
const nuevoId = () => `m${(contador += 1)}`;

export const decir = (
  texto: string,
  acciones?: AccionAsistente[],
  fuente?: string,
): MensajeAsistente => ({ id: nuevoId(), autor: 'ASISTENTE', texto, acciones, fuente });

export const dijoElCliente = (texto: string): MensajeAsistente =>
  ({ id: nuevoId(), autor: 'CLIENTE', texto });

// ------------------------------------------------------------
// Entender la pregunta
// ------------------------------------------------------------

/** Quita tildes y baja a minúsculas: «Dónde está» y «donde esta» son lo mismo. */
function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Se buscan RAÍCES, no palabras completas.
 *
 * La gente escribe «ya despacharon lo mío», no «despacho»; «me lo entregaron»,
 * no «entrega». Con la palabra entera el asistente no entendía la mitad de las
 * frases reales y contestaba «no te entendí» a una pregunta clarísima.
 */
const INTENCIONES: Array<{ nombre: string; palabras: string[] }> = [
  { nombre: 'PEDIDO', palabras: ['pedido', 'orden', 'envi', 'entreg', 'lleg', 'despach', 'guia', 'rastre', 'seguimiento'] },
  { nombre: 'CANTIDAD', palabras: ['cuanta', 'cuanto', 'galon', 'litro', 'alcanza', 'rinde', 'rendimiento', 'metro', 'm2', 'calcul'] },
  { nombre: 'PRODUCTO', palabras: ['pintura', 'producto', 'sirve', 'recomien', 'cual', 'fachada', 'interior', 'techo', 'madera', 'metal', 'humedad', 'piso', 'bano', 'cocina'] },
  { nombre: 'TIENDA', palabras: ['tienda', 'sede', 'punto', 'donde queda', 'direccion', 'horario', 'recoger', 'retiro'] },
  { nombre: 'FACTURA', palabras: ['factura', 'iva', 'precio', 'cuesta', 'vale', 'pago', 'pagar', 'credito'] },
  { nombre: 'PERSONA', palabras: ['asesor', 'persona', 'humano', 'hablar con', 'reclamo', 'queja'] },
  // Lo social va al final a propósito: si alguien escribe «hola, dónde va mi
  // pedido», gana PEDIDO por número de aciertos y se le responde lo que de
  // verdad preguntó, en vez de devolverle un saludo.
  { nombre: 'SALUDO', palabras: ['hola', 'buenas', 'buenos dias', 'buen dia', 'buenas tardes', 'buenas noches', 'que mas', 'quiubo', 'hey', 'saludos'] },
  { nombre: 'GRACIAS', palabras: ['gracias', 'muchas gracias', 'mil gracias', 'te pasaste', 'excelente', 'perfecto', 'listo'] },
  { nombre: 'DESPEDIDA', palabras: ['chao', 'adios', 'hasta luego', 'nos vemos', 'bye'] },
  { nombre: 'QUIEN_ERES', palabras: ['quien eres', 'como te llamas', 'eres un bot', 'eres humano', 'eres una persona', 'eres real', 'que eres'] },
];

/**
 * Un numero de pedido escrito en la frase.
 *
 * `ORD-PNT-000029`, `DEMO-2411-35427`: un codigo con guiones y digitos. Basta
 * para saber que se pregunta por un pedido, aunque la palabra «pedido» no
 * aparezca por ningun lado.
 */
const PARECE_NUMERO_DE_PEDIDO = /\b[a-z]{3,6}-[a-z0-9]{2,6}-\d{3,8}\b/i;

/**
 * Formas de preguntar por un pedido sin nombrarlo.
 *
 * «¿Donde va...?», «¿como va...?», «¿que paso con...?». Se buscan como frase y
 * no como palabra suelta porque «va» o «paso» por su cuenta no significan nada.
 */
const FRASES_DE_PEDIDO = ['donde va', 'como va', 'que paso con', 'en que va', 'ya salio'];

export function intencionDe(texto: string): string {
  const t = normalizar(texto);

  /*
   * Un numero de pedido manda sobre todo lo demas.
   *
   * FALLO REAL que esto cierra: al elegir del desplegable se enviaba
   * «¿Donde va ORD-PNT-000029?» y el asistente contestaba «no te entendi».
   * Ninguna de sus palabras clave aparecia —«ord-pnt» no es «orden»— asi que
   * la frase mas clara posible caia en desconocida. Que el propio asistente no
   * entienda lo que el mismo acaba de ofrecer es de lo peor que puede pasar.
   */
  if (PARECE_NUMERO_DE_PEDIDO.test(texto) || FRASES_DE_PEDIDO.some((f) => t.includes(f))) {
    // Salvo que ademas pidan una persona: eso pesa mas que consultar el estado.
    const pidePersona = INTENCIONES.find((i) => i.nombre === 'PERSONA');
    if (pidePersona && pidePersona.palabras.some((w) => t.includes(w))) return 'PERSONA';
    return 'PEDIDO';
  }

  let mejor = { nombre: 'DESCONOCIDA', aciertos: 0 };
  for (const i of INTENCIONES) {
    const aciertos = i.palabras.filter((p) => t.includes(p)).length;
    if (aciertos > mejor.aciertos) mejor = { nombre: i.nombre, aciertos };
  }
  return mejor.nombre;
}

/** Área en m² mencionada en la frase: «tengo 85 metros», «120 m2». */
export function areaMencionada(texto: string): number | null {
  const t = normalizar(texto);
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metros?|mts)/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Número de pedido mencionado: «ORD-PNT-000106» o solo «106». */
export function pedidoMencionado(texto: string, pedidos: PedidoCliente[]): PedidoCliente | null {
  const t = texto.toUpperCase();
  const exacto = pedidos.find((p) => t.includes(p.numero.toUpperCase()));
  if (exacto) return exacto;
  const soloNumero = t.match(/\b0*(\d{1,6})\b/);
  if (!soloNumero) return null;
  return pedidos.find((p) => p.numero.replace(/\D/g, '').replace(/^0+/, '') === soloNumero[1])
    ?? null;
}

// ------------------------------------------------------------
// Responder
// ------------------------------------------------------------

const ESTADO_EN_PALABRAS: Record<string, string> = {
  PENDIENTE: 'está pendiente de pago',
  CONFIRMADO: 'ya está confirmado y entra a preparación',
  PREPARANDO: 'lo están alistando en la tienda',
  LISTO: 'ya está listo para que lo recojas',
  EN_TRANSITO: 'va en camino',
  ENTREGADO: 'fue entregado',
  CANCELADO: 'fue cancelado',
};

/**
 * ¿Preguntan por UNO o por TODOS?
 *
 * «¿Qué pedidos he hecho?» es una lista; «¿dónde va mi pedido?» es uno. Antes
 * no se distinguía y a la pregunta en plural se le contestaba con un solo
 * pedido —el más reciente—, que dejaba fuera todo lo demás.
 */
function pideLaLista(texto: string): boolean {
  const t = normalizar(texto);
  return /\bpedidos\b/.test(t)
    || /(cuantos|cuales|que).{0,12}(pedidos|ordenes)/.test(t)
    || /(mis|todos).{0,10}(pedidos|ordenes)/.test(t)
    || /historial/.test(t);
}

/** Los que todavía están vivos: es de lo que la gente pregunta. */
const enCurso = (p: PedidoCliente) =>
  p.estado !== 'ENTREGADO' && p.estado !== 'CANCELADO';

async function responderPedido(texto: string): Promise<MensajeAsistente> {
  const pedidos = await trackingService.misPedidos();

  if (pedidos.length === 0) {
    return decir(
      'Todavía no tienes pedidos. Cuando hagas el primero, aquí te digo en qué '
      + 'va y cuándo llega.',
      [{ etiqueta: 'Ver la tienda', ir: { pagina: 'store' } }],
    );
  }

  // ── Pregunta en plural: se listan, no se elige uno ──
  if (pideLaLista(texto) && !pedidoMencionado(texto, pedidos)) {
    const activos = pedidos.filter(enCurso);
    const lista = (activos.length > 0 ? activos : pedidos)
      .slice(0, 5)
      .map((p) => `· ${p.numero} — ${ESTADO_EN_PALABRAS[p.estado] ?? p.estado}`)
      .join('\n');

    const cuantos = pedidos.length;
    const encabezado = activos.length > 0
      ? `Tienes ${activos.length} ${activos.length === 1 ? 'pedido en curso' : 'pedidos en curso'}:`
      : `No tienes pedidos en curso. Los últimos que hiciste:`;

    const respuesta = decir(
      `${encabezado}\n${lista}`
      + (cuantos > 5 ? `\n\nY ${cuantos - 5} más en tu historial.` : '')
      + '\n\n¿Sobre cuál quieres saber?',
      [{ etiqueta: 'Ver todos mis pedidos', ir: { pagina: 'orders' } }],
      'Consultado en tus pedidos',
    );

    // El desplegable lleva TODOS, no solo los cinco que se enumeran arriba:
    // el texto resume y la lista sirve para llegar a cualquiera.
    respuesta.selector = {
      plantilla: '¿Dónde va {numero}?',
      opciones: pedidos.map((p) => ({
        numero: p.numero,
        estado: p.estado,
        descripcion: ESTADO_EN_PALABRAS[p.estado] ?? p.estado.toLowerCase(),
        enCurso: enCurso(p),
      })),
    };
    return respuesta;
  }

  /*
   * Cuál se elige cuando no se nombra ninguno.
   *
   * El más reciente EN CURSO, no el más reciente a secas. Antes se cogía
   * `pedidos[0]` y podía salir uno cancelado o ya entregado, que es
   * justamente de lo que nadie pregunta: quien escribe quiere saber por lo
   * que está esperando.
   */
  const elegido = pedidoMencionado(texto, pedidos)
    ?? pedidos.find(enCurso)
    ?? pedidos[0];
  const estado = ESTADO_EN_PALABRAS[elegido.estado] ?? `está en ${elegido.estado}`;

  // La fecha estimada la calcula la base con los días de la ciudad; no se
  // inventa aquí una promesa de entrega.
  const cuando = elegido.estimada
    ? ` La fecha estimada es el ${new Date(elegido.estimada).toLocaleDateString('es-CO', {
        day: 'numeric', month: 'long',
      })}.`
    : '';

  const comoLlega = elegido.esEnvio
    ? `Va con envío${elegido.ciudad ? ` a ${elegido.ciudad}` : ''}.`
    : 'Es para retiro en tienda.';

  // Sobre un pedido terminado ya no se puede abrir conversación: la base la
  // cierra al llegar a entregado o cancelado. Ofrecerlo sería mandar a la
  // persona a un botón que va a fallar.
  const vivo = enCurso(elegido);

  return decir(
    `Tu pedido ${elegido.numero} ${estado}. ${comoLlega}${cuando}`
    + (vivo ? '' : ' Como ya terminó, su conversación quedó cerrada.'),
    [
      { etiqueta: 'Ver el detalle', ir: { pagina: 'orders', param: elegido.numero } },
      ...(vivo
        ? [{ etiqueta: 'Hablar con una persona', escalarA: elegido.id }]
        : [{ etiqueta: 'Ver mis otros pedidos', preguntar: '¿Qué pedidos tengo?' }]),
    ],
    'Consultado en tus pedidos',
  );
}

async function responderProducto(texto: string): Promise<MensajeAsistente> {
  const t = normalizar(texto);

  // Se traduce lo que dice la persona a lo que el catálogo entiende. Si no
  // reconoce la superficie, se pregunta en vez de recomendar cualquier cosa.
  const superficies: Array<[string[], string]> = [
    [['fachada', 'exterior', 'afuera'], 'Fachadas & Exteriores'],
    [['interior', 'sala', 'cuarto', 'habitacion', 'adentro'], 'Vinilos & Interiores'],
    [['techo', 'losa', 'humedad', 'gotera', 'impermeab'], 'Impermeabilizantes'],
    [['metal', 'reja', 'oxido', 'puerta metalica'], 'Esmaltes & Metales'],
    [['madera', 'puerta de madera'], 'Maderas'],
    [['piso', 'garaje', 'bodega'], 'Pisos'],
  ];
  const encontrada = superficies.find(([claves]) => claves.some((c) => t.includes(c)));

  if (!encontrada) {
    return decir(
      '¿Para qué superficie es? Dime si es fachada, interior, techo, metal, madera o piso '
      + 'y te muestro lo que Pintuco tiene para eso.',
      [
        { etiqueta: 'Fachada', preguntar: 'Necesito pintura para fachada' },
        { etiqueta: 'Interior', preguntar: 'Necesito pintura para interior' },
        { etiqueta: 'Techo con humedad', preguntar: 'Tengo humedad en el techo' },
        { etiqueta: 'Metal', preguntar: 'Necesito pintura para metal' },
      ],
    );
  }

  const [, categoria] = encontrada;
  const productos = await productService.getProducts({ category: categoria });

  if (productos.length === 0) {
    return decir(
      `Ahora mismo no tengo productos cargados para ${categoria.toLowerCase()}. `
      + 'Un asesor puede recomendarte.',
      [{ etiqueta: 'Ver todo el catálogo', ir: { pagina: 'store' } }],
    );
  }

  const lista = productos.slice(0, 3).map((p) => `· ${p.name}`).join('\n');
  return decir(
    `Para ${categoria.toLowerCase()} tenemos:\n${lista}\n\n`
    + '¿Sabes cuántos metros cuadrados vas a pintar? Con eso te digo cuánto necesitas.',
    [{ etiqueta: 'Ver estos productos', ir: { pagina: 'store', param: categoria } }],
    'Consultado en el catálogo',
  );
}

async function responderTienda(texto: string): Promise<MensajeAsistente> {
  const tiendas = await storeService.getStores();
  if (tiendas.length === 0) {
    return decir('No pude consultar las tiendas en este momento.');
  }

  const t = normalizar(texto);
  const enSuCiudad = tiendas.filter((s) => t.includes(normalizar(s.city)));
  const mostrar = enSuCiudad.length > 0 ? enSuCiudad : tiendas;

  const lista = mostrar.slice(0, 3)
    .map((s) => `· ${s.name}\n  ${s.address} — ${s.city}${s.hours ? `\n  ${s.hours}` : ''}`)
    .join('\n\n');

  return decir(
    enSuCiudad.length > 0
      ? `Estas son nuestras tiendas ahí:\n\n${lista}`
      : `Tenemos ${tiendas.length} puntos. Los más cercanos que puedo mostrarte:\n\n${lista}`,
    [{ etiqueta: 'Ver todos los puntos', ir: { pagina: 'stores' } }],
    'Consultado en puntos de venta',
  );
}

function responderCantidad(texto: string): MensajeAsistente {
  const area = areaMencionada(texto);

  if (area === null) {
    return decir(
      '¿Cuántos metros cuadrados vas a pintar? Con el área te digo cuántos galones '
      + 'necesitas, usando el rendimiento real de cada producto.',
      [{ etiqueta: 'Abrir la calculadora', ir: { pagina: 'calculator' } }],
    );
  }

  // El cálculo NO se hace aquí: lo hace `calculate_paint` en el servidor,
  // que lee el rendimiento del producto de la base. Repetir la fórmula en el
  // asistente era el error que ya existió, con dos motores dando cifras
  // distintas.
  return decir(
    `Para ${area} m² el cálculo depende del producto: cada pintura rinde distinto y `
    + 'el rendimiento está guardado por referencia. Te abro la calculadora con esa '
    + 'área para que elijas el producto y te dé la cifra exacta.',
    [{ etiqueta: `Calcular para ${area} m²`, ir: { pagina: 'calculator', param: String(area) } }],
  );
}

function responderFactura(): MensajeAsistente {
  return decir(
    'Los precios del catálogo ya incluyen IVA: lo que ves es lo que pagas. '
    + 'En el carrito se desglosa la base y el impuesto, y la factura sale con ese '
    + 'mismo desglose.',
    [
      { etiqueta: 'Ver mis pedidos', ir: { pagina: 'orders' } },
      { etiqueta: 'Ir a la tienda', ir: { pagina: 'store' } },
    ],
  );
}

async function responderPersona(texto = ''): Promise<MensajeAsistente> {
  const pedidos = await trackingService.misPedidos();
  if (pedidos.length === 0) {
    return decir(
      'Para pasarte con una persona necesito un pedido al que asociar la '
      + 'conversación. Si tu duda es antes de comprar, escríbenos por la línea '
      + 'del constructor: 01 8000 111-247.',
    );
  }
  // Solo los que siguen en curso: en un pedido terminado la conversación está
  // cerrada y el botón no haría nada.
  const abiertos = pedidos.filter(enCurso);

  /*
   * Si ya dijeron cuál, no se vuelve a preguntar.
   *
   * Pasa al elegir del desplegable: llega «Quiero hablar con un asesor sobre
   * ORD-PNT-000029». Volver a pedir el pedido después de haberlo elegido es
   * hacerle repetir a la persona algo que acaba de decir.
   */
  const nombrado = pedidoMencionado(texto, pedidos);
  if (nombrado) {
    if (!enCurso(nombrado)) {
      return decir(
        `El pedido ${nombrado.numero} ya terminó, así que su conversación está `
        + 'cerrada. Si es sobre otro, dime cuál; si no, llámanos a la Línea '
        + 'Constructor: 01 8000 111-247.',
      );
    }
    return decir(
      `Listo, le escribo al equipo sobre ${nombrado.numero}.`,
      [{ etiqueta: `Hablar sobre ${nombrado.numero}`, escalarA: nombrado.id }],
    );
  }
  if (abiertos.length === 0) {
    return decir(
      'Todos tus pedidos ya terminaron, así que sus conversaciones están cerradas. '
      + 'Si necesitas algo, llámanos a la Línea Constructor: 01 8000 111-247.',
      [{ etiqueta: 'Ver mis pedidos', ir: { pagina: 'orders' } }],
    );
  }

  // Hasta tres, botones directos; a partir de ahí no caben y se usa la lista.
  if (abiertos.length <= 3) {
    return decir(
      '¿Sobre cuál de tus pedidos? Le escribo al equipo en ese hilo y te responden ahí '
      + 'mismo, sin que tengas que repetir nada.',
      abiertos.map((p) => ({ etiqueta: p.numero, escalarA: p.id })),
    );
  }

  const conLista = decir(
    `Tienes ${abiertos.length} pedidos en curso. Elige sobre cuál quieres que le `
    + 'escriba al equipo.',
  );
  conLista.selector = {
    plantilla: 'Quiero hablar con un asesor sobre {numero}',
    opciones: abiertos.map((p) => ({
      numero: p.numero,
      estado: p.estado,
      descripcion: ESTADO_EN_PALABRAS[p.estado] ?? p.estado.toLowerCase(),
      enCurso: true,
    })),
  };
  return conLista;
}

/** Se presenta. Sin fingir ser una persona, que es lo que se le pregunta. */
function responderQuienEres(haySesion: boolean): MensajeAsistente {
  return decir(
    `Soy ${NOMBRE}, el asistente de la tienda de Pintuco. No soy una persona: `
    + 'consulto el sistema para responderte, y cuando no sé algo te lo digo y te '
    + 'paso con alguien del equipo.',
    haySesion
      ? [
        { etiqueta: '¿Dónde va mi pedido?', preguntar: '¿Dónde va mi pedido?' },
        { etiqueta: 'Hablar con una persona', preguntar: 'Quiero hablar con un asesor' },
      ]
      : [{ etiqueta: '¿Qué pintura uso?', preguntar: '¿Qué pintura me sirve?' }],
  );
}

/** Franja del día, para que el saludo no desentone con el reloj. */
function momentoDelDia(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function responderSaludo(haySesion: boolean): MensajeAsistente {
  return decir(
    `${momentoDelDia()}. Soy ${NOMBRE}, de Pintuco. `
    + (haySesion
      ? '¿En qué te ayudo? Puedo mirar tus pedidos, decirte qué pintura sirve para '
        + 'lo tuyo o pasarte con una persona.'
      : '¿En qué te ayudo? Puedo decirte qué pintura sirve para lo tuyo y dónde '
        + 'queda la tienda más cercana.'),
    haySesion
      ? [
        { etiqueta: '¿Dónde va mi pedido?', preguntar: '¿Dónde va mi pedido?' },
        { etiqueta: '¿Qué pintura uso?', preguntar: '¿Qué pintura me sirve?' },
        { etiqueta: '¿Dónde queda la tienda?', preguntar: '¿Dónde queda la tienda?' },
      ]
      : [
        { etiqueta: '¿Qué pintura uso?', preguntar: '¿Qué pintura me sirve?' },
        { etiqueta: '¿Cuánta necesito?', preguntar: '¿Cuánta pintura necesito?' },
        { etiqueta: '¿Dónde queda la tienda?', preguntar: '¿Dónde queda la tienda?' },
      ],
  );
}

function responderGracias(): MensajeAsistente {
  return decir(
    'Con gusto. Si te queda otra duda, aquí sigo.',
    [{ etiqueta: 'Tengo otra pregunta', preguntar: '¿Qué pintura me sirve?' }],
  );
}

function responderDespedida(): MensajeAsistente {
  return decir(`Hasta luego. Que te rinda la pintura.`);
}

/**
 * La respuesta a un mensaje.
 *
 * Si no entiende, lo dice y ofrece lo que sí sabe hacer. No adivina: una
 * respuesta plausible pero inventada sobre cuánta pintura comprar cuesta
 * dinero de verdad.
 */
export async function responder(
  texto: string,
  historial: Array<{ autor: AutorMensaje; texto: string }> = [],
  haySesion = true,
): Promise<MensajeAsistente> {
  // Las intenciones que la aplicación resuelve MEJOR que un modelo se atienden
  // con reglas aunque la IA esté encendida: el estado de un pedido y las
  // tiendas son datos exactos, y hacerlos pasar por un redactor solo añade
  // latencia, costo y una oportunidad de que se equivoque.
  const intencion = intencionDe(texto);
  // Lo social y los datos exactos se resuelven con reglas aunque la IA esté
  // encendida: un «hola» no necesita una llamada al proveedor, y el estado de
  // un pedido es un dato que no mejora por redactarlo.
  const mejorConReglas = ['PEDIDO', 'TIENDA', 'PERSONA', 'SALUDO', 'GRACIAS',
    'DESPEDIDA', 'QUIEN_ERES'].includes(intencion);

  if (!mejorConReglas && await hayIA()) {
    const conIA = await responderConIA(texto, historial);
    if (conIA) return conIA;
    // Si falla, sigue de largo a las reglas sin decirle nada al cliente.
  }

  // Sin sesión hay cosas que sencillamente no se pueden responder, y decirlo
  // es mejor que intentarlo: consultar pedidos sin sesión devuelve una lista
  // vacía, y el asistente diría «no tienes pedidos» a alguien que sí los tiene.
  if (!haySesion && (intencion === 'PEDIDO' || intencion === 'PERSONA')) {
    return decir(
      intencion === 'PEDIDO'
        ? 'Para ver tus pedidos necesito que entres a tu cuenta. Ahí te digo en qué '
          + 'va cada uno y cuándo llega.'
        : 'Para pasarte con una persona necesito tu cuenta, así el equipo sabe de '
          + 'qué pedido hablas. Si prefieres, llámanos a la Línea Constructor: '
          + '01 8000 111-247.',
      [
        { etiqueta: 'Entrar a mi cuenta', ir: { pagina: 'login' } },
        { etiqueta: 'Ver el catálogo', ir: { pagina: 'store' } },
      ],
    );
  }

  try {
    switch (intencion) {
      case 'PEDIDO': return await responderPedido(texto);
      case 'PRODUCTO': return await responderProducto(texto);
      case 'TIENDA': return await responderTienda(texto);
      case 'CANTIDAD': return responderCantidad(texto);
      case 'FACTURA': return responderFactura();
      case 'PERSONA': return await responderPersona(texto);
      case 'SALUDO': return responderSaludo(haySesion);
      case 'GRACIAS': return responderGracias();
      case 'DESPEDIDA': return responderDespedida();
      case 'QUIEN_ERES': return responderQuienEres(haySesion);
      default:
        return decir(
          `No te entendí bien. Soy ${NOMBRE} y puedo ayudarte con:`,
          [
            { etiqueta: '¿Dónde va mi pedido?', preguntar: '¿Dónde va mi pedido?' },
            { etiqueta: '¿Qué pintura uso?', preguntar: '¿Qué pintura me sirve?' },
            { etiqueta: '¿Cuánta necesito?', preguntar: '¿Cuánta pintura necesito?' },
            { etiqueta: '¿Dónde queda la tienda?', preguntar: '¿Dónde queda la tienda?' },
            { etiqueta: 'Hablar con una persona', preguntar: 'Quiero hablar con un asesor' },
          ],
        );
    }
  } catch (e) {
    console.error('[asistente] responder:', e);
    return decir(
      'No pude consultar esa información ahora mismo. Inténtalo de nuevo en un momento.',
    );
  }
}

// ------------------------------------------------------------
// La capa de IA, cuando está encendida
// ------------------------------------------------------------

/**
 * ¿El asistente redacta con un modelo?
 *
 * Se consulta una sola vez y se guarda: preguntarlo en cada mensaje añade una
 * ida y vuelta a cada respuesta sin aportar nada, porque no cambia mientras la
 * persona está escribiendo.
 */
let iaActiva: boolean | null = null;

export async function hayIA(): Promise<boolean> {
  if (iaActiva !== null) return iaActiva;
  try {
    const { data } = await supabase.rpc('estado_asistente');
    iaActiva = (data as { activa?: boolean } | null)?.activa === true;
  } catch {
    iaActiva = false;
  }
  return iaActiva;
}

/** Para que la pantalla de configuración refresque tras encenderla. */
export function olvidarEstadoIA(): void {
  iaActiva = null;
}

/**
 * Intenta que el modelo redacte la respuesta.
 *
 * Devuelve `null` cuando no se puede —sin llave, sin cupo, proveedor caído— y
 * entonces manda el asistente de reglas. La IA MEJORA la redacción; no es de
 * lo que depende que el asistente funcione, y por eso ningún fallo suyo se le
 * muestra al cliente como un error.
 */
async function responderConIA(
  pregunta: string,
  historial: Array<{ autor: AutorMensaje; texto: string }>,
): Promise<MensajeAsistente | null> {
  try {
    const { data, error } = await supabase.functions.invoke('asistente-ia', {
      body: { pregunta, historial },
    });
    if (error) return null;

    const r = data as {
      success: boolean;
      data?: { texto: string; contexto: { pedidos: number; productos: number } };
    };
    if (!r?.success || !r.data?.texto) return null;

    return decir(
      r.data.texto,
      // Las acciones las siguen poniendo las reglas: el modelo redacta, no
      // decide a dónde te lleva la aplicación.
      [{ etiqueta: 'Hablar con una persona', preguntar: 'Quiero hablar con un asesor' }],
      `Con tus ${r.data.contexto.pedidos} pedidos y el catálogo`,
    );
  } catch {
    return null;
  }
}

/** El saludo. Se dice desde el principio qué es esto y qué no. */
export function saludo(nombre?: string | null, haySesion = true): MensajeAsistente {
  const quien = nombre ? `, ${nombre.split(' ')[0]}` : '';

  // A quien no ha entrado no se le ofrece lo que no puede hacer: un botón
  // «¿Dónde va mi pedido?» que acaba pidiéndole la cuenta es una promesa rota.
  if (!haySesion) {
    return decir(
      `${momentoDelDia()}. Soy ${NOMBRE}, el asistente de Pintuco. Te ayudo a `
      + 'encontrar la pintura que necesitas y a ubicar la tienda más cercana. '
      + 'Consulto el catálogo real, así que no invento nada. Si entras a tu cuenta, '
      + 'además puedo decirte en qué va tu pedido.',
      [
        { etiqueta: '¿Qué pintura uso?', preguntar: '¿Qué pintura me sirve?' },
        { etiqueta: '¿Dónde queda la tienda?', preguntar: '¿Dónde queda la tienda?' },
        { etiqueta: '¿Cuánta necesito?', preguntar: '¿Cuánta pintura necesito?' },
      ],
    );
  }

  return decir(
    `${momentoDelDia()}${quien}. Soy ${NOMBRE}, el asistente de Pintuco. Te ayudo `
    + 'con tus pedidos, con qué pintura usar y con cuánta necesitas. Consulto el '
    + 'sistema para responder, así que si algo no lo sé, te lo digo y te paso con '
    + 'una persona.',
    [
      { etiqueta: '¿Dónde va mi pedido?', preguntar: '¿Dónde va mi pedido?' },
      { etiqueta: '¿Qué pintura uso?', preguntar: '¿Qué pintura me sirve?' },
      { etiqueta: '¿Dónde queda la tienda?', preguntar: '¿Dónde queda la tienda?' },
    ],
  );
}

/**
 * Pasa la conversación a una persona.
 *
 * Escribe en el hilo del pedido, que es donde el equipo ya mira: así no se
 * abre un canal nuevo que nadie atiende, y el cliente ve la respuesta en el
 * mismo sitio donde sigue su pedido.
 */
export async function escalar(orderId: string, resumen: string): Promise<void> {
  // `escalar` y no `escribir`: si la conversación se había dado por terminada,
  // pedir una persona otra vez tiene que volver a abrirla. Con `escribir` la
  // petición se rechazaría y el cliente se quedaría sin saber por qué.
  await conversacionPedidoService.escalar(
    orderId,
    `[Desde el asistente] ${resumen}`,
  );
}
