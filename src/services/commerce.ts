import { supabase } from '../lib/supabase';
import type { CartItem, NotificationItem, SolutionKit, StoreProduct } from '../types';
import {
  CANTIDAD_MAXIMA, resolverColorId, resolverPasosKit, type LineaInvitado,
} from './carritoInvitado';

/** Carrito, pedidos, notificaciones y calculadora. El navegador nunca envía precios ni totales. */

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[commerce] ${contexto}:`, error.message);
  const m = error.message ?? '';
  if (/EMPTY_CART/.test(m)) return new Error('Tu carrito está vacío.');
  if (/PRODUCT_UNAVAILABLE/.test(m))
    return new Error('Uno de los productos de tu carrito ya no está disponible.');
  // Mensajes de create_order_from_cart sobre el color de una línea.
  const color = /(COLOR_REQUERIDO|COLOR_NO_OFRECIDO|SIN_CARTA):\s*(.*)$/.exec(m);
  if (color) {
    const detalle = color[2].charAt(0).toUpperCase() + color[2].slice(1);
    return new Error(
      color[1] === 'COLOR_REQUERIDO'
        ? `${detalle} en el carrito antes de confirmar.`
        : `${detalle}. Revisa el color en el carrito.`
    );
  }
  if (/VALIDATION/.test(m)) return new Error(m.replace(/^.*VALIDATION:\s*/, ''));
  if (/NOT_CALCULABLE/.test(m))
    return new Error('Este producto no tiene rendimiento por galón: no es calculable.');
  if (/INVALID_TRANSITION/.test(m))
    return new Error('Ese cambio de estado no está permitido para este pedido.');
  if (/FORBIDDEN/.test(m)) return new Error('No tienes permisos para esta operación.');
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

// Carrito
interface FilaCartItem {
  id: string;
  quantity: number;
  kit_solution_id: string | null;
  colors: { name: string; code: string; hex: string } | null;
  product_variants: {
    id: string;
    label: string;
    price_cop: string | number;
    products: { external_ref: string | null; name: string; image_url: string | null;
                categories: { name: string } | null } | null;
  } | null;
  solutions: { name: string; discount_percent: string | number | null } | null;
}

const CART_SELECT = `
  id, quantity, kit_solution_id,
  colors ( name, code, hex ),
  product_variants (
    id, label, price_cop,
    products ( external_ref, name, image_url, categories ( name ) )
  ),
  solutions:kit_solution_id ( name, discount_percent )
