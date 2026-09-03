import React, { useEffect, useState } from 'react';
import { Ban, FileText, Printer, ReceiptText, Search } from 'lucide-react';
import { facturaService, formatearCOP, type FacturaLista } from '../../services/backoffice';
import { useAdminAuth } from '../AdminAuthContext';
import { ReciboPOS } from '../ReciboPOS';
import { AnularFactura } from '../AnularFactura';
import { Button } from '../../components/common/Button';
import { useSedes } from '../SedeContext';
import { ExportarBoton } from '../ExportarBoton';
import { IconoModulo } from '../IconosDeModulo';
import {
  ContadorPorSede, sedeVisible, useAislamientoDeSede,
} from '../ContadorPorSede';

/** Facturación POS: emitir, consultar y reimprimir. */
interface FacturacionPageProps {
  /** Factura que pide la URL, por su NÚMERO (`/facturacion/POS-000004`). */
  idAbierto?: string | null;
  onAbrir?: (numero: string) => void;
  onCerrar?: () => void;
}

export const FacturacionPage: React.FC<FacturacionPageProps> = ({
  idAbierto, onAbrir, onCerrar,
}) => {
  const { puede } = useAdminAuth();
  const { filtroSedes, permitidas } = useSedes();
  const [anio, setAnio] = useState<string>('TODOS');
  const { sedeAislada, aislar, filtroEfectivo } = useAislamientoDeSede();
  const [facturas, setFacturas] = useState<FacturaLista[]>([]);
  const [pendientes, setPendientes] = useState<Array<{ id: string; numero: string; cliente: string; total: number }>>([]);
  const [pestana, setPestana] = useState<'emitidas' | 'pendientes'>('emitidas');
  /** Factura que se está anulando. */
  const [anulando, setAnulando] = useState<FacturaLista | null>(null);
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

  /**
   * Abre la factura que pide la URL en cuanto la lista está cargada.
   *
   * `abrio` evita que cerrar el recibo lo reabra: el id sigue en la URL hasta
   * que `onCerrar` lo quita, y sin la guarda el efecto volvería a dispararse.
   */
  const [abrio, setAbrio] = useState<string | null>(null);
  useEffect(() => {
    if (!idAbierto || abrio === idAbierto || facturas.length === 0) return;
    setAbrio(idAbierto);
    const f = facturas.find((x) => x.numero === idAbierto);
    if (f) setRecibo(f.id);
    else setError(`No se encontró la factura ${idAbierto}.`);
  }, [idAbierto, abrio, facturas]);

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

  // Lo que se ve queda acotado a las sedes ACTIVAS del selector. RLS ya limitó
  // las filas a lo permitido; esto es la selección de pantalla.
  // DOS listas a propósito:
  //   `porSede`  — solo la selección GLOBAL: es la que alimenta los contadores,
  //                para que las demás sedes no aparezcan en 0 al aislar una.
  //   `visibles` — global ∩ aislamiento local: es lo que se muestra.
  /**
   * Años con facturas, para el filtro. Se derivan de los datos y no se
   * escriben a mano: una lista fija quedaría desactualizada en enero.
   */
  // Se arma con un bucle y no con `[...new Set(...)]`: el proyecto compila sin
  // `strictNullChecks` (ver tsconfig.json) y ahí la inferencia del `Set`
  // degenera a `unknown`. Así queda explícito y no depende de eso.
  const anios: string[] = [];
  for (const f of facturas) {
    const a = f.emitida.slice(0, 4);
    if (!anios.includes(a)) anios.push(a);
  }
  anios.sort((a, b) => b.localeCompare(a));

  const porAnio = (f: FacturaLista) => anio === 'TODOS' || f.emitida.startsWith(anio);

  const porSede = facturas
    .filter((f) => sedeVisible(f.locationId, filtroSedes))
    .filter(porAnio);
  const visibles = facturas
    .filter((f) => sedeVisible(f.locationId, filtroEfectivo))
    .filter(porAnio);
  const totalIva = visibles.reduce((s, f) => s + f.iva, 0);
  const totalFacturado = visibles.reduce((s, f) => s + f.total, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="ReceiptText" /> Facturación
          </h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Documento equivalente POS con IVA desglosado. No es facturación electrónica DIAN.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Facturas emitidas', String(visibles.length)],
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

      {/* Con varias sedes activas, el total no dice cómo se reparte: la
          comparación entre sedes es justo lo que se busca al activar varias. */}
      <ContadorPorSede
        filas={porSede}
        sustantivo="Facturas"
        sedeAislada={sedeAislada}
        onAislar={aislar}
      />

      <div className="flex flex-wrap gap-2 items-center">
        {/* Año: el caso concreto es «descargar el listado de facturas 2025». */}
        {anios.length > 0 && (
          <select
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200
                       bg-white text-slate-700 cursor-pointer"
          >
            <option value="TODOS">Todos los años</option>
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}

        {/* Exporta EXACTAMENTE lo que se ve: año, sede y pestaña incluidos. */}
        <ExportarBoton<FacturaLista>
          filas={visibles}
          nombre={`facturas${anio === 'TODOS' ? '' : '-' + anio}`}
          titulo="Listado de facturas"
          filtros={[
            anio === 'TODOS' ? 'Todos los años' : `Año ${anio}`,
            sedeAislada
              ? (permitidas.find((s) => s.id === sedeAislada)?.nombre ?? 'Una sede')
              : 'Sedes activas',
          ].join(' · ')}
          columnas={[
            { titulo: 'Factura', valor: (f) => f.numero },
            { titulo: 'Pedido', valor: (f) => f.pedido },
            { titulo: 'Cliente', valor: (f) => f.cliente },
            { titulo: 'Emitida', valor: (f) => fecha(f.emitida) },
            { titulo: 'Estado', valor: (f) => f.estado },
            { titulo: 'Base gravable', valor: (f) => f.base, numerica: true },
            { titulo: 'IVA', valor: (f) => f.iva, numerica: true },
            { titulo: 'Total', valor: (f) => f.total, numerica: true },
          ]}
        />

        <div className="flex gap-1.5">
          {([['emitidas', `Emitidas (${visibles.length})`], ['pendientes', `Por facturar (${pendientes.length})`]] as const).map(([v, t]) => (
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
              {visibles.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                  <ReceiptText className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                  Todavía no hay facturas emitidas.
                </td></tr>
              )}
              {visibles.map((f) => (
                <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-bold text-slate-900">{f.numero}</td>
                  <td className="px-4 py-3 text-slate-700">{f.cliente}</td>
                  <td className="px-4 py-3 text-slate-500">{f.pedido}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatearCOP(f.base)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatearCOP(f.iva)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold">{formatearCOP(f.total)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fecha(f.emitida)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* El estado se ve en la fila: una factura anulada que
                          se lee igual que una válida es la forma más fácil de
                          cobrar dos veces. */}
                      {f.estado === 'ANULADA' && (
                        <span className="text-[10px] font-extrabold uppercase tracking-wider
                                         px-2 py-1 rounded-md bg-rose-50 text-rose-700
                                         border border-rose-200">
                          Anulada
                        </span>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { setRecibo(f.id); onAbrir?.(f.numero); }}
                        leftIcon={<Printer className="w-3.5 h-3.5" />}>Recibo</Button>
                      {puede('invoices.void') && f.estado !== 'ANULADA' && (
                        <Button variant="ghost" size="sm" onClick={() => setAnulando(f)}
                          className="text-rose-600 hover:bg-rose-50"
                          leftIcon={<Ban className="w-3.5 h-3.5" />}>
                          Anular
                        </Button>
                      )}
                    </div>
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

      {recibo && (
        <ReciboPOS
          facturaId={recibo}
          onCerrar={() => { setRecibo(null); onCerrar?.(); }}
        />
      )}

      {anulando && (
        <AnularFactura
          factura={anulando}
          onCerrar={() => setAnulando(null)}
          onAnulada={() => { setAnulando(null); void cargar(); }}
        />
      )}
    </div>
  );
};
