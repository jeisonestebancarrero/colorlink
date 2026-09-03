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
  /**
   * Destino del envío. Antes eran dos textos con una dirección de
   * demostración escrita en el código; ahora es una elección explícita entre
   * una dirección guardada, una sede de la empresa o una dirección nueva.
   */
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
 * FASE 8 — El carrito vive en Supabase.
 *
 * Antes se guardaba en localStorage con los precios dentro, de modo que
 * cualquiera podía editarlos desde la consola del navegador. Ahora el
 * servidor guarda solo qué variante y qué cantidad; el precio se lee del
 * catálogo y se congela al confirmar el pedido (MÓDULO 52/60).
 *
 * Se eliminó también el carrito precargado con tres productos: sembrar la
 * compra de un usuario real no tiene sentido fuera de una demo.
 *
 * EL VISITANTE SIN CUENTA TAMBIÉN COMPRA. Añadir al carrito no exige sesión:
 * sin sesión las líneas se guardan en el navegador (services/carritoInvitado)
 * y al entrar se vuelcan al carrito real. La cuenta se pide recién al pedir la
 * cotización formal o al confirmar el pedido. Antes `addProduct` lanzaba
 * "Inicia sesión para agregar productos al carrito" y ese error moría en un
 * console.error: el visitante pulsaba "Agregar al Carrito", no pasaba nada y
 * se iba sin comprar. Por eso ahora TODO fallo del carrito se muestra en
 * pantalla.
 */
/**
 * Cómo se resuelve la dirección de entrega.
 *   'guardada' — una de las direcciones del cliente
 *   'sede'     — una sede de su empresa
 *   'nueva'    — escrita a mano; el caso de la obra, que no es una sede
 * En los dos primeros el servidor lee la dirección del registro elegido y
 * descarta lo que mande el navegador.
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
  // En blanco a propósito. Antes venía con 'Cra 43A # 18 Sur - 135, Edif.
  // Horizonte', una dirección de demostración: quien no la cambiaba dejaba esa
  // dirección falsa en un pedido real.
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
    return tomorrow.toISOString().split('T')[0];
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

  /** Mensaje de error visible. Un fallo del carrito no puede ser silencioso. */
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
   * Carga el carrito y, al entrar, se trae el que la persona armó de visitante.
   *
   * Sin sesión lee el carrito del navegador —antes lo dejaba vacío, así que el
   * visitante no tenía carrito posible—. Con sesión, si hay líneas de visitante
   * las vuelca a la cuenta y reabre el carrito, para que quien acaba de entrar
   * vea exactamente lo que había armado antes de registrarse.
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
        // Solo se borra el carrito local cuando el volcado salió bien: si
        // falla, lo que la persona armó sigue ahí y puede reintentar.
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
   * Direcciones del cliente y sedes de su empresa, al iniciar sesión.
   *
   * Y se precarga el destino: si tiene una dirección principal, el carrito la
   * propone; si su empresa tiene sedes, propone la principal. Es lo que pedía
   * "que se complete con la dirección registrada", y sigue siendo cambiable.
   * Un invitado no tiene nada de esto, así que su dirección arranca EN BLANCO
   * y el pedido no puede salir sin que la escriba.
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
        // Un cliente particular no tiene empresa: RLS devuelve vacío y no es
        // un error.
        sedeService.listar().catch(() => [] as SedeEmpresa[]),
      ]);
      if (!activo) return;

      setDireccionesGuardadas(dirs);
      setSedesEmpresa(sedes);

      // Se propone un destino, sin pisar lo que la persona ya haya elegido.
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
      // Vaciar el carrito deja sin sentido la sesión que se estaba pidiendo.
      setNecesitaSesionPara(null);
      carritoInvitado.guardarIntencion(null);
    } catch (e) {
      avisarError('clearCart', e);
    }
  }, [isAuthenticated, avisarError]);

  /**
   * Pide la sesión sin tocar el carrito.
   *
   * La intención se guarda también en el navegador porque el acceso con Google
   * recarga la página entera: al volver, el efecto de arranque la lee y reabre
   * el carrito con todo dentro.
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
   * FASE 9 — Checkout real.
   *
   * Antes generaba un número de pedido con Math.random(), vaciaba el carrito
   * y no guardaba nada: no existía ningún pedido. Ahora llama a
   * create_order_from_cart, que valida disponibilidad, calcula subtotal,
   * descuento, envío y total en el servidor, crea el pago y el envío, emite
   * la notificación y cierra el carrito, todo en una transacción.
   */
  const completeCheckout = useCallback(async () => {
    // Sin cuenta no hay pedido: el pedido se vincula a un usuario y a él van
    // el seguimiento, la factura y los correos. Se pide la sesión AQUÍ y no al
    // añadir al carrito, y el carrito armado se conserva.
    if (!isAuthenticated) {
      pedirSesionPara('pedido');
      setIsCartOpen(true);
      return;
    }
    // Validación antes de salir a la red, para que los campos que faltan se
    // marquen en el formulario en lugar de volver como un error genérico.
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
        // La dirección arranca en blanco y es obligatoria: es lo que impide
        // que salga un pedido hacia la dirección de demostración de antes.
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
      // Si escribió un barrio que no estaba en la lista, se incorpora ahora.
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
      setCheckoutError(e instanceof Error ? e.message : 'No fue posible crear el pedido.');
      // `checkoutError` no lo pinta ninguna vista todavía: sin este aviso,
      // pulsar "Confirmar Pedido" y fallar no le decía nada al cliente.
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
