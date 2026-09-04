import { supabase } from '../lib/supabase';

/**
 * Pintu por voz: la llamada.
 *
 * El audio va por WebRTC DIRECTO del navegador al proveedor. No pasa por
 * nuestro servidor, y eso no es un atajo: meter audio en tiempo real por una
 * función de borde añade latencia en los dos sentidos y convierte una
 * conversación en un walkie-talkie.
 *
 * ── Qué viaja y qué no ────────────────────────────────────────────────
 * Al modelo NO se le manda el catálogo ni los pedidos. Se le dan HERRAMIENTAS
 * y las ejecuta ESTE archivo, con la sesión de quien llama. Dos consecuencias,
 * las dos deliberadas:
 *
 *   · RLS SIGUE MANDANDO. Si el modelo pidiera el pedido de otro cliente, la
 *     base devuelve vacío. La barrera no es la instrucción del prompt, que se
 *     puede convencer; es la política de la base, que no.
 *   · SE PAGA MENOS. La API de voz es CON ESTADO: en cada turno relee todo el
 *     contexto acumulado. Un catálogo metido en las instrucciones se cobra en
 *     cada frase de la llamada. Consultado a demanda, se cobra una vez y solo
 *     si hace falta.
 *
 * ── Lo que el cliente NO puede oír ────────────────────────────────────
 * Las herramientas devuelven campos elegidos a mano. Nunca costos, márgenes,
 * inventario interno ni datos de otros. Que el prompt lo prohíba está bien;
 * que el dato no exista en la respuesta es lo que de verdad lo impide.
 */

const FUNCION = 'asistente-voz';

/** Estados que la pantalla necesita para animar el avatar. */
export type EstadoLlamada =
  | 'inactiva'
  | 'conectando'
  | 'escuchando'
  | 'pensando'
  | 'hablando'
  | 'finalizada'
  | 'error';

export interface TurnoVoz {
  autor: 'CLIENTE' | 'PINTU';
  texto: string;
}

export interface ConsumoLlamada {
  /** Segundos de llamada. Lo que se factura es audio, y el audio es tiempo. */
  segundos: number;
  /** Cuántas veces Pintu consultó datos reales. */
  consultas: number;
}

export interface ManejadorLlamada {
  colgar: () => void;
  /** Silencia el micrófono sin cortar la llamada. */
  silenciar: (valor: boolean) => void;
}

export interface OpcionesLlamada {
  onEstado: (e: EstadoLlamada) => void;
  onTurno: (t: TurnoVoz) => void;
  /** Amplitud 0..1 de quien tenga la palabra, para animar el avatar. */
  onNivel: (n: number) => void;
  /**
   * Amplitud 0..1 SOLO del micrófono.
   *
   * Va aparte del nivel general porque responde a otra pregunta: «¿me está
   * oyendo?». Sin esto, cuando el detector de voz no abre turno no hay forma
   * de saber si el problema es el micrófono, el permiso o el umbral, y la
   * única pista que le queda a la persona es que Pintu no contesta.
   */
  onNivelMicro: (n: number) => void;
  onConsumo: (c: ConsumoLlamada) => void;
  onError: (mensaje: string) => void;
}

/* ─────────────────────────── Topes de gasto ─────────────────────────── */

/**
 * Estos tres números son lo único que separa una demo de una factura
 * desagradable. El audio se cobra por tiempo, y una pestaña olvidada con el
 * micrófono abierto factura sola.
 */
const TOPE_SEGUNDOS = 300;          // 5 minutos por llamada
const AVISO_SEGUNDOS = 240;         // avisa a los 4
const SILENCIO_PARA_COLGAR = 45;    // segundos sin que nadie hable

/* ──────────────────── Las herramientas, contra datos reales ──────────────── */

/**
 * Catálogo: público, pero sin una sola columna de costo.
 *
 * SE AJUSTA SOLO A LO QUE HAYA. No hay ni una referencia escrita a mano: lee
 * los productos ACTIVOS con su categoría, su ambiente y sus presentaciones en
 * el momento de la pregunta. Si cargan un producto, una presentación o una
 * categoría nueva, Pintu la ofrece sin tocar código; si desactivan algo, deja
 * de mencionarlo.
 *
 * El filtrado se hace AQUÍ, no en la consulta, y es a propósito. La versión
 * anterior armaba un `or(name.ilike..., environment.ilike...)` y **fallaba
 * entera**: `environment` es un enum de Postgres e `ilike` no existe para
 * enums, así que cualquier búsqueda devolvía «no pude consultar el catálogo»
 * —incluida la más obvia, «pintura de exterior»—.
 */
