import { supabase } from '../lib/supabase';
import type { CartItem, SolutionKit, StoreProduct } from '../types';

/**
 * Carrito del visitante en el navegador, porque `carts`/`cart_items` niegan el acceso
 * anónimo. Guarda solo variante, color y cantidad, nunca precios; al iniciar sesión
 * se vuelca con `cartService.absorberLineas`.
 */

const CLAVE = 'colorlink.carrito.invitado.v1';

/** Tope de `cart_items_cantidad_positiva`; si se supera, el volcado falla. */
export const CANTIDAD_MAXIMA = 999;

export interface LineaInvitado {
  variantId: string;
  colorId: string | null;
  quantity: number;
  kitSolutionId: string | null;
}

/** Id sintético variante+color (como `cart_items_unico`) para que las operaciones funcionen igual con y sin sesión. */
export const idLinea = (variantId: string, colorId: string | null): string =>
  `inv:${variantId}:${colorId ?? 'sin-color'}`;

const mismaLinea = (a: LineaInvitado, b: LineaInvitado): boolean =>
  a.variantId === b.variantId && a.colorId === b.colorId;

// Almacenamiento

/** localStorage puede lanzar (modo privado, cuota, cookies bloqueadas); se devuelve vacío. */
export function leerLineas(): LineaInvitado[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const dato: unknown = JSON.parse(crudo);
    if (!Array.isArray(dato)) return [];
    return dato.filter(
      (l): l is LineaInvitado =>
        typeof l === 'object' && l !== null &&
        typeof (l as LineaInvitado).variantId === 'string' &&
        typeof (l as LineaInvitado).quantity === 'number' &&
        (l as LineaInvitado).quantity > 0
    );
  } catch (e) {
    console.warn('[carrito-invitado] no se pudo leer el carrito local', e);
    return [];
  }
}

function guardarLineas(lineas: LineaInvitado[]): void {
  try {
    if (lineas.length === 0) window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, JSON.stringify(lineas));
  } catch (e) {
    console.warn('[carrito-invitado] no se pudo guardar el carrito local', e);
  }
}

export function vaciar(): void {
  guardarLineas([]);
}

export function hayLineas(): boolean {
  return leerLineas().length > 0;
}

// Intención pendiente al pedir la sesión

/** Acción que exige cuenta y disparó la petición de sesión. */
export type Intencion = 'cotizacion' | 'pedido';

const CLAVE_INTENCION = 'colorlink.carrito.intencion.v1';

/** En el navegador porque el acceso con Google recarga la página y se pierde el estado de React. */
export function guardarIntencion(intencion: Intencion | null): void {
  try {
    if (intencion === null) window.localStorage.removeItem(CLAVE_INTENCION);
    else window.localStorage.setItem(CLAVE_INTENCION, intencion);
  } catch (e) {
    console.warn('[carrito-invitado] no se pudo guardar la intención', e);
  }
}

export function leerIntencion(): Intencion | null {
  try {
    const v = window.localStorage.getItem(CLAVE_INTENCION);
    return v === 'cotizacion' || v === 'pedido' ? v : null;
  } catch {
    return null;
  }
}

// Resolución contra el catálogo (lectura anónima permitida)

/** true si el producto se vende por color (tiene filas en product_colors). */
export const tieneCarta = (producto: Pick<StoreProduct, 'availableColors'>): boolean =>
  (producto.availableColors?.length ?? 0) > 0;

/** Código de color → id real. */
export async function idDeColor(codigo: string): Promise<string> {
  const { data } = await supabase.from('colors').select('id').eq('code', codigo).maybeSingle();
  const id = (data as { id: string } | null)?.id;
  if (!id) throw new Error('Ese color ya no está disponible. Elige otro.');
  return id;
}

/**
 * Color elegido (código o nombre) → id real. La base rechaza el pedido si una pintura
 * con carta va sin color, así que se exige aquí, antes de que llegue al carrito.
 */
