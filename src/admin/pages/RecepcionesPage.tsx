import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Building2, CalendarClock, CheckCircle2, FileText, Plus, Search,
  Store, Trash2, Truck, X,
} from 'lucide-react';
import {
  recepcionService, proveedorService, catalogoService, formatearCOP,
  ETIQUETA_RECEPCION, COLOR_RECEPCION,
  type Recepcion, type Proveedor, type ProductoCatalogo,
} from '../../services/catalogoAdmin';
import { inventarioService, formatearFecha, hoyISO, type ResumenPunto } from '../../services/backoffice';
import { useAdminAuth } from '../AdminAuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';

/**
 * Recepción de mercancía.
 *
 * Es el único punto por donde el costo entra al sistema. Por eso la pantalla
 * insiste en el documento del proveedor: dentro de seis meses, cuando alguien
 * pregunte por qué un cuñete costó lo que costó, la respuesta tiene que estar
 * aquí y no en la memoria de quien lo recibió.
 *
 * El borrador no toca el inventario. Se confirma una sola vez, y entonces
 * entran las unidades y se recalcula el costo promedio de la bodega.
 */
export const RecepcionesPage: React.FC = () => {
  const { puede } = useAdminAuth();
  const [recepciones, setRecepciones] = useState<Recepcion[]>([]);
  const [abierta, setAbierta] = useState<Recepcion | null>(null);
  const [puntos, setPuntos] = useState<ResumenPunto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [creando, setCreando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [nuevoProveedor, setNuevoProveedor] = useState(false);

  const [borrador, setBorrador] = useState({
    puntoId: '', proveedorId: '', documento: '', fecha: hoyISO(), notas: '',
  });
  const [linea, setLinea] = useState({ variantId: '', cantidad: '', costo: '' });
  const [prov, setProv] = useState({ nombre: '', nit: '', telefono: '', ciudad: '' });

  const escribe = puede('inventory.write');

  const cargar = async () => {
    setCargando(true);
    try {
      const [recs, pts, provs, prods] = await Promise.all([
        recepcionService.listar(),
        inventarioService.porPunto(),
        proveedorService.listar(),
        catalogoService.productos(),
      ]);
      setRecepciones(recs);
      setPuntos(pts);
      setProveedores(provs);
      setProductos(prods);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar las recepciones.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  /** Todas las presentaciones publicables, para elegir qué llegó. */
  const presentaciones = useMemo(
    () =>
      productos.flatMap((p) =>
        p.presentaciones.map((v) => ({
          id: v.id,
          etiqueta: `${p.nombre} · ${v.label}${v.sku ? ` (${v.sku})` : ''}`,
        })),
      ),
    [productos],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return recepciones;
    return recepciones.filter(
      (r) =>
        r.numero.toLowerCase().includes(q) ||
        (r.proveedor ?? '').toLowerCase().includes(q) ||
        (r.documento ?? '').toLowerCase().includes(q) ||
        r.punto.toLowerCase().includes(q),
    );
  }, [recepciones, busqueda]);

  const refrescar = async (id?: string) => {
    const recs = await recepcionService.listar();
    setRecepciones(recs);
    if (id) setAbierta(await recepcionService.detalle(id));
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!borrador.puntoId) {
      setError('Indica a qué punto de venta llega la mercancía.');
      return;
    }
    setOcupado(true);
    try {
      const id = await recepcionService.crear({
        puntoId: borrador.puntoId,
        proveedorId: borrador.proveedorId || undefined,
        documento: borrador.documento || undefined,
        fecha: borrador.fecha || undefined,
        notas: borrador.notas || undefined,
      });
      setCreando(false);
      setBorrador({ puntoId: '', proveedorId: '', documento: '', fecha: hoyISO(), notas: '' });
      await refrescar(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear la recepción.');
    } finally {
      setOcupado(false);
    }
  };

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abierta) return;
    setError('');
    const cantidad = Number(linea.cantidad);
    const costo = Number(linea.costo);
    if (!linea.variantId) return setError('Elige qué presentación llegó.');
    if (!Number.isFinite(cantidad) || cantidad <= 0) return setError('La cantidad debe ser mayor que cero.');
    if (!Number.isFinite(costo) || costo < 0) return setError('El costo unitario no es válido.');

    setOcupado(true);
    try {
      await recepcionService.agregarLinea({
        recepcionId: abierta.id,
        variantId: linea.variantId,
        cantidad,
        costoUnitario: costo,
      });
      setLinea({ variantId: '', cantidad: '', costo: '' });
      await refrescar(abierta.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible agregar la línea.');
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    if (!abierta) return;
    setError('');
    setOcupado(true);
    try {
      const r = await recepcionService.confirmar(abierta.id);
      setAviso(
        `Recepción confirmada: ${r.lineas} ${r.lineas === 1 ? 'línea' : 'líneas'} por ${formatearCOP(r.total)}. ` +
          'Las unidades ya están en el inventario y el costo promedio quedó actualizado.',
      );
      await refrescar(abierta.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible confirmar.');
    } finally {
      setOcupado(false);
    }
  };

  const guardarProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      await proveedorService.guardar(prov);
      setProveedores(await proveedorService.listar());
      setProv({ nombre: '', nit: '', telefono: '', ciudad: '' });
      setNuevoProveedor(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el proveedor.');
    } finally {
      setOcupado(false);
    }
  };

  // ── Detalle de una recepción ──────────────────────────────────────────────
  if (abierta) {
    const enBorrador = abierta.estado === 'BORRADOR';
    const total = abierta.lineas.reduce((a, l) => a + l.subtotal, 0);

    return (
      <div className="space-y-5">
        <button
          onClick={() => { setAbierta(null); setAviso(''); }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a recepciones
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {abierta.numero}
              </h1>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${COLOR_RECEPCION[abierta.estado]}`}>
                {ETIQUETA_RECEPCION[abierta.estado]}
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {abierta.punto} · {formatearFecha(abierta.fecha)}
              {abierta.proveedor ? ` · ${abierta.proveedor}` : ''}
              {abierta.documento ? ` · ${abierta.documento}` : ''}
            </p>
          </div>

          {enBorrador && escribe && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={ocupado}
                onClick={async () => {
                  setOcupado(true);
                  try {
                    await recepcionService.anular(abierta.id);
                    await refrescar(abierta.id);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'No fue posible anular.');
                  } finally {
                    setOcupado(false);
                  }
                }}
              >
                Anular
              </Button>
              <Button
                variant="pintuco"
                size="sm"
                isLoading={ocupado}
                disabled={abierta.lineas.length === 0}
                leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                onClick={() => void confirmar()}
              >
                Confirmar recepción
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}
        {aviso && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium flex items-start gap-2">
            <span className="flex-1">{aviso}</span>
            <button onClick={() => setAviso('')} aria-label="Cerrar aviso">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {enBorrador && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg font-medium">
            Esta recepción todavía <strong>no ha entrado al inventario</strong>. Revisa las líneas
            contra el documento del proveedor y confírmala cuando cuadre.
          </div>
        )}

        {/* Líneas */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">Mercancía recibida</h3>
            <span className="text-sm font-bold text-slate-700 tabular-nums">
              {formatearCOP(abierta.estado === 'CONFIRMADA' ? abierta.total : total)}
            </span>
          </div>

          {abierta.lineas.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">
              Todavía no hay líneas. Agrega lo que llegó, con su costo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                    <th className="text-left px-5 py-2.5">Producto</th>
                    <th className="text-right px-3 py-2.5">Cantidad</th>
                    <th className="text-right px-3 py-2.5">Costo unitario</th>
                    <th className="text-right px-3 py-2.5">Subtotal</th>
                    {enBorrador && escribe && <th className="px-5 py-2.5"></th>}
                  </tr>
                </thead>
                <tbody>
                  {abierta.lineas.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-900">{l.producto}</p>
                        <p className="text-xs text-slate-500">
                          {[l.presentacion, l.sku].filter(Boolean).join(' · ')}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{l.cantidad}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                        {formatearCOP(l.costoUnitario)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">
                        {formatearCOP(l.subtotal)}
                      </td>
                      {enBorrador && escribe && (
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={async () => {
                              await recepcionService.quitarLinea(l.id);
                              await refrescar(abierta.id);
                            }}
                            aria-label={`Quitar ${l.producto}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Agregar línea */}
        {enBorrador && escribe && (
          <form onSubmit={agregar} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">Agregar lo que llegó</h3>

            <Select
              label="Presentación"
              options={[
                { value: '', label: 'Elige el producto y su presentación…' },
                ...presentaciones.map((p) => ({ value: p.id, label: p.etiqueta })),
              ]}
              value={linea.variantId}
              onChange={(e) => setLinea({ ...linea, variantId: e.target.value })}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Cantidad"
                type="number"
                min="1"
                value={linea.cantidad}
                onChange={(e) => setLinea({ ...linea, cantidad: e.target.value })}
              />
              <Input
                label="Costo unitario (sin IVA)"
                inputMode="decimal"
                value={linea.costo}
                onChange={(e) => setLinea({ ...linea, costo: e.target.value })}
                placeholder="Ej. 98000"
              />
            </div>
            <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
              Es lo que Pintuco paga al proveedor, no lo que se le cobra al cliente. De aquí sale
              el costo promedio de la bodega y, con él, la rentabilidad.
            </p>

            <Button type="submit" variant="outline" size="sm" isLoading={ocupado} leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Agregar a la recepción
            </Button>
          </form>
        )}

        {abierta.estado === 'CONFIRMADA' && (
          <p className="text-xs text-slate-500">
            Confirmada por {abierta.confirmadaPor ?? '—'}. Una recepción confirmada no se modifica:
            si llegó mercancía de menos, corrígelo con un ajuste por conteo en Inventario, que deja
            su propio rastro.
          </p>
        )}
      </div>
    );
  }

  // ── Listado ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Recepciones</h1>
          <p className="text-sm text-slate-500 font-medium">
            Entrada de mercancía. Es donde el costo llega al sistema.
          </p>
        </div>
        {escribe && !creando && (
          <Button variant="pintuco" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreando(true)}>
            Nueva recepción
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      {creando && (
        <form onSubmit={crear} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900">Nueva recepción</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Punto de venta que recibe"
              options={[
                { value: '', label: 'Elige la bodega…' },
                ...puntos.map((p) => ({ value: p.locationId, label: `${p.punto} · ${p.ciudad}` })),
              ]}
              value={borrador.puntoId}
              onChange={(e) => setBorrador({ ...borrador, puntoId: e.target.value })}
              required
            />
            <Select
              label="Proveedor"
              options={[
                { value: '', label: 'Sin proveedor' },
                ...proveedores.map((p) => ({ value: p.id, label: p.nombre })),
              ]}
              value={borrador.proveedorId}
              onChange={(e) => setBorrador({ ...borrador, proveedorId: e.target.value })}
            />
          </div>

          <button
            type="button"
            onClick={() => setNuevoProveedor((v) => !v)}
            className="text-xs font-semibold text-[#004F9F] hover:underline"
          >
            {nuevoProveedor ? 'Cancelar proveedor nuevo' : '+ Registrar un proveedor nuevo'}
          </button>

          {nuevoProveedor && (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Razón social"
                  value={prov.nombre}
                  onChange={(e) => setProv({ ...prov, nombre: e.target.value })}
                  leftIcon={<Building2 className="w-4 h-4" />}
                />
                <Input label="NIT" value={prov.nit} onChange={(e) => setProv({ ...prov, nit: e.target.value })} />
                <Input label="Teléfono" value={prov.telefono} onChange={(e) => setProv({ ...prov, telefono: e.target.value })} />
                <Input label="Ciudad" value={prov.ciudad} onChange={(e) => setProv({ ...prov, ciudad: e.target.value })} />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                isLoading={ocupado}
                disabled={!prov.nombre.trim()}
                onClick={(e) => void guardarProveedor(e as unknown as React.FormEvent)}
              >
                Guardar proveedor
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Factura o remisión del proveedor"
              value={borrador.documento}
              onChange={(e) => setBorrador({ ...borrador, documento: e.target.value })}
              placeholder="Ej. FV-44210"
              leftIcon={<FileText className="w-4 h-4" />}
            />
            <Input
              label="Fecha de recibo"
              type="date"
              value={borrador.fecha}
              onChange={(e) => setBorrador({ ...borrador, fecha: e.target.value })}
              leftIcon={<CalendarClock className="w-4 h-4" />}
            />
          </div>
          <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
            El número del documento es lo que permite reconciliar con el papel cuando algo no
            cuadra. Vale la pena escribirlo aunque no sea obligatorio.
          </p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreando(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="pintuco" isLoading={ocupado}>
              Crear y agregar mercancía
            </Button>
          </div>
        </form>
      )}

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por número, proveedor, factura o bodega…"
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {cargando ? (
          <p className="text-sm text-slate-400 text-center py-14">Cargando recepciones…</p>
        ) : filtradas.length === 0 ? (
          <div className="text-center py-14 px-6">
            <Truck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">
              {recepciones.length === 0 ? 'Todavía no hay recepciones' : 'Ninguna coincide'}
            </p>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
              {recepciones.length === 0
                ? 'Cuando llegue mercancía de un proveedor, créala aquí con su factura y su costo. Al confirmarla entra al inventario y actualiza el costo promedio de la bodega.'
                : 'Prueba con otro texto.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="text-left px-5 py-3">Recepción</th>
                  <th className="text-left px-3 py-3">Proveedor</th>
                  <th className="text-left px-3 py-3">Bodega</th>
                  <th className="text-left px-3 py-3">Estado</th>
                  <th className="text-right px-3 py-3">Total</th>
                  <th className="text-right px-5 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((r) => (
                  <tr
                    key={r.id}
                    onClick={async () => { setAviso(''); setAbierta(await recepcionService.detalle(r.id)); }}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{r.numero}</p>
                      {r.documento && <p className="text-xs text-slate-500">{r.documento}</p>}
                    </td>
                    <td className="px-3 py-3.5 text-slate-700">{r.proveedor ?? '—'}</td>
                    <td className="px-3 py-3.5 text-slate-600 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Store className="w-3 h-3" /> {r.punto}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COLOR_RECEPCION[r.estado]}`}>
                        {ETIQUETA_RECEPCION[r.estado]}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums font-semibold">
                      {r.estado === 'CONFIRMADA' ? formatearCOP(r.total) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-slate-500">
                      {formatearFecha(r.fecha)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
