import { describe, it, expect } from 'vitest';
import {
  desglosarIvaIncluido, formatearImporteImpuesto, TARIFA_IVA_POR_DEFECTO,
} from './impuestos';

/**
 * Desglose del IVA.
 *
 * Lo que se vigila:
 *   1. Que el desglose NO cambie el total. Los precios del catálogo ya
 *      incluyen IVA; si el carrito lo sumara, el cliente vería un precio en la
 *      tienda y otro al pagar.
 *   2. Que dé exactamente lo mismo que `emitir_factura_pos`, que despeja la
 *      base con `subtotal / (1 + tarifa/100)` redondeado a dos decimales. Un
 *      desglose que no cuadre con la factura es peor que no mostrarlo.
 *   3. Que una tarifa de 0 (producto excluido de IVA) sea válida y no se
 *      confunda con "falta el dato".
 */
describe('Desglose de IVA incluido', () => {
  it('base + IVA da siempre el total: el precio no cambia', () => {
    for (const total of [1, 43900, 68900, 118900, 142900, 285800, 428700, 1234567]) {
      const d = desglosarIvaIncluido(total, 19);
      expect(d.total).toBe(total);
      expect(Math.round((d.base + d.iva) * 100) / 100).toBe(total);
    }
  });

  it('coincide al peso con lo que guardó la factura POS-000001', () => {
    // Fila real de invoice_items: unit_price_cop 142900, base 120084.03,
    // IVA 22815.97, total 142900. Si este cálculo se desviara, el carrito
    // mostraría un IVA distinto al de la factura del mismo pedido.
    const d = desglosarIvaIncluido(142900, 19);
    expect(d.base).toBe(120084.03);
    expect(d.iva).toBe(22815.97);
  });

  it('coincide con la factura también sobre un total de 285.800', () => {
    // Segunda fila real: base 240168.07, IVA 45631.93.
    const d = desglosarIvaIncluido(285800, 19);
    expect(d.base).toBe(240168.07);
    expect(d.iva).toBe(45631.93);
  });

  it('replica la fórmula del servidor para cualquier importe', () => {
    const comoElServidor = (total: number, tarifa: number) => {
      const base = Math.round((total / (1 + tarifa / 100)) * 100) / 100;
      return { base, iva: Math.round((total - base) * 100) / 100 };
    };

    for (const total of [999, 43900, 142900, 529000, 7654321]) {
      for (const tarifa of [0, 5, 19]) {
        const esperado = comoElServidor(total, tarifa);
        const d = desglosarIvaIncluido(total, tarifa);
        expect(d.base).toBe(esperado.base);
        expect(d.iva).toBe(esperado.iva);
      }
    }
  });

  it('con tarifa 0 la base es el total y el IVA es cero', () => {
    const d = desglosarIvaIncluido(142900, 0);
    expect(d.base).toBe(142900);
    expect(d.iva).toBe(0);
    expect(d.tarifa).toBe(0);
  });

  it('usa la tarifa por defecto si no se le pasa ninguna', () => {
    expect(desglosarIvaIncluido(142900).tarifa).toBe(TARIFA_IVA_POR_DEFECTO);
    expect(TARIFA_IVA_POR_DEFECTO).toBe(19);
  });

  it('cae en la tarifa por defecto ante un valor inservible, nunca en cero', () => {
    // Devolver 0 haría que el carrito imprimiera "IVA 0" sobre una venta
    // gravada: una cifra falsa en pantalla.
    for (const mala of [NaN, -5, Number.POSITIVE_INFINITY]) {
      expect(desglosarIvaIncluido(142900, mala).tarifa).toBe(TARIFA_IVA_POR_DEFECTO);
    }
  });

  it('trata un total inservible como cero en lugar de imprimir NaN', () => {
    const d = desglosarIvaIncluido(NaN, 19);
    expect(d.total).toBe(0);
    expect(d.base).toBe(0);
    expect(d.iva).toBe(0);
  });

  it('un carrito vacío no imprime importes raros', () => {
    const d = desglosarIvaIncluido(0, 19);
    expect(d).toMatchObject({ base: 0, iva: 0, total: 0, tarifa: 19 });
  });
});

/**
 * El desglose que se IMPRIME debe sumar el total impreso.
 *
 * Es el defecto que se estaba a punto de publicar: con pesos enteros, un
 * total de $999 se desglosaba como $840 + $160 = $1.000. Un desglose que no
 * cuadra hace desconfiar del precio, que es justo lo contrario de para lo que
 * se puso.
 */
describe('Desglose impreso', () => {
  const aNumero = (texto: string): number =>
    Number(texto.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'));

  it('base + IVA impresos suman el total, incluido el caso de $999', () => {
    for (const total of [999, 1189, 2379, 43900, 142900, 285800, 428700, 7654321]) {
      const d = desglosarIvaIncluido(total, 19);
      const base = aNumero(formatearImporteImpuesto(d.base));
      const iva = aNumero(formatearImporteImpuesto(d.iva));

      expect(Math.round((base + iva) * 100) / 100).toBe(total);
    }
  });

  it('imprime siempre dos decimales, que es lo que hace que cuadre', () => {
    expect(formatearImporteImpuesto(839.5)).toMatch(/839,50/);
    expect(formatearImporteImpuesto(159.5)).toMatch(/159,50/);
    expect(formatearImporteImpuesto(120084.03)).toMatch(/120\.084,03/);
  });
});
