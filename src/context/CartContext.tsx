import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CartItem, PintucoStore, SolutionKit, StoreProduct } from '../types';
import { cartService, orderService } from '../services/commerce';
import { storeService } from '../services/catalog';
import { pagoService } from '../services/pagos';
import * as carritoInvitado from '../services/carritoInvitado';
import type { Intencion } from '../services/carritoInvitado';
import { useAuth } from './AuthContext';
import { useProjects } from './ProjectContext';
import {
  direccionService, sedeService,
  type DireccionCliente, type SedeEmpresa,
} from '../services/direcciones';
import {
  UBICACION_VACIA, resolverBarrio, validarUbicacion, type ValorUbicacion,
} from '../components/common/SelectorUbicacion';
import { fechaLocal } from '../utils/fechaLocal';

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
  deliveryMethod: 'pickup' | 'delivery';
  setDeliveryMethod: (method: 'pickup' | 'delivery') => void;
  selectedStore: PintucoStore;
  setSelectedStore: (store: PintucoStore) => void;
  pickupDate: string;
  setPickupDate: (date: string) => void;
  /** Destino del envío: dirección guardada, sede de la empresa o dirección nueva. */
  destino: DestinoEnvio;
  setDestino: (d: DestinoEnvio) => void;
  direccionesGuardadas: DireccionCliente[];
  sedesEmpresa: SedeEmpresa[];
  /** Quién recibe. Obligatorio también en el retiro en tienda. */
  quienRecibe: QuienRecibe;
  setQuienRecibe: (q: QuienRecibe) => void;
  /** Campos que faltan por llenar, para pintarlos en rojo. */
  erroresEntrega: Record<string, string>;
  isCheckoutSuccessOpen: boolean;
  setIsCheckoutSuccessOpen: (open: boolean) => void;
  lastOrderNumber: string | null;
  checkoutError: string | null;
  stores: PintucoStore[];
  completeCheckout: () => void;
  /**
   * Acción que el visitante quiso hacer sin tener sesión. Mientras no sea
   * `null`, el carrito muestra la invitación a entrar o registrarse en lugar
   * de la acción, y su contenido se conserva.
   */
  necesitaSesionPara: Intencion | null;
  pedirSesionPara: (intencion: Intencion) => void;
  descartarPeticionDeSesion: () => void;
  /** true mientras el carrito del visitante se está pasando a su cuenta. */
  recuperandoCarrito: boolean;
  /** Pedido recién creado que todavía no se ha cobrado. */
  pedidoPorPagar: { id: string; numero: string; total: number } | null;
  /** true solo si el cobro se resolvió (pagado o a crédito aprobado). */
  ultimoPedidoPagado: boolean;
  cerrarPago: (pagado: boolean) => void;
}

/**
 * El carrito vive en Supabase y guarda solo variante y cantidad; el precio sale
 * del catálogo y se congela al confirmar. Sin sesión las líneas quedan en el
 * navegador (carritoInvitado) y se vuelcan al entrar; la cuenta se pide al
 * cotizar o confirmar. Todo fallo del carrito se muestra en pantalla.
 */
/**
 * Origen de la dirección de entrega. En 'guardada' y 'sede' el servidor lee el
 * registro elegido e ignora lo que mande el navegador.
 */
export type ModoDestino = 'guardada' | 'sede' | 'nueva';

export interface DestinoEnvio {
  modo: ModoDestino;
  customerAddressId: string | null;
  companyBranchId: string | null;
  /** Solo para 'nueva'. */
  direccion: string;
  ubicacion: ValorUbicacion;
}

export interface QuienRecibe {
  nombre: string;
  tipoDocumento: string;
  numeroDocumento: string;
  telefono: string;
}

const DESTINO_VACIO: DestinoEnvio = {
  modo: 'nueva',
  customerAddressId: null,
  companyBranchId: null,
  // En blanco a propósito: una dirección precargada acababa en pedidos reales.
  direccion: '',
  ubicacion: UBICACION_VACIA,
};

