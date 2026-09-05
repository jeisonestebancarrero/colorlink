import { supabase } from '../lib/supabase';

/**
 * Servicios operativos del back-office: pedidos y conversaciones.
 *
 * Ninguna operación decide permisos aquí. Las políticas RLS filtran las
 * filas y las funciones del servidor validan las acciones; este archivo solo
 * consulta y presenta.
 */

/**
 * Formatea una fecha que puede venir con hora o sin ella.
 *
 * Las columnas `date` de Postgres llegan como 'YYYY-MM-DD'. `new Date()` las
 * interpreta como medianoche UTC y, al pintarlas en horario de Colombia
 * (UTC-5), retroceden un día: una visita programada para el 15 se mostraba
 * como el 14 y una entrega estimada se adelantaba una jornada. Anclar la
 * fecha sin hora al mediodía local elimina el corrimiento en cualquier huso.
 */
export function formatearFecha(
  valor: string | null | undefined,
  opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  if (!valor) return '—';
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  const d = new Date(soloFecha ? `${valor}T12:00:00` : valor);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO', opciones);
}

/** La fecha de hoy en 'YYYY-MM-DD' según el reloj local, no según UTC. */
export function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[backoffice] ${contexto}:`, error.message);
  const m = error.message ?? '';
  if (/INVALID_TRANSITION/.test(m)) {
    return new Error('Ese cambio de estado no está permitido para este pedido.');
  }
  if (/FORBIDDEN/.test(m)) return new Error('No tienes permisos para esta operación.');
  if (/ALREADY_INVOICED/.test(m)) return new Error('Este pedido ya tiene una factura vigente.');
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ============================================================
// PEDIDOS
// ============================================================
export const ESTADOS_PEDIDO = [
  'PENDIENTE', 'CONFIRMADO', 'PREPARANDO', 'ENVIADO',
  'LISTO_PARA_RETIRO', 'ENTREGADO', 'CANCELADO',
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/**
 * Transiciones válidas. Es una COPIA de la máquina de estados que aplica
 * change_order_status en el servidor, usada solo para no ofrecer botones que
 * el servidor va a rechazar. La verdad sigue estando en la base.
 */
export const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  PENDIENTE: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['ENVIADO', 'LISTO_PARA_RETIRO', 'CANCELADO'],
  ENVIADO: ['ENTREGADO'],
  LISTO_PARA_RETIRO: ['ENTREGADO'],
  ENTREGADO: [],
  CANCELADO: [],
};

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADO: 'Confirmado',
  PREPARANDO: 'Preparando',
  ENVIADO: 'Enviado',
  LISTO_PARA_RETIRO: 'Listo para retiro',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

export const COLOR_ESTADO: Record<EstadoPedido, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-800 border-amber-200',
  CONFIRMADO: 'bg-sky-50 text-sky-800 border-sky-200',
  PREPARANDO: 'bg-violet-50 text-violet-800 border-violet-200',
  ENVIADO: 'bg-blue-50 text-blue-800 border-blue-200',
  LISTO_PARA_RETIRO: 'bg-teal-50 text-teal-800 border-teal-200',
  ENTREGADO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CANCELADO: 'bg-slate-100 text-slate-600 border-slate-200',
};

export interface PedidoLista {
  id: string;
  numero: string;
  estado: EstadoPedido;
  metodo: string;
  cliente: string;
  empresa: string | null;
  total: number;
  creadoEn: string;
  puntoRetiro: string | null;
  /** Sede del pedido. Null en un envío que no sale de una tienda concreta. */
  locationId: string | null;
}

export interface LineaPedido {
  descripcion: string;
  codigo: string | null;
  presentacion: string | null;
  color: string | null;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PedidoDetalle extends PedidoLista {
  subtotal: number;
  descuento: number;
  envio: number;
  direccion: string | null;
  ciudad: string | null;
  codigoRetiro: string | null;
  lineas: LineaPedido[];
  facturaId: string | null;
  facturaNumero: string | null;
}

const PEDIDO_SELECT = `
  id, order_number, status, delivery_method, subtotal_cop, discount_cop,
  shipping_cop, total_cop, created_at, shipping_address, shipping_city,
  pickup_code, pickup_location_id,
  profiles:user_id ( first_name, last_name ),
  companies ( name ),
  pickup_locations ( name, city )
