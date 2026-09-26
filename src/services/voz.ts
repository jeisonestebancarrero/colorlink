import { supabase } from '../lib/supabase';
import { mensajeDeLaFuncion } from './errorDeFuncion';

/**
 * Pintu por voz: audio WebRTC directo al proveedor para evitar latencia. El modelo no
 * recibe datos, solo herramientas que este archivo ejecuta con la sesión del usuario:
 * RLS sigue aplicando, se paga menos contexto y nunca se devuelven costos ni datos ajenos.
 */

const FUNCION = 'asistente-voz';

/** Estados que la pantalla usa para animar el avatar. */
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
  /** Segundos de llamada: el audio se factura por tiempo. */
  segundos: number;
  /** Consultas a datos reales durante la llamada. */
  consultas: number;
}

export interface ManejadorLlamada {
  colgar: () => void;
  /** Silencia el micrófono sin colgar. */
  silenciar: (valor: boolean) => void;
}

export interface OpcionesLlamada {
  onEstado: (e: EstadoLlamada) => void;
  onTurno: (t: TurnoVoz) => void;
  /** Amplitud 0..1 de quien habla, para el avatar. */
  onNivel: (n: number) => void;
  /** Amplitud 0..1 solo del micrófono, para diagnosticar si se está oyendo a la persona. */
  onNivelMicro: (n: number) => void;
  onConsumo: (c: ConsumoLlamada) => void;
  onError: (mensaje: string) => void;
}

/** Topes de gasto: el audio se cobra por tiempo y una pestaña olvidada factura sola. */
const TOPE_SEGUNDOS = 300;          // 5 minutos por llamada
const AVISO_SEGUNDOS = 240;         // avisa a los 4
const SILENCIO_PARA_COLGAR = 45;    // segundos sin que nadie hable


/**
 * Catálogo activo sin columnas de costo, leído en cada pregunta. Se filtra en cliente
 * porque `environment` es un enum y `ilike` no aplica a enums.
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

  // Sin tildes y en minúsculas para comparar lo hablado con el catálogo.
  const norm = (t: string) =>
    t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  let candidatos = ((data as unknown as Fila[]) ?? []);

  // Contra el valor real de la fila, no una lista fija.
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
    // El nombre pesa más que la descripción.
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
    // «La más económica» se responde ordenando por precio, no por parecido al texto.
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

  // Solo los campos útiles: cada campo extra se paga en cada turno.
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

/** Pedidos del usuario: la consulta no filtra, lo hace la RLS de `orders`. */
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
    // Misma respuesta si no existe o es ajeno, para no confirmar que el número existe.
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

/** El cálculo lo hace `calculate_paint` con el rendimiento real, no el modelo. */
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


export async function iniciarLlamada(op: OpcionesLlamada): Promise<ManejadorLlamada> {
  op.onEstado('conectando');

  // 1. Token efímero; la llave real nunca llega al navegador.
  const { data: resp, error: errFn } = await supabase.functions.invoke(FUNCION, { body: {} });
  if (errFn) {
    // El motivo real viene en el cuerpo: distingue falta de llave de sesión caducada.
    throw new Error(await mensajeDeLaFuncion(errFn, 'No fue posible abrir la llamada.'));
  }
  const cuerpo = resp as {
    success: boolean;
    data?: { token: string; nombre?: string };
    error?: { message: string };
  };
  if (!cuerpo?.success || !cuerpo.data?.token) {
    throw new Error(cuerpo?.error?.message ?? 'Pintu no está disponible.');
  }

  // 2. Micrófono; si se niega, se informa claramente.
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
  // Un <audio> fuera del documento no reproduce de forma fiable en todos los navegadores.
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

  // 3. Amplitud de ambos lados para animar el avatar. El AudioContext nace suspendido
  // sin gesto del usuario: sin `resume()` el analizador solo devuelve ceros.
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
    // El avatar sigue a quien tiene la palabra.
    op.onNivel(Math.max(p, c));
    op.onNivelMicro(c);
  }, 60);

  micro.getTracks().forEach((t) => pc.addTrack(t, micro));

  // 4. Canal de eventos: transcripciones y llamadas a herramientas.
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

    // Transcripción de la persona.
    if (tipo === 'conversation.item.input_audio_transcription.completed') {
      const t = String(e.transcript ?? '').trim();
      if (t) op.onTurno({ autor: 'CLIENTE', texto: t });
    }
    // Transcripción de Pintu.
    if (tipo === 'response.output_audio_transcript.done') {
      const t = String(e.transcript ?? '').trim();
      if (t) op.onTurno({ autor: 'PINTU', texto: t });
    }

    // Herramientas: aquí entra el dato real.
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
    // Pintu saluda primero para que el silencio inicial no parezca una llamada caída.
    canal.send(JSON.stringify({
      type: 'response.create',
      response: {
        instructions: nombre
          ? `Saluda a ${nombre} por su nombre, di que eres Pintu y pregunta en qué le ayudas. UNA sola frase corta.`
          : 'Preséntate como Pintu en UNA sola frase corta y pregunta en qué le ayudas. Nada más.',
      },
    }));
  });

  // 5. Oferta SDP al proveedor con el token efímero.
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

  // 6. Topes, revisados cada segundo.
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
