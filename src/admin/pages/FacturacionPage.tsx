import React, { useEffect, useState } from 'react';
import { FileText, Printer, ReceiptText, Search } from 'lucide-react';
import { facturaService, formatearCOP, type FacturaLista } from '../../services/backoffice';
import { useAdminAuth } from '../AdminAuthContext';
import { ReciboPOS } from '../ReciboPOS';
import { Button } from '../../components/common/Button';

/** Facturación POS: emitir, consultar y reimprimir. */
export const FacturacionPage: React.FC = () => {
  const { puede } = useAdminAuth();
  const [facturas, setFacturas] = useState<FacturaLista[]>([]);
  const [pendientes, setPendientes] = useState<Array<{ id: string; numero: string; cliente: string; total: number }>>([]);
  const [pestana, setPestana] = useState<'emitidas' | 'pendientes'>('emitidas');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recibo, setRecibo] = useState<string | null>(null);
  const [emitiendo, setEmitiendo] = useState<string | null>(null);

  const cargar = async () => {
    try {
      const [f, p] = await Promise.all([facturaService.listar(busqueda), facturaService.pendientes()]);
      setFacturas(f);
      setPendientes(p);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar la facturación.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const emitir = async (orderId: string) => {
    setEmitiendo(orderId);
    setError('');
    try {
      const id = await facturaService.emitir(orderId);
      await cargar();
      setRecibo(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible emitir la factura.');
    } finally {
      setEmitiendo(null);
    }
  };

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

  const totalIva = facturas.reduce((s, f) => s + f.iva, 0);
  const totalFacturado = facturas.reduce((s, f) => s + f.total, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Facturación</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Documento equivalente POS con IVA desglosado. No es facturación electrónica DIAN.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Facturas emitidas', String(facturas.length)],
          ['Total facturado', formatearCOP(totalFacturado)],
          ['IVA recaudado', formatearCOP(totalIva)],
          ['Pedidos sin facturar', String(pendientes.length)],
        ].map(([t, v]) => (
          <div key={t} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t}</p>
            <p className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1.5">
          {([['emitidas', `Emitidas (${facturas.length})`], ['pendientes', `Por facturar (${pendientes.length})`]] as const).map(([v, t]) => (
            <button key={v} onClick={() => setPestana(v)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                pestana === v ? 'bg-[#004F9F] text-white border-[#004F9F]'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}>{t}</button>
          ))}
        </div>
        {pestana === 'emitidas' && (
          <div className="relative flex-1 min-w-[15rem] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void cargar(); }}
              placeholder="Buscar por número o cliente…"
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30" />
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
      )}

      {cargando ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-[#004F9F] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pestana === 'emitidas' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="text-left px-5 py-3">Factura</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Pedido</th>
                <th className="text-right px-4 py-3">Base</th>
                <th className="text-right px-4 py-3">IVA</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                  <ReceiptText className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                  Todavía no hay facturas emitidas.
                </td></tr>
              )}
              {facturas.map((f) => (
                <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-bold text-slate-900">{f.numero}</td>
                  <td className="px-4 py-3 text-slate-700">{f.cliente}</td>
                  <td className="px-4 py-3 text-slate-500">{f.pedido}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatearCOP(f.base)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatearCOP(f.iva)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold">{formatearCOP(f.total)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fecha(f.emitida)}</td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => setRecibo(f.id)}
                      leftIcon={<Printer className="w-3.5 h-3.5" />}>Recibo</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="text-left px-5 py-3">Pedido</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {pendientes.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-400">
                  <FileText className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                  Todos los pedidos están facturados.
                </td></tr>
              )}
              {pendientes.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-bold text-slate-900">{p.numero}</td>
                  <td className="px-4 py-3 text-slate-700">{p.cliente}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatearCOP(p.total)}</td>
                  <td className="px-5 py-3 text-right">
                    {puede('invoices.issue') && (
                      <Button variant="pintuco" size="sm" isLoading={emitiendo === p.id}
                        onClick={() => emitir(p.id)}
                        leftIcon={<ReceiptText className="w-3.5 h-3.5" />}>
                        Emitir factura
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recibo && <ReciboPOS facturaId={recibo} onCerrar={() => setRecibo(null)} />}
    </div>
  );
};