async function buscarProducto(
  consulta: string,
  ambiente?: string,
  masEconomico?: boolean,
): Promise<unknown> {
  const { data, error } = await supabase
    .from('products')
    .select('code, name, description, environment, finish, features, spread_rate_m2_per_gal, categories(name), product_variants(label, price_cop, status)')
    .eq('status', 'ACTIVO');

  if (error) {
    console.error('[voz] buscar_producto', error.message);
    return { error: 'No pude consultar el catálogo.' };
  }

  type Fila = {
    code: string; name: string; description: string | null;
    environment: string | null; finish: string | null; features: string[] | null;
    spread_rate_m2_per_gal: number | null;
    categories: { name: string } | null;
    product_variants: Array<{ label: string; price_cop: number; status: string }> | null;
  };

  // Sin tildes y en minúsculas: quien habla dice «exterior» y el catálogo
  // guarda «Exterior»; quien pregunta por «madera» busca algo que se llama
  // «Madetec». Comparar en crudo perdería las dos.
  const norm = (t: string) =>
    t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  let candidatos = ((data as unknown as Fila[]) ?? []);

  // El ambiente se compara contra el valor REAL de la fila, no contra una
  // lista fija: si aparece un ambiente nuevo, sigue valiendo.
  if (ambiente && ambiente.trim()) {
    const a = norm(ambiente);
    const filtrados = candidatos.filter(
      (p) => norm(p.environment ?? '') === a || norm(p.environment ?? '') === 'ambos',
    );
    if (filtrados.length > 0) candidatos = filtrados;
  }

  const palabras = norm(consulta ?? '').split(/\s+/).filter((w) => w.length >= 3);

  const puntuar = (p: Fila): number => {
    const heno = norm([
      p.name, p.description ?? '', p.environment ?? '', p.finish ?? '',
      p.categories?.name ?? '', (p.features ?? []).join(' '),
    ].join(' '));
    // El nombre pesa más: quien dice «Koraza» quiere Koraza, no todo lo que la
    // menciona de pasada en su descripción.
    return palabras.reduce(
      (n, w) => n + (norm(p.name).includes(w) ? 3 : heno.includes(w) ? 1 : 0),
      0,
    );
  };

  const precioDesde = (p: Fila): number => {
    const activos = (p.product_variants ?? []).filter((v) => v.status === 'ACTIVO');
    return activos.length === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.min(...activos.map((v) => Number(v.price_cop)));
  };

  let elegidos: Fila[];
  if (masEconomico) {
    // «La más económica» se responde con el catálogo ordenado por precio, no
    // con las que más se parezcan al texto: si no, la barata de verdad se
    // queda fuera por no llamarse como la pregunta.
    const base = palabras.length > 0 ? candidatos.filter((p) => puntuar(p) > 0) : candidatos;
    elegidos = (base.length > 0 ? base : candidatos)
      .slice().sort((a, b) => precioDesde(a) - precioDesde(b)).slice(0, 3);
  } else if (palabras.length === 0) {
    elegidos = candidatos.slice(0, 3);
  } else {
    elegidos = candidatos.map((p) => ({ p, n: puntuar(p) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((x) => x.p);
  }

  if (elegidos.length === 0) {
    return { mensaje: 'No hay en el catálogo activo nada que coincida con esa búsqueda.' };
  }

  // Se recorta a lo que sirve para hablar. Cada campo de más se paga en cada
  // turno posterior, porque el contexto se relee entero.
  return elegidos.map((p) => ({
    codigo: p.code,
    nombre: p.name,
    categoria: p.categories?.name ?? null,
    ambiente: p.environment,
    acabado: p.finish,
    rendimiento_m2_galon: p.spread_rate_m2_per_gal,
    presentaciones: (p.product_variants ?? [])
      .filter((v) => v.status === 'ACTIVO')
      .sort((a, b) => Number(a.price_cop) - Number(b.price_cop))
      .map((v) => ({ presentacion: v.label, precio_cop: v.price_cop })),
  }));
}

/**
 * Pedidos: SOLO los de quien llama.
 *
 * Y no porque esta consulta filtre por usuario —no lo hace—, sino porque la
 * política de `orders` en la base solo devuelve los suyos. Esa es la
 * diferencia que importa: si alguien le dicta a Pintu el número de pedido de
 * otra persona, la base devuelve cero filas y Pintu no tiene nada que contar.
 * La barrera no es la instrucción del prompt, que se puede convencer; es RLS,
 * que no.
 */
async function misPedidos(numero?: string): Promise<unknown> {
  let peticion = supabase
    .from('orders')
    .select('order_number, status, total_cop, estimated_delivery_date, delivery_method')
    .order('created_at', { ascending: false })
    .limit(3);

  if (numero && numero.trim()) {
    peticion = peticion.eq('order_number', numero.trim().toUpperCase().replace(/\s+/g, ''));
  }

  const { data, error } = await peticion;
  if (error) {
    console.error('[voz] mis_pedidos', error.message);
    return { error: 'No pude consultar los pedidos.' };
  }

  const filas = (data ?? []) as Array<Record<string, unknown>>;
  if (filas.length === 0) {
    // Se responde lo mismo tanto si el pedido no existe como si es de otra
    // persona. Distinguirlo confirmaría que ese número SÍ existe, que es justo
    // lo que no se le cuenta a quien no es su dueño.
    return numero && numero.trim()
      ? { mensaje: 'No aparece ningun pedido con ese numero a nombre de este cliente.' }
      : { mensaje: 'Este cliente no tiene pedidos todavia.' };
  }
  return filas.map((o) => ({
    numero: o.order_number,
    estado: o.status,
    total_cop: o.total_cop,
    entrega_estimada: o.estimated_delivery_date,
    forma: o.delivery_method,
  }));
}

async function puntosDeVenta(ciudad?: string): Promise<unknown> {
  let peticion = supabase
    .from('pickup_locations')
    .select('name, city, address, hours')
    .eq('status', 'ACTIVO')
    .limit(4);
  if (ciudad?.trim()) peticion = peticion.ilike('city', `%${ciudad.trim().replace(/[%,()]/g, '')}%`);

  const { data, error } = await peticion;
  if (error) return { error: 'No pude consultar las tiendas.' };
  return (data ?? []).map((t: Record<string, unknown>) => ({
    tienda: t.name, ciudad: t.city, direccion: t.address, horario: t.hours,
  }));
}

/**
 * El cálculo NO lo hace el modelo.
 *
 * Se apoya en `calculate_paint`, que lee el rendimiento real de la ficha y
 * rechaza los productos que no lo tienen. Un modelo estimando galones «a ojo»
 * es un cliente comprando de menos para su fachada.
 */
async function calcularPintura(codigo: string, areaM2: number, manos?: number): Promise<unknown> {
  const { data: variantes, error: e1 } = await supabase
    .from('product_variants')
    .select('id, label, price_cop, products!inner(code, status)')
    .eq('products.code', codigo)
    .eq('status', 'ACTIVO')
    .limit(1);

  if (e1 || !variantes || variantes.length === 0) {
    return { error: `No encontré el producto ${codigo} en el catálogo.` };
  }

  const v = variantes[0] as unknown as { id: string; label: string; price_cop: number };
  const { data, error } = await supabase.rpc('calculate_paint', {
    _variant_id: v.id,
    _area_m2: areaM2,
    _coats: manos && manos > 0 ? Math.round(manos) : 2,
    _surface_factor: 1.0,
    _waste_percent: 10,
  });

  if (error) return { error: 'Ese producto no tiene rendimiento cargado; que lo revise un asesor.' };

  const r = data as Record<string, unknown>;
  return {
    producto: r.product_name,
    presentacion: r.presentation,
    area_m2: r.area_m2,
    manos: r.coats,
    unidades: r.units_recommended,
    precio_unidad_cop: r.unit_price_cop,
    total_cop: r.subtotal_cop,
  };
}

async function ejecutarHerramienta(nombre: string, args: Record<string, unknown>): Promise<unknown> {
  switch (nombre) {
    case 'buscar_producto':
      return buscarProducto(
        String(args.consulta ?? ''),
        args.ambiente ? String(args.ambiente) : undefined,
        args.mas_economico === true,
      );
    case 'mis_pedidos':
      return misPedidos(args.numero ? String(args.numero) : undefined);
    case 'puntos_de_venta': return puntosDeVenta(args.ciudad ? String(args.ciudad) : undefined);
    case 'calcular_pintura':
      return calcularPintura(
        String(args.codigo ?? ''),
        Number(args.area_m2 ?? 0),
        args.manos === undefined ? undefined : Number(args.manos),
      );
    default:
      return { error: 'No tengo esa consulta.' };
  }
}

/* ────────────────────────────── La llamada ────────────────────────────── */

export async function iniciarLlamada(op: OpcionesLlamada): Promise<ManejadorLlamada> {
  op.onEstado('conectando');

  // 1. El token efímero. La llave real nunca llega aquí.
  const { data: resp, error: errFn } = await supabase.functions.invoke(FUNCION, { body: {} });
  if (errFn) throw new Error('No fue posible abrir la llamada.');
  const cuerpo = resp as {
    success: boolean;
    data?: { token: string; nombre?: string };
    error?: { message: string };
  };
  if (!cuerpo?.success || !cuerpo.data?.token) {
    throw new Error(cuerpo?.error?.message ?? 'Pintu no está disponible.');
  }

  // 2. El micrófono. Si lo niega, no hay llamada y hay que decirlo claro.
  let micro: MediaStream;
  try {
    micro = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    throw new Error('Necesito permiso del micrófono para hablar contigo.');
  }

  const nombre = (cuerpo.data.nombre ?? '').trim();

  const pc = new RTCPeerConnection();
  const audio = document.createElement('audio');
  audio.autoplay = true;
  // Va al documento: un elemento de audio suelto, fuera del árbol, no
  // reproduce de forma fiable en todos los navegadores.
  audio.style.display = 'none';
  document.body.appendChild(audio);

  let consultas = 0;
  const inicio = Date.now();
  let ultimaVoz = Date.now();
  let cerrada = false;
  let avisado = false;
  let vigilante: number | undefined;
  let medidor: number | undefined;

  const segundos = () => Math.round((Date.now() - inicio) / 1000);

  const colgar = () => {
    if (cerrada) return;
    cerrada = true;
    window.clearInterval(vigilante);
    window.clearInterval(medidor);
    try { canal.close(); } catch { /* ya cerrado */ }
    try { pc.close(); } catch { /* ya cerrado */ }
    micro.getTracks().forEach((t) => t.stop());
    audio.srcObject = null;
    audio.remove();
    try { void ctx?.close(); } catch { /* ya cerrado */ }
    op.onConsumo({ segundos: segundos(), consultas });
    op.onEstado('finalizada');
  };

  // 3. La amplitud, para que el avatar se mueva con la voz de verdad.
  //
  // Se miden LOS DOS lados. Midiendo solo a Pintu, la cara se queda congelada
  // mientras habla el cliente, que es justo cuando más falta hace ver que del
  // otro lado hay alguien escuchando.
  //
  // El AudioContext nace SUSPENDIDO si no hubo gesto del usuario: sin
  // `resume()` el analizador devuelve ceros para siempre y el avatar no se
  // mueve nunca. Es el motivo por el que parecía una imagen fija.
  let ctx: AudioContext | null = null;
  let midePintu: (() => number) | null = null;
  let mideCliente: (() => number) | null = null;

  const construirMedidor = (flujo: MediaStream): (() => number) | null => {
    try {
      ctx ??= new AudioContext();
      void ctx.resume();
      const fuente = ctx.createMediaStreamSource(flujo);
      const analizador = ctx.createAnalyser();
      analizador.fftSize = 256;
      analizador.smoothingTimeConstant = 0.6;
      fuente.connect(analizador);
      const datos = new Uint8Array(analizador.frequencyBinCount);
      return () => {
        analizador.getByteFrequencyData(datos);
        const media = datos.reduce((a, b) => a + b, 0) / datos.length;
        return Math.min(1, media / 70);
      };
    } catch {
      return null;
    }
  };

  mideCliente = construirMedidor(micro);

  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
    void audio.play().catch(() => undefined);
    midePintu = construirMedidor(e.streams[0]);
  };

  medidor = window.setInterval(() => {
    const p = midePintu?.() ?? 0;
    const c = mideCliente?.() ?? 0;
    // Gana el que esté sonando: el avatar sigue a quien tiene la palabra.
    op.onNivel(Math.max(p, c));
    op.onNivelMicro(c);
  }, 60);

  micro.getTracks().forEach((t) => pc.addTrack(t, micro));

  // 4. El canal de eventos: transcripciones y llamadas a herramientas.
  const canal = pc.createDataChannel('oai-events');

  canal.addEventListener('message', (ev: MessageEvent) => {
    let e: Record<string, unknown>;
    try { e = JSON.parse(ev.data as string); } catch { return; }
    const tipo = String(e.type ?? '');

    if (tipo === 'input_audio_buffer.speech_started') {
      ultimaVoz = Date.now();
      op.onEstado('escuchando');
    }
    if (tipo === 'input_audio_buffer.speech_stopped') op.onEstado('pensando');
    if (tipo === 'response.output_audio.delta') {
      ultimaVoz = Date.now();
      op.onEstado('hablando');
    }
    if (tipo === 'response.output_audio.done') op.onEstado('escuchando');

    // Lo que entendió de la persona.
    if (tipo === 'conversation.item.input_audio_transcription.completed') {
      const t = String(e.transcript ?? '').trim();
      if (t) op.onTurno({ autor: 'CLIENTE', texto: t });
    }
    // Lo que dijo Pintu.
    if (tipo === 'response.output_audio_transcript.done') {
      const t = String(e.transcript ?? '').trim();
      if (t) op.onTurno({ autor: 'PINTU', texto: t });
    }

    // Las herramientas. Aquí es donde entra el dato real.
    if (tipo === 'response.done') {
      const salida = ((e.response as Record<string, unknown>)?.output ?? []) as Array<Record<string, unknown>>;
      for (const item of salida) {
        if (item.type !== 'function_call') continue;
        consultas += 1;
        op.onEstado('pensando');
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(String(item.arguments ?? '{}')); } catch { /* sin argumentos */ }

        void ejecutarHerramienta(String(item.name), args).then((resultado) => {
          if (cerrada || canal.readyState !== 'open') return;
          canal.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: item.call_id,
              output: JSON.stringify(resultado),
            },
          }));
          canal.send(JSON.stringify({ type: 'response.create' }));
        });
      }
    }

    if (tipo === 'error') {
      console.error('[voz] evento de error', e);
      op.onError('Se cortó la conversación con Pintu.');
    }
  });

  canal.addEventListener('open', () => {
    op.onEstado('escuchando');
    // Que salude él. Si esperamos a que hable el cliente, el silencio inicial
    // se siente como una llamada que no entró.
    canal.send(JSON.stringify({
      type: 'response.create',
      response: {
        instructions: nombre
          ? `Saluda a ${nombre} por su nombre, di que eres Pintu y pregunta en qué le ayudas. UNA sola frase corta.`
          : 'Preséntate como Pintu en UNA sola frase corta y pregunta en qué le ayudas. Nada más.',
      },
    }));
  });

  // 5. La oferta SDP contra el proveedor, con el token efímero.
  const oferta = await pc.createOffer();
  await pc.setLocalDescription(oferta);

  const r = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    body: oferta.sdp,
    headers: {
      Authorization: `Bearer ${cuerpo.data.token}`,
      'Content-Type': 'application/sdp',
    },
  });
  if (!r.ok) {
    colgar();
    throw new Error('El proveedor de voz rechazó la llamada.');
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });

  // 6. Los topes. Se revisan cada segundo porque cada segundo se paga.
  vigilante = window.setInterval(() => {
    const s = segundos();
    op.onConsumo({ segundos: s, consultas });

    if (!avisado && s >= AVISO_SEGUNDOS) {
      avisado = true;
      op.onError('La llamada se cierra en un minuto. Puedes volver a llamar cuando quieras.');
    }
    if (s >= TOPE_SEGUNDOS) colgar();
    if ((Date.now() - ultimaVoz) / 1000 >= SILENCIO_PARA_COLGAR) colgar();
  }, 1000);

  return {
    colgar,
    silenciar: (valor: boolean) => micro.getAudioTracks().forEach((t) => { t.enabled = !valor; }),
  };
}