`;

interface FilaPedido {
  id: string;
  order_number: string;
  status: EstadoPedido;
  delivery_method: string;
  subtotal_cop: string | number;
  discount_cop: string | number;
  shipping_cop: string | number;
  total_cop: string | number;
  created_at: string;
  shipping_address: string | null;
  shipping_city: string | null;
  pickup_code: string | null;
  pickup_location_id: string | null;
  profiles: { first_name: string; last_name: string } | null;
  companies: { name: string } | null;
  pickup_locations: { name: string; city: string } | null;
}

const aPedido = (f: FilaPedido): PedidoLista => ({
  id: f.id,
  numero: f.order_number,
  estado: f.status,
  metodo: f.delivery_method === 'ENVIO' ? 'Envío' : 'Retiro en tienda',
  cliente: `${f.profiles?.first_name ?? ''} ${f.profiles?.last_name ?? ''}`.trim() || '—',
  empresa: f.companies?.name ?? null,
  total: num(f.total_cop),
  creadoEn: f.created_at,
  puntoRetiro: f.pickup_locations ? `${f.pickup_locations.name} · ${f.pickup_locations.city}` : null,
  locationId: f.pickup_location_id,
});

export const pedidoService = {
  async listar(filtros: { estado?: EstadoPedido | 'TODOS'; busqueda?: string } = {}): Promise<PedidoLista[]> {
    let consulta = supabase
      .from('orders')
      .select(PEDIDO_SELECT)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filtros.estado && filtros.estado !== 'TODOS') consulta = consulta.eq('status', filtros.estado);
    if (filtros.busqueda?.trim()) {
      const q = filtros.busqueda.trim().replace(/[%,()]/g, '');
      consulta = consulta.ilike('order_number', `%${q}%`);
    }

    const { data, error } = await consulta;
    if (error) throw errorLegible('listar', error);
    return ((data ?? []) as unknown as FilaPedido[]).map(aPedido);
  },

  /**
   * Igual que `detalle`, pero por NÚMERO de pedido.
   *
   * La URL lleva `ORD-PNT-000045` y no el uuid: es lo que la persona reconoce
   * y lo que va a pegar en un chat. Un uuid en la barra de direcciones no le
   * dice nada a nadie.
   */
  async detallePorNumero(numero: string): Promise<PedidoDetalle | null> {
    const { data, error } = await supabase
      .from('orders').select('id').eq('order_number', numero).maybeSingle();
    if (error) throw errorLegible('detallePorNumero', error);
    const fila = data as { id: string } | null;
    if (!fila) return null;
    return this.detalle(fila.id);
  },

  async detalle(id: string): Promise<PedidoDetalle | null> {
    const [{ data, error }, { data: lineas }, { data: factura }] = await Promise.all([
      supabase.from('orders').select(PEDIDO_SELECT).eq('id', id).maybeSingle(),
      supabase
        .from('order_items')
        .select('product_name, product_code, presentation, color_name, quantity, unit_price_cop, subtotal_cop')
        .eq('order_id', id),
      supabase.from('invoices').select('id, invoice_number').eq('order_id', id)
        .eq('status', 'EMITIDA').maybeSingle(),
    ]);
    if (error) throw errorLegible('detalle', error);
    if (!data) return null;

    const f = data as unknown as FilaPedido;
    const fac = factura as { id: string; invoice_number: string } | null;

    return {
      ...aPedido(f),
      subtotal: num(f.subtotal_cop),
      descuento: num(f.discount_cop),
      envio: num(f.shipping_cop),
      direccion: f.shipping_address,
      ciudad: f.shipping_city,
      codigoRetiro: f.pickup_code,
      facturaId: fac?.id ?? null,
      facturaNumero: fac?.invoice_number ?? null,
      lineas: ((lineas ?? []) as Array<Record<string, string | number | null>>).map((l) => ({
        descripcion: String(l.product_name),
        codigo: (l.product_code as string) ?? null,
        presentacion: (l.presentation as string) ?? null,
        color: (l.color_name as string) ?? null,
        cantidad: num(l.quantity),
        precioUnitario: num(l.unit_price_cop),
        subtotal: num(l.subtotal_cop),
      })),
    };
  },

  async cambiarEstado(id: string, nuevo: EstadoPedido): Promise<void> {
    const { error } = await supabase.rpc('change_order_status', { _order_id: id, _nuevo: nuevo });
    if (error) throw errorLegible('cambiarEstado', error);
  },

  async emitirFactura(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('issue_pos_invoice', { _order_id: id });
    if (error) throw errorLegible('emitirFactura', error);
    return data as string;
  },
};

// ============================================================
// CONVERSACIONES (chatter)
// ============================================================
export interface Mensaje {
  id: string;
  tipo: 'MENSAJE' | 'NOTA_INTERNA' | 'EVENTO';
  cuerpo: string;
  autor: string | null;
  autorId: string | null;
  /**
   * Quién escribió, visto desde el portal interno. Sin esto los mensajes del
   * cliente y los del equipo se pintaban iguales y el hilo se leía como un
   * monólogo.
   */
  quien: 'CLIENTE' | 'EQUIPO' | 'YO' | 'SISTEMA';
  creadoEn: string;
  /**
   * Cuándo lo leyó el destinatario. Null = entregado pero sin abrir.
   *
   * Solo se muestra en los mensajes PROPIOS: `read_at` lo escribe quien abre
   * la conversación, así que en un mensaje ajeno diría cuándo lo leí yo.
   */
  leidoEn: string | null;
}

export interface AvisoInterno {
  id: string;
  titulo: string;
  mensaje: string;
  leido: boolean;
  creadoEn: string;
  projectId: string | null;
  orderId: string | null;
}

/**
 * Avisos del personal interno.
 *
 * Son los mismos `notifications` que recibe el cliente, pero dirigidos a una
 * cuenta interna: «Proyecto asignado» cuando alguien te asigna una obra,
 * «Solicitud de vinculación» cuando un empleado de una empresa cliente pide
 * entrar. Hasta ahora el portal no los mostraba en ninguna parte, así que
 * llegaban a la base y nadie los veía nunca.
 *
 * RLS ya limita cada fila a su destinatario: aquí no hay que filtrar por
 * usuario.
 */
export const avisoInternoService = {
  async listar(limite = 20): Promise<AvisoInterno[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message, read, created_at, project_id, order_id')
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) {
      // Un fallo aquí no puede tumbar la barra lateral.
      console.error('[avisos] listar:', error.message);
      return [];
    }
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((f) => ({
      id: String(f.id),
      titulo: (f.title as string) ?? '',
      mensaje: (f.message as string) ?? '',
      leido: f.read === true,
      creadoEn: String(f.created_at ?? ''),
      projectId: (f.project_id as string) ?? null,
      orderId: (f.order_id as string) ?? null,
    }));
  },

  /** Al abrirlo. `notifications_update_propio` deja marcar solo los suyos. */
  async marcarLeido(id: string): Promise<void> {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    if (error) console.error('[avisos] marcarLeido:', error.message);
  },

  async marcarTodosLeidos(): Promise<void> {
    const { error } = await supabase
      .from('notifications').update({ read: true }).eq('read', false);
    if (error) console.error('[avisos] marcarTodosLeidos:', error.message);
  },
};

export const chatterService = {
  async mensajes(campo: 'order_id' | 'project_id', id: string): Promise<Mensaje[]> {
    // El dueño del hilo es el cliente. Todo lo demás que tenga autor es el
    // equipo: es la única forma de distinguirlos sin consultar los roles de
    // cada autor, que además el cliente no puede leer.
    const tabla = campo === 'order_id' ? 'orders' : 'projects';

    const [{ data, error }, dueno, sesion] = await Promise.all([
      supabase
        .from('conversation_messages')
        .select('id, kind, body, created_at, read_at, author_id, '
          + 'profiles:author_id ( first_name, last_name )')
        .eq(campo, id)
        .order('created_at'),
      supabase.from(tabla).select('user_id').eq('id', id).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (error) throw errorLegible('mensajes', error);

    const clienteId = (dueno.data as { user_id?: string } | null)?.user_id ?? null;
    const yo = sesion.data.user?.id ?? null;

    return ((data ?? []) as unknown as Array<{
      id: string; kind: Mensaje['tipo']; body: string; created_at: string;
      read_at: string | null;
      author_id: string | null;
      profiles: { first_name: string; last_name: string } | null;
    }>).map((m) => ({
      id: m.id,
      tipo: m.kind,
      cuerpo: m.body,
      autor: m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}`.trim() : null,
      autorId: m.author_id,
      quien: !m.author_id
        ? 'SISTEMA'
        : m.author_id === yo
          ? 'YO'
          : m.author_id === clienteId
            ? 'CLIENTE'
            : 'EQUIPO',
      creadoEn: m.created_at,
      leidoEn: m.read_at,
    }));
  },

  /** ¿Se puede escribir todavía? Solo aplica a pedidos. */
  async estadoConversacion(orderId: string): Promise<{
    sePuedeEscribir: boolean; atendida: boolean;
  } | null> {
    const { data, error } = await supabase.rpc('estado_conversacion', { _order_id: orderId });
    if (error || !data) return null;
    const d = data as Record<string, unknown>;
    return {
      // Lo decide el PEDIDO: mientras siga en curso, el cliente escribe.
      sePuedeEscribir: d.se_puede_escribir !== false,
      atendida: d.atendida === true,
    };
  },

  /**
   * Da por terminada la conversación del pedido.
   *
   * Lo puede hacer cualquiera de los dos lados. No borra nada: impide escribir
   * mensajes nuevos, y así el equipo sabe qué hilos siguen pendientes.
   */
  async cerrarConversacion(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('cerrar_conversacion', { _order_id: orderId });
    if (error) throw errorLegible('cerrarConversacion', error);
  },

  async reabrirConversacion(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('reabrir_conversacion', { _order_id: orderId });
    if (error) throw errorLegible('reabrirConversacion', error);
  },

  async publicar(
    campo: 'order_id' | 'project_id',
    id: string,
    cuerpo: string,
    interno: boolean
  ): Promise<void> {
    const { error } = await supabase.rpc('post_message', {
      _order_id: campo === 'order_id' ? id : null,
      _project_id: campo === 'project_id' ? id : null,
      _body: cuerpo,
      _internal: interno,
    });
    if (error) throw errorLegible('publicar', error);
  },
};

