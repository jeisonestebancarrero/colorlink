import { supabase } from '../lib/supabase';
import { formatearFecha } from './backoffice';

/**
 * Contabilidad en partida doble.
 *
 * ALCANCE: registra lo que el sistema ya sabe —facturas, recepciones,
 * recaudos— y entrega libro auxiliar y balance de prueba. No emite medios
 * magnéticos ni información exógena, no calcula retenciones y no reemplaza a
 * un contador público. La pantalla lo dice para que nadie lo descubra tarde.
 */

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[contabilidad] ${contexto}:`, error.message);
  const m = error.message ?? '';
  if (/DESCUADRADO/.test(m)) {
    const cifras = m.match(/\(([\d.]+)\).*?\(([\d.]+)\)/);
    return new Error(
      cifras
        ? `El comprobante no cuadra: débito ${cifras[1]} contra crédito ${cifras[2]}.`
        : 'El comprobante no cuadra: el débito y el crédito deben ser iguales.',
    );
  }
  if (/MINIMO_DOS_LINEAS/.test(m)) {
    return new Error('Un asiento en partida doble necesita al menos dos líneas.');
  }
  if (/CUENTA_NO_IMPUTABLE/.test(m)) {
    return new Error('Esa es una cuenta de agrupación y no recibe asientos. Elige una de movimiento.');
  }
  if (/CUENTA_DESCONOCIDA/.test(m)) return new Error('Alguna cuenta no existe o está inactiva.');
  if (/SIN_VALOR/.test(m)) return new Error('El comprobante no puede ser por cero.');
  if (/SIN_DESCRIPCION/.test(m)) return new Error('El comprobante necesita una descripción.');
  if (/SIN_MOTIVO/.test(m)) return new Error('Hay que decir por qué se anula.');
  if (/YA_ANULADO/.test(m)) return new Error('Ese comprobante ya está anulado.');
  if (/FORBIDDEN/.test(m)) return new Error('No tienes permiso para esta operación.');
  if (/NOT_FOUND/.test(m)) return new Error('Ese comprobante ya no existe.');
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const formatearCOP = (n: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
    .format(n);

export { formatearFecha };

export const ETIQUETA_ORIGEN: Record<string, string> = {
  MANUAL: 'Manual',
  FACTURA: 'Factura',
  RECEPCION: 'Recepción',
  RECAUDO: 'Recaudo',
  AJUSTE_INVENTARIO: 'Ajuste de inventario',
};

export const ETIQUETA_CLASE: Record<string, string> = {
  ACTIVO: 'Activo',
  PASIVO: 'Pasivo',
  PATRIMONIO: 'Patrimonio',
  INGRESO: 'Ingresos',
  GASTO: 'Gastos',
  COSTO: 'Costos',
};

export interface Cuenta {
  id: string;
  codigo: string;
  nombre: string;
  clase: string;
  naturaleza: 'DEBITO' | 'CREDITO';
  imputable: boolean;
}

export interface LineaAsiento {
  cuenta: string;
  cuentaNombre: string;
  detalle: string | null;
  debito: number;
  credito: number;
}

export interface Asiento {
  id: string;
  numero: string;
  fecha: string;
  origen: string;
  descripcion: string;
  estado: 'REGISTRADO' | 'ANULADO';
  totalDebito: number;
  totalCredito: number;
  motivoAnulacion: string | null;
  lineas: LineaAsiento[];
}

export interface SaldoCuenta {
  cuenta: string;
  nombre: string;
  clase: string;
  naturaleza: 'DEBITO' | 'CREDITO';
  debitos: number;
  creditos: number;
  saldo: number;
}

/** El documento que originó un comprobante, con sus líneas. */
export interface DocumentoOrigen {
  tipo: 'FACTURA' | 'RECEPCION' | 'RECAUDO' | 'MANUAL';
  numero?: string;
  fecha?: string;
  contraparte?: string;
  documento?: string | null;
  total?: number;
  base?: number;
  impuesto?: number;
  descuento?: number;
  envio?: number;
  formaPago?: string;
  bodega?: string;
  cuenta?: string;
  costosVisibles?: boolean;
  lineas: Array<{
    descripcion: string;
    codigo: string | null;
    presentacion: string | null;
    cantidad: number;
    valorUnitario: number | null;
    subtotal: number | null;
  }>;
}

export interface RenglonResultado {
  clase: string;
  cuenta: string;
  nombre: string;
  valor: number;
}

export const contabilidadService = {
  async cuentas(): Promise<Cuenta[]> {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, code, name, class, nature, is_postable')
      .eq('is_active', true)
      .order('code');
    if (error) throw errorLegible('cuentas', error);

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((c) => ({
      id: String(c.id),
      codigo: String(c.code),
      nombre: String(c.name),
      clase: String(c.class),
      naturaleza: c.nature === 'CREDITO' ? 'CREDITO' : 'DEBITO',
      imputable: Boolean(c.is_postable),
    }));
  },

  async comprobantes(filtro?: { desde?: string; hasta?: string }): Promise<Asiento[]> {
    let consulta = supabase
      .from('journal_entries')
      .select(
        'id, entry_number, entry_date, source, description, status, total_debit, total_credit, void_reason',
      )
      .order('entry_date', { ascending: false })
      .order('entry_number', { ascending: false })
      .limit(200);

    if (filtro?.desde) consulta = consulta.gte('entry_date', filtro.desde);
    if (filtro?.hasta) consulta = consulta.lte('entry_date', filtro.hasta);

    const { data, error } = await consulta;
    if (error) throw errorLegible('comprobantes', error);

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((e) => ({
      id: String(e.id),
      numero: String(e.entry_number),
      fecha: String(e.entry_date),
      origen: String(e.source),
      descripcion: String(e.description),
      estado: e.status === 'ANULADO' ? 'ANULADO' : 'REGISTRADO',
      totalDebito: num(e.total_debit),
      totalCredito: num(e.total_credit),
      motivoAnulacion: (e.void_reason as string) ?? null,
      lineas: [],
    }));
  },

  async lineas(entryId: string): Promise<LineaAsiento[]> {
    const { data, error } = await supabase
      .from('v_libro_auxiliar')
      .select('cuenta, cuenta_nombre, detalle, debit_cop, credit_cop')
      .eq('entry_id', entryId)
      .order('cuenta');
    if (error) throw errorLegible('lineas', error);

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((l) => ({
      cuenta: String(l.cuenta),
      cuentaNombre: String(l.cuenta_nombre),
      detalle: (l.detalle as string) ?? null,
      debito: num(l.debit_cop),
      credito: num(l.credit_cop),
    }));
  },

  /**
   * El documento que originó el comprobante.
   *
   * Va por función y no consultando las tablas porque una recepción incluye
   * el costo de compra, que es confidencial: el servidor decide si lo
   * devuelve según el permiso de quien pregunta.
   */
  async documento(entryId: string): Promise<DocumentoOrigen> {
    const { data, error } = await supabase.rpc('detalle_documento_comprobante', {
      _entry_id: entryId,
    });
    if (error) throw errorLegible('documento', error);

    const d = (data ?? { tipo: 'MANUAL' }) as Record<string, unknown>;
    return {
      tipo: (d.tipo as DocumentoOrigen['tipo']) ?? 'MANUAL',
      numero: d.numero as string | undefined,
      fecha: d.fecha as string | undefined,
      contraparte: d.contraparte as string | undefined,
      documento: (d.documento as string) ?? null,
      total: d.total === undefined ? undefined : num(d.total),
      base: d.base === undefined ? undefined : num(d.base),
      impuesto: d.impuesto === undefined ? undefined : num(d.impuesto),
      descuento: d.descuento === undefined ? undefined : num(d.descuento),
      envio: d.envio === undefined ? undefined : num(d.envio),
      formaPago: d.forma_pago as string | undefined,
      bodega: d.bodega as string | undefined,
      cuenta: d.cuenta as string | undefined,
      costosVisibles: d.costos_visibles as boolean | undefined,
      lineas: ((d.lineas ?? []) as Array<Record<string, unknown>>).map((l) => ({
        descripcion: String(l.descripcion ?? ''),
        codigo: (l.codigo as string) ?? null,
        presentacion: (l.presentacion as string) ?? null,
        cantidad: num(l.cantidad),
        valorUnitario: l.valor_unitario === null || l.valor_unitario === undefined ? null : num(l.valor_unitario),
        subtotal: l.subtotal === null || l.subtotal === undefined ? null : num(l.subtotal),
      })),
    };
  },

  /** Movimientos de una cuenta: la consulta más frecuente de un contador. */
  async auxiliar(cuenta: string, filtro?: { desde?: string; hasta?: string }): Promise<Array<{
    entryId: string;
    numero: string;
    fecha: string;
    comprobante: string;
    detalle: string | null;
    origen: string;
    estado: string;
    debito: number;
    credito: number;
  }>> {
    let consulta = supabase
      .from('v_libro_auxiliar')
      .select('entry_id, entry_number, entry_date, comprobante, detalle, source, status, debit_cop, credit_cop')
      .eq('cuenta', cuenta)
      .eq('status', 'REGISTRADO')
      .order('entry_date')
      .order('entry_number');

    if (filtro?.desde) consulta = consulta.gte('entry_date', filtro.desde);
    if (filtro?.hasta) consulta = consulta.lte('entry_date', filtro.hasta);

    const { data, error } = await consulta;
    if (error) throw errorLegible('auxiliar', error);

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((l) => ({
      entryId: String(l.entry_id),
      numero: String(l.entry_number),
      fecha: String(l.entry_date),
      comprobante: String(l.comprobante),
      detalle: (l.detalle as string) ?? null,
      origen: String(l.source),
      estado: String(l.status),
      debito: num(l.debit_cop),
      credito: num(l.credit_cop),
    }));
  },

  async estadoResultados(): Promise<RenglonResultado[]> {
    const { data, error } = await supabase
      .from('v_estado_resultados')
      .select('clase, cuenta, cuenta_nombre, valor')
      .order('cuenta');
    if (error) throw errorLegible('estadoResultados', error);

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      clase: String(r.clase),
      cuenta: String(r.cuenta),
      nombre: String(r.cuenta_nombre),
      valor: num(r.valor),
    }));
  },

  async balance(): Promise<SaldoCuenta[]> {
    const { data, error } = await supabase
      .from('v_balance_prueba')
      .select('cuenta, cuenta_nombre, clase, naturaleza, debitos, creditos, saldo')
      .order('cuenta');
    if (error) throw errorLegible('balance', error);

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((b) => ({
      cuenta: String(b.cuenta),
      nombre: String(b.cuenta_nombre),
      clase: String(b.clase),
      naturaleza: b.naturaleza === 'CREDITO' ? 'CREDITO' : 'DEBITO',
      debitos: num(b.debitos),
      creditos: num(b.creditos),
      saldo: num(b.saldo),
    }));
  },

  /** Comprobación global: la suma de débitos debe igualar la de créditos. */
  async cuadra(): Promise<{ debitos: number; creditos: number; cuadra: boolean; comprobantes: number }> {
    const { data, error } = await supabase.rpc('contabilidad_cuadra');
    if (error) throw errorLegible('cuadra', error);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      debitos: num(d.debitos),
      creditos: num(d.creditos),
      cuadra: Boolean(d.cuadra),
      comprobantes: num(d.comprobantes),
    };
  },

  async registrar(datos: {
    descripcion: string;
    fecha?: string;
    lineas: Array<{ cuenta: string; detalle?: string; debito: number; credito: number }>;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('post_journal_entry', {
      _descripcion: datos.descripcion,
      _lineas: datos.lineas,
      _fecha: datos.fecha ?? null,
      _origen: 'MANUAL',
    });
    if (error) throw errorLegible('registrar', error);
    return String(data);
  },

  async anular(entryId: string, motivo: string): Promise<string> {
    const { data, error } = await supabase.rpc('void_journal_entry', {
      _entry_id: entryId,
      _motivo: motivo,
    });
    if (error) throw errorLegible('anular', error);
    return String(data);
  },
};