`;

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function aCartItem(f: FilaCartItem): CartItem {
  const v = f.product_variants;
  const p = v?.products;
  return {
    id: f.id,
    productId: p?.external_ref ?? '',
    productName: p?.name ?? '',
    category: p?.categories?.name ?? '',
    presentation: v?.label ?? '',
    colorName: f.colors?.name,
    colorCode: f.colors?.code,
    colorHex: f.colors?.hex,
    // El precio siempre sale del catálogo.
    unitPrice: num(v?.price_cop),
    quantity: f.quantity,
    image: p?.image_url ?? '',
    isKitItem: f.kit_solution_id !== null,
    kitName: f.solutions?.name,
    kitDiscountPercent: num(f.solutions?.discount_percent),
  };
}

/** Carrito activo del usuario; lo crea si no existe. */
async function carritoActivo(): Promise<string | null> {
  const { data: sesion } = await supabase.auth.getSession();
  const userId = sesion.session?.user?.id;
  if (!userId) return null;

  const { data: existente } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (existente) return (existente as { id: string }).id;

  const { data: nuevo, error } = await supabase
    .from('carts')
    .insert({ user_id: userId })
    .select('id')
    .single();
  if (error) throw errorLegible('carritoActivo', error);
  return (nuevo as { id: string }).id;
}

/** Línea del carrito con esa variante y color; `.is()` solo sirve para nulo, no para un uuid. */
async function lineaExistente(
  cartId: string, variantId: string, colorId: string | null
): Promise<{ id: string; quantity: number } | null> {
  let consulta = supabase
    .from('cart_items').select('id, quantity').eq('cart_id', cartId).eq('variant_id', variantId);
  consulta = colorId ? consulta.eq('color_id', colorId) : consulta.is('color_id', null);
  const { data } = await consulta.maybeSingle();
  return (data as { id: string; quantity: number } | null) ?? null;
}

export const cartService = {
  async getItems(): Promise<CartItem[]> {
    const cartId = await carritoActivo();
    if (!cartId) return [];

    const { data, error } = await supabase
      .from('cart_items')
      .select(CART_SELECT)
      .eq('cart_id', cartId)
      .order('created_at');
    if (error) throw errorLegible('getItems', error);
    return ((data ?? []) as unknown as FilaCartItem[]).map(aCartItem);
  },

  /** Resuelve el `variant_id` real a partir del producto y la presentación mostrada. */
  async addProduct(
    producto: StoreProduct,
    etiquetaPresentacion?: string,
    color?: string,
    cantidad = 1
  ): Promise<CartItem[]> {
    const cartId = await carritoActivo();
    if (!cartId) throw new Error('Inicia sesión para agregar productos al carrito.');

    const presentacion =
      producto.presentations.find((p) => p.label === etiquetaPresentacion) ??
      producto.presentations[0];
    if (!presentacion) throw new Error('Este producto no tiene presentaciones disponibles.');

    const colorId = await resolverColorId(producto, color);

    // La presentación ya trae el UUID de la variante.
    const existente = await lineaExistente(cartId, presentacion.id, colorId);

    if (existente) {
      const fila = existente as { id: string; quantity: number };
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: Math.min(CANTIDAD_MAXIMA, fila.quantity + cantidad) })
        .eq('id', fila.id);
      if (error) throw errorLegible('addProduct/update', error);
    } else {
      const { error } = await supabase.from('cart_items').insert({
        cart_id: cartId,
        variant_id: presentacion.id,
        color_id: colorId,
        quantity: cantidad,
      });
      if (error) throw errorLegible('addProduct/insert', error);
    }

    return this.getItems();
  },

  /** Añade los pasos de un kit, marcados para el descuento; `colores` va por número de paso. */
  async addKit(
    kit: SolutionKit,
    multiplicador = 1,
    colores: Record<number, string> = {}
  ): Promise<CartItem[]> {
    const cartId = await carritoActivo();
    if (!cartId) throw new Error('Inicia sesión para agregar el kit al carrito.');

    // Se resuelven todos los pasos antes de escribir: un color faltante no deja el kit a medias.
    const lineas = await resolverPasosKit(kit, multiplicador, colores);
    for (const linea of lineas) {
      const existente = await lineaExistente(cartId, linea.variantId, linea.colorId);

      if (existente) {
        const fila = existente as { id: string; quantity: number };
        const { error } = await supabase.from('cart_items')
          .update({ quantity: Math.min(CANTIDAD_MAXIMA, fila.quantity + linea.quantity) })
          .eq('id', fila.id);
        if (error) throw errorLegible('addKit/update', error);
      } else {
        const { error } = await supabase.from('cart_items').insert({
          cart_id: cartId, variant_id: linea.variantId, color_id: linea.colorId,
          quantity: Math.min(CANTIDAD_MAXIMA, linea.quantity),
          kit_solution_id: linea.kitSolutionId,
        });
        if (error) throw errorLegible('addKit/insert', error);
      }
    }

    return this.getItems();
  },

  /** Pone color a una línea que no lo tenía; si ya había otra con ese color, se juntan. */
  async fijarColor(itemId: string, colorId: string): Promise<CartItem[]> {
    const { data: actual, error: errLectura } = await supabase
      .from('cart_items').select('id, cart_id, variant_id, quantity').eq('id', itemId).single();
    if (errLectura) throw errorLegible('fijarColor/leer', errLectura);
    const linea = actual as { id: string; cart_id: string; variant_id: string; quantity: number };

    const { data: gemela } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('cart_id', linea.cart_id)
      .eq('variant_id', linea.variant_id)
      .eq('color_id', colorId)
      .maybeSingle();

    if (gemela) {
      const g = gemela as { id: string; quantity: number };
      const { error } = await supabase.from('cart_items')
        .update({ quantity: Math.min(CANTIDAD_MAXIMA, g.quantity + linea.quantity) })
        .eq('id', g.id);
      if (error) throw errorLegible('fijarColor/juntar', error);
      return this.removeItem(linea.id);
    }

    const { error } = await supabase
      .from('cart_items').update({ color_id: colorId }).eq('id', linea.id);
    if (error) throw errorLegible('fijarColor', error);
    return this.getItems();
  },

  async updateQuantity(itemId: string, cantidad: number): Promise<CartItem[]> {
    if (cantidad <= 0) return this.removeItem(itemId);
    const { error } = await supabase
      .from('cart_items').update({ quantity: cantidad }).eq('id', itemId);
    if (error) throw errorLegible('updateQuantity', error);
    return this.getItems();
  },

  async removeItem(itemId: string): Promise<CartItem[]> {
    const { error } = await supabase.from('cart_items').delete().eq('id', itemId);
    if (error) throw errorLegible('removeItem', error);
    return this.getItems();
  },

  async clear(): Promise<CartItem[]> {
    const cartId = await carritoActivo();
    if (!cartId) return [];
    const { error } = await supabase.from('cart_items').delete().eq('cart_id', cartId);
    if (error) throw errorLegible('clear', error);
    return [];
  },

  /**
   * Vuelca el carrito del visitante tras entrar; las cantidades se suman a las
   * existentes. Solo recibe variante, color y cantidad.
   */
  async absorberLineas(lineas: LineaInvitado[]): Promise<CartItem[]> {
    if (lineas.length === 0) return this.getItems();
    const cartId = await carritoActivo();
    if (!cartId) throw new Error('Inicia sesión para recuperar tu carrito.');

    for (const linea of lineas) {
      const existente = await lineaExistente(cartId, linea.variantId, linea.colorId);

      // Tope de cart_items_cantidad_positiva (999): superarlo haría fallar todo el volcado.
      if (existente) {
        const fila = existente as { id: string; quantity: number };
        const cantidad = Math.min(CANTIDAD_MAXIMA, fila.quantity + linea.quantity);
        const { error } = await supabase
          .from('cart_items').update({ quantity: cantidad }).eq('id', fila.id);
        if (error) throw errorLegible('absorberLineas/update', error);
      } else {
        const { error } = await supabase.from('cart_items').insert({
          cart_id: cartId,
          variant_id: linea.variantId,
          color_id: linea.colorId,
          quantity: Math.min(CANTIDAD_MAXIMA, linea.quantity),
          kit_solution_id: linea.kitSolutionId,
        });
        if (error) throw errorLegible('absorberLineas/insert', error);
      }
    }

    return this.getItems();
  },
};

// Pedidos
export interface ResumenPedido {
  id: string;
  orderNumber: string;
  status: string;
  totalCOP: number;
  createdAt: string;
  /** Solo en envíos; la calcula el servidor por tramos de cobertura. */
  entregaEstimada?: string | null;
}

export const orderService = {
  /** Todos los importes los calcula create_order_from_cart en el servidor. */
  async createFromCart(datos: {
    deliveryMethod: 'pickup' | 'delivery';
    pickupLocationExternalRef?: string;
    /**
     * Se envía el id de sede o dirección y el servidor lee la dirección, para que el
     * navegador no pueda desviar el despacho. La dirección manual es para obras.
     */
    companyBranchId?: string | null;
    customerAddressId?: string | null;
    shippingAddress?: string;
    shippingMunicipalityCode?: string;
    /** Los cuatro datos del receptor son obligatorios, también al retirar en tienda. */
    recipientName: string;
    recipientDocumentType: string;
    recipientDocumentNumber: string;
    recipientPhone: string;
    projectId?: string;
    notes?: string;
  }): Promise<ResumenPedido> {
    let pickupId: string | null = null;
    if (datos.deliveryMethod === 'pickup' && datos.pickupLocationExternalRef) {
      const { data } = await supabase
        .from('pickup_locations').select('id')
        .eq('external_ref', datos.pickupLocationExternalRef).maybeSingle();
      pickupId = (data as { id: string } | null)?.id ?? null;
    }

    const { data: orderId, error } = await supabase.rpc('create_order_from_cart', {
      _delivery_method: datos.deliveryMethod === 'delivery' ? 'ENVIO' : 'RETIRO_TIENDA',
      _pickup_location_id: pickupId,
      _shipping_address: datos.shippingAddress ?? null,
      _shipping_municipality_code: datos.shippingMunicipalityCode ?? null,
      _customer_address_id: datos.customerAddressId ?? null,
      _company_branch_id: datos.companyBranchId ?? null,
      _recipient_name: datos.recipientName,
      _recipient_document_type: datos.recipientDocumentType,
      _recipient_document_number: datos.recipientDocumentNumber,
      _recipient_phone: datos.recipientPhone,
      _project_id: datos.projectId ?? null,
      _notes: datos.notes ?? null,
    });
    if (error) throw errorLegible('createFromCart', error);

    const { data: pedido } = await supabase
      .from('orders')
      .select('id, order_number, status, total_cop, created_at, estimated_delivery_date')
      .eq('id', orderId as string)
      .single();

    const o = pedido as {
      id: string; order_number: string; status: string;
      total_cop: string | number; created_at: string; estimated_delivery_date: string | null;
    };
    return {
      id: o.id,
      orderNumber: o.order_number,
      status: o.status,
      totalCOP: num(o.total_cop),
      createdAt: o.created_at,
      entregaEstimada: o.estimated_delivery_date,
    };
  },

  async getOrders(page = 1, limit = 20): Promise<ResumenPedido[]> {
    const desde = (page - 1) * limit;
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, total_cop, created_at')
      .order('created_at', { ascending: false })
      .range(desde, desde + limit - 1);
    if (error) throw errorLegible('getOrders', error);
    return ((data ?? []) as Array<Record<string, string | number>>).map((o) => ({
      id: String(o.id),
      orderNumber: String(o.order_number),
      status: String(o.status),
      totalCOP: num(o.total_cop),
      createdAt: String(o.created_at),
    }));
  },
};

// Notificaciones
interface FilaNotificacion {
  id: string;
  title: string;
  message: string;
  read: boolean;
  type: NotificationItem['type'];
  action_required: boolean;
  action_label: string | null;
  created_at: string;
  project_id: string | null;
  projects: { name: string } | null;
}

function fechaRelativa(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'Ahora';
  if (minutos < 60) return `Hace ${minutos} min`;
  if (minutos < 1440) return `Hace ${Math.floor(minutos / 60)} h`;
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export const notificationService = {
  async getNotifications(): Promise<NotificationItem[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message, read, type, action_required, action_label, created_at, project_id, projects(name)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('[commerce] getNotifications:', error.message);
      return [];
    }
    return ((data ?? []) as unknown as FilaNotificacion[]).map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      date: fechaRelativa(n.created_at),
      read: n.read,
      projectId: n.project_id ?? undefined,
      projectName: n.projects?.name,
      actionRequired: n.action_required,
      actionLabel: n.action_label ?? undefined,
      type: n.type,
    }));
  },

  async markAsRead(id: string): Promise<NotificationItem[]> {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    return this.getNotifications();
  },

  async markAllAsRead(): Promise<NotificationItem[]> {
    await supabase.from('notifications').update({ read: true }).eq('read', false);
    return this.getNotifications();
  },
};

// Calculadora
export interface ResultadoCalculo {
  productName: string;
  presentation: string;
  areaM2: number;
  coats: number;
  spreadRateM2PerGal: number;
  gallonsRequired: number;
  unitsRecommended: number;
  unitPriceCOP: number;
  subtotalCOP: number;
}

export const calculatorService = {
  /** Cálculo en el servidor con rendimiento y precio de la base; el navegador solo aporta los parámetros. */
  async calculate(entrada: {
    variantId: string;
    areaM2: number;
    coats?: number;
    surfaceFactor?: number;
    wastePercent?: number;
  }): Promise<ResultadoCalculo> {
    const { data, error } = await supabase.rpc('calculate_paint', {
      _variant_id: entrada.variantId,
      _area_m2: entrada.areaM2,
      _coats: entrada.coats ?? 2,
      _surface_factor: entrada.surfaceFactor ?? 1.0,
      _waste_percent: entrada.wastePercent ?? 5,
    });
    if (error) throw errorLegible('calculate', error);

    const r = data as Record<string, string | number>;
    return {
      productName: String(r.product_name),
      presentation: String(r.presentation),
      areaM2: num(r.area_m2),
      coats: num(r.coats),
      spreadRateM2PerGal: num(r.spread_rate_m2_per_gal),
      gallonsRequired: num(r.gallons_required),
      unitsRecommended: num(r.units_recommended),
      unitPriceCOP: num(r.unit_price_cop),
      subtotalCOP: num(r.subtotal_cop),
    };
  },
};
