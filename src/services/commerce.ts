import { supabase } from '../lib/supabase';
import type { CartItem, NotificationItem, SolutionKit, StoreProduct } from '../types';

/**
 * Carrito, pedidos, notificaciones y motor de cálculo — FASES 7 a 13.
 *
 * PRINCIPIO: el navegador nunca envía precios ni totales. El carrito guarda
 * solo qué variante y cuánta cantidad; el precio se lee del catálogo al
 * mostrarlo y se congela en el servidor al confirmar el pedido.
 */

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[commerce] ${contexto}:`, error.message);
  const m = error.message ?? '';
  if (/EMPTY_CART/.test(m)) return new Error('Tu carrito está vacío.');
  if (/PRODUCT_UNAVAILABLE/.test(m))
    return new Error('Uno de los productos de tu carrito ya no está disponible.');
  if (/VALIDATION/.test(m)) return new Error(m.replace(/^.*VALIDATION:\s*/, ''));
  if (/NOT_CALCULABLE/.test(m))
    return new Error('Este producto no tiene rendimiento por galón: no es calculable.');
  if (/INVALID_TRANSITION/.test(m))
    return new Error('Ese cambio de estado no está permitido para este pedido.');
  if (/FORBIDDEN/.test(m)) return new Error('No tienes permisos para esta operación.');
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

// ============================================================
// CARRITO (MÓDULO 15)
// ============================================================
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
  solutions: { name: string } | null;
}

const CART_SELECT = `
  id, quantity, kit_solution_id,
  colors ( name, code, hex ),
  product_variants (
    id, label, price_cop,
    products ( external_ref, name, image_url, categories ( name ) )
  ),
  solutions:kit_solution_id ( name )
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
    // Precio SIEMPRE del catálogo, nunca almacenado en el carrito.
    unitPrice: num(v?.price_cop),
    quantity: f.quantity,
    image: p?.image_url ?? '',
    isKitItem: f.kit_solution_id !== null,
    kitName: f.solutions?.name,
  };
}

/** Devuelve el carrito activo del usuario, creándolo si no existe. */
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

  /**
   * Añade una presentación. Se resuelve el `variant_id` real a partir del
   * producto y la etiqueta de presentación que muestra la interfaz.
   */
  async addProduct(
    producto: StoreProduct,
    etiquetaPresentacion?: string,
    nombreColor?: string,
    cantidad = 1
  ): Promise<CartItem[]> {
    const cartId = await carritoActivo();
    if (!cartId) throw new Error('Inicia sesión para agregar productos al carrito.');

    const presentacion =
      producto.presentations.find((p) => p.label === etiquetaPresentacion) ??
      producto.presentations[0];
    if (!presentacion) throw new Error('Este producto no tiene presentaciones disponibles.');

    let colorId: string | null = null;
    if (nombreColor) {
      const codigo = producto.availableColors?.find((c) => c.name === nombreColor)?.code;
      if (codigo) {
        const { data } = await supabase
          .from('colors').select('id').eq('code', codigo).maybeSingle();
        colorId = (data as { id: string } | null)?.id ?? null;
      }
    }

    // La presentación ya trae el UUID real de la variante (FASE 4).
    const { data: existente } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('cart_id', cartId)
      .eq('variant_id', presentacion.id)
      .is('color_id', colorId)
      .maybeSingle();

    if (existente) {
      const fila = existente as { id: string; quantity: number };
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: fila.quantity + cantidad })
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

  /** Añade todos los pasos de un kit, marcados como tales para el descuento. */
  async addKit(kit: SolutionKit, multiplicador = 1): Promise<CartItem[]> {
    const cartId = await carritoActivo();
    if (!cartId) throw new Error('Inicia sesión para agregar el kit al carrito.');

    const { data: solucion } = await supabase
      .from('solutions').select('id').eq('external_ref', kit.id).maybeSingle();
    const solutionId = (solucion as { id: string } | null)?.id ?? null;

    for (const paso of kit.steps) {
      const { data: variante } = await supabase
        .from('product_variants')
        .select('id, products!inner(external_ref)')
        .eq('products.external_ref', paso.productId)
        .eq('label', paso.presentation)
        .maybeSingle();

      const variantId = (variante as { id: string } | null)?.id;
      // Algunos pasos citan etiquetas que no son una variante real (deuda de
      // datos conocida): se omiten en lugar de romper la compra del kit.
      if (!variantId) {
        console.warn(`[commerce] paso de kit sin variante: ${paso.productId} / ${paso.presentation}`);
        continue;
      }

      const cantidad = paso.quantityFor85m2 * multiplicador;
      const { data: existente } = await supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('cart_id', cartId)
        .eq('variant_id', variantId)
        .is('color_id', null)
        .maybeSingle();

      if (existente) {
        const fila = existente as { id: string; quantity: number };
        await supabase.from('cart_items')
          .update({ quantity: fila.quantity + cantidad }).eq('id', fila.id);
      } else {
        await supabase.from('cart_items').insert({
          cart_id: cartId, variant_id: variantId, quantity: cantidad,
          kit_solution_id: solutionId,
        });
      }
    }

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
};

// ============================================================
// PEDIDOS (MÓDULO 16 / 60)
// ============================================================
export interface ResumenPedido {
  id: string;
  orderNumber: string;
  status: string;
  totalCOP: number;
  createdAt: string;
}

export const orderService = {
  /**
   * Convierte el carrito en pedido.
   *
   * Todos los importes los calcula create_order_from_cart en el servidor:
   * subtotal, descuento de kit, envío y total. El navegador no envía ni un
   * solo precio (MÓDULO 60).
   */
  async createFromCart(datos: {
    deliveryMethod: 'pickup' | 'delivery';
    pickupLocationExternalRef?: string;
    shippingAddress?: string;
    shippingCity?: string;
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
      _shipping_city: datos.shippingCity ?? null,
      _project_id: datos.projectId ?? null,
      _notes: datos.notes ?? null,
    });
    if (error) throw errorLegible('createFromCart', error);

    const { data: pedido } = await supabase
      .from('orders')
      .select('id, order_number, status, total_cop, created_at')
      .eq('id', orderId as string)
      .single();

    const o = pedido as {
      id: string; order_number: string; status: string;
      total_cop: string | number; created_at: string;
    };
    return {
      id: o.id,
      orderNumber: o.order_number,
      status: o.status,
      totalCOP: num(o.total_cop),
      createdAt: o.created_at,
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

// ============================================================
// NOTIFICACIONES (MÓDULO 24)
// ============================================================
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

// ============================================================
// CALCULADORA (MÓDULO 14)
// ============================================================
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
  /**
   * Calcula la cantidad de pintura EN EL SERVIDOR.
   *
   * Unifica los dos motores contradictorios que existían en el frontend
   * (R3 de la auditoría). El rendimiento y el precio se leen de la base:
   * el navegador solo aporta área, manos, tipo de superficie y desperdicio.
   */
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