export async function resolverColorId(
  producto: StoreProduct,
  color?: string
): Promise<string | null> {
  if (!tieneCarta(producto)) return null;
  if (!color) throw new Error(`Elige el color de «${producto.name}» antes de agregarlo.`);
  const elegido = producto.availableColors?.find((c) => c.code === color || c.name === color);
  if (!elegido) throw new Error(`«${producto.name}» no se ofrece en ese color. Elige otro.`);
  return idDeColor(elegido.code);
}

interface FilaVarianteKit {
  id: string;
  products: {
    name: string;
    product_colors: Array<{ colors: { id: string; code: string } | null }> | null;
  } | null;
}

/**
 * Traduce los pasos de un kit a líneas de carrito. `colores` va por número de paso
 * (código de color); los pasos con carta sin color detienen todo el kit.
 */
export async function resolverPasosKit(
  kit: SolutionKit,
  multiplicador: number,
  colores: Record<number, string> = {}
): Promise<LineaInvitado[]> {
  const { data: solucion } = await supabase
    .from('solutions').select('id').eq('external_ref', kit.id).maybeSingle();
  const kitSolutionId = (solucion as { id: string } | null)?.id ?? null;

  const lineas: LineaInvitado[] = [];
  const faltantes: string[] = [];
  for (const paso of kit.steps) {
    const { data: variante } = await supabase
      .from('product_variants')
      .select('id, products!inner(external_ref, name, product_colors(colors(id, code)))')
      .eq('products.external_ref', paso.productId)
      .eq('label', paso.presentation)
      .maybeSingle();

    const fila = variante as FilaVarianteKit | null;
    // Algunos pasos del kit citan etiquetas sin variante real: se omiten sin romper la compra.
    if (!fila) {
      console.warn(`[carrito] paso de kit sin variante: ${paso.productId} / ${paso.presentation}`);
      continue;
    }

    const carta = (fila.products?.product_colors ?? [])
      .map((pc) => pc.colors)
      .filter((c): c is { id: string; code: string } => c !== null);
    let colorId: string | null = null;
    if (carta.length > 0) {
      colorId = carta.find((c) => c.code === colores[paso.stepNumber])?.id ?? null;
      if (!colorId) {
        faltantes.push(fila.products?.name ?? paso.productName);
        continue;
      }
    }

    lineas.push({
      variantId: fila.id,
      colorId,
      // cart_items.quantity es entera: se redondea hacia arriba como lo muestra la página.
      quantity: Math.max(1, Math.ceil(paso.quantityFor85m2 * multiplicador)),
      kitSolutionId,
    });
  }

  if (faltantes.length > 0) {
    throw new Error(`Elige el color de: ${faltantes.map((n) => `«${n}»`).join(', ')}.`);
  }
  if (lineas.length === 0) throw new Error('Este kit no tiene productos disponibles por ahora.');
  return lineas;
}

// Escritura

function fusionar(actuales: LineaInvitado[], nuevas: LineaInvitado[]): LineaInvitado[] {
  const resultado = [...actuales];
  for (const nueva of nuevas) {
    const existente = resultado.find((l) => mismaLinea(l, nueva));
    if (existente) {
      existente.quantity = Math.min(CANTIDAD_MAXIMA, existente.quantity + nueva.quantity);
    } else {
      resultado.push({ ...nueva, quantity: Math.min(CANTIDAD_MAXIMA, nueva.quantity) });
    }
  }
  return resultado;
}

export async function agregarProducto(
  producto: StoreProduct,
  etiquetaPresentacion?: string,
  color?: string,
  cantidad = 1
): Promise<void> {
  const presentacion =
    producto.presentations.find((p) => p.label === etiquetaPresentacion) ??
    producto.presentations[0];
  if (!presentacion) throw new Error('Este producto no tiene presentaciones disponibles.');

  const colorId = await resolverColorId(producto, color);
  guardarLineas(
    fusionar(leerLineas(), [
      { variantId: presentacion.id, colorId, quantity: cantidad, kitSolutionId: null },
    ])
  );
}

export async function agregarKit(
  kit: SolutionKit,
  multiplicador = 1,
  colores: Record<number, string> = {}
): Promise<void> {
  const nuevas = await resolverPasosKit(kit, multiplicador, colores);
  guardarLineas(fusionar(leerLineas(), nuevas));
}

