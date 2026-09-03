import { supabase } from '../lib/supabase';

/**
 * Pasarela de pagos y cupo de crédito por empresa.
 *
 * Las funciones de la base existían desde el principio pero no tenían
 * pantalla: cargar las llaves de Wompi, apagar el modo prueba o aprobarle
 * crédito a una constructora obligaba a entrar a la base a mano. Eso no lo
 * puede hacer quien administra el negocio, así que en la práctica no se hacía.
 *
 * LOS SECRETOS NUNCA VUELVEN. `estado_pasarela` solo dice si están puestos, no
 * su valor: devolverlos los filtraría a cualquiera que abra la consola del
 * navegador. Por eso la pantalla muestra «configurado» y no un campo relleno,
 * y un campo vacío al guardar significa «no lo cambies», no «bórralo».
 */

export interface EstadoPasarela {
  /** Si está apagada, el cliente no ve la opción de pagar. */
  activa: boolean;
  /**
   * Modo prueba: **aprueba el cobro sin cobrar**. Es lo que hay hoy, y es la
   * cosa más peligrosa de la configuración si se olvida al salir a producción.
   */
  prueba: boolean;
  llavePublica: string | null;
  tieneIntegridad: boolean;
  tieneEventos: boolean;
}

export interface DatosPasarela {
  activa: boolean;
  prueba: boolean;
  /** Vacío = conservar la que ya está guardada. */
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
  /** Saldo pendiente hoy. Sirve para no aprobar un cupo por debajo de lo que ya debe. */
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
  /** Si la llave está puesta. Nunca cuál es. */
  tieneLlave: boolean;
  configuradaEn: string | null;
}

/**
 * Asistente con IA.
 *
 * La llave NO se puede leer desde el navegador: la columna tiene el SELECT
 * revocado y solo la usa la función de borde. Mismo trato que la contraseña
 * del correo y los secretos de Wompi, y por la misma razón: una llave de API
 * en el paquete JavaScript se la lleva cualquiera que abra la consola, y se le
 * factura al dueño hasta que la cancele.
 */
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

  /**
   * Guarda la configuración. Los campos de secreto en blanco se omiten para
   * que la base conserve el valor guardado.
   */
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

  // ----------------------------------------------------------
  // Crédito por empresa
  // ----------------------------------------------------------

  /**
   * Empresas con su condición de pago y lo que deben hoy.
   *
   * El saldo se trae de `v_cartera` para poder avisar cuando el cupo que se va
   * a aprobar queda por debajo de la deuda existente: aprobar 1 millón a quien
   * ya debe 3 bloquea sus pedidos sin que nadie entienda por qué.
   */
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

    // Saldo por empresa. `v_cartera` es por factura, así que se agrupa aquí.
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

  /** La condición de pago de UNA empresa, para su pantalla de detalle. */
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

    // Lo que ya debe. Se consulta aparte porque vive en las facturas, no en la
    // ficha de la empresa.
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
