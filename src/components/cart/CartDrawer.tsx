import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { usePickupStores, useTarifaIva } from '../../hooks/useCatalog';
import { desglosarIvaIncluido, formatearImporteImpuesto } from '../../services/impuestos';
import {
  X,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Store,
  Truck,
  MapPin,
  Calendar,
  Clock,
  ShieldCheck,
  FileText,
  ArrowRight,
  CheckCircle2,
  Download,
  Printer,
  Sparkles,
  ChevronDown,
  UserPlus,
  LogIn,
  Lock,
} from 'lucide-react';
import { Button } from '../common/Button';
import { PagoModal } from './PagoModal';
import { CotizacionFormal } from './CotizacionFormal';
import { DestinoEnvioSelector, QuienRecibeFormulario } from './DestinoEnvio';

interface CartDrawerProps {
  /**
   * La aplicación no usa librería de enrutado: la navegación es estado en
   * App.tsx. Se recibe para poder llevar al visitante a entrar o registrarse
   * sin perder el carrito. App.tsx ya lo pasaba, pero el componente lo
   * ignoraba.
   */
  onNavigate?: (page: string, param?: string) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onNavigate }) => {
  // FASE 4 — puntos de retiro desde Supabase. La lógica del carrito y del
  // pedido sigue en CartContext hasta las FASES 8 y 9.
  const { data: PINTUCO_STORES } = usePickupStores();

  const {
    cartItems,
    cartCount,
    subtotalCOP,
    discountCOP,
    totalCOP,
    isCartOpen,
    setIsCartOpen,
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
    completeCheckout,
    necesitaSesionPara,
    pedirSesionPara,
    descartarPeticionDeSesion,
    recuperandoCarrito,
    pedidoPorPagar,
    ultimoPedidoPagado,
    cerrarPago,
  } = useCart();
  const { user, isAuthenticated } = useAuth();

  const [isGeneratingQuote, setIsGeneratingQuote] = useState(false);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);

  // El desglose se calcula sobre el total YA descontado, igual que la factura:
  // si se calculara sobre el subtotal, el IVA del carrito no cuadraría con el
  // de la factura en cuanto hubiera un descuento de kit.
  const { data: tarifaIva } = useTarifaIva();
  const desglose = desglosarIvaIncluido(totalCOP, tarifaIva);

  const formatCOP = (num: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Antes esto llamaba a window.print() sobre la tienda entera y salía la
  // barra de navegación y el catálogo. Ahora abre un documento de cotización
  // de verdad, con emisor, NIT, IVA discriminado, vigencia y condiciones.
  //
  // La cotización lleva los datos del cliente y queda como documento a su
  // nombre, así que exige cuenta. Se le pide aquí, con el carrito ya armado
  // delante, en lugar de habérsela pedido al añadir el primer producto.
  const handleDownloadQuote = () => {
    if (!isAuthenticated) {
      pedirSesionPara('cotizacion');
      return;
    }
    setIsGeneratingQuote(true);
  };

  /** Lleva a entrar o a registrarse dejando el carrito intacto. */
  const irA = (pagina: 'login' | 'register') => {
    setIsCartOpen(false);
    onNavigate?.(pagina);
  };

  if (!isCartOpen && !isCheckoutSuccessOpen && !pedidoPorPagar) return null;

  /**
   * Se dibuja en un PORTAL, colgado de `document.body`.
   *
   * El cajón se veía cortado por arriba: le faltaba su cabecera con el título
   * y la X. No era un problema de altura —es `fixed inset-y-0`, ocupa toda la
   * pantalla— sino de orden de pintado. `CartDrawer` cuelga de
   * `<main className="relative z-10">`, y eso crea un CONTEXTO DE APILAMIENTO:
   * su `z-50` solo compite dentro de ese contenedor, así que la cabecera del
   * sitio (`sticky z-40`, hermana de `main`) se pintaba encima de los primeros
   * 220 píxeles del cajón.
   *
   * Subir el número no lo arregla: mientras siga dentro de `main`, cualquier
   * `z` pierde contra un hermano de `main`. Un portal lo saca de ahí y el
   * problema desaparece de raíz, que es lo que se espera de un cajón o un
   * diálogo: se dibujan sobre TODO.
   */
  return createPortal(
    <>
      {isGeneratingQuote && (
        <CotizacionFormal
          items={cartItems}
          subtotal={subtotalCOP}
          descuento={discountCOP}
          total={totalCOP}
          onCerrar={() => setIsGeneratingQuote(false)}
        />
      )}

      {/* El pago se abre apenas el pedido queda creado: sin cobro el pedido no
          se alista, así que confirmarlo sin pagar no significaría nada. */}
      {pedidoPorPagar && (
        <PagoModal
          orderId={pedidoPorPagar.id}
          orderNumber={pedidoPorPagar.numero}
          total={pedidoPorPagar.total}
          onListo={(pagado) => cerrarPago(pagado)}
          onCerrar={() => cerrarPago(false)}
        />
      )}

      {/* Cart Drawer Backdrop */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div className="absolute inset-0" onClick={() => setIsCartOpen(false)} />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-lg bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out">
              {/* Header */}
              <div className="px-5 py-4 bg-[#004F9F] text-white flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold tracking-tight">
                      Tu Carrito de Materiales
                    </h2>
                    <p className="text-xs text-blue-100 font-medium">
                      {cartCount} {cartCount === 1 ? 'producto' : 'productos'} para tu obra
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Cerrar carrito"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {cartItems.length === 0 ? (
                  <div className="py-16 text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-50 text-[#004F9F] rounded-full flex items-center justify-center mx-auto">
                      <ShoppingCart className="w-8 h-8 stroke-[1.5]" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-slate-800">
                        Tu carrito está vacío
                      </p>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        Explora la tienda de pinturas Pintuco o arma tu Kit de Solución para agregar productos.
                      </p>
                    </div>
                    <Button
                      onClick={() => setIsCartOpen(false)}
                      variant="primary"
                      className="bg-[#004F9F] text-xs font-semibold"
                    >
                      Explorar Tienda Pintuco
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Delivery Mode Toggle */}
                    <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDeliveryMethod('pickup')}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            deliveryMethod === 'pickup'
                              ? 'bg-[#004F9F] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                          }`}
                        >
                          <Store className="w-4 h-4" />
                          <span>Retiro en Tienda (GRATIS)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeliveryMethod('delivery')}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            deliveryMethod === 'delivery'
                              ? 'bg-[#004F9F] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                          }`}
                        >
                          <Truck className="w-4 h-4" />
                          <span>Envío a Obra / Domicilio</span>
                        </button>
                      </div>

                      {/* Pickup details */}
                      {deliveryMethod === 'pickup' ? (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-blue-100 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <MapPin className="w-4 h-4 text-[#004F9F] shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-bold text-slate-800">
                                  {selectedStore.name}
                                </p>
                                <p className="text-[11px] text-slate-600">
                                  {selectedStore.address} — {selectedStore.city}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Listo en {selectedStore.stockReadinessHours}h
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    {selectedStore.hours}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => setShowStoreDropdown(!showStoreDropdown)}
                              className="text-[11px] font-bold text-[#004F9F] hover:underline cursor-pointer shrink-0"
                            >
                              Cambiar
                            </button>
                          </div>

                          {showStoreDropdown && (
                            <div className="pt-2 border-t border-slate-100 space-y-1.5 max-h-48 overflow-y-auto">
                              <p className="text-[10px] font-bold uppercase text-slate-500">
                                Selecciona una tienda oficial Pintuco:
                              </p>
                              {PINTUCO_STORES.map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => {
                                    setSelectedStore(s);
                                    setShowStoreDropdown(false);
                                  }}
                                  className={`w-full text-left p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                                    selectedStore.id === s.id
                                      ? 'bg-blue-50 border border-blue-200 text-[#004F9F] font-bold'
                                      : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span>{s.name} ({s.city})</span>
                                    <span className="text-[10px] font-semibold text-slate-500">{s.phone}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                            <span className="text-slate-600 font-medium flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" /> Fecha estimada de retiro:
                            </span>
                            <input
                              type="date"
                              value={pickupDate}
                              onChange={(e) => setPickupDate(e.target.value)}
                              className="border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-blue-600"
                            />
                          </div>

                          {/* Al retirar en tienda también hay que saber a
                              quién se le entrega: el punto de venta verifica
                              el documento. El servidor lo exige igual. */}
                          <QuienRecibeFormulario />
                        </div>
                      ) : (
                        <DestinoEnvioSelector />
                      )}
                    </div>

                    {/* Items List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Productos en Cotización
                        </span>
                        <button
                          onClick={clearCart}
                          className="text-[11px] text-red-600 hover:underline font-semibold cursor-pointer"
                        >
                          Vaciar carrito
                        </button>
                      </div>

                      {cartItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex gap-3 items-center group"
                        >
                          <img
                            src={item.image}
                            alt={item.productName}
                            className="w-14 h-14 object-cover rounded-lg bg-white border border-slate-200 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            {item.isKitItem && (
                              <span className="inline-block text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded mb-0.5">
                                Incluido en Kit Solución
                              </span>
                            )}
                            <h4 className="text-xs font-bold text-slate-900 truncate">
                              {item.productName}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Presentación: <strong className="text-slate-700">{item.presentation}</strong>
                            </p>
                            {item.colorName && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span
                                  className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                                  style={{ backgroundColor: item.colorHex || '#FFFFFF' }}
                                />
                                <span className="text-[11px] text-slate-600 font-medium truncate">
                                  {item.colorName} ({item.colorCode})
                                </span>
                              </div>
                            )}
                            <p className="text-xs font-extrabold text-[#004F9F] mt-1">
                              {formatCOP(item.unitPrice)} <span className="text-[10px] font-normal text-slate-500">c/u · IVA incl.</span>
                            </p>
                          </div>

                          {/* Controls */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="text-slate-400 hover:text-red-600 transition-colors p-1"
                              title="Eliminar producto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                              <button
                                onClick={() => updateQuantity(item.id, -1)}
                                className="px-2 py-1 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="px-2 text-xs font-bold text-slate-800 min-w-6 text-center">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateQuantity(item.id, 1)}
                                className="px-2 py-1 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pintuco Guarantee Notice */}
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-emerald-900 leading-tight">
                        <strong className="font-bold">Garantía Directa de Fábrica Pintuco:</strong>
                        <p className="mt-0.5 text-emerald-800">
                          Todos los productos cuentan con respaldo técnico oficial y acompañamiento en obra sin costo adicional.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer Summary & Checkout */}
              {cartItems.length > 0 && (
                <div className="p-5 bg-slate-50 border-t border-slate-200 space-y-3.5">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal Materiales:</span>
                      <span className="font-semibold text-slate-800">{formatCOP(subtotalCOP)}</span>
                    </div>
                    {discountCOP > 0 && (
                      <div className="flex justify-between text-emerald-700 font-semibold">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" /> Descuento Kit Solución:
                        </span>
                        <span>-{formatCOP(discountCOP)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Despacho / Retiro:</span>
                      <span className="font-semibold text-emerald-700">GRATIS</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Asesoría Técnica Pintuco:</span>
                      <span className="font-semibold text-blue-700">INCLUIDA ($0)</span>
                    </div>

                    {/* Desglose del IVA.
                        Los precios de góndola ya lo incluyen, así que aquí NO
                        se suma nada: se despeja hacia atrás con el mismo
                        cálculo de `emitir_factura_pos`, y por eso el total
                        no cambia. Sin estas dos líneas el cliente veía un
                        precio sin saber si al pagar le sumarían el 19 %. */}
                    <div className="pt-2 border-t border-dashed border-slate-300 space-y-1.5">
                      <div className="flex justify-between text-slate-500">
                        <span>Base gravable:</span>
                        <span className="tabular-nums">{formatearImporteImpuesto(desglose.base)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>IVA {desglose.tarifa} % (incluido):</span>
                        <span className="tabular-nums">{formatearImporteImpuesto(desglose.iva)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                      <span className="text-sm font-extrabold text-slate-900">Total a Pagar (COP):</span>
                      <span className="text-xl font-extrabold text-[#004F9F]">
                        {formatCOP(totalCOP)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      IVA incluido. Este es el valor final: al pagar no se suma
                      nada más.
                    </p>
                  </div>

                  {/* Se pide la cuenta AQUÍ, no al añadir al carrito. Lo que
                      la persona armó sigue arriba, a la vista, y se recupera
                      tal cual después de entrar. */}
                  {necesitaSesionPara ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <Lock className="w-4 h-4 text-[#004F9F] shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-900">
                            {necesitaSesionPara === 'cotizacion'
                              ? 'Necesitas una cuenta para la cotización formal'
                              : 'Necesitas una cuenta para confirmar el pedido'}
                          </p>
                          <p className="text-xs text-slate-600 leading-snug">
                            {necesitaSesionPara === 'cotizacion'
                              ? 'La cotización se emite a tu nombre, con tus datos y tu NIT si eres empresa.'
                              : 'El pedido queda vinculado a tu cuenta para que puedas seguir el alistamiento y recibir la factura.'}
                          </p>
                          <p className="text-xs font-semibold text-emerald-700">
                            Tranquilo: guardamos tus {cartCount}{' '}
                            {cartCount === 1 ? 'producto' : 'productos'} y te los
                            devolvemos al entrar.
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={() => irA('login')}
                          variant="primary"
                          className="bg-[#004F9F] hover:bg-[#003B77] text-xs font-bold text-white shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          <span>Iniciar sesión</span>
                        </Button>
                        <Button
                          onClick={() => irA('register')}
                          variant="outline"
                          className="text-xs font-bold border-[#004F9F] text-[#004F9F] flex items-center justify-center gap-1.5"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Crear cuenta</span>
                        </Button>
                      </div>
                      <button
                        onClick={descartarPeticionDeSesion}
                        className="w-full text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        Seguir viendo productos
                      </button>
                    </div>
                  ) : (
                    <>
                      {!isAuthenticated && (
                        <p className="text-[11px] text-slate-500 leading-snug flex items-start gap-1.5">
                          <Lock className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          <span>
                            Puedes armar tu carrito sin cuenta. Te pediremos
                            iniciar sesión solo al cotizar o confirmar el pedido.
                          </span>
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={handleDownloadQuote}
                          disabled={recuperandoCarrito}
                          variant="outline"
                          className="text-xs font-bold border-slate-300 text-slate-700 flex items-center justify-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-500" />
                          <span>Cotización formal</span>
                        </Button>
                        <Button
                          onClick={completeCheckout}
                          disabled={recuperandoCarrito}
                          variant="primary"
                          className="bg-[#004F9F] hover:bg-[#003B77] text-xs font-bold text-white shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>Confirmar Pedido</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Confirmation Modal */}
      {isCheckoutSuccessOpen && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4 animate-in zoom-in-95 duration-200">
            {/* El estado del pedido depende del cobro, no de haber llegado a
                esta pantalla: cerrar la ventana de pago dejaba antes un
                "registrada con éxito" sobre un pedido que nadie pagó. */}
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-inner ${
                ultimoPedidoPagado
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-amber-100 text-amber-600'
              }`}
            >
              {ultimoPedidoPagado ? (
                <CheckCircle2 className="w-10 h-10" />
              ) : (
                <Clock className="w-10 h-10" />
              )}
            </div>

            <div className="space-y-1">
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  ultimoPedidoPagado
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-amber-800 bg-amber-50 border-amber-200'
                }`}
              >
                {ultimoPedidoPagado ? '¡Pedido confirmado!' : 'Pendiente de pago'}
              </span>
              <h3 className="text-xl font-extrabold text-slate-900">
                Orden #{lastOrderNumber}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {ultimoPedidoPagado ? (
                  <>
                    Notificamos a <strong>{selectedStore.name}</strong> para que empiece el
                    alistamiento. Te avisamos por correo en cada paso.
                  </>
                ) : (
                  <>
                    Tu pedido quedó guardado, pero <strong>no se alista hasta que lo pagues</strong>.
                    Puedes completar el pago cuando quieras desde <strong>Mis Pedidos</strong>.
                  </>
                )}
              </p>
            </div>

            {/* Receipt card */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Cliente:</span>
                <strong className="text-slate-800">
                  {`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Cliente'}
                  {user?.company ? ` (${user.company})` : ''}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Modalidad:</span>
                <strong className="text-blue-700">
                  {deliveryMethod === 'pickup' ? 'Retiro en Tienda Pintuco' : 'Envío a Obra'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Punto de Entrega:</span>
                <strong className="text-slate-800 truncate max-w-[200px]">
                  {deliveryMethod === 'pickup' ? selectedStore.name : 'Envío a la dirección indicada'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fecha Programada:</span>
                <strong className="text-slate-800">{pickupDate}</strong>
              </div>
            </div>

            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-[11px] text-blue-900 text-left flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <p>
                Tu pedido quedó vinculado a tu cuenta ColorLink. Puedes consultar el estado del alistamiento o coordinar el acompañamiento de obra desde el panel.
              </p>
            </div>

            <Button
              onClick={() => setIsCheckoutSuccessOpen(false)}
              variant="primary"
              className="w-full bg-[#004F9F] text-xs font-bold text-white py-2.5 cursor-pointer"
            >
              Volver a la Plataforma
            </Button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
};
