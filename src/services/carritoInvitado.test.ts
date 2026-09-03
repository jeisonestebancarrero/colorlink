import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StoreProduct } from '../types';

/**
 * Carrito del visitante SIN sesión.
 *
 * Lo que se vigila:
 *   1. Que un visitante pueda armar su carrito sin cuenta. Antes no podía:
 *      "Agregar al Carrito" lanzaba un error que moría en la consola y el
 *      visitante se iba sin comprar y sin ver un solo mensaje.
 *   2. Que aquí NO se guarde ni un precio. Si el precio viajara en el
 *      navegador, cualquiera lo editaría desde la consola. Es el mismo
 *      principio del carrito del servidor.
 *   3. Que las cantidades se sumen y no se pasen del tope de la base
 *      (cart_items_cantidad_positiva, <= 999): pasarse haría fallar el
 *      volcado y el visitante perdería su carrito justo al iniciar sesión.
 *   4. Que un localStorage que lanza no tumbe la tienda (modo privado, cuota
 *      llena, cookies bloqueadas).
 */

// El entorno de pruebas es node: no hay window. Se monta el mínimo que usa el
// módulo, para poder probar la lógica sin arrastrar un DOM completo.
class AlmacenFalso {
  private datos = new Map<string, string>();
  getItem(k: string): string | null { return this.datos.get(k) ?? null; }
  setItem(k: string, v: string): void { this.datos.set(k, v); }
  removeItem(k: string): void { this.datos.delete(k); }
  get tamano(): number { return this.datos.size; }
}

function montarAlmacen(instancia: unknown): void {
  (globalThis as { window?: unknown }).window = { localStorage: instancia };
}

// Se monta ANTES del import: el módulo se carga con `window` ya en su sitio.
let almacen = new AlmacenFalso();
montarAlmacen(almacen);

const {
  leerLineas, vaciar, hayLineas, idLinea, agregarProducto,
  fijarCantidad, quitar, guardarIntencion, leerIntencion, CANTIDAD_MAXIMA,
} = await import('./carritoInvitado');

/** Producto mínimo con dos presentaciones cuyos ids son variantes reales. */
const producto = (): StoreProduct => ({
  id: 'PNT-INT-002',
  code: 'PNT-INT-002',
  name: 'Viniltex Avanzada',
  brand: 'Pintuco',
  tagline: '',
  category: 'Vinilos & Interiores',
  rating: 4.8,
  reviewsCount: 310,
  description: '',
  features: [],
  image: '',
  surface: [],
  environment: 'Interior',
  finish: 'Mate',
  coverage: '',
  spreadRateM2PerGal: 45,
  dryingTime: '',
  presentations: [
    { id: 'variante-galon', label: '1 Galón (3.785 L)', priceCOP: 118900, stockStatus: 'InStock' },
    { id: 'variante-cunete', label: 'Cuñete 5 Galones (18.9 L)', priceCOP: 529000, stockStatus: 'InStock' },
  ],
});

