import { supabase } from '../lib/supabase';

/** Servicios operativos del back-office. RLS filtra y las funciones del servidor validan; aquí solo se consulta. */

/** Ancla las fechas sin hora al mediodía local: como medianoche UTC retroceden un día en UTC-5. */
export function formatearFecha(
  valor: string | null | undefined,
  opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  if (!valor) return '—';
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  const d = new Date(soloFecha ? `${valor}T12:00:00` : valor);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO', opciones);
}

/** Hoy en 'YYYY-MM-DD' según el reloj local, no UTC. */
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

// Pedidos
export const ESTADOS_PEDIDO = [
  'PENDIENTE', 'CONFIRMADO', 'PREPARANDO', 'ENVIADO',
  'LISTO_PARA_RETIRO', 'ENTREGADO', 'CANCELADO',
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/** Copia de la máquina de estados de change_order_status, solo para no ofrecer botones inválidos; manda la base. */
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
  /** Null en un envío que no sale de una tienda concreta. */
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

  /** Como `detalle`, pero por número de pedido, que es lo que lleva la URL. */
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

// Conversaciones (chatter)
export interface Mensaje {
  id: string;
  tipo: 'MENSAJE' | 'NOTA_INTERNA' | 'EVENTO';
  cuerpo: string;
  autor: string | null;
  autorId: string | null;
  /** Autor visto desde el portal, para distinguir cliente y equipo en el hilo. */
  quien: 'CLIENTE' | 'EQUIPO' | 'YO' | 'SISTEMA';
  creadoEn: string;
  /** Null = entregado sin abrir. Solo aplica a mensajes propios: `read_at` lo escribe quien abre. */
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

/** Avisos (`notifications`) dirigidos a cuentas internas; RLS ya limita cada fila a su destinatario. */
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

  /** `notifications_update_propio` solo deja marcar los propios. */
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
    // El dueño del hilo es el cliente y todo otro autor es el equipo; el cliente no puede leer roles.
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

  /** Solo aplica a pedidos. */
  async estadoConversacion(orderId: string): Promise<{
    sePuedeEscribir: boolean; atendida: boolean;
  } | null> {
    const { data, error } = await supabase.rpc('estado_conversacion', { _order_id: orderId });
    if (error || !data) return null;
    const d = data as Record<string, unknown>;
    return {
      // Lo decide el estado del pedido.
      sePuedeEscribir: d.se_puede_escribir !== false,
      atendida: d.atendida === true,
    };
  },

  /** Cierra la conversación desde cualquier lado; no borra, solo impide mensajes nuevos. */
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


// Despacho
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
 * Icono por estado, compartido por filtro, tabla y detalle. Se guarda el nombre
 * y no el componente para no importar `lucide-react` en servicios.
 */
export const ICONO_ENVIO: Record<EstadoEnvio, string> = {
  PENDIENTE: 'Clock',
  EN_PREPARACION: 'PackageOpen',
  DESPACHADO: 'PackageCheck',
  EN_TRANSITO: 'Truck',
  ENTREGADO: 'CheckCircle2',
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
  /** Sede que despacha; se hereda del pedido. */
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
  /** Entrega un retiro por código: el servidor resuelve el pedido, así no se entrega uno equivocado ni sin alistar. */
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
      // En mostrador el motivo se muestra completo: decide si la mercancía sale.
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

  /** El trigger `shipments_trazabilidad` escribe el cambio en el hilo del pedido. */
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
      // Las fechas se derivan del estado para que no queden incoherentes.
      if (cambios.estado === 'DESPACHADO') patch.shipped_at = new Date().toISOString();
      if (cambios.estado === 'ENTREGADO') patch.delivered_at = new Date().toISOString();
    }
    if (cambios.transportadora !== undefined) patch.carrier = cambios.transportadora || null;
    if (cambios.guia !== undefined) patch.tracking_number = cambios.guia || null;
    if (cambios.estimada !== undefined) patch.estimated_at = cambios.estimada || null;

    const { error } = await supabase.from('shipments').update(patch).eq('id', id);
    if (error) throw errorLegible('actualizarDespacho', error);
  },

  /** Cambios en vivo para que el tablero de despacho se actualice sin recargar. */
  suscribir(alCambiar: () => void): () => void {
    const canal = supabase
      .channel('despachos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, alCambiar)
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  },
};


// Inventario
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

/** Color de la carta de un producto, tal como se muestra en inventario. */
export interface ColorInventario {
  id: string;
  codigo: string;
  nombre: string;
  hex: string;
}

export interface Existencia {
  variantId: string;
  locationId: string;
  productId: string;
  /** Nulo en productos sin carta y en existencias sin clasificar. */
  colorId: string | null;
  color: ColorInventario | null;
  /** El producto se vende por color: todo movimiento exige uno de `coloresProducto`. */
  tieneCarta: boolean;
  coloresProducto: ColorInventario[];
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
  /** Punto de reorden; 0 = sin definir. */
  minimo: number;
}

/** 'bajo' solo si hay punto de reorden definido para esa referencia y bodega. */
export type SituacionExistencia = 'agotado' | 'bajo' | 'ok';

/** Existencias de un producto con carta que aún no tienen color asignado. */
export function sinClasificar(e: Existencia): boolean {
  return e.tieneCarta && !e.colorId;
}

/** Texto de búsqueda de una existencia: incluye el nombre y el código del color. */
export function coincideExistencia(e: Existencia, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [
    e.producto, e.presentacion, e.categoria, e.codigo ?? '',
    e.color?.nombre ?? '', e.color?.codigo ?? '',
    sinClasificar(e) ? 'sin clasificar' : '',
  ].some((v) => v.toLowerCase().includes(t));
}

export function situacion(e: Existencia): SituacionExistencia {
  if (e.neto <= 0) return 'agotado';
  if (e.minimo > 0 && e.neto <= e.minimo) return 'bajo';
  return 'ok';
}

export interface ResumenPunto {
  locationId: string;
  /** Llave estable para resolver la imagen de la tienda. */
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
 * `quantity` siempre es positiva y la dirección está en `kind`. AJUSTE no suma ni
 * resta: fija el saldo tras un conteo y guarda la diferencia absoluta.
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
  color: ColorInventario | null;
  bodega: string;
  notas: string | null;
  autor: string | null;
  fecha: string;
}

interface FilaColor { id: string; code: string; name: string; hex: string }

const aColor = (c: FilaColor | null | undefined): ColorInventario | null =>
  c ? { id: c.id, codigo: c.code, nombre: c.name, hex: c.hex } : null;

/** Los errores de color del servidor ya vienen en español tras el código: se usa ese texto. */
function errorDeColor(error: { message: string }): Error | null {
  const m = error.message ?? '';
  const r = m.match(/(?:COLOR_REQUERIDO|COLOR_NO_OFRECIDO|SIN_CARTA|NOT_FOUND):\s*(.+)$/);
  if (!r) return null;
  const texto = r[1].trim();
  return new Error(`${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`);
}

export const inventarioService = {
  /** Totales por punto de venta. */
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

  async existencias(opciones?: { locationId?: string; busqueda?: string }): Promise<Existencia[]> {
    let consulta = supabase
      .from('inventory')
      .select(
        'variant_id, location_id, color_id, qty_available, qty_reserved, min_qty, ' +
          'colors ( id, code, name, hex ), ' +
          'product_variants ( label, sku, products ( id, name, code, categories ( name ), brands ( name ), ' +
          'product_colors ( sort_order, colors ( id, code, name, hex ) ) ) ), ' +
          'pickup_locations ( name, city )'
      );

    if (opciones?.locationId) consulta = consulta.eq('location_id', opciones.locationId);

    const { data, error } = await consulta;
    if (error) throw errorLegible('existencias', error);

    const filas: Existencia[] = ((data ?? []) as unknown as Array<{
      variant_id: string; location_id: string; color_id: string | null;
      qty_available: number; qty_reserved: number; min_qty: number;
      colors: FilaColor | null;
      product_variants: {
        label: string; sku: string | null;
        products: {
          id: string; name: string; code: string;
          categories: { name: string } | null;
          brands: { name: string } | null;
          product_colors: Array<{ sort_order: number; colors: FilaColor | null }> | null;
        } | null;
      } | null;
      pickup_locations: { name: string; city: string } | null;
    }>).map((f) => {
      const p = f.product_variants?.products;
      const carta = [...(p?.product_colors ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((pc) => aColor(pc.colors))
        .filter((c): c is ColorInventario => c !== null);
      return {
        variantId: f.variant_id,
        locationId: f.location_id,
        productId: p?.id ?? '',
        colorId: f.color_id,
        color: aColor(f.colors),
        // Una fila con color también delata la carta aunque RLS oculte `product_colors`.
        tieneCarta: carta.length > 0 || f.color_id !== null,
        coloresProducto: carta,
        producto: p?.name ?? '—',
        codigo: p?.code ?? null,
        presentacion: f.product_variants?.label ?? '',
        categoria: p?.categories?.name ?? 'Sin categoría',
        marca: p?.brands?.name ?? '',
        bodega: f.pickup_locations?.name ?? '—',
        ciudad: f.pickup_locations?.city ?? '',
        disponible: f.qty_available,
        reservado: f.qty_reserved,
        neto: f.qty_available - f.qty_reserved,
        minimo: f.min_qty ?? 0,
      };
    });

    const q = opciones?.busqueda ?? '';
    const lista = filas.filter((f) => coincideExistencia(f, q));

    // Primero lo agotado y luego lo bajo el punto de reorden; dentro, producto, presentación y color.
    const peso = (e: Existencia) =>
      situacion(e) === 'agotado' ? 0 : situacion(e) === 'bajo' ? 1 : 2;
    return lista.sort(
      (a, b) =>
        peso(a) - peso(b) ||
        a.categoria.localeCompare(b.categoria, 'es') ||
        a.producto.localeCompare(b.producto, 'es') ||
        a.presentacion.localeCompare(b.presentacion, 'es') ||
        (a.color?.nombre ?? '').localeCompare(b.color?.nombre ?? '', 'es'),
    );
  },

  async fijarPuntoReorden(
    variantId: string, locationId: string, minimo: number, colorId: string | null = null,
  ): Promise<void> {
    const { error } = await supabase.rpc('set_reorder_point', {
      _variant_id: variantId,
      _location_id: locationId,
      _min_qty: minimo,
      _color_id: colorId,
    });
    if (error) throw errorDeColor(error) ?? errorLegible('fijarPuntoReorden', error);
  },

  /** Salida y entrada ocurren en una sola transacción en el servidor. */
  async trasladar(datos: {
    variantId: string;
    origen: string;
    destino: string;
    cantidad: number;
    colorId?: string | null;
    notas?: string;
  }): Promise<{ referencia: string; saldoOrigen: number; saldoDestino: number }> {
    const { data, error } = await supabase.rpc('transfer_inventory', {
      _variant_id: datos.variantId,
      _origen: datos.origen,
      _destino: datos.destino,
      _cantidad: datos.cantidad,
      _notas: datos.notas ?? null,
      _color_id: datos.colorId ?? null,
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
      if (/NOT_FOUND/.test(error.message)) {
        throw new Error('El punto de origen no tiene existencias de esa referencia en ese color.');
      }
      throw errorDeColor(error) ?? errorLegible('trasladar', error);
    }

    const r = data as { referencia: string; saldo_origen: number; saldo_destino: number };
    return { referencia: r.referencia, saldoOrigen: r.saldo_origen, saldoDestino: r.saldo_destino };
  },

  /** Pasa unidades sin clasificar al color que realmente son; el total del punto no cambia. */
  async clasificarPorColor(datos: {
    variantId: string; locationId: string; colorId: string; cantidad: number;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('clasificar_por_color', {
      _variant_id: datos.variantId,
      _location_id: datos.locationId,
      _color_id: datos.colorId,
      _cantidad: datos.cantidad,
    });
    if (error) {
      if (/INSUFFICIENT_STOCK/.test(error.message)) {
        throw new Error('No hay tantas unidades sin clasificar en este punto de venta.');
      }
      if (/VALIDATION/.test(error.message)) {
        throw new Error('La cantidad debe ser mayor que cero.');
      }
      if (/inventory_reservado_menor_o_igual/.test(error.message)) {
        throw new Error('Parte de esas unidades están reservadas en pedidos; clasifica solo las libres.');
      }
      throw errorDeColor(error) ?? errorLegible('clasificarPorColor', error);
    }
    return String((data as { referencia: string }).referencia);
  },

  async movimientos(filtro?: { variantId?: string; locationId?: string }): Promise<Movimiento[]> {
    let consulta = supabase
      .from('inventory_movements')
      .select(
        'id, kind, quantity, balance_after, notes, created_at, ' +
          'colors ( id, code, name, hex ), ' +
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
      colors: FilaColor | null;
      product_variants: { label: string; products: { name: string } | null } | null;
      pickup_locations: { name: string } | null;
      profiles: { first_name: string; last_name: string } | null;
    }>).map((m) => ({
      id: m.id,
      tipo: m.kind,
      cantidad: m.quantity,
      saldo: m.balance_after,
      producto: `${m.product_variants?.products?.name ?? '—'} · ${m.product_variants?.label ?? ''}`,
      color: aColor(m.colors),
      bodega: m.pickup_locations?.name ?? '—',
      notas: m.notes,
      autor: m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}`.trim() : null,
      fecha: m.created_at,
    }));
  },

  /** El saldo no se edita: se registra un movimiento y el servidor lo recalcula. */
  async registrar(datos: {
    variantId: string; locationId: string; tipo: TipoMovimiento;
    cantidad: number; colorId?: string | null; notas?: string;
  }): Promise<number> {
    const { data, error } = await supabase.rpc('register_inventory_movement', {
      _variant_id: datos.variantId,
      _location_id: datos.locationId,
      _kind: datos.tipo,
      _quantity: datos.cantidad,
      _reference: null,
      _notes: datos.notas ?? null,
      _color_id: datos.colorId ?? null,
    });
    if (error) {
      if (/INSUFFICIENT_STOCK/.test(error.message)) {
        throw new Error('No hay existencias suficientes para ese movimiento.');
      }
      if (/inventory_reservado_menor_o_igual/.test(error.message)) {
        throw new Error('El saldo no puede quedar por debajo de lo reservado en pedidos.');
      }
      throw errorDeColor(error) ?? errorLegible('registrar', error);
    }
    return Number((data as { balance: number }).balance);
  },
};

// Conversaciones: bandeja del personal
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
  /** Agrupa por hilo en el cliente porque el volumen es bajo; si crece, pasar a una vista materializada. */
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


// Facturación
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
  /** Null en facturas históricas sin pedido. */
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

  /** Pedidos entregados o listos sin factura vigente. */
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

  /** Motivo obligatorio (lo exige la base). Se rechaza si hay recaudos: primero se devuelven. */
  async anular(invoiceId: string, motivo: string): Promise<{
    numero: string; asientoRevertido: boolean;
  }> {
    const { data, error } = await supabase.rpc('anular_factura', {
      _invoice_id: invoiceId, _motivo: motivo,
    });
    if (error) {
      const m = error.message;
      if (/TIENE_RECAUDOS/.test(m)) {
        // Se conserva la cifra que devuelve la base.
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

// Panel

/** Cada bloque es null si el rol no tiene el permiso, para no dibujar la tarjeta. */
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
  /** El servidor cruza `_sedes` con las permitidas; una sede ajena no devuelve cifras. */
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

// Analítica
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

  /** Opciones de los filtros. */
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

  /** Tablero completo en una sola consulta. */
  async detallada(f: FiltrosAnalitica = {}): Promise<AnaliticaDetallada> {
    const { data, error } = await supabase.rpc('analitica_ventas', {
      _desde: f.desde ?? null,
      _hasta: f.hasta ?? null,
      // Arreglo vacío significaría "ningún punto"; sin filtro va null.
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


// Tesorería
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
  /** Null en un egreso que no pertenece a una tienda. */
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

  /** Facturas con saldo pendiente, por antigüedad. */
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

  /** Se excluyen caja y bancos: mover entre ellas es un traslado, no un gasto. */
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

  /** La contrapartida es obligatoria para saber qué se pagó. */
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
