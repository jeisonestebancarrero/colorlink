import { supabase } from '../lib/supabase';

/** Seguimiento para el cliente: el avance como secuencia de hitos, no como campos de la base. */

export type EstadoSeguimiento =
  | 'PENDIENTE' | 'CONFIRMADO' | 'PREPARANDO' | 'ENVIADO'
  | 'LISTO_PARA_RETIRO' | 'ENTREGADO' | 'CANCELADO';

export interface HitoSeguimiento {
  clave: string;
  titulo: string;
  descripcion: string;
  alcanzado: boolean;
  actual: boolean;
  fecha?: string;
}

export interface PedidoCliente {
  id: string;
  numero: string;
  estado: EstadoSeguimiento;
  esEnvio: boolean;
  total: number;
  creadoEn: string;
  direccion: string | null;
  ciudad: string | null;
  puntoRetiro: string | null;
  ciudadRetiro: string | null;
  codigoRetiro: string | null;
  transportadora: string | null;
  guia: string | null;
  estimada: string | null;
  items: Array<{ nombre: string; presentacion: string | null; cantidad: number; subtotal: number }>;
  /** Avance de 0 a 1. */
  progreso: number;
  hitos: HitoSeguimiento[];
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Retiro y envío tienen recorridos distintos: al que recoge no se le muestra "en camino". */
function construirHitos(estado: EstadoSeguimiento, esEnvio: boolean): HitoSeguimiento[] {
  const secuencia = esEnvio
    ? [
        { clave: 'CONFIRMADO', titulo: 'Pedido confirmado', descripcion: 'Recibimos tu pedido y lo estamos procesando.' },
        { clave: 'PREPARANDO', titulo: 'Preparando tu pedido', descripcion: 'Alistamos tus productos en bodega.' },
        { clave: 'ENVIADO', titulo: 'En camino', descripcion: 'Tu pedido salió hacia la dirección de entrega.' },
        { clave: 'ENTREGADO', titulo: 'Entregado', descripcion: 'Tu pedido llegó a su destino.' },
      ]
    : [
        { clave: 'CONFIRMADO', titulo: 'Pedido confirmado', descripcion: 'Recibimos tu pedido y lo estamos procesando.' },
        { clave: 'PREPARANDO', titulo: 'Preparando tu pedido', descripcion: 'Alistamos tus productos en la tienda.' },
        { clave: 'LISTO_PARA_RETIRO', titulo: 'Listo para retirar', descripcion: 'Puedes pasar por tu pedido cuando quieras.' },
        { clave: 'ENTREGADO', titulo: 'Retirado', descripcion: 'Gracias por tu compra.' },
      ];

  const orden = secuencia.map((h) => h.clave);
  // PENDIENTE aún no alcanza el primer hito.
  const indiceActual = estado === 'PENDIENTE' ? -1 : orden.indexOf(estado);

  return secuencia.map((h, i) => ({
    ...h,
    alcanzado: i <= indiceActual,
    actual: i === indiceActual,
  }));
}

const PROGRESO: Record<EstadoSeguimiento, number> = {
  PENDIENTE: 0.02,
  CONFIRMADO: 0.15,
  PREPARANDO: 0.35,
  ENVIADO: 0.7,
  LISTO_PARA_RETIRO: 0.85,
  ENTREGADO: 1,
  CANCELADO: 0,
};

export const trackingService = {
  async misPedidos(): Promise<PedidoCliente[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, delivery_method, total_cop, created_at, ' +
          'shipping_address, shipping_city, pickup_code, estimated_delivery_date, ' +
          'pickup_locations ( name, city ), ' +
          'shipments ( carrier, tracking_number, estimated_at ), ' +
          'order_items ( product_name, presentation, quantity, subtotal_cop )'
      )
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('[tracking] misPedidos:', error.message);
      throw new Error('No fue posible cargar tus pedidos. Inténtalo nuevamente.');
    }

    return ((data ?? []) as unknown as Array<Record<string, never>>).map((raw) => {
      const f = raw as unknown as {
        id: string; order_number: string; status: EstadoSeguimiento;
        delivery_method: string; total_cop: string | number; created_at: string;
        shipping_address: string | null; shipping_city: string | null;
        pickup_code: string | null;
        estimated_delivery_date: string | null;
        pickup_locations: { name: string; city: string } | null;
        shipments: Array<{ carrier: string | null; tracking_number: string | null; estimated_at: string | null }> | null;
        order_items: Array<{ product_name: string; presentation: string | null; quantity: number; subtotal_cop: string | number }> | null;
      };
      const esEnvio = f.delivery_method === 'ENVIO';
      const envio = f.shipments?.[0];

      return {
        id: f.id,
        numero: f.order_number,
        estado: f.status,
        esEnvio,
        total: num(f.total_cop),
        creadoEn: f.created_at,
        direccion: f.shipping_address,
        ciudad: f.shipping_city,
        puntoRetiro: f.pickup_locations?.name ?? null,
        ciudadRetiro: f.pickup_locations?.city ?? null,
        codigoRetiro: f.pickup_code,
        transportadora: envio?.carrier ?? null,
        guia: envio?.tracking_number ?? null,
        // La del despacho manda cuando existe; si no, la que calculó el servidor al crear el pedido.
        estimada: envio?.estimated_at ?? f.estimated_delivery_date ?? null,
        progreso: PROGRESO[f.status] ?? 0,
        hitos: construirHitos(f.status, esEnvio),
        items: (f.order_items ?? []).map((i) => ({
          nombre: i.product_name,
          presentacion: i.presentation,
          cantidad: Number(i.quantity),
          subtotal: num(i.subtotal_cop),
        })),
      };
    });
  },

  /** Cambios en vivo de pedidos y envíos, sin sondeo. */
  suscribir(alCambiar: () => void): () => void {
    const canal = supabase
      .channel('seguimiento-cliente')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, alCambiar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, alCambiar)
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  },
};