describe('Carrito del visitante sin sesión', () => {
  beforeEach(() => {
    almacen = new AlmacenFalso();
    montarAlmacen(almacen);
    vaciar();
  });

  it('guarda la línea sin sesión y no exige cuenta para añadir', async () => {
    await agregarProducto(producto(), '1 Galón (3.785 L)', undefined, 2);

    const lineas = leerLineas();
    expect(lineas).toHaveLength(1);
    expect(lineas[0].variantId).toBe('variante-galon');
    expect(lineas[0].quantity).toBe(2);
    expect(hayLineas()).toBe(true);
  });

  it('NO guarda precios: solo variante, color y cantidad', async () => {
    await agregarProducto(producto(), '1 Galón (3.785 L)');

    const crudo = JSON.stringify(leerLineas());
    // 118900 es el precio de la presentación. No puede aparecer por ningún lado.
    expect(crudo).not.toContain('118900');
    expect(Object.keys(leerLineas()[0]).sort()).toEqual(
      ['colorId', 'kitSolutionId', 'quantity', 'variantId']
    );
  });

  it('suma la cantidad al repetir la misma presentación', async () => {
    await agregarProducto(producto(), '1 Galón (3.785 L)', undefined, 3);
    await agregarProducto(producto(), '1 Galón (3.785 L)', undefined, 4);

    expect(leerLineas()).toHaveLength(1);
    expect(leerLineas()[0].quantity).toBe(7);
  });

  it('trata cada presentación como una línea aparte', async () => {
    await agregarProducto(producto(), '1 Galón (3.785 L)');
    await agregarProducto(producto(), 'Cuñete 5 Galones (18.9 L)');

    expect(leerLineas().map((l) => l.variantId).sort())
      .toEqual(['variante-cunete', 'variante-galon']);
  });

  it('usa la primera presentación si la etiqueta no existe', async () => {
    await agregarProducto(producto(), 'Presentación inventada');
    expect(leerLineas()[0].variantId).toBe('variante-galon');
  });

  it('avisa si el producto no tiene presentaciones', async () => {
    const sinPresentaciones = { ...producto(), presentations: [] };
    await expect(agregarProducto(sinPresentaciones)).rejects.toThrow(
      /no tiene presentaciones/
    );
  });

  it('no se pasa del tope de cantidad que acepta la base', async () => {
    await agregarProducto(producto(), '1 Galón (3.785 L)', undefined, 900);
    await agregarProducto(producto(), '1 Galón (3.785 L)', undefined, 900);

    expect(leerLineas()[0].quantity).toBe(CANTIDAD_MAXIMA);
    expect(CANTIDAD_MAXIMA).toBe(999);
  });

  it('cambia la cantidad por el id sintético de la línea', async () => {
    await agregarProducto(producto(), '1 Galón (3.785 L)', undefined, 2);
    const id = idLinea('variante-galon', null);

    fijarCantidad(id, 5);
    expect(leerLineas()[0].quantity).toBe(5);
  });

  it('quita la línea si la cantidad baja a cero', async () => {
    await agregarProducto(producto(), '1 Galón (3.785 L)', undefined, 1);
    fijarCantidad(idLinea('variante-galon', null), 0);

    expect(leerLineas()).toHaveLength(0);
  });

  it('quita una línea sin tocar las demás', async () => {
    await agregarProducto(producto(), '1 Galón (3.785 L)');
    await agregarProducto(producto(), 'Cuñete 5 Galones (18.9 L)');

    quitar(idLinea('variante-galon', null));
    expect(leerLineas().map((l) => l.variantId)).toEqual(['variante-cunete']);
  });

  it('ignora un id de línea que no existe', async () => {
    await agregarProducto(producto(), '1 Galón (3.785 L)', undefined, 2);
    fijarCantidad('inv:no-existe:sin-color', 99);
    quitar('inv:no-existe:sin-color');

    expect(leerLineas()).toHaveLength(1);
    expect(leerLineas()[0].quantity).toBe(2);
  });

  it('recuerda si el visitante venía a cotizar o a pedir', () => {
    guardarIntencion('cotizacion');
    expect(leerIntencion()).toBe('cotizacion');

    guardarIntencion('pedido');
    expect(leerIntencion()).toBe('pedido');

    guardarIntencion(null);
    expect(leerIntencion()).toBeNull();
  });

  it('descarta un valor de intención que no reconoce', () => {
    almacen.setItem('colorlink.carrito.intencion.v1', 'cualquier-cosa');
    expect(leerIntencion()).toBeNull();
  });

  it('descarta líneas corruptas en lugar de romper la tienda', () => {
    almacen.setItem(
      'colorlink.carrito.invitado.v1',
      JSON.stringify([
        { variantId: 'ok', colorId: null, quantity: 2, kitSolutionId: null },
        { variantId: 'sin-cantidad', colorId: null, kitSolutionId: null },
        { quantity: 3 },
        { variantId: 'cantidad-cero', colorId: null, quantity: 0, kitSolutionId: null },
        'basura',
      ])
    );

    expect(leerLineas().map((l) => l.variantId)).toEqual(['ok']);
  });

  it('devuelve carrito vacío si el contenido guardado no es JSON', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    almacen.setItem('colorlink.carrito.invitado.v1', 'esto{no es}json');

    expect(leerLineas()).toEqual([]);
    aviso.mockRestore();
  });

  it('sigue funcionando si localStorage lanza al leer y al escribir', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    montarAlmacen({
      getItem: () => { throw new Error('acceso denegado'); },
      setItem: () => { throw new Error('cuota llena'); },
      removeItem: () => { throw new Error('cuota llena'); },
    });

    // Ni una ni otra deben propagar: el visitante navega con carrito vacío en
    // lugar de ver la tienda caerse.
    expect(leerLineas()).toEqual([]);
    expect(() => vaciar()).not.toThrow();
    expect(() => guardarIntencion('pedido')).not.toThrow();
    expect(leerIntencion()).toBeNull();

    aviso.mockRestore();
  });
});
