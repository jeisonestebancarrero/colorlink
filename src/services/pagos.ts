import { supabase } from '../lib/supabase';

/**
 * Pagos del cliente. `condiciones_de_pago` decide en el servidor contado o crédito;
 * la confirmación llega firmada por el webhook de Wompi, no por aquí.
 */

export interface CondicionesPago {
  aCredito: boolean;
  motivo?: string;
  empresa?: string;
  dias?: number;
  cupo?: number;
  usado?: number;
  disponible?: number;
}

export interface IntencionPago {
  modo: 'WOMPI' | 'PRUEBA' | 'CREDITO';
  referencia?: string;
  centavos?: number;
  moneda?: string;
  llavePublica?: string | null;
  firma?: string | null;
  vence?: string;
  dias?: number;
}

export type EstadoPago = 'PENDIENTE' | 'AUTORIZADO' | 'PAGADO' | 'RECHAZADO' | 'REEMBOLSADO';

function legible(contexto: string, error: { message?: string }): Error {
  const m = error?.message ?? '';
  if (/SIN_CREDITO/.test(m)) return new Error('Esta cuenta no tiene crédito aprobado.');
  if (/CUPO_INSUFICIENTE/.test(m)) return new Error('El pedido supera el cupo de crédito disponible.');
  if (/PASARELA_APAGADA/.test(m)) return new Error('El pago en línea no está configurado todavía.');
  if (/YA_PAGADO/.test(m)) return new Error('Ese pedido ya está pagado.');
  if (/PEDIDO_VACIO/.test(m)) return new Error('El pedido no tiene valor a pagar.');
  if (/MODO_PRUEBA_APAGADO/.test(m)) return new Error('El pago de prueba no está disponible.');
  if (/FORBIDDEN/.test(m)) return new Error('No tienes permiso para esta operación.');
  console.error(`[pagos] ${contexto}`, error);
  return new Error('No fue posible completar el pago. Inténtalo nuevamente.');
}

export const pagoService = {
  /** Contado o crédito, y cupo disponible. */
  async condiciones(): Promise<CondicionesPago> {
    const { data, error } = await supabase.rpc('condiciones_de_pago');
    if (error) throw legible('condiciones', error);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      aCredito: Boolean(d.a_credito),
      motivo: (d.motivo as string) ?? undefined,
      empresa: (d.empresa as string) ?? undefined,
      dias: d.dias === undefined ? undefined : Number(d.dias),
      cupo: d.cupo === undefined ? undefined : Number(d.cupo),
      usado: d.usado === undefined ? undefined : Number(d.usado),
      disponible: d.disponible === undefined ? undefined : Number(d.disponible),
    };
  },

  /** Abre el cobro y devuelve los datos para la pasarela. */
  async iniciar(orderId: string, metodo: string): Promise<IntencionPago> {
    const { data, error } = await supabase.rpc('iniciar_pago', {
      _order_id: orderId,
      _metodo: metodo,
    });
    if (error) throw legible('iniciar', error);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      modo: (d.modo as IntencionPago['modo']) ?? 'PRUEBA',
      referencia: (d.referencia as string) ?? undefined,
      centavos: d.centavos === undefined ? undefined : Number(d.centavos),
      moneda: (d.moneda as string) ?? 'COP',
      llavePublica: (d.llave_publica as string) ?? null,
      firma: (d.firma as string) ?? null,
      vence: (d.vence as string) ?? undefined,
      dias: d.dias === undefined ? undefined : Number(d.dias),
    };
  },

  /** Aprueba sin pasarela; el servidor solo lo acepta en modo prueba. */
  async simular(orderId: string, aprobar = true): Promise<EstadoPago> {
    const { data, error } = await supabase.rpc('simular_pago', {
      _order_id: orderId,
      _aprobar: aprobar,
    });
    if (error) throw legible('simular', error);
    return ((data as Record<string, unknown>)?.resultado as EstadoPago) ?? 'PENDIENTE';
  },

  async estado(orderId: string): Promise<{ estado: EstadoPago; aCredito: boolean; vence: string | null }> {
    const { data, error } = await supabase
      .from('payments')
      .select('status, is_credit, due_date')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw legible('estado', error);
    const d = data as { status?: string; is_credit?: boolean; due_date?: string } | null;
    return {
      estado: (d?.status as EstadoPago) ?? 'PENDIENTE',
      aCredito: Boolean(d?.is_credit),
      vence: d?.due_date ?? null,
    };
  },

  /** Pago abandonado: cancela el pedido y devuelve sus productos al carrito. */
  async devolverAlCarrito(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('devolver_pedido_al_carrito', {
      _order_id: orderId,
    });
    // Si el pedido ya avanzó no hay nada que devolver y no es un error.
    if (error && !/YA_EN_CURSO/.test(error.message ?? '')) {
      throw legible('devolverAlCarrito', error);
    }
  },

  /** Configuración de la pasarela, para decidir qué ofrecer. */
  async configuracion(): Promise<{ activa: boolean; prueba: boolean }> {
    const { data } = await supabase
      .from('app_settings')
      .select('payments_enabled, payments_test_mode')
      .limit(1)
      .maybeSingle();
    const d = data as { payments_enabled?: boolean; payments_test_mode?: boolean } | null;
    return { activa: Boolean(d?.payments_enabled), prueba: Boolean(d?.payments_test_mode) };
  },
};

/** Medios de pago en línea con su nombre común. */
export const MEDIOS_PAGO = [
  { valor: 'PSE', texto: 'PSE — débito desde tu banco' },
  { valor: 'TARJETA_CREDITO', texto: 'Tarjeta de crédito' },
  { valor: 'TARJETA_DEBITO', texto: 'Tarjeta débito' },
  { valor: 'TRANSFERENCIA', texto: 'Transferencia' },
] as const;