const QUIEN_RECIBE_VACIO: QuienRecibe = {
  nombre: '', tipoDocumento: 'CC', numeroDocumento: '', telefono: '',
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { showToast } = useProjects();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [stores, setStores] = useState<PintucoStore[]>([]);
  const [necesitaSesionPara, setNecesitaSesionPara] = useState<Intencion | null>(null);
  const [recuperandoCarrito, setRecuperandoCarrito] = useState(false);

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
    return fechaLocal(tomorrow);
  });
  const [destino, setDestino] = useState<DestinoEnvio>(DESTINO_VACIO);
  const [direccionesGuardadas, setDireccionesGuardadas] = useState<DireccionCliente[]>([]);
  const [sedesEmpresa, setSedesEmpresa] = useState<SedeEmpresa[]>([]);
  const [quienRecibe, setQuienRecibe] = useState<QuienRecibe>(QUIEN_RECIBE_VACIO);
  const [erroresEntrega, setErroresEntrega] = useState<Record<string, string>>({});
  const [isCheckoutSuccessOpen, setIsCheckoutSuccessOpen] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pedidoPorPagar, setPedidoPorPagar] = useState<
    { id: string; numero: string; total: number } | null
  >(null);
  const [ultimoPedidoPagado, setUltimoPedidoPagado] = useState(false);

  // Puntos de retiro (pickup_locations).
  useEffect(() => {
    storeService
      .getStores()
      .then((lista) => {
        setStores(lista);
        if (lista.length > 0) setSelectedStore((actual) => (actual.id ? actual : lista[0]));
      })
      .catch((e) => console.error('[cart] no se pudieron cargar los puntos de retiro', e));
  }, []);

  /** Un fallo del carrito nunca debe ser silencioso. */
  const avisarError = useCallback(
    (contexto: string, e: unknown) => {
      console.error(`[cart] ${contexto}`, e);
      showToast(
        e instanceof Error ? e.message : 'No fue posible actualizar tu carrito.',
        'error'
      );
    },
    [showToast]
  );

  /**
   * Carga el carrito: sin sesión, el del navegador; al entrar, vuelca las líneas
   * de visitante a la cuenta y reabre el carrito.
   */
  useEffect(() => {
    let activo = true;

    const cargar = async () => {
      if (!isAuthenticated) {
        try {
          const items = await carritoInvitado.obtenerArticulos();
          if (activo) setCartItems(items);
        } catch (e) {
          if (activo) avisarError('carrito de visitante', e);
        }
        return;
      }

      const pendientes = carritoInvitado.leerLineas();
      const intencion = carritoInvitado.leerIntencion();

      if (pendientes.length === 0) {
        try {
          const items = await cartService.getItems();
          if (activo) setCartItems(items);
        } catch (e) {
          if (activo) avisarError('no se pudo cargar el carrito', e);
        }
        return;
      }

      if (activo) setRecuperandoCarrito(true);
      try {
        const items = await cartService.absorberLineas(pendientes);
        // Solo se borra si el volcado salió bien, para poder reintentar.
        carritoInvitado.vaciar();
        carritoInvitado.guardarIntencion(null);
        if (!activo) return;
        setCartItems(items);
        setNecesitaSesionPara(null);
        setIsCartOpen(true);
        showToast(
          intencion === 'cotizacion'
            ? 'Recuperamos tu carrito. Ya puedes descargar la cotización formal.'
            : 'Recuperamos tu carrito. Ya puedes confirmar tu pedido.',
          'success'
        );
      } catch (e) {
        if (activo) avisarError('no se pudo recuperar el carrito de visitante', e);
      } finally {
        if (activo) setRecuperandoCarrito(false);
      }
    };

    void cargar();
    return () => {
      activo = false;
    };
  }, [isAuthenticated, avisarError, showToast]);


  /**
   * Carga direcciones y sedes al iniciar sesión y propone un destino por defecto
   * (dirección o sede principal). Un invitado arranca con la dirección en blanco.
   */
  useEffect(() => {
    let activo = true;

    if (!isAuthenticated) {
      setDireccionesGuardadas([]);
      setSedesEmpresa([]);
      setDestino(DESTINO_VACIO);
      setQuienRecibe(QUIEN_RECIBE_VACIO);
      setErroresEntrega({});
      return;
    }

    const cargar = async () => {
      const [dirs, sedes] = await Promise.all([
        direccionService.listar().catch((e) => {
          avisarError('no se pudieron cargar tus direcciones', e);
          return [] as DireccionCliente[];
        }),
        // Un cliente particular no tiene empresa: RLS devuelve vacío, no es error.
        sedeService.listar().catch(() => [] as SedeEmpresa[]),
      ]);
      if (!activo) return;

      setDireccionesGuardadas(dirs);
      setSedesEmpresa(sedes);

      // Propone un destino sin pisar el que ya se haya elegido.
      setDestino((actual) => {
        if (actual.customerAddressId || actual.companyBranchId || actual.direccion) {
          return actual;
        }
        const sedePpal = sedes.find((x) => x.isDefault) ?? sedes[0];
        if (sedePpal) {
          return { ...DESTINO_VACIO, modo: 'sede', companyBranchId: sedePpal.id };
        }
        const dirPpal = dirs.find((x) => x.isDefault) ?? dirs[0];
        if (dirPpal) {
          return { ...DESTINO_VACIO, modo: 'guardada', customerAddressId: dirPpal.id };
        }
        return DESTINO_VACIO;
      });
    };

    void cargar();
    return () => { activo = false; };
  }, [isAuthenticated, avisarError]);

  const addToCart = useCallback(
    async (
      product: StoreProduct,
      presentationLabel?: string,
      colorName?: string,
      _colorHex?: string,
      qty = 1
    ) => {
      try {
        if (isAuthenticated) {
          setCartItems(await cartService.addProduct(product, presentationLabel, colorName, qty));
        } else {
          await carritoInvitado.agregarProducto(product, presentationLabel, colorName, qty);
          setCartItems(await carritoInvitado.obtenerArticulos());
        }
        setIsCartOpen(true);
      } catch (e) {
        avisarError('addToCart', e);
      }
    },
    [isAuthenticated, avisarError]
  );

  const addKitToCart = useCallback(
    async (kit: SolutionKit, multiplier = 1) => {
      try {
        if (isAuthenticated) {
          setCartItems(await cartService.addKit(kit, multiplier));
        } else {
          await carritoInvitado.agregarKit(kit, multiplier);
          setCartItems(await carritoInvitado.obtenerArticulos());
        }
        setIsCartOpen(true);
      } catch (e) {
        avisarError('addKitToCart', e);
      }
    },
    [isAuthenticated, avisarError]
  );

  const updateQuantity = useCallback(
    async (itemId: string, delta: number) => {
      const actual = cartItems.find((i) => i.id === itemId);
      if (!actual) return;
      try {
        if (isAuthenticated) {
          setCartItems(await cartService.updateQuantity(itemId, actual.quantity + delta));
        } else {
          carritoInvitado.fijarCantidad(itemId, actual.quantity + delta);
          setCartItems(await carritoInvitado.obtenerArticulos());
        }
      } catch (e) {
        avisarError('updateQuantity', e);
      }
    },
    [cartItems, isAuthenticated, avisarError]
  );

  const removeFromCart = useCallback(
    async (itemId: string) => {
      try {
        if (isAuthenticated) {
          setCartItems(await cartService.removeItem(itemId));
        } else {
          carritoInvitado.quitar(itemId);
          setCartItems(await carritoInvitado.obtenerArticulos());
        }
      } catch (e) {
        avisarError('removeFromCart', e);
      }
    },
    [isAuthenticated, avisarError]
  );

  const clearCart = useCallback(async () => {
    try {
      if (isAuthenticated) {
        setCartItems(await cartService.clear());
      } else {
        carritoInvitado.vaciar();
        setCartItems([]);
      }
      setNecesitaSesionPara(null);
      carritoInvitado.guardarIntencion(null);
    } catch (e) {
      avisarError('clearCart', e);
    }
  }, [isAuthenticated, avisarError]);

  /**
   * Pide la sesión sin tocar el carrito. La intención se guarda en el navegador
   * porque el acceso con Google recarga la página.
   */
  const pedirSesionPara = useCallback((intencion: Intencion) => {
    carritoInvitado.guardarIntencion(intencion);
    setNecesitaSesionPara(intencion);
  }, []);

  const descartarPeticionDeSesion = useCallback(() => {
    carritoInvitado.guardarIntencion(null);
    setNecesitaSesionPara(null);
  }, []);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCOP = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountCOP = cartItems.some((i) => i.isKitItem) ? Math.round(subtotalCOP * 0.08) : 0;
  const totalCOP = Math.max(0, subtotalCOP - discountCOP);

  /**
   * Llama a create_order_from_cart: el servidor valida disponibilidad, calcula
   * totales, crea pago y envío y cierra el carrito en una transacción.
   */
  const completeCheckout = useCallback(async () => {
    // El pedido se vincula a un usuario; la sesión se pide aquí, no al añadir, y el carrito se conserva.
    if (!isAuthenticated) {
      pedirSesionPara('pedido');
      setIsCartOpen(true);
      return;
    }
    // Validar antes de la red para marcar los campos en el formulario.
    const errs: Record<string, string> = {};

    if (!quienRecibe.nombre.trim()) errs.nombre = 'Indica quién recibe';
    if (!quienRecibe.numeroDocumento.trim()) errs.numeroDocumento = 'Indica el documento';
    if (!quienRecibe.telefono.trim()) errs.telefono = 'Indica el teléfono';

    if (deliveryMethod === 'pickup' && !selectedStore.id) {
      errs.punto = 'Elige el punto de retiro';
    }

    if (deliveryMethod === 'delivery') {
      if (destino.modo === 'guardada' && !destino.customerAddressId) {
        errs.destino = 'Elige una de tus direcciones';
      }
      if (destino.modo === 'sede' && !destino.companyBranchId) {
        errs.destino = 'Elige la sede a la que va el pedido';
      }
      if (destino.modo === 'nueva') {
        if (destino.direccion.trim().length < 5) {
          errs.direccion = 'Escribe la dirección de entrega';
        }
        Object.assign(errs, validarUbicacion(destino.ubicacion, { pedirBarrio: false }));
      }
    }

    setErroresEntrega(errs);
    if (Object.keys(errs).length > 0) {
      showToast('Faltan datos de la entrega. Revisa lo marcado en rojo.', 'error');
      setIsCartOpen(true);
      return;
    }

    try {
      // Un barrio que no estaba en la lista se crea ahora.
      let barrioId: string | null = null;
      if (deliveryMethod === 'delivery' && destino.modo === 'nueva') {
        barrioId = await resolverBarrio(destino.ubicacion);
      }
      void barrioId;

      const pedido = await orderService.createFromCart({
        deliveryMethod,
        pickupLocationExternalRef: deliveryMethod === 'pickup' ? selectedStore.id : undefined,
        customerAddressId:
          deliveryMethod === 'delivery' && destino.modo === 'guardada'
            ? destino.customerAddressId : null,
        companyBranchId:
          deliveryMethod === 'delivery' && destino.modo === 'sede'
            ? destino.companyBranchId : null,
        shippingAddress:
          deliveryMethod === 'delivery' && destino.modo === 'nueva'
            ? destino.direccion.trim() : undefined,
        shippingMunicipalityCode:
          deliveryMethod === 'delivery' && destino.modo === 'nueva'
            ? destino.ubicacion.municipalityCode : undefined,
        recipientName: quienRecibe.nombre.trim(),
        recipientDocumentType: quienRecibe.tipoDocumento,
        recipientDocumentNumber: quienRecibe.numeroDocumento.trim(),
        recipientPhone: quienRecibe.telefono.trim(),
      });
      setLastOrderNumber(pedido.orderNumber);
      setCartItems([]);
      setIsCartOpen(false);
      setErroresEntrega({});
      // Creado no es vendido: falta el cobro, por eso se abre el pago y no la confirmación.
      setUltimoPedidoPagado(false);
      setPedidoPorPagar({
        id: pedido.id,
        numero: pedido.orderNumber,
        total: pedido.totalCOP,
      });
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'No fue posible crear el pedido.');
      // Ninguna vista pinta checkoutError todavía; sin este aviso el fallo pasaba inadvertido.
      avisarError('completeCheckout', e);
    }
  }, [
    deliveryMethod, selectedStore, destino, quienRecibe,
    isAuthenticated, pedirSesionPara, avisarError, showToast,
  ]);

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
        destino,
        setDestino,
        direccionesGuardadas,
        sedesEmpresa,
        quienRecibe,
        setQuienRecibe,
        erroresEntrega,
        isCheckoutSuccessOpen,
        setIsCheckoutSuccessOpen,
        lastOrderNumber,
        checkoutError,
        stores,
        completeCheckout,
        necesitaSesionPara,
        pedirSesionPara,
        descartarPeticionDeSesion,
        recuperandoCarrito,
        pedidoPorPagar,
        ultimoPedidoPagado,
        // Cerrar la ventana de pago no implica haber pagado.
        cerrarPago: (pagado: boolean) => {
          setUltimoPedidoPagado(pagado);
          const pedido = pedidoPorPagar;
          setPedidoPorPagar(null);

          if (pagado) {
            setIsCheckoutSuccessOpen(true);
            return;
          }

          // Sin pago se cancela el pedido y sus productos vuelven al carrito, para no dejar pedidos fantasma.
          if (pedido) {
            void pagoService
              .devolverAlCarrito(pedido.id)
              .catch((e) => avisarError('devolverAlCarrito', e))
              .finally(async () => {
                try {
                  setCartItems(await cartService.getItems());
                } catch (e) {
                  avisarError('no se pudo recargar el carrito', e);
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