/** Pone color a una línea; si ya había otra con ese color, se juntan. */
export function fijarColor(itemId: string, colorId: string): void {
  const lineas = leerLineas();
  const linea = lineas.find((l) => idLinea(l.variantId, l.colorId) === itemId);
  if (!linea) return;
  const resto = lineas.filter((l) => l !== linea);
  guardarLineas(fusionar(resto, [{ ...linea, colorId }]));
}

export function fijarCantidad(itemId: string, cantidad: number): void {
  const lineas = leerLineas();
  const linea = lineas.find((l) => idLinea(l.variantId, l.colorId) === itemId);
  if (!linea) return;

  if (cantidad <= 0) {
    guardarLineas(lineas.filter((l) => l !== linea));
    return;
  }
  linea.quantity = Math.min(CANTIDAD_MAXIMA, cantidad);
  guardarLineas(lineas);
}

export function quitar(itemId: string): void {
  guardarLineas(leerLineas().filter((l) => idLinea(l.variantId, l.colorId) !== itemId));
}

// Lectura para mostrar

interface FilaVariante {
  id: string;
  label: string;
  price_cop: string | number;
  products: {
    external_ref: string | null;
    name: string;
    image_url: string | null;
    categories: { name: string } | null;
  } | null;
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Arma los artículos leyendo nombre, imagen y precio del catálogo en el momento.
 * Las variantes retiradas se descartan y se reescribe el carrito local.
 */
export async function obtenerArticulos(): Promise<CartItem[]> {
  const lineas = leerLineas();
  if (lineas.length === 0) return [];

  const variantIds = [...new Set(lineas.map((l) => l.variantId))];
  const colorIds = [...new Set(lineas.map((l) => l.colorId).filter((c): c is string => !!c))];
  const kitIds = [...new Set(lineas.map((l) => l.kitSolutionId).filter((k): k is string => !!k))];

  const { data: variantes, error } = await supabase
    .from('product_variants')
    .select('id, label, price_cop, products ( external_ref, name, image_url, categories ( name ) )')
    .in('id', variantIds);
  if (error) {
    console.error('[carrito-invitado] obtenerArticulos:', error.message);
    throw new Error('No fue posible cargar tu carrito. Inténtalo nuevamente.');
  }

  const porVariante = new Map<string, FilaVariante>(
    ((variantes ?? []) as unknown as FilaVariante[]).map((v) => [v.id, v])
  );

  const porColor = new Map<string, { name: string; code: string; hex: string }>();
  if (colorIds.length > 0) {
    const { data } = await supabase
      .from('colors').select('id, name, code, hex').in('id', colorIds);
    for (const c of (data ?? []) as Array<{ id: string; name: string; code: string; hex: string }>) {
      porColor.set(c.id, { name: c.name, code: c.code, hex: c.hex });
    }
  }

  const porKit = new Map<string, string>();
  if (kitIds.length > 0) {
    const { data } = await supabase.from('solutions').select('id, name').in('id', kitIds);
    for (const s of (data ?? []) as Array<{ id: string; name: string }>) {
      porKit.set(s.id, s.name);
    }
  }

  const vigentes = lineas.filter((l) => porVariante.has(l.variantId));
  if (vigentes.length !== lineas.length) guardarLineas(vigentes);

  return vigentes.map((l) => {
    const v = porVariante.get(l.variantId) as FilaVariante;
    const p = v.products;
    const color = l.colorId ? porColor.get(l.colorId) : undefined;
    return {
      id: idLinea(l.variantId, l.colorId),
      productId: p?.external_ref ?? '',
      productName: p?.name ?? '',
      category: p?.categories?.name ?? '',
      presentation: v.label,
      colorName: color?.name,
      colorCode: color?.code,
      colorHex: color?.hex,
      // El precio siempre sale del catálogo.
      unitPrice: num(v.price_cop),
      quantity: l.quantity,
      image: p?.image_url ?? '',
      isKitItem: l.kitSolutionId !== null,
      kitName: l.kitSolutionId ? porKit.get(l.kitSolutionId) : undefined,
    };
  });
}
