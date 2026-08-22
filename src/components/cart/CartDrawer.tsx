import React, { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { PINTUCO_STORES } from '../../data/storeMockData';
import {
  X,
  ShoppingBag,
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
} from 'lucide-react';
import { Button } from '../common/Button';

export const CartDrawer: React.FC = () => {
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
    deliveryAddress,
    setDeliveryAddress,
    deliveryCity,
    setDeliveryCity,
    isCheckoutSuccessOpen,
    setIsCheckoutSuccessOpen,
    lastOrderNumber,
    completeCheckout,
  } = useCart();

  const [isGeneratingQuote, setIsGeneratingQuote] = useState(false);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);

  const formatCOP = (num: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const handleDownloadQuote = () => {
    setIsGeneratingQuote(true);
    setTimeout(() => {
      setIsGeneratingQuote(false);
      window.print();
    }, 600);
  };

  if (!isCartOpen && !isCheckoutSuccessOpen) return null;

  return (
    <>
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
                    <ShoppingBag className="w-5 h-5 text-white" />
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
                      <ShoppingBag className="w-8 h-8 stroke-[1.5]" />
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
                        </div>
                      ) : (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-blue-100 space-y-2">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-700">
                              Dirección de entrega en Obra:
                            </label>
                            <input
                              type="text"
                              value={deliveryAddress}
                              onChange={(e) => setDeliveryAddress(e.target.value)}
                              placeholder="Dirección completa, torre, apto o frente de obra"
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Ciudad: <strong>{deliveryCity}</strong></span>
                            <span className="text-blue-700 font-semibold">Entrega estimada: 24-48 horas</span>
                          </div>
                        </div>
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
                              {formatCOP(item.unitPrice)} <span className="text-[10px] font-normal text-slate-500">c/u</span>
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
                    <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                      <span className="text-sm font-extrabold text-slate-900">Total Estimado (COP):</span>
                      <span className="text-xl font-extrabold text-[#004F9F]">
                        {formatCOP(totalCOP)}
                      </span>
                    </div>
                  </div>

                  {/* CTAs */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={handleDownloadQuote}
                      variant="outline"
                      disabled={isGeneratingQuote}
                      className="text-xs font-bold border-slate-300 text-slate-700 flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isGeneratingQuote ? 'Preparando...' : 'Cotización Formal'}</span>
                    </Button>
                    <Button
                      onClick={completeCheckout}
                      variant="primary"
                      className="bg-[#004F9F] hover:bg-[#003B77] text-xs font-bold text-white shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Confirmar Pedido</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
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
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                ¡Orden Registrada con Éxito!
              </span>
              <h3 className="text-xl font-extrabold text-slate-900">
                Orden #{lastOrderNumber}
              </h3>
              <p className="text-xs text-slate-600">
                Hemos notificado a la tienda <strong>{selectedStore.name}</strong> y a tu asesor técnico Pintuco asignado.
              </p>
            </div>

            {/* Receipt card */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Cliente:</span>
                <strong className="text-slate-800">Carlos Mendoza (Constructora Horizonte)</strong>
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
                  {deliveryMethod === 'pickup' ? selectedStore.name : deliveryAddress}
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
    </>
  );
};
