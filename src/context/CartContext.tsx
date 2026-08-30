import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CartItem, PintucoStore, SolutionKit, StoreProduct } from '../types';
import { cartService, orderService } from '../services/commerce';
import { storeService } from '../services/catalog';
import { pagoService } from '../services/pagos';
import { useAuth } from './AuthContext';

interface CartContextType {
  cartItems: CartItem[];
  cartCount: number;
  subtotalCOP: number;
  discountCOP: number;
  totalCOP: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  addToCart: (product: StoreProduct, presentationLabel?: string, colorName?: string, colorHex?: string, qty?: number) => Promise<void>;
  addKitToCart: (kit: SolutionKit, multiplier?: number) => Promise<void>;
  updateQuantity: (itemId: string, delta: number) => Promise<void>;
  removeFromCart: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  // Delivery & Pickup Options
  deliveryMethod: 'pickup' | 'delivery';
  setDeliveryMethod: (method: 'pickup' | 'delivery') => void;
  selectedStore: PintucoStore;
  setSelectedStore: (store: PintucoStore) => void;
  pickupDate: string;
  setPickupDate: (date: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (address: string) => void;
  deliveryCity: string;
  setDeliveryCity: (city: string) => void;
  isCheckoutSuccessOpen: boolean;
  setIsCheckoutSuccessOpen: (open: boolean) => void;
  lastOrderNumber: string | null;
  checkoutError: string | null;
  stores: PintucoStore[];
  completeCheckout: () => void;
  /** Pedido recién creado que todavía no se ha cobrado. */
  pedidoPorPagar: { id: string; numero: string; total: number } | null;
  /** true solo si el cobro se resolvió (pagado o a crédito aprobado). */
  ultimoPedidoPagado: boolean;
  cerrarPago: (pagado: boolean) => void;
}

/**
 * FASE 8 — El carrito vive en Supabase.
 *
 * Antes se guardaba en localStorage con los precios dentro, de modo que
 * cualquiera podía editarlos desde la consola del navegador. Ahora el
 * servidor guarda solo qué variante y qué cantidad; el precio se lee del
 * catálogo y se congela al confirmar el pedido (MÓDULO 52/60).
 *
 * Se eliminó también el carrito precargado con tres productos: sembrar la
 * compra de un usuario real no tiene sentido fuera de una demo.
 */
const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [stores, setStores] = useState<PintucoStore[]>([]);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [selectedStore, setSelectedStore] = useState<PintucoStore>({
    id: '', name: 'Selecciona un punto de retiro', city: '', address: '',
    phone: '', hours: '', hasColorStudio: false, hasTechAdvisor: false,
    hasExpressPickup: false, stockReadinessHours: 24,
  });
  const [pickupDate, setPickupDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [deliveryAddress, setDeliveryAddress] = useState('Cra 43A # 18 Sur - 135, Edif. Horizonte');
  const [deliveryCity, setDeliveryCity] = useState('Medellín');
  const [isCheckoutSuccessOpen, setIsCheckoutSuccessOpen] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pedidoPorPagar, setPedidoPorPagar] = useState<
    { id: string; numero: string; total: number } | null
  >(null);
  const [ultimoPedidoPagado, setUltimoPedidoPagado] = useState(false);

  // Puntos de retiro reales (tabla pickup_locations).
  useEffect(() => {
    storeService
      .getStores()
      .then((lista) => {
        setStores(lista);
        if (lista.length > 0) setSelectedStore((actual) => (actual.id ? actual : lista[0]));
      })
      .catch((e) => console.error('[cart] no se pudieron cargar los puntos de retiro', e));
  }, []);

  // El carrito se carga al iniciar sesión y se vacía al cerrarla.
  useEffect(() => {
    if (!isAuthenticated) {
      setCartItems([]);
      return;
    }
    cartService
      .getItems()
      .then(setCartItems)
      .catch((e) => console.error('[cart] no se pudo cargar el carrito', e));
  }, [isAuthenticated]);

  const addToCart = useCallback(
    async (
      product: StoreProduct,
      presentationLabel?: string,
      colorName?: string,
      _colorHex?: string,
      qty = 1
    ) => {
      try {
        setCartItems(await cartService.addProduct(product, presentationLabel, colorName, qty));
        setIsCartOpen(true);
      } catch (e) {
        console.error('[cart] addToCart', e);
      }
    },
    []
  );