export const formatearCOP = (n: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);


// ============================================================
// DESPACHO (MÓDULO 18)
// ============================================================
export const ESTADOS_ENVIO = [
  'PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'EN_TRANSITO', 'ENTREGADO', 'DEVUELTO',
] as const;
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number];

export const ETIQUETA_ENVIO: Record<EstadoEnvio, string> = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  DESPACHADO: 'Despachado',
  EN_TRANSITO: 'En tránsito',
  ENTREGADO: 'Entregado',
  DEVUELTO: 'Devuelto',
};

/**
 * Icono de cada estado de envío.
 *
 * Va aquí, junto a la etiqueta y el color, para que el estado se muestre igual
 * en el filtro, en la tabla y en el detalle. Si cada pantalla eligiera su
 * icono, «Despachado» sería un camión en una y una caja en otra.
 *
 * Se guarda el NOMBRE del icono y no el componente porque este archivo es de
 * servicios y no debe importar de `lucide-react`: quien lo consume resuelve el
 * nombre contra su propio mapa.
 */
export const ICONO_ENVIO: Record<EstadoEnvio, string> = {
  // Espera a que alguien lo tome.
  PENDIENTE: 'Clock',
  // Alguien está armando la caja en la bodega.
  EN_PREPARACION: 'PackageOpen',
  // Salió de la tienda.
  DESPACHADO: 'PackageCheck',
  // Va en camino.
  EN_TRANSITO: 'Truck',
  // Lo recibió el cliente.
  ENTREGADO: 'CheckCircle2',
  // Volvió: es el único estado que hay que mirar dos veces.
  DEVUELTO: 'Undo2',
};

export const COLOR_ENVIO: Record<EstadoEnvio, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-800 border-amber-200',
  EN_PREPARACION: 'bg-violet-50 text-violet-800 border-violet-200',
  DESPACHADO: 'bg-sky-50 text-sky-800 border-sky-200',
  EN_TRANSITO: 'bg-blue-50 text-blue-800 border-blue-200',
  ENTREGADO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  DEVUELTO: 'bg-rose-50 text-rose-800 border-rose-200',
};

export interface Despacho {
  id: string;
  orderId: string;
  numeroPedido: string;
  cliente: string;
  estado: EstadoEnvio;
  transportadora: string | null;
  guia: string | null;
  direccion: string | null;
  ciudad: string | null;
  estimada: string | null;
  despachadoEn: string | null;
  entregadoEn: string | null;
  /** Sede que despacha. Se hereda del pedido. */
  locationId: string | null;
}

interface FilaEnvio {
  id: string;
  order_id: string;
  carrier: string | null;
  tracking_number: string | null;
  address: string | null;
  city: string | null;
  status: EstadoEnvio;
  location_id: string | null;
  estimated_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  orders: {
    order_number: string;
    profiles: { first_name: string; last_name: string } | null;
  } | null;
}

const aDespacho = (f: FilaEnvio): Despacho => ({
  id: f.id,
  orderId: f.order_id,
  numeroPedido: f.orders?.order_number ?? '—',
  cliente: f.orders?.profiles
    ? `${f.orders.profiles.first_name} ${f.orders.profiles.last_name}`.trim()
    : '—',
  estado: f.status,
  transportadora: f.carrier,
  guia: f.tracking_number,
  direccion: f.address,
  ciudad: f.city,
  estimada: f.estimated_at,
  despachadoEn: f.shipped_at,
  entregadoEn: f.delivered_at,
  locationId: f.location_id,
});

