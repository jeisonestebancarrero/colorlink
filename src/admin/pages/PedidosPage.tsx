import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Printer, ReceiptText, Search, Truck, Store } from 'lucide-react';
import {
  pedidoService, formatearCOP, ESTADOS_PEDIDO, TRANSICIONES,
  ETIQUETA_ESTADO, COLOR_ESTADO,
  type EstadoPedido, type PedidoLista, type PedidoDetalle,
} from '../../services/backoffice';
import { useAdminAuth } from '../AdminAuthContext';
import { Chatter } from '../Chatter';
import { ReciboPOS } from '../ReciboPOS';
import { Button } from '../../components/common/Button';

/** Gestión de pedidos: listado, detalle, estados, factura y conversación. */
export const PedidosPage: React.FC = () => {
  const { puede } = useAdminAuth();
  const [pedidos, setPedidos] = useState<PedidoLista[]>([]);
  const [detalle, setDetalle] = useState<PedidoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState<EstadoPedido | 'TODOS'>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [accionando, setAccionando] = useState(false);
  const [reciboAbierto, setReciboAbierto] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      setPedidos(await pedidoService.listar({ estado, busqueda }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar los pedidos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, [estado]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pedidos;
    return pedidos.filter(
      (p) => p.numero.toLowerCase().includes(q) ||
             p.cliente.toLowerCase().includes(q) ||
             (p.empresa ?? '').toLowerCase().includes(q)
    );
  }, [pedidos, busqueda]);

  const abrir = async (id: string) => {
    setError('');
    try {
      setDetalle(await pedidoService.detalle(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible abrir el pedido.');
    }
  };

  const cambiar = async (nuevo: EstadoPedido) => {
    if (!detalle) return;
    setAccionando(true);
    setError('');
    try {
      await pedidoService.cambiarEstado(detalle.id, nuevo);
      await abrir(detalle.id);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cambiar el estado.');
    } finally {
      setAccionando(false);
    }
  };

  const facturar = async () => {
    if (!detalle) return;
    setAccionando(true);
    setError('');
    try {
      await pedidoService.emitirFactura(detalle.id);
      await abrir(detalle.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible emitir la factura.');
    } finally {
      setAccionando(false);
    }
  };

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

  // ---------- Detalle ----------
  if (detalle) {
    const siguientes = TRANSICIONES[detalle.estado] ?? [];
    return (
      <div className="space-y-6">
        <button onClick={() => setDetalle(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a pedidos
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{detalle.numero}</h1>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${COLOR_ESTADO[detalle.estado]}`}>
                {ETIQUETA_ESTADO[detalle.estado]}
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {detalle.cliente}{detalle.empresa ? ` · ${detalle.empresa}` : ''} · {fecha(detalle.creadoEn)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {puede('orders.status') && siguientes.map((s) => (
              <Button key={s} variant={s === 'CANCELADO' ? 'outline' : 'pintuco'} size="sm"
                isLoading={accionando} onClick={() => cambiar(s)}>
                {ETIQUETA_ESTADO[s]}
              </Button>
            ))}
            {puede('invoices.issue') && !detalle.facturaId && (
              <Button variant="secondary" size="sm" isLoading={accionando} onClick={facturar}
                leftIcon={<ReceiptText className="w-3.5 h-3.5" />}>
                Emitir factura
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
        )}
        {detalle.facturaNumero && detalle.facturaId && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium flex flex-wrap items-center gap-2">
            <ReceiptText className="w-4 h-4" /> Factura emitida: <strong>{detalle.facturaNumero}</strong>
            <button
              onClick={() => setReciboAbierto(detalle.facturaId)}
              className="ml-auto inline-flex items-center gap-1.5 font-bold text-emerald-900 hover:underline"
            >
              <Printer className="w-3.5 h-3.5" /> Ver e imprimir recibo
            </button>
          </div>
        )}

        {reciboAbierto && (
          <ReciboPOS facturaId={reciboAbierto} onCerrar={() => setReciboAbierto(null)} />
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-extrabold text-slate-900">Productos</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                      <th className="text-left px-5 py-2.5">Producto</th>
                      <th className="text-right px-3 py-2.5">Cant.</th>
                      <th className="text-right px-3 py-2.5">Unitario</th>
                      <th className="text-right px-5 py-2.5">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.lineas.map((l, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-900">{l.descripcion}</p>
                          <p className="text-xs text-slate-500">
                            {[l.presentacion, l.color, l.codigo].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{l.cantidad}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatearCOP(l.precioUnitario)}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold">{formatearCOP(l.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr className="border-t border-slate-200">
                      <td colSpan={3} className="px-5 py-2 text-right text-xs font-semibold text-slate-500">Subtotal</td>
                      <td className="px-5 py-2 text-right tabular-nums font-semibold">{formatearCOP(detalle.subtotal)}</td>
                    </tr>
                    {detalle.descuento > 0 && (
                      <tr>
                        <td colSpan={3} className="px-5 py-2 text-right text-xs font-semibold text-slate-500">Descuento</td>
                        <td className="px-5 py-2 text-right tabular-nums font-semibold text-emerald-700">−{formatearCOP(detalle.descuento)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={3} className="px-5 py-2 text-right text-xs font-semibold text-slate-500">Envío</td>
                      <td className="px-5 py-2 text-right tabular-nums font-semibold">{formatearCOP(detalle.envio)}</td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td colSpan={3} className="px-5 py-3 text-right text-sm font-extrabold text-slate-900">Total</td>
                      <td className="px-5 py-3 text-right tabular-nums font-extrabold text-slate-900">{formatearCOP(detalle.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <Chatter campo="order_id" id={detalle.id} />
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                {detalle.metodo === 'Envío' ? <Truck className="w-4 h-4 text-[#004F9F]" /> : <Store className="w-4 h-4 text-[#004F9F]" />}
                {detalle.metodo}
              </h3>
              {detalle.puntoRetiro && (
                <div><p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Punto de retiro</p>
                  <p className="text-sm text-slate-700 font-medium">{detalle.puntoRetiro}</p></div>
              )}
              {detalle.codigoRetiro && (
                <div><p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Código de retiro</p>
                  <p className="text-lg font-mono font-extrabold text-slate-900 tracking-widest">{detalle.codigoRetiro}</p></div>
              )}
              {detalle.direccion && (
                <div><p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Dirección</p>
                  <p className="text-sm text-slate-700 font-medium">{detalle.direccion}</p>
                  <p className="text-xs text-slate-500">{detalle.ciudad}</p></div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Listado ----------
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Pedidos</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Seguimiento, cambios de estado y facturación.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[15rem] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número, cliente o empresa…"
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30" />
        </div>
        <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoPedido | 'TODOS')}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30">
          <option value="TODOS">Todos los estados</option>
          {ESTADOS_PEDIDO.map((s) => <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>)}
        </select>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
              <th className="text-left px-5 py-3">Pedido</th>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-left px-4 py-3">Entrega</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-left px-5 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Cargando…</td></tr>}
            {!cargando && filtrados.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                No hay pedidos que coincidan.
              </td></tr>
            )}
            {filtrados.map((p) => (
              <tr key={p.id} onClick={() => abrir(p.id)}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                <td className="px-5 py-3 font-bold text-slate-900">{p.numero}</td>
                <td className="px-4 py-3">
                  <p className="text-slate-800 font-medium">{p.cliente}</p>
                  {p.empresa && <p className="text-xs text-slate-500">{p.empresa}</p>}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.metodo}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${COLOR_ESTADO[p.estado]}`}>
                    {ETIQUETA_ESTADO[p.estado]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatearCOP(p.total)}</td>
                <td className="px-5 py-3 text-slate-500">{fecha(p.creadoEn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