  const addKitToCart = useCallback(async (kit: SolutionKit, multiplier = 1) => {
    try {
      setCartItems(await cartService.addKit(kit, multiplier));
      setIsCartOpen(true);
    } catch (e) {
      console.error('[cart] addKitToCart', e);
    }
  }, []);

  const updateQuantity = useCallback(async (itemId: string, delta: number) => {
    const actual = cartItems.find((i) => i.id === itemId);
    if (!actual) return;
    try {
      setCartItems(await cartService.updateQuantity(itemId, actual.quantity + delta));
    } catch (e) {
      console.error('[cart] updateQuantity', e);
    }
  }, [cartItems]);

  const removeFromCart = useCallback(async (itemId: string) => {
    try {
      setCartItems(await cartService.removeItem(itemId));
    } catch (e) {
      console.error('[cart] removeFromCart', e);
    }
  }, []);

  const clearCart = useCallback(async () => {
    try {
      setCartItems(await cartService.clear());
    } catch (e) {
      console.error('[cart] clearCart', e);
    }
  }, []);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCOP = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountCOP = cartItems.some((i) => i.isKitItem) ? Math.round(subtotalCOP * 0.08) : 0;
  const totalCOP = Math.max(0, subtotalCOP - discountCOP);

  /**
   * FASE 9 — Checkout real.
   *
   * Antes generaba un número de pedido con Math.random(), vaciaba el carrito
   * y no guardaba nada: no existía ningún pedido. Ahora llama a
   * create_order_from_cart, que valida disponibilidad, calcula subtotal,
   * descuento, envío y total en el servidor, crea el pago y el envío, emite
   * la notificación y cierra el carrito, todo en una transacción.
   */
  const completeCheckout = useCallback(async () => {
    try {
      const pedido = await orderService.createFromCart({
        deliveryMethod,
        pickupLocationExternalRef: deliveryMethod === 'pickup' ? selectedStore.id : undefined,
        shippingAddress: deliveryMethod === 'delivery' ? deliveryAddress : undefined,
        shippingCity: deliveryMethod === 'delivery' ? deliveryCity : undefined,
      });
      setLastOrderNumber(pedido.orderNumber);
      setCartItems([]);
      setIsCartOpen(false);
      // El pedido está creado pero todavía no es una venta: falta el cobro.
      // Por eso se abre el pago y no la confirmación, que antes daba a
      // entender que la compra ya estaba hecha.
      setUltimoPedidoPagado(false);
      setPedidoPorPagar({
        id: pedido.id,
        numero: pedido.orderNumber,
        total: pedido.totalCOP,
      });
    } catch (e) {
      console.error('[cart] completeCheckout', e);
      setCheckoutError(e instanceof Error ? e.message : 'No fue posible crear el pedido.');
    }
  }, [deliveryMethod, selectedStore, deliveryAddress, deliveryCity]);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        cartCount,
        subtotalCOP,
        discountCOP,
        totalCOP,
        isCartOpen,
        setIsCartOpen,
        addToCart,
        addKitToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        deliveryMethod,
        setDeliveryMethod,
        selectedStore,
        setSelectedStore,
        pickupDate,
        setPickupDate,
        deliveryAddress,
        setDeliveryAddress,
        deliveryCity,
        setDeliveryCity,
        isCheckoutSuccessOpen,
        setIsCheckoutSuccessOpen,
        lastOrderNumber,
        checkoutError,
        stores,
        completeCheckout,
        pedidoPorPagar,
        ultimoPedidoPagado,
        // Cerrar la ventana de pago NO es haber pagado. Antes se mostraba
        // "orden registrada con éxito" aunque el cliente hubiera salido sin
        // pagar, y el pedido quedaba varado sin que nadie lo supiera.
        cerrarPago: (pagado: boolean) => {
          setUltimoPedidoPagado(pagado);
          const pedido = pedidoPorPagar;
          setPedidoPorPagar(null);

          if (pagado) {
            setIsCheckoutSuccessOpen(true);
            return;
          }

          // Sin pago no hay venta: el pedido se cancela y sus productos
          // vuelven al carrito. Dejarlo a medias le quitaba el carrito al
          // cliente y dejaba un pedido fantasma en la bandeja de la tienda.
          if (pedido) {
            void pagoService
              .devolverAlCarrito(pedido.id)
              .catch((e) => console.error('[cart] devolverAlCarrito', e))
              .finally(async () => {
                try {
                  setCartItems(await cartService.getItems());
                } catch (e) {
                  console.error('[cart] no se pudo recargar el carrito', e);
                }
                setIsCartOpen(true);
              });
          }
        },
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