export const despachoService = {
  /**
   * Entrega un retiro en tienda verificando el código que trae el cliente.
   *
   * Quien atiende NO elige el pedido: escribe el código y el servidor decide
   * cuál es. Por eso no puede equivocarse de pedido, ni entregar uno que
   * todavía se está alistando.
   */
  async entregarPorCodigo(codigo: string): Promise<{
    numero: string; recibe: string | null; documento: string | null; total: number;
  }> {
    const { data, error } = await supabase.rpc('entregar_por_codigo', { _codigo: codigo });
    if (error) {
      const m = error.message ?? '';
      if (/CODIGO_NO_VALIDO/.test(m)) {
        throw new Error('Ese código no corresponde a ningún pedido listo para retiro en esta sede.');
      }
      if (/YA_ENTREGADO/.test(m)) throw new Error('Ese pedido ya fue retirado.');
      if (/CANCELADO/.test(m)) {
        throw new Error('Ese pedido está cancelado. No entregues la mercancía.');
      }
      // El del mostrador tiene al cliente enfrente: el motivo va completo y
      // sin rodeos, porque de esto depende que la mercancía salga o no.
      if (/SIN_PAGO/.test(m)) throw new Error(m.replace(/^.*SIN_PAGO:\s*/, ''));
      if (/NO_ESTA_LISTO/.test(m)) {
        throw new Error(m.replace(/^.*NO_ESTA_LISTO:\s*/, ''));
      }
      if (/CODIGO_CORTO/.test(m)) throw new Error('Escribe el código completo que trae el cliente.');
      if (/FORBIDDEN/.test(m)) throw new Error('No tienes permiso para entregar pedidos.');
      throw new Error('No fue posible entregar el pedido.');
    }
    const d = data as { numero: string; recibe: string | null; documento: string | null; total: number };
    return d;
  },

  async listar(estado?: EstadoEnvio | 'TODOS'): Promise<Despacho[]> {
    let consulta = supabase
      .from('shipments')
      .select(
        'id, order_id, carrier, tracking_number, address, city, status, ' +
          'location_id, estimated_at, shipped_at, delivered_at, ' +
          'orders ( order_number, profiles:user_id ( first_name, last_name ) )'
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (estado && estado !== 'TODOS') consulta = consulta.eq('status', estado);

    const { data, error } = await consulta;
    if (error) throw errorLegible('listarDespachos', error);
    return ((data ?? []) as unknown as FilaEnvio[]).map(aDespacho);
  },

  /**
   * Actualiza guía, transportadora y estado.
   *
   * El trigger `shipments_trazabilidad` escribe el cambio en el hilo del
   * pedido, así que el cliente lo ve sin que nadie tenga que avisarle.
   */
  async actualizar(
    id: string,
    cambios: {
      estado?: EstadoEnvio;
      transportadora?: string;
      guia?: string;
      estimada?: string | null;
    }
  ): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (cambios.estado) {
      patch.status = cambios.estado;
      // Las fechas se derivan del estado en lugar de pedirlas aparte:
      // un despacho sin fecha de despacho es un dato incoherente.
      if (cambios.estado === 'DESPACHADO') patch.shipped_at = new Date().toISOString();
      if (cambios.estado === 'ENTREGADO') patch.delivered_at = new Date().toISOString();
    }
    if (cambios.transportadora !== undefined) patch.carrier = cambios.transportadora || null;
    if (cambios.guia !== undefined) patch.tracking_number = cambios.guia || null;
    if (cambios.estimada !== undefined) patch.estimated_at = cambios.estimada || null;

    const { error } = await supabase.from('shipments').update(patch).eq('id', id);
    if (error) throw errorLegible('actualizarDespacho', error);
  },

  /**
   * Escucha cambios en vivo. Es lo que hace que el tablero de despacho de
   * una persona se actualice cuando otra mueve un envío, sin recargar.
   */
  suscribir(alCambiar: () => void): () => void {
    const canal = supabase
      .channel('despachos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, alCambiar)
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  },
};


// ============================================================
// INVENTARIO (MÓDULO 20)
// ============================================================
export const TIPOS_MOVIMIENTO = [
  'ENTRADA', 'SALIDA', 'AJUSTE', 'TRASLADO_SALIDA', 'TRASLADO_ENTRADA',
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste por conteo',
  TRASLADO_SALIDA: 'Traslado (salida)',
  TRASLADO_ENTRADA: 'Traslado (entrada)',
  RESERVA: 'Reserva',
  LIBERACION: 'Liberación',
};

export interface Existencia {
  variantId: string;
  locationId: string;
  producto: string;
  codigo: string | null;
  presentacion: string;
  categoria: string;
  marca: string;
  bodega: string;
  ciudad: string;
  disponible: number;
  reservado: number;
  neto: number;
  /** Punto de reorden. 0 = sin definir. */
  minimo: number;
}

/**
 * En qué situación está una referencia.
 *
 * 'agotado' es un hecho comprobable. 'bajo' solo se afirma cuando alguien
 * definió un punto de reorden para esa referencia en esa bodega: sin ese
 * dato, decir que quedan pocas unidades sería una opinión disfrazada de
 * alerta, que es justo lo que hacía el umbral fijo anterior.
 */
export type SituacionExistencia = 'agotado' | 'bajo' | 'ok';

export function situacion(e: Existencia): SituacionExistencia {
  if (e.neto <= 0) return 'agotado';
  if (e.minimo > 0 && e.neto <= e.minimo) return 'bajo';
  return 'ok';
}

export interface ResumenPunto {
  locationId: string;
  /** Llave estable con la que se resuelve la imagen de la tienda. */
  referencia: string | null;
  imageUrl: string | null;
  punto: string;
  ciudad: string;
  referencias: number;
  disponible: number;
  reservado: number;
  neto: number;
  agotadas: number;
  bajoReorden: number;
}

/**
 * Hacia dónde mueve el saldo cada tipo de movimiento.
 *
 * `inventory_movements.quantity` guarda siempre una magnitud POSITIVA; la
 * dirección vive en `kind`. Leer el signo del número hacía que una salida de
 * traslado apareciera como «+5» en verde: en un libro de inventario eso no es
 * un detalle estético, es leer al revés lo que pasó en la bodega.
 *
 * El AJUSTE no tiene dirección: no suma ni resta, FIJA el saldo tras un
 * conteo físico, y la cantidad guardada es la diferencia en valor absoluto.
 */
export function signoMovimiento(tipo: string): 1 | -1 | 0 {
  if (tipo === 'AJUSTE') return 0;
  if (tipo === 'SALIDA' || tipo === 'TRASLADO_SALIDA' || tipo === 'RESERVA') return -1;
  return 1;
}

export interface Movimiento {
  id: string;
  tipo: string;
  cantidad: number;
  saldo: number;
  producto: string;
  bodega: string;
  notas: string | null;
  autor: string | null;
  fecha: string;
}

export const inventarioService = {
  /** Totales por punto de venta, para el tablero. */
  async porPunto(): Promise<ResumenPunto[]> {
    const { data, error } = await supabase
      .from('v_inventario_por_punto')
      .select('*')
      .order('punto');
    if (error) throw errorLegible('porPunto', error);

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      locationId: String(r.location_id),
      referencia: (r.punto_ref as string) ?? null,
      imageUrl: (r.foto_url as string) ?? null,
      punto: String(r.punto),
      ciudad: String(r.ciudad ?? ''),
      referencias: num(r.referencias as number),
      disponible: num(r.disponible as number),
      reservado: num(r.reservado as number),
      neto: num(r.neto as number),
      agotadas: num(r.agotadas as number),
      bajoReorden: num(r.bajo_reorden as number),
    }));
  },

  /** Existencias, opcionalmente de un solo punto de venta. */
  async existencias(opciones?: { locationId?: string; busqueda?: string }): Promise<Existencia[]> {
    let consulta = supabase
      .from('inventory')
      .select(
        'variant_id, location_id, qty_available, qty_reserved, min_qty, ' +
          'product_variants ( label, sku, products ( name, code, categories ( name ), brands ( name ) ) ), ' +
          'pickup_locations ( name, city )'
      );

    if (opciones?.locationId) consulta = consulta.eq('location_id', opciones.locationId);

    const { data, error } = await consulta;
    if (error) throw errorLegible('existencias', error);

    const filas: Existencia[] = ((data ?? []) as unknown as Array<{
      variant_id: string; location_id: string;
      qty_available: number; qty_reserved: number; min_qty: number;
      product_variants: {
        label: string; sku: string | null;
        products: {
          name: string; code: string;
          categories: { name: string } | null;
          brands: { name: string } | null;
        } | null;
      } | null;
      pickup_locations: { name: string; city: string } | null;
    }>).map((f) => ({
      variantId: f.variant_id,
      locationId: f.location_id,
      producto: f.product_variants?.products?.name ?? '—',
      codigo: f.product_variants?.products?.code ?? null,
      presentacion: f.product_variants?.label ?? '',
      categoria: f.product_variants?.products?.categories?.name ?? 'Sin categoría',
      marca: f.product_variants?.products?.brands?.name ?? '',
      bodega: f.pickup_locations?.name ?? '—',
      ciudad: f.pickup_locations?.city ?? '',
      disponible: f.qty_available,
      reservado: f.qty_reserved,
      neto: f.qty_available - f.qty_reserved,
      minimo: f.min_qty ?? 0,
    }));

    const q = opciones?.busqueda?.trim().toLowerCase();
    const lista = !q
      ? filas
      : filas.filter(
          (f) =>
            f.producto.toLowerCase().includes(q) ||
            f.presentacion.toLowerCase().includes(q) ||
            f.categoria.toLowerCase().includes(q) ||
            (f.codigo ?? '').toLowerCase().includes(q),
        );

    // Lo agotado primero, luego lo que está bajo su punto de reorden: el orden
    // de la lista es lo que decide qué se ve sin desplazarse.
    const peso = (e: Existencia) =>
      situacion(e) === 'agotado' ? 0 : situacion(e) === 'bajo' ? 1 : 2;
    return lista.sort(
      (a, b) =>
        peso(a) - peso(b) ||
        a.categoria.localeCompare(b.categoria, 'es') ||
        a.producto.localeCompare(b.producto, 'es'),
    );
  },

  /** Fija el punto de reorden de una referencia en una bodega. */
  async fijarPuntoReorden(variantId: string, locationId: string, minimo: number): Promise<void> {
    const { error } = await supabase.rpc('set_reorder_point', {
      _variant_id: variantId,
      _location_id: locationId,
      _min_qty: minimo,
    });
    if (error) throw errorLegible('fijarPuntoReorden', error);
  },

  /**
   * Traslada unidades de un punto de venta a otro.
   *
   * Las dos patas —salida y entrada— ocurren dentro de la misma transacción
   * en el servidor. Hacerlo como dos movimientos sueltos permitía que la
   * mercancía saliera de una bodega y no entrara en ninguna.
   */
  async trasladar(datos: {
    variantId: string;
    origen: string;
    destino: string;
    cantidad: number;
    notas?: string;
  }): Promise<{ referencia: string; saldoOrigen: number; saldoDestino: number }> {
    const { data, error } = await supabase.rpc('transfer_inventory', {
      _variant_id: datos.variantId,
      _origen: datos.origen,
      _destino: datos.destino,
      _cantidad: datos.cantidad,
      _notas: datos.notas ?? null,
    });

    if (error) {
      if (/INSUFFICIENT_STOCK/.test(error.message)) {
        const m = error.message.match(/(\d+) unidades/);
        throw new Error(
          m
            ? `El punto de origen solo tiene ${m[1]} unidades disponibles.`
            : 'No hay existencias suficientes en el punto de origen.',
        );
      }
      if (/SAME_LOCATION/.test(error.message)) {
        throw new Error('El origen y el destino son el mismo punto de venta.');
      }
      if (/BAD_QTY/.test(error.message)) {
        throw new Error('La cantidad a trasladar debe ser mayor que cero.');
      }
      throw errorLegible('trasladar', error);
    }

    const r = data as { referencia: string; saldo_origen: number; saldo_destino: number };
    return { referencia: r.referencia, saldoOrigen: r.saldo_origen, saldoDestino: r.saldo_destino };
  },

  async movimientos(filtro?: { variantId?: string; locationId?: string }): Promise<Movimiento[]> {
    let consulta = supabase
      .from('inventory_movements')
      .select(
        'id, kind, quantity, balance_after, notes, created_at, ' +
          'product_variants ( label, products ( name ) ), ' +
          'pickup_locations ( name ), profiles:created_by ( first_name, last_name )'
      )
      .order('created_at', { ascending: false })
      .limit(80);
    if (filtro?.variantId) consulta = consulta.eq('variant_id', filtro.variantId);
    if (filtro?.locationId) consulta = consulta.eq('location_id', filtro.locationId);

    const { data, error } = await consulta;
    if (error) throw errorLegible('movimientos', error);

    return ((data ?? []) as unknown as Array<{
      id: string; kind: string; quantity: number; balance_after: number;
      notes: string | null; created_at: string;
      product_variants: { label: string; products: { name: string } | null } | null;
      pickup_locations: { name: string } | null;
      profiles: { first_name: string; last_name: string } | null;
    }>).map((m) => ({
      id: m.id,
      tipo: m.kind,
      cantidad: m.quantity,
      saldo: m.balance_after,
      producto: `${m.product_variants?.products?.name ?? '—'} · ${m.product_variants?.label ?? ''}`,
      bodega: m.pickup_locations?.name ?? '—',
      notas: m.notes,
      autor: m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}`.trim() : null,
      fecha: m.created_at,
    }));
  },

  /** El saldo nunca se edita: se registra un movimiento y el servidor lo recalcula. */
  async registrar(datos: {
    variantId: string; locationId: string; tipo: TipoMovimiento;
    cantidad: number; notas?: string;
  }): Promise<number> {
    const { data, error } = await supabase.rpc('register_inventory_movement', {
      _variant_id: datos.variantId,
      _location_id: datos.locationId,
      _kind: datos.tipo,
      _quantity: datos.cantidad,
      _reference: null,
      _notes: datos.notas ?? null,
    });
    if (error) {
      if (/INSUFFICIENT_STOCK/.test(error.message)) {
        throw new Error('No hay existencias suficientes para ese movimiento.');
      }
      throw errorLegible('registrar', error);
    }
    return Number((data as { balance: number }).balance);
  },
};

// ============================================================
// CONVERSACIONES — bandeja del personal
// ============================================================
export interface HiloConversacion {
  id: string;
  tipo: 'PEDIDO' | 'PROYECTO';
  titulo: string;
  contraparte: string;
  ultimoMensaje: string;
  ultimaFecha: string;
  mensajes: number;
  soloEventos: boolean;
}

export const conversacionService = {
  /**
   * Agrupa los mensajes por hilo. Se hace en el cliente porque son pocos y
   * evita una vista adicional; si el volumen crece, esto pasa a una vista
   * materializada en la base.
   */
  async bandeja(): Promise<HiloConversacion[]> {
    const { data, error } = await supabase
      .from('conversation_messages')
      .select(
        'id, kind, body, created_at, order_id, project_id, ' +
          'orders ( order_number, profiles:user_id ( first_name, last_name ) ), ' +
          'projects ( name, profiles:user_id ( first_name, last_name ) )'
      )
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw errorLegible('bandeja', error);

    const hilos = new Map<string, HiloConversacion>();
    for (const m of (data ?? []) as unknown as Array<{
      kind: string; body: string; created_at: string;
      order_id: string | null; project_id: string | null;
      orders: { order_number: string; profiles: { first_name: string; last_name: string } | null } | null;
      projects: { name: string; profiles: { first_name: string; last_name: string } | null } | null;
    }>) {
      const id = m.order_id ?? m.project_id;
      if (!id) continue;
      const esPedido = Boolean(m.order_id);
      const perfil = esPedido ? m.orders?.profiles : m.projects?.profiles;

      const existente = hilos.get(id);
      if (existente) {
        existente.mensajes += 1;
        if (m.kind !== 'EVENTO') existente.soloEventos = false;
        continue;
      }
      hilos.set(id, {
        id,
        tipo: esPedido ? 'PEDIDO' : 'PROYECTO',
        titulo: esPedido ? (m.orders?.order_number ?? 'Pedido') : (m.projects?.name ?? 'Proyecto'),
        contraparte: perfil ? `${perfil.first_name} ${perfil.last_name}`.trim() : '—',
        ultimoMensaje: m.body,
        ultimaFecha: m.created_at,
        mensajes: 1,
        soloEventos: m.kind === 'EVENTO',
      });
    }
    return [...hilos.values()];
  },

  suscribir(alCambiar: () => void): () => void {
    const canal = supabase
      .channel('bandeja-conversaciones')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_messages' }, alCambiar)
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  },
};


// ============================================================
// FACTURACIÓN
// ============================================================
export interface FacturaLista {
  id: string;
  numero: string;
  cliente: string;
  pedido: string;
  base: number;
  iva: number;
  total: number;
  estado: string;
  emitida: string;
  /** Sede que emitió la factura. Null en las históricas sin pedido asociado. */
  locationId: string | null;
}

export const facturaService = {
  async listar(busqueda?: string): Promise<FacturaLista[]> {
    let consulta = supabase
      .from('invoices')
      .select('id, invoice_number, customer_name, taxable_base_cop, tax_cop, total_cop, status, issued_at, location_id, orders ( order_number )')
      .order('issued_at', { ascending: false })
      .limit(100);
    if (busqueda?.trim()) {
      const q = busqueda.trim().replace(/[%,()]/g, '');
      consulta = consulta.or(`invoice_number.ilike.%${q}%,customer_name.ilike.%${q}%`);
    }
    const { data, error } = await consulta;
    if (error) throw errorLegible('listarFacturas', error);

    return ((data ?? []) as unknown as Array<{
      id: string; invoice_number: string; customer_name: string;
      taxable_base_cop: string | number; tax_cop: string | number; total_cop: string | number;
      status: string; issued_at: string; location_id: string | null;
      orders: { order_number: string } | null;
    }>).map((f) => ({
      id: f.id,
      numero: f.invoice_number,
      cliente: f.customer_name,
      pedido: f.orders?.order_number ?? '—',
      base: num(f.taxable_base_cop),
      iva: num(f.tax_cop),
      total: num(f.total_cop),
      estado: f.status,
      emitida: f.issued_at,
      locationId: f.location_id,
    }));
  },

  /** Pedidos entregados o listos que todavía no tienen factura vigente. */
  async pendientes(): Promise<Array<{ id: string; numero: string; cliente: string; total: number }>> {
    const [{ data: pedidos }, { data: facturados }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, total_cop, profiles:user_id ( first_name, last_name )')
        .in('status', ['CONFIRMADO', 'PREPARANDO', 'ENVIADO', 'LISTO_PARA_RETIRO', 'ENTREGADO'])
        .order('created_at', { ascending: false }),
      supabase.from('invoices').select('order_id').eq('status', 'EMITIDA'),
    ]);

    const yaFacturados = new Set(((facturados ?? []) as Array<{ order_id: string }>).map((f) => f.order_id));
    return ((pedidos ?? []) as unknown as Array<{
      id: string; order_number: string; total_cop: string | number;
      profiles: { first_name: string; last_name: string } | null;
    }>)
      .filter((o) => !yaFacturados.has(o.id))
      .map((o) => ({
        id: o.id,
        numero: o.order_number,
        cliente: o.profiles ? `${o.profiles.first_name} ${o.profiles.last_name}`.trim() : '—',
        total: num(o.total_cop),
      }));
  },

  async emitir(orderId: string): Promise<string> {
    const { data, error } = await supabase.rpc('issue_pos_invoice', { _order_id: orderId });
    if (error) throw errorLegible('emitir', error);
    return data as string;
  },

  /**
   * Anula una factura emitida.
   *
   * El motivo es obligatorio y lo exige la base, no esta pantalla: una factura
   * anulada sin explicación es lo primero que pregunta una auditoría.
   *
   * Se niega si la factura ya tiene dinero recibido. No es una limitación
   * técnica: anularla dejaría el recaudo colgando de un documento que dejó de
   * existir, y el dinero del cliente sin respaldo. Primero se devuelve.
   */
  async anular(invoiceId: string, motivo: string): Promise<{
    numero: string; asientoRevertido: boolean;
  }> {
    const { data, error } = await supabase.rpc('anular_factura', {
      _invoice_id: invoiceId, _motivo: motivo,
    });
    if (error) {
      const m = error.message;
      if (/TIENE_RECAUDOS/.test(m)) {
        // Se conserva la cifra que devuelve la base: decir «tiene recaudos» sin
        // decir cuánto obliga a ir a buscarlo a otra pantalla.
        const cuanto = m.match(/tiene ([\d.,]+) recaudado/)?.[1];
        throw new Error(
          cuanto
            ? `No se puede anular: ya tiene $${cuanto} recaudado. Registra primero la devolución del dinero.`
            : 'No se puede anular: la factura ya tiene dinero recibido.',
        );
      }
      if (/YA_ANULADA/.test(m)) throw new Error('Esa factura ya estaba anulada.');
      if (/VALIDATION/.test(m)) {
        throw new Error('Escribe el motivo de la anulación, explicando qué pasó.');
      }
      if (/FORBIDDEN/.test(m)) {
        throw new Error('No tienes permiso para anular facturas.');
      }
      throw errorLegible('anular', error);
    }
    const d = data as Record<string, unknown>;
    return {
      numero: String(d.numero ?? ''),
      asientoRevertido: d.asiento_revertido === true,
    };
  },
};

// ============================================================
// PANEL
// ============================================================
/**
 * Cada bloque es `null` cuando el rol no tiene el permiso correspondiente. La
 * pantalla lo usa para no dibujar tarjetas vacías: un técnico de campo no debe
 * ver un cero en "ventas de hoy", debe no ver la tarjeta.
 */
export interface ResumenPanel {
  porConfirmar: number | null;
  porAlistar: number | null;
  listosParaRetiro: number | null;
  enTransito: number | null;
  ventasHoy: number | null;
  pedidosHoy: number | null;
  ventasMes: number | null;
  ventasMesAnterior: number | null;
  bajoMinimo: number | null;
  agotados: number | null;
  criticos: Array<{
    producto: string; presentacion: string; punto: string;
    existencia: number; minimo: number; faltante: number;
  }> | null;
  visitasHoy: number | null;
  visitasSemana: number | null;
  visitasVencidas: number | null;
  agenda: Array<{
    fecha: string; hora: string | null; proyecto: string;
    ciudad: string | null; tecnico: string | null;
  }> | null;
  proyectosSinAsesor: number | null;
  proyectosActivos: number | null;
  sinResponder: number | null;
}

export const panelService = {
  /**
   * Resumen del panel, acotado a las sedes que pida la pantalla.
   *
   * El servidor cruza `_sedes` con las permitidas, así que mandar una sede
   * ajena no devuelve sus cifras: aquí solo se pasa la selección de pantalla.
   */
  async resumen(sedes?: string[] | null): Promise<ResumenPanel> {
    const { data, error } = await supabase.rpc('resumen_panel', {
      _sedes: sedes && sedes.length > 0 ? sedes : null,
    });
    if (error) throw errorLegible('panel', error);
    const d = (data ?? {}) as Record<string, unknown>;
    const n = (v: unknown) => (v === null || v === undefined ? null : num(v as number));
    return {
      porConfirmar: n(d.por_confirmar),
      porAlistar: n(d.por_alistar),
      listosParaRetiro: n(d.listos_para_retiro),
      enTransito: n(d.en_transito),
      ventasHoy: n(d.ventas_hoy),
      pedidosHoy: n(d.pedidos_hoy),
      ventasMes: n(d.ventas_mes),
      ventasMesAnterior: n(d.ventas_mes_anterior),
      bajoMinimo: n(d.bajo_minimo),
      agotados: n(d.agotados),
      criticos: (d.criticos ?? null) as ResumenPanel['criticos'],
      visitasHoy: n(d.visitas_hoy),
      visitasSemana: n(d.visitas_semana),
      visitasVencidas: n(d.visitas_vencidas),
      agenda: (d.agenda ?? null) as ResumenPanel['agenda'],
      proyectosSinAsesor: n(d.proyectos_sin_asesor),
      proyectosActivos: n(d.proyectos_activos),
      sinResponder: n(d.sin_responder),
    };
  },
};

// ============================================================
// ANALÍTICA
// ============================================================
export interface ResumenVentas {
  ingresos: number;
  pedidos: number;
  unidades: number;
  ticketMedio: number;
  margen: number | null;
  lineasSinCosto: number;
  porMes: Array<{ mes: string; total: number; pedidos: number }>;
  topProductos: Array<{ product_name: string; unidades: number; total: number }>;
  topEmpresas: Array<{ empresa: string; pedidos: number; total: number }>;
}

// ── Analítica detallada ─────────────────────────────────────────────────────
export interface FiltrosAnalitica {
  desde?: string;
  hasta?: string;
  puntos?: string[];
  categorias?: string[];
  productos?: string[];
}

export interface SerieMes {
  mes: string;
  ingresos: number;
  margen: number | null;
  pedidos: number;
  unidades: number;
}

export interface SerieAnio {
  anio: number;
  ingresos: number;
  margen: number | null;
  pedidos: number;
}

export interface CorteVentas {
  etiqueta: string;
  detalle?: string;
  ingresos: number;
  margen: number | null;
  pedidos?: number;
  unidades?: number;
  margenPct?: number | null;
}

export interface AnaliticaDetallada {
  ingresos: number;
  costo: number | null;
  margen: number | null;
  pedidos: number;
  unidades: number;
  ticketMedio: number;
  lineas: number;
  lineasSinCosto: number;
  lineasEstimadas: number;
  verCostos: boolean;
  porMes: SerieMes[];
  porAnio: SerieAnio[];
  mejorMes: { mes: string; ingresos: number; margen: number | null } | null;
  porPunto: CorteVentas[];
  porCategoria: CorteVentas[];
  porProducto: CorteVentas[];
}

export interface OpcionesAnalitica {
  puntos: Array<{ id: string; nombre: string; ciudad: string | null }>;
  categorias: Array<{ id: string; nombre: string }>;
  productos: Array<{ id: string; nombre: string; codigo: string }>;
  anios: number[];
}

export interface Ranking {
  asesores: Array<{ nombre: string; pedidos: number; total: number }>;
  sinAsesor: { pedidos: number; total: number };
}

export const analiticaService = {
  async resumen(
    desde?: string, hasta?: string, sedes?: string[] | null
  ): Promise<ResumenVentas> {
    const { data, error } = await supabase.rpc('resumen_ventas', {
      _desde: desde ?? null, _hasta: hasta ?? null,
      _sedes: sedes && sedes.length > 0 ? sedes : null,
    });
    if (error) throw errorLegible('resumen', error);
    const d = data as Record<string, unknown>;
    return {
      ingresos: num(d.ingresos as number),
      pedidos: num(d.pedidos as number),
      unidades: num(d.unidades as number),
      ticketMedio: num(d.ticket_medio as number),
      margen: d.margen === null || d.margen === undefined ? null : num(d.margen as number),
      lineasSinCosto: num(d.lineas_sin_costo as number),
      porMes: (d.por_mes ?? []) as ResumenVentas['porMes'],
      topProductos: (d.top_productos ?? []) as ResumenVentas['topProductos'],
      topEmpresas: (d.top_empresas ?? []) as ResumenVentas['topEmpresas'],
    };
  },

  /** Opciones de los desplegables de filtro. */
  async opciones(): Promise<OpcionesAnalitica> {
    const { data, error } = await supabase.rpc('analitica_filtros');
    if (error) throw errorLegible('opciones', error);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      puntos: (d.puntos ?? []) as OpcionesAnalitica['puntos'],
      categorias: (d.categorias ?? []) as OpcionesAnalitica['categorias'],
      productos: (d.productos ?? []) as OpcionesAnalitica['productos'],
      anios: ((d.anios ?? []) as number[]).slice().sort((a, b) => b - a),
    };
  },

  /** Tablero completo: una sola consulta con todos los cortes. */
  async detallada(f: FiltrosAnalitica = {}): Promise<AnaliticaDetallada> {
    const { data, error } = await supabase.rpc('analitica_ventas', {
      _desde: f.desde ?? null,
      _hasta: f.hasta ?? null,
      // Un arreglo vacío significaría "ningún punto" y devolvería cero filas.
      // Sin filtro es null.
      _puntos: f.puntos?.length ? f.puntos : null,
      _categorias: f.categorias?.length ? f.categorias : null,
      _productos: f.productos?.length ? f.productos : null,
    });
    if (error) throw errorLegible('analitica', error);
    const d = (data ?? {}) as Record<string, unknown>;

    const opcional = (v: unknown) => (v === null || v === undefined ? null : num(v as number));

    const corte = (
      filas: unknown,
      etiqueta: string,
      detalle?: string,
    ): CorteVentas[] =>
      ((filas ?? []) as Array<Record<string, unknown>>).map((x) => ({
        etiqueta: String(x[etiqueta] ?? '—'),
        detalle: detalle ? ((x[detalle] as string) ?? undefined) : undefined,
        ingresos: num(x.ingresos as number),
        margen: opcional(x.margen),
        pedidos: x.pedidos === undefined ? undefined : num(x.pedidos as number),
        unidades: x.unidades === undefined ? undefined : num(x.unidades as number),
        margenPct: opcional(x.margen_pct),
      }));

    const mejor = d.mejor_mes as Record<string, unknown> | null;

    return {
      ingresos: num(d.ingresos as number),
      costo: opcional(d.costo),
      margen: opcional(d.margen),
      pedidos: num(d.pedidos as number),
      unidades: num(d.unidades as number),
      ticketMedio: num(d.ticket_medio as number),
      lineas: num(d.lineas as number),
      lineasSinCosto: num(d.lineas_sin_costo as number),
      lineasEstimadas: num(d.lineas_estimadas as number),
      verCostos: Boolean(d.ver_costos),
      porMes: ((d.por_mes ?? []) as Array<Record<string, unknown>>).map((m) => ({
        mes: String(m.mes),
        ingresos: num(m.ingresos as number),
        margen: opcional(m.margen),
        pedidos: num(m.pedidos as number),
        unidades: num(m.unidades as number),
      })),
      porAnio: ((d.por_anio ?? []) as Array<Record<string, unknown>>).map((a) => ({
        anio: num(a.anio as number),
        ingresos: num(a.ingresos as number),
        margen: opcional(a.margen),
        pedidos: num(a.pedidos as number),
      })),
      mejorMes: mejor
        ? {
            mes: String(mejor.mes),
            ingresos: num(mejor.ingresos as number),
            margen: opcional(mejor.margen),
          }
        : null,
      porPunto: corte(d.por_punto, 'punto', 'ciudad'),
      porCategoria: corte(d.por_categoria, 'categoria'),
      porProducto: corte(d.por_producto, 'producto', 'codigo'),
    };
  },

  async ranking(desde?: string, hasta?: string): Promise<Ranking> {
    const { data, error } = await supabase.rpc('ranking_comercial', {
      _desde: desde ?? null, _hasta: hasta ?? null,
    });
    if (error) throw errorLegible('ranking', error);
    const d = data as { asesores: Ranking['asesores']; sin_asesor: Ranking['sinAsesor'] };
    return { asesores: d.asesores ?? [], sinAsesor: d.sin_asesor ?? { pedidos: 0, total: 0 } };
  },
};


// ============================================================
// TESORERÍA (MÓDULO 17)
// ============================================================
export const METODOS_PAGO = [
  'PSE', 'TARJETA_CREDITO', 'TARJETA_DEBITO', 'EFECTIVO',
  'TRANSFERENCIA', 'CREDITO_EMPRESARIAL',
] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ETIQUETA_METODO: Record<string, string> = {
  PSE: 'PSE',
  TARJETA_CREDITO: 'Tarjeta de crédito',
  TARJETA_DEBITO: 'Tarjeta débito',
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CREDITO_EMPRESARIAL: 'Crédito empresarial',
};

export interface CuentaSaldo {
  id: string;
  nombre: string;
  tipo: string;
  banco: string | null;
  numero: string | null;
  saldo: number;
  sinConciliar: number;
}

export interface CarteraItem {
  invoiceId: string;
  numero: string;
  cliente: string;
  emitida: string;
  total: number;
  recaudado: number;
  saldo: number;
  dias: number;
}

export interface MovimientoTesoreria {
  id: string;
  cuenta: string;
  direccion: 'INGRESO' | 'EGRESO';
  monto: number;
  fecha: string;
  concepto: string;
  referencia: string | null;
  conciliado: boolean;
  refExtracto: string | null;
  /** Sede del movimiento. Null en un egreso que no pertenece a una tienda. */
  locationId: string | null;
}

export const tesoreriaService = {
  async cuentas(): Promise<CuentaSaldo[]> {
    const { data, error } = await supabase
      .from('v_saldos_cuenta')
      .select('id, name, kind, bank_name, account_number, balance, sin_conciliar')
      .eq('is_active', true)
      .order('name');
    if (error) throw errorLegible('cuentas', error);
    return ((data ?? []) as Array<Record<string, string | number | null>>).map((c) => ({
      id: String(c.id),
      nombre: String(c.name),
      tipo: String(c.kind),
      banco: (c.bank_name as string) ?? null,
      numero: (c.account_number as string) ?? null,
      saldo: num(c.balance as number),
      sinConciliar: num(c.sin_conciliar as number),
    }));
  },

  /** Facturas con saldo pendiente, ordenadas por antigüedad. */
  async cartera(): Promise<CarteraItem[]> {
    const { data, error } = await supabase
      .from('v_cartera')
      .select('invoice_id, invoice_number, customer_name, issued_at, total_cop, recaudado, saldo, dias')
      .gt('saldo', 0)
      .order('issued_at');
    if (error) throw errorLegible('cartera', error);
    return ((data ?? []) as Array<Record<string, string | number>>).map((c) => ({
      invoiceId: String(c.invoice_id),
      numero: String(c.invoice_number),
      cliente: String(c.customer_name),
      emitida: String(c.issued_at),
      total: num(c.total_cop),
      recaudado: num(c.recaudado),
      saldo: num(c.saldo),
      dias: num(c.dias),
    }));
  },

  async movimientos(soloPendientes = false): Promise<MovimientoTesoreria[]> {
    let consulta = supabase
      .from('treasury_movements')
      .select('id, direction, amount_cop, occurred_on, concept, reference, reconciled, bank_statement_ref, location_id, bank_accounts ( name )')
      .order('occurred_on', { ascending: false })
      .limit(120);
    if (soloPendientes) consulta = consulta.eq('reconciled', false);

    const { data, error } = await consulta;
    if (error) throw errorLegible('movimientos', error);
    return ((data ?? []) as unknown as Array<{
      id: string; direction: 'INGRESO' | 'EGRESO'; amount_cop: string | number;
      occurred_on: string; concept: string; reference: string | null;
      reconciled: boolean; bank_statement_ref: string | null;
      location_id: string | null;
      bank_accounts: { name: string } | null;
    }>).map((m) => ({
      id: m.id,
      cuenta: m.bank_accounts?.name ?? '—',
      direccion: m.direction,
      monto: num(m.amount_cop),
      fecha: m.occurred_on,
      concepto: m.concept,
      referencia: m.reference,
      conciliado: m.reconciled,
      refExtracto: m.bank_statement_ref,
      locationId: m.location_id,
    }));
  },

  async registrarRecaudo(datos: {
    invoiceId: string; cuentaId: string; monto: number;
    metodo: MetodoPago; referencia?: string; fecha?: string;
  }): Promise<{ saldo: number; saldada: boolean }> {
    const { data, error } = await supabase.rpc('registrar_recaudo', {
      _invoice_id: datos.invoiceId,
      _account_id: datos.cuentaId,
      _amount: datos.monto,
      _method: datos.metodo,
      _reference: datos.referencia ?? null,
      _occurred_on: datos.fecha ?? null,
    });
    if (error) {
      if (/OVERPAYMENT/.test(error.message)) {
        throw new Error('El valor supera el saldo pendiente de la factura.');
      }
      throw errorLegible('registrarRecaudo', error);
    }
    const d = data as { saldo: number; saldada: boolean };
    return { saldo: num(d.saldo), saldada: Boolean(d.saldada) };
  },

  /**
   * Cuentas contables que pueden ser contrapartida de un egreso.
   *
   * Se excluyen caja y bancos: pagar de una cuenta a otra es un traslado, no
   * un egreso, y mezclarlos haría que el estado de resultados contara como
   * gasto un dinero que sigue siendo de la empresa.
   */
  async cuentasParaEgreso(): Promise<Array<{ codigo: string; nombre: string; clase: string }>> {
    const { data, error } = await supabase
      .from('accounts')
      .select('code, name, class')
      .eq('is_postable', true)
      .eq('is_active', true)
      .not('code', 'in', '(1105,1110)')
      .order('code');
    if (error) throw errorLegible('cuentasParaEgreso', error);
    return ((data ?? []) as unknown as Array<Record<string, string>>).map((c) => ({
      codigo: c.code, nombre: c.name, clase: c.class,
    }));
  },

  /**
   * Registra una salida de dinero.
   *
   * La contrapartida es OBLIGATORIA: un egreso no dice por sí solo qué se
   * pagó —un flete, un abono a proveedor, un servicio— y ponerle una por
   * defecto metería todos los pagos en la misma cuenta.
   */
  async registrarEgreso(datos: {
    cuentaId: string; monto: number; concepto: string;
    contrapartida: string; referencia?: string; fecha?: string;
  }): Promise<{ saldoDespues: number; quedaEnNegativo: boolean; contrapartida: string }> {
    const { data, error } = await supabase.rpc('registrar_egreso', {
      _account_id: datos.cuentaId,
      _amount: datos.monto,
      _concept: datos.concepto,
      _cuenta_contrapartida: datos.contrapartida,
      _reference: datos.referencia ?? null,
      _occurred_on: datos.fecha ?? null,
    });
    if (error) {
      if (/CUENTA_INVALIDA/.test(error.message)) {
        throw new Error(
          'Esa cuenta contable no sirve como contrapartida. Caja y bancos no valen: '
          + 'eso sería un traslado, no un egreso.',
        );
      }
      if (/VALIDATION/.test(error.message)) {
        throw new Error('Revisa el valor y el concepto del egreso.');
      }
      throw errorLegible('registrarEgreso', error);
    }
    const d = data as Record<string, unknown>;
    return {
      saldoDespues: num(d.saldo_despues as number),
      quedaEnNegativo: d.queda_en_negativo === true,
      contrapartida: String(d.contrapartida ?? ''),
    };
  },

  async conciliar(movementId: string, refExtracto: string, conciliado = true): Promise<void> {
    const { error } = await supabase.rpc('conciliar_movimiento', {
      _movement_id: movementId, _bank_ref: refExtracto, _conciliado: conciliado,
    });
    if (error) throw errorLegible('conciliar', error);
  },
};
