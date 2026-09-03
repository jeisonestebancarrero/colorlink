import { supabase } from '../lib/supabase';
import type { CartItem, SolutionKit, StoreProduct } from '../types';

/**
 * Carrito del visitante SIN sesión.
 *
 * Un visitante puede armar su compra antes de tener cuenta. La sesión se le
 * pide recién cuando va a pedir la cotización formal o a confirmar el pedido,
 * y lo que había armado no se pierde: al entrar, estas líneas se vuelcan al
 * carrito real con `cartService.absorberLineas` y este almacén queda vacío.
 *
 * PRINCIPIO IGUAL AL DEL SERVIDOR: aquí se guarda solo QUÉ variante, QUÉ color
 * y CUÁNTA cantidad. Nunca precios. El precio se lee del catálogo cada vez que
 * el carrito se muestra, así que nadie puede editarlo desde la consola del
 * navegador. Las tablas `carts` y `cart_items` niegan el acceso anónimo (401),
 * que es justamente la razón de que este carrito viva en el navegador.
 */

const CLAVE = 'colorlink.carrito.invitado.v1';

/** Cota de `cart_items_cantidad_positiva`: si se pasa, el volcado falla. */
export const CANTIDAD_MAXIMA = 999;

export interface LineaInvitado {
  variantId: string;
  colorId: string | null;
  quantity: number;
  kitSolutionId: string | null;
}

/**
 * Identificador sintético de la línea.
 *
 * El carrito con sesión identifica cada línea por el `id` de `cart_items`.
 * Sin sesión no hay fila, así que se compone con lo que sí la hace única, que
 * es la misma pareja del índice `cart_items_unico`: variante y color. Así
 * `updateQuantity` y `removeFromCart` funcionan igual en los dos modos.
 */
export const idLinea = (variantId: string, colorId: string | null): string =>
  `inv:${variantId}:${colorId ?? 'sin-color'}`;

const mismaLinea = (a: LineaInvitado, b: LineaInvitado): boolean =>
  a.variantId === b.variantId && a.colorId === b.colorId;

// ------------------------------------------------------------
// Almacenamiento
// ------------------------------------------------------------

/**
 * localStorage puede lanzar (modo privado, cuota llena, cookies bloqueadas).
 * Si falla, el visitante sigue navegando con el carrito en blanco en lugar de
 * ver la tienda caerse.
 */
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

// ------------------------------------------------------------
// Qué quería hacer el visitante cuando se le pidió la sesión
// ------------------------------------------------------------

/** La acción que exige cuenta y que disparó la petición de sesión. */
export type Intencion = 'cotizacion' | 'pedido';

const CLAVE_INTENCION = 'colorlink.carrito.intencion.v1';

/**
 * Se guarda en el navegador y no en memoria porque el acceso con Google
 * redirige toda la página: al volver, el estado de React ya no existe y sin
 * esto la persona aterrizaría en el panel sin saber que su carrito la espera.
 */
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

// ------------------------------------------------------------
// Resolución contra el catálogo (lectura anónima permitida)
// ------------------------------------------------------------

/** Traduce el nombre de color que muestra la interfaz al id real. */
async function resolverColorId(
  producto: StoreProduct,
  nombreColor?: string
): Promise<string | null> {
  if (!nombreColor) return null;
  const codigo = producto.availableColors?.find((c) => c.name === nombreColor)?.code;
  if (!codigo) return null;
  const { data } = await supabase.from('colors').select('id').eq('code', codigo).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ------------------------------------------------------------
// Escritura
// ------------------------------------------------------------

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
  nombreColor?: string,
  cantidad = 1
): Promise<void> {
  const presentacion =
    producto.presentations.find((p) => p.label === etiquetaPresentacion) ??
    producto.presentations[0];
  if (!presentacion) throw new Error('Este producto no tiene presentaciones disponibles.');

  const colorId = await resolverColorId(producto, nombreColor);
  guardarLineas(
    fusionar(leerLineas(), [
      { variantId: presentacion.id, colorId, quantity: cantidad, kitSolutionId: null },
    ])
  );
}

export async function agregarKit(kit: SolutionKit, multiplicador = 1): Promise<void> {
  const { data: solucion } = await supabase
    .from('solutions').select('id').eq('external_ref', kit.id).maybeSingle();
  const kitSolutionId = (solucion as { id: string } | null)?.id ?? null;

  const nuevas: LineaInvitado[] = [];
  for (const paso of kit.steps) {
    const { data: variante } = await supabase
      .from('product_variants')
      .select('id, products!inner(external_ref)')
      .eq('products.external_ref', paso.productId)
      .eq('label', paso.presentation)
      .maybeSingle();

    const variantId = (variante as { id: string } | null)?.id;
    // Misma deuda de datos que en el carrito del servidor: algunos pasos citan
    // etiquetas que no son una variante real. Se omiten en lugar de romper la
    // compra completa del kit.
    if (!variantId) {
      console.warn(`[carrito-invitado] paso de kit sin variante: ${paso.productId} / ${paso.presentation}`);
      continue;
    }
    nuevas.push({
      variantId,
      colorId: null,
      quantity: paso.quantityFor85m2 * multiplicador,
      kitSolutionId,
    });
  }

  if (nuevas.length === 0) throw new Error('Este kit no tiene productos disponibles por ahora.');
  guardarLineas(fusionar(leerLineas(), nuevas));
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

// ------------------------------------------------------------
// Lectura para mostrar
// ------------------------------------------------------------

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
 * Convierte las líneas guardadas en artículos mostrables, leyendo nombre,
 * imagen y PRECIO del catálogo en el momento.
 *
 * Si una variante dejó de existir, su línea se descarta y el carrito local se
 * reescribe sin ella: un producto retirado del catálogo no puede dejar el
 * carrito del visitante roto para siempre.
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
      // Precio SIEMPRE del catálogo, igual que en el carrito del servidor.
      unitPrice: num(v.price_cop),
      quantity: l.quantity,
      image: p?.image_url ?? '',
      isKitItem: l.kitSolutionId !== null,
      kitName: l.kitSolutionId ? porKit.get(l.kitSolutionId) : undefined,
    };
  });
}
