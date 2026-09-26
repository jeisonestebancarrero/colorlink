import { supabase } from '../lib/supabase';

/**
 * IVA. Los precios del catálogo ya lo incluyen; `emitir_factura_pos` despeja la
 * base hacia atrás. Este módulo centraliza ese despeje para carrito y cotización.
 */

/** Mientras `app_settings` no responda o si la consulta falla. */
export const TARIFA_IVA_POR_DEFECTO = 19;

export interface DesgloseIva {
  /** Base gravable: precio sin IVA. */
  base: number;
  iva: number;
  /** Lo que paga el cliente (precio de góndola). */
  total: number;
  /** Tarifa aplicada, en porcentaje. */
  tarifa: number;
}

/** Mismo cálculo y redondeo que `emitir_factura_pos`, para coincidir al peso con la factura. */
export function desglosarIvaIncluido(
  totalConIva: number,
  tarifa: number = TARIFA_IVA_POR_DEFECTO
): DesgloseIva {
  const total = Number.isFinite(totalConIva) ? totalConIva : 0;
  // Tarifa 0 (excluido de IVA) es válida: base = total.
  const t = Number.isFinite(tarifa) && tarifa >= 0 ? tarifa : TARIFA_IVA_POR_DEFECTO;

  const base = Math.round((total / (1 + t / 100)) * 100) / 100;
  return { base, iva: Math.round((total - base) * 100) / 100, total, tarifa: t };
}

/** Con centavos a propósito: redondeados a pesos, base + IVA puede no sumar el total. */
export const formatearImporteImpuesto = (n: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

/** Legible sin sesión; solo expone tarifa y régimen, nunca SMTP ni llaves de la pasarela. */
export async function obtenerTarifaIva(): Promise<number> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('default_tax_rate')
    .maybeSingle();

  if (error) {
    console.warn('[impuestos] no se pudo leer la tarifa de IVA:', error.message);
    return TARIFA_IVA_POR_DEFECTO;
  }
  const tarifa = Number((data as { default_tax_rate: string | number } | null)?.default_tax_rate);
  return Number.isFinite(tarifa) && tarifa >= 0 ? tarifa : TARIFA_IVA_POR_DEFECTO;
}
