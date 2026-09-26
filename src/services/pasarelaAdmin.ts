import { supabase } from '../lib/supabase';

/**
 * Pasarela de pagos y cupo de crédito por empresa. Los secretos nunca vuelven al
 * navegador: `estado_pasarela` solo indica si existen y un campo vacío los conserva.
 */

export interface EstadoPasarela {
  /** Apagada, el cliente no ve la opción de pagar. */
  activa: boolean;
  /** Modo prueba: aprueba sin cobrar. Debe apagarse antes de producción. */
  prueba: boolean;
  llavePublica: string | null;
  tieneIntegridad: boolean;
  tieneEventos: boolean;
}

export interface DatosPasarela {
  activa: boolean;
  prueba: boolean;
  /** Vacío = conservar la guardada. */
  llavePublica?: string;
  secretoIntegridad?: string;
  secretoEventos?: string;
}

export interface CreditoEmpresa {
  id: string;
  nombre: string;
  nit: string | null;
  ciudad: string | null;
  aCredito: boolean;
  dias: number;
  cupo: number;
  /** Saldo pendiente, para no aprobar un cupo menor que la deuda. */
  saldo: number;
}

function fallo(contexto: string, mensaje: string): Error {
  console.error(`[pasarela] ${contexto}:`, mensaje);
  if (/FALTAN_LLAVES/.test(mensaje)) {
    return new Error(
      'Para cobrar de verdad hacen falta la llave pública y el secreto de integridad.'
    );
  }
  if (/PLAZO_INVALIDO/.test(mensaje)) {
    return new Error('El plazo debe estar entre 1 y 180 días.');
  }
  if (/CUPO_INVALIDO/.test(mensaje)) {
    return new Error('Un crédito sin cupo no sirve de nada: pon el monto aprobado.');
  }
  if (/FORBIDDEN/.test(mensaje)) {
    return new Error('Solo un administrador puede hacer este cambio.');
  }
  if (/NOT_FOUND/.test(mensaje)) {
    return new Error('Esa empresa no existe.');
  }
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface EstadoAsistente {
  activa: boolean;
  proveedor: string;
  modelo: string;
  /** Si la llave está puesta; nunca su valor. */
  tieneLlave: boolean;
  configuradaEn: string | null;
}

/** Asistente con IA. La llave tiene SELECT revocado y solo la usa la función de borde. */
export const asistenteService = {
  async estado(): Promise<EstadoAsistente> {
    const { data, error } = await supabase.rpc('estado_asistente');
    if (error) throw fallo('estadoAsistente', error.message);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      activa: d.activa === true,
      proveedor: (d.proveedor as string) ?? 'openai',
      modelo: (d.modelo as string) ?? '',
      tieneLlave: d.tiene_llave === true,
      configuradaEn: (d.configurada_en as string) ?? null,
    };
  },

  async guardar(datos: {
    activa: boolean; modelo?: string; llave?: string;
  }): Promise<EstadoAsistente> {
    const cuerpo: Record<string, unknown> = { ai_enabled: datos.activa };
    if (datos.modelo?.trim()) cuerpo.ai_model = datos.modelo.trim();
    // Vacío = conservar la guardada.
    if (datos.llave?.trim()) cuerpo.ai_api_key = datos.llave.trim();

    const { error } = await supabase.rpc('configurar_asistente', { _datos: cuerpo });
    if (error) {
      if (/FALTA_LLAVE/.test(error.message)) {
        throw new Error(
          'Para encender la IA hace falta la llave del proveedor. Sin ella el '
          + 'cliente se quedaría esperando una respuesta que no llega.',
        );
      }
      throw fallo('guardarAsistente', error.message);
    }
    return this.estado();
  },
};

