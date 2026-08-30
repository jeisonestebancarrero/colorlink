import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Circle, Clock, Package, Radio, Store, Truck,
} from 'lucide-react';
import { trackingService, type PedidoCliente } from '../services/tracking';
import { MapaSeguimiento } from '../components/orders/MapaSeguimiento';
import { Button } from '../components/common/Button';
import { CatalogError, CatalogLoading } from '../components/common/CatalogState';

/**
 * Mis pedidos — vista del CLIENTE.
 *
 * Enfoque distinto al del portal interno: aquí no hay estados de base de
 * datos, transportadoras ni acciones de gestión. Solo la respuesta a
 * "¿dónde está mi pedido y cuándo llega?", con el avance en vivo.
 */
interface Props {
  onNavigate: (page: string, param?: string) => void;
}

const formatearCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

export const MisPedidosPage: React.FC<Props> = ({ onNavigate }) => {
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [enVivo, setEnVivo] = useState(false);

  const cargar = async () => {
    try {
      setPedidos(await trackingService.misPedidos());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar tus pedidos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  // Seguimiento en vivo: cuando despacho mueve el envío, esto se actualiza
  // solo, sin recargar ni consultar cada pocos segundos.
  useEffect(() => {
    const cancelar = trackingService.suscribir(() => { void cargar(); });
    setEnVivo(true);
    return () => { cancelar(); setEnVivo(false); };
  }, []);

  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

  if (cargando) return <CatalogLoading mensaje="Cargando tus pedidos…" />;
  if (error) return <CatalogError mensaje={error} onReintentar={() => { setCargando(true); void cargar(); }} />;

  const detalle = pedidos.find((p) => p.id === abierto);

  // ---------- Detalle con seguimiento ----------
  if (detalle) {
    return (
      <div className="space-y-6 pb-16">
        <button onClick={() => setAbierto(null)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#004F9F] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a mis pedidos
        </button>

        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 px-3 py-1 rounded-full text-xs font-bold border border-blue-200 mb-2">
                {detalle.esEnvio ? <Truck className="w-3.5 h-3.5" /> : <Store className="w-3.5 h-3.5" />}
                {detalle.esEnvio ? 'Envío a domicilio' : 'Retiro en tienda'}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {detalle.numero}
              </h1>
              <p className="text-sm text-slate-500 font-medium mt-1">
                Realizado el {fecha(detalle.creadoEn)} · {formatearCOP(detalle.total)}
              </p>
            </div>
            {enVivo && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <Radio className="w-3 h-3 animate-pulse" /> Seguimiento en vivo
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 space-y-5">
            <MapaSeguimiento pedido={detalle} />

            {/* Datos de entrega */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs">
              {detalle.esEnvio ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Dirección de entrega</p>
                    <p className="text-sm text-slate-800 font-semibold mt-1">{detalle.direccion ?? '—'}</p>
                    <p className="text-xs text-slate-500">{detalle.ciudad}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Entrega estimada</p>
                    <p className="text-sm text-slate-800 font-semibold mt-1">
                      {detalle.estimada ? fecha(detalle.estimada) : 'Por confirmar'}
                    </p>
                  </div>
                  {detalle.transportadora && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Transportadora</p>
                      <p className="text-sm text-slate-800 font-semibold mt-1">{detalle.transportadora}</p>
                    </div>
                  )}
                  {detalle.guia && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Número de guía</p>
                      <p className="text-sm text-slate-800 font-mono font-bold mt-1">{detalle.guia}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Punto de retiro</p>
                    <p className="text-sm text-slate-800 font-semibold mt-1">{detalle.puntoRetiro ?? '—'}</p>
                    <p className="text-xs text-slate-500">{detalle.ciudadRetiro}</p>
                  </div>
                  {detalle.codigoRetiro && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Tu código de retiro</p>
                      <p className="text-2xl text-slate-900 font-mono font-extrabold tracking-widest mt-1">
                        {detalle.codigoRetiro}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">Preséntalo en la tienda</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Productos */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-extrabold text-slate-900">Tu pedido</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {detalle.items.map((i, idx) => (
                  <div key={idx} className="px-6 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{i.nombre}</p>
                      <p className="text-xs text-slate-500">{i.presentacion} · {i.cantidad} unid.</p>
                    </div>
                    <p className="text-sm font-bold text-slate-900 tabular-nums shrink-0">
                      {formatearCOP(i.subtotal)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Línea de tiempo */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs sticky top-6">
              <h2 className="text-base font-extrabold text-slate-900 mb-5">Estado de tu pedido</h2>
              <div className="space-y-1">
                {detalle.hitos.map((h, i) => (
                  <div key={h.clave} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      {h.alcanzado ? (
                        <CheckCircle2 className={`w-5 h-5 shrink-0 ${h.actual ? 'text-[#004F9F]' : 'text-emerald-500'}`} />
                      ) : (
                        <Circle className="w-5 h-5 shrink-0 text-slate-300" />
                      )}
                      {i < detalle.hitos.length - 1 && (
                        <div className={`w-0.5 flex-1 min-h-[2rem] ${h.alcanzado ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                      )}
                    </div>
                    <div className="pb-5">
                      <p className={`text-sm font-bold ${h.alcanzado ? 'text-slate-900' : 'text-slate-400'}`}>
                        {h.titulo}
                      </p>
                      <p className={`text-xs mt-0.5 ${h.alcanzado ? 'text-slate-500' : 'text-slate-400'}`}>
                        {h.descripcion}
                      </p>
                      {h.actual && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-[#004F9F] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          <Clock className="w-2.5 h-2.5" /> Estado actual
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Listado ----------
  return (
    <div className="space-y-6 pb-16">
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Mis Pedidos</h1>
        <p className="text-sm text-slate-500 font-medium mt-1.5">
          Sigue el avance de tus compras en tiempo real.
        </p>
      </div>

      {pedidos.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-2xs text-center">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-extrabold text-slate-900">Todavía no tienes pedidos</h2>
          <p className="text-sm text-slate-500 font-medium mt-1.5 max-w-sm mx-auto">
            Explora el catálogo Pintuco y arma tu primer pedido con retiro en tienda o envío a domicilio.
          </p>
          <Button variant="pintuco" className="mt-5" onClick={() => onNavigate('store')}>
            Ir a la tienda
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pedidos.map((p) => (
            <button key={p.id} onClick={() => setAbierto(p.id)}
              className="text-left bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:border-[#004F9F]/40 hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-extrabold text-slate-900">{p.numero}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{fecha(p.creadoEn)}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full shrink-0">
                  {p.esEnvio ? <Truck className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                  {p.esEnvio ? 'Envío' : 'Retiro'}
                </span>
              </div>

              <div className="mt-4">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-linear-to-r from-[#004F9F] to-[#0284C7] rounded-full transition-all duration-700"
                    style={{ width: `${Math.round(p.progreso * 100)}%` }} />
                </div>
                <p className="text-xs font-bold text-slate-700 mt-2">
                  {p.hitos.find((h) => h.actual)?.titulo ?? 'Procesando tu pedido'}
                </p>
              </div>

              <p className="text-sm font-extrabold text-slate-900 mt-3 tabular-nums">
                {formatearCOP(p.total)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
