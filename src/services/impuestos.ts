import { supabase } from '../lib/supabase';

/**
 * IVA.
 *
 * DECISIÓN DEL SISTEMA: **los precios del catálogo YA INCLUYEN IVA.** Es el
 * precio de góndola, el que el cliente paga. La factura no le suma nada: al
 * emitirla, `emitir_factura_pos` despeja la base hacia atrás
 * (`subtotal / (1 + tarifa/100)`) y guarda base e IVA por separado. Se puede
 * comprobar en `invoice_items`: `unit_price_cop` y `total_cop` son iguales.
 *
 * Este módulo existe para que ese despeje se escriba UNA sola vez. Antes vivía
 * suelto dentro de `CotizacionFormal.tsx`, así que la cotización discriminaba
 * el IVA y el carrito no mostraba ni una línea: el cliente veía un precio sin
 * saber si al pagar le sumarían el 19 %, que es motivo de sobra para abandonar
 * la compra.
 */

/** Se usa mientras `app_settings` no haya respondido, y si falla la consulta. */
export const TARIFA_IVA_POR_DEFECTO = 19;

export interface DesgloseIva {
  /** Base gravable: el precio sin IVA. */
  base: number;
  /** IVA contenido en el precio. */
  iva: number;
  /** Lo que paga el cliente. Igual al precio de góndola. */
  total: number;
  /** Tarifa aplicada, en porcentaje. */
  tarifa: number;
}

/**
 * Despeja base e IVA a partir de un precio que YA los incluye.
 *
 * Mismo cálculo y mismo redondeo que `emitir_factura_pos`, para que el
 * desglose del carrito coincida al peso con el de la factura.
 */
export function desglosarIvaIncluido(
  totalConIva: number,
  tarifa: number = TARIFA_IVA_POR_DEFECTO
): DesgloseIva {
  const total = Number.isFinite(totalConIva) ? totalConIva : 0;
  // Una tarifa de 0 (producto excluido de IVA) es válida: base = total.
  const t = Number.isFinite(tarifa) && tarifa >= 0 ? tarifa : TARIFA_IVA_POR_DEFECTO;

  const base = Math.round((total / (1 + t / 100)) * 100) / 100;
  return { base, iva: Math.round((total - base) * 100) / 100, total, tarifa: t };
}

/**
 * Formato para las líneas de base gravable e IVA. **Con centavos, a propósito.**
 *
 * El resto de la tienda muestra pesos enteros, pero base e IVA no se pueden
 * redondear: `desglosarIvaIncluido(999)` da base 839,50 e IVA 159,50, y en
 * pesos enteros eso se imprime como $840 + $160 = $1.000 sobre un total de
 * $999. Un desglose que no suma el total es justo lo que hace desconfiar del
 * precio. Con centavos siempre cuadra, y además coincide al centavo con lo que
 * guarda `invoice_items`.
 */
export const formatearImporteImpuesto = (n: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

/**
 * Tarifa general configurada en `app_settings`.
 *
 * Legible sin sesión: el visitante necesita ver el desglose antes de tener
 * cuenta. Solo se expone la tarifa y el régimen, nunca las columnas de SMTP ni
 * las llaves de la pasarela.
 */
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