export const pasarelaService = {
  async estado(): Promise<EstadoPasarela> {
    const { data, error } = await supabase.rpc('estado_pasarela');
    if (error) throw fallo('estado', error.message);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      activa: d.activa === true,
      prueba: d.prueba !== false,
      llavePublica: (d.llave_publica as string) ?? null,
      tieneIntegridad: d.tiene_integridad === true,
      tieneEventos: d.tiene_eventos === true,
    };
  },

  /** Los secretos en blanco se omiten para que la base conserve el valor. */
  async guardar(datos: DatosPasarela): Promise<EstadoPasarela> {
    const cuerpo: Record<string, unknown> = {
      payments_enabled: datos.activa,
      payments_test_mode: datos.prueba,
    };
    if (datos.llavePublica?.trim()) cuerpo.wompi_public_key = datos.llavePublica.trim();
    if (datos.secretoIntegridad?.trim()) {
      cuerpo.wompi_integrity_secret = datos.secretoIntegridad.trim();
    }
    if (datos.secretoEventos?.trim()) {
      cuerpo.wompi_events_secret = datos.secretoEventos.trim();
    }

    const { error } = await supabase.rpc('configurar_pasarela', { _datos: cuerpo });
    if (error) throw fallo('guardar', error.message);
    return this.estado();
  },

  // Crédito por empresa

  /** Condición de pago y saldo (`v_cartera`), para avisar si el cupo queda por debajo de la deuda. */
  async empresas(busqueda = ''): Promise<CreditoEmpresa[]> {
    let q = supabase
      .from('companies')
      .select('id, name, nit, city, payment_terms, credit_days, credit_limit_cop')
      .order('name');

    if (busqueda.trim()) {
      const t = busqueda.trim();
      const nit = t.replace(/[^0-9A-Za-z-]/g, '');
      q = q.or(`name.ilike.%${t}%,nit.ilike.%${nit}%`);
    }

    const { data, error } = await q;
    if (error) throw fallo('empresas', error.message);

    const filas = (data ?? []) as Array<{
      id: string; name: string; nit: string | null; city: string | null;
      payment_terms: string; credit_days: number; credit_limit_cop: string | number;
    }>;
    if (filas.length === 0) return [];

    // `v_cartera` es por factura: se agrupa por empresa aquí.
    const { data: cartera } = await supabase
      .from('v_cartera')
      .select('company_id, saldo')
      .gt('saldo', 0);

    const porEmpresa = new Map<string, number>();
    for (const c of (cartera ?? []) as Array<{ company_id: string | null; saldo: number }>) {
      if (!c.company_id) continue;
      porEmpresa.set(c.company_id, (porEmpresa.get(c.company_id) ?? 0) + num(c.saldo));
    }

    return filas.map((f) => ({
      id: f.id,
      nombre: f.name,
      nit: f.nit,
      ciudad: f.city,
      aCredito: f.payment_terms === 'CREDITO',
      dias: f.credit_days ?? 0,
      cupo: num(f.credit_limit_cop),
      saldo: porEmpresa.get(f.id) ?? 0,
    }));
  },

  /** Condición de pago de una empresa. */
  async credito(companyId: string): Promise<CreditoEmpresa | null> {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, nit, city, payment_terms, credit_days, credit_limit_cop')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw fallo('credito', error.message);
    if (!data) return null;

    const f = data as {
      id: string; name: string; nit: string | null; city: string | null;
      payment_terms: string; credit_days: number; credit_limit_cop: string | number;
    };

    // La deuda vive en las facturas, no en la ficha de la empresa.
    const { data: cartera } = await supabase
      .from('v_cartera')
      .select('saldo')
      .eq('company_id', companyId)
      .gt('saldo', 0);

    let saldo = 0;
    for (const c of (cartera ?? []) as Array<{ saldo: number }>) saldo += num(c.saldo);

    return {
      id: f.id,
      nombre: f.name,
      nit: f.nit,
      ciudad: f.city,
      aCredito: f.payment_terms === 'CREDITO',
      dias: f.credit_days ?? 0,
      cupo: num(f.credit_limit_cop),
      saldo,
    };
  },

  async fijarCredito(
    companyId: string,
    aCredito: boolean,
    dias: number,
    cupo: number
  ): Promise<void> {
    const { error } = await supabase.rpc('fijar_credito_empresa', {
      _company_id: companyId,
      _a_credito: aCredito,
      _dias: dias,
      _cupo: cupo,
    });
    if (error) throw fallo('fijarCredito', error.message);
  },
};
