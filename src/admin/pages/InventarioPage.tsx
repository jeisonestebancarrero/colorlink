import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRightLeft, Boxes, ChevronDown, ChevronRight,
  MapPin, PackageX, Palette, Search, Store, Target, X,
} from 'lucide-react';
import {
  inventarioService, situacion, signoMovimiento, formatearFecha, sinClasificar, coincideExistencia,
  TIPOS_MOVIMIENTO, ETIQUETA_MOVIMIENTO,
  type ColorInventario, type Existencia, type Movimiento, type ResumenPunto, type TipoMovimiento,
} from '../../services/backoffice';
import { useSedes } from '../SedeContext';
import { ExportarBoton } from '../ExportarBoton';
import { useAdminAuth } from '../AdminAuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { FotoPunto } from '../../components/common/FotoPunto';
import { IconoModulo } from '../IconosDeModulo';

const cantidad = (n: number) => n.toLocaleString('es-CO');

/** Inventario navegado por bodega y luego por categoría: la bodega es la unidad de trabajo. */
export const InventarioPage: React.FC = () => {
  const { filtroSedes } = useSedes();
  const { puede } = useAdminAuth();

  const [puntos, setPuntos] = useState<ResumenPunto[]>([]);
  const [punto, setPunto] = useState<ResumenPunto | null>(null);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [pestana, setPestana] = useState<'existencias' | 'movimientos'>('existencias');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroColor, setFiltroColor] = useState('');
  const [soloAtencion, setSoloAtencion] = useState(false);
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const [moviendo, setMoviendo] = useState<Existencia | null>(null);
  const [trasladando, setTrasladando] = useState<Existencia | null>(null);
  const [reordenando, setReordenando] = useState<Existencia | null>(null);
  const [clasificando, setClasificando] = useState<Existencia | null>(null);

  const escribe = puede('inventory.write');

  const cargarPuntos = async () => {
    setCargando(true);
    try {
      setPuntos(await inventarioService.porPunto());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar el inventario.');
    } finally {
      setCargando(false);
    }
  };

  const cargarPunto = async (p: ResumenPunto) => {
    setCargando(true);
    setError('');
    try {
      const [ex, mv] = await Promise.all([
        inventarioService.existencias({ locationId: p.locationId }),
        inventarioService.movimientos({ locationId: p.locationId }),
      ]);
      setExistencias(ex);
      setMovimientos(mv);
      setPunto(p);
      setPestana('existencias');
      setBusqueda('');
      setFiltroColor('');
      setSoloAtencion(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible abrir el punto de venta.');
    } finally {
      setCargando(false);
    }
  };

  const refrescar = async () => {
    if (!punto) return;
    const [ex, mv, ps] = await Promise.all([
      inventarioService.existencias({ locationId: punto.locationId }),
      inventarioService.movimientos({ locationId: punto.locationId }),
      inventarioService.porPunto(),
    ]);
    setExistencias(ex);
    setMovimientos(mv);
    setPuntos(ps);
    setPunto(ps.find((p) => p.locationId === punto.locationId) ?? punto);
  };

  useEffect(() => { void cargarPuntos(); }, []);

  const filtradas = useMemo(() => {
    const c = filtroColor.trim().toLowerCase();
    return existencias.filter((e) => {
      // El filtro de color solo mira el color: nombre, código o «sin clasificar».
      const porColor =
        !c ||
        (e.color?.nombre ?? '').toLowerCase().includes(c) ||
        (e.color?.codigo ?? '').toLowerCase().includes(c) ||
        (sinClasificar(e) && 'sin clasificar'.includes(c));
      const porAtencion = !soloAtencion || situacion(e) !== 'ok';
      return coincideExistencia(e, busqueda) && porColor && porAtencion;
    });
  }, [existencias, busqueda, filtroColor, soloAtencion]);

  /** Agrupado por categoría. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, Existencia[]>();
    for (const e of filtradas) mapa.set(e.categoria, [...(mapa.get(e.categoria) ?? []), e]);
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [filtradas]);

  const alternarGrupo = (categoria: string) => {
    setPlegados((prev) => {
      const s = new Set(prev);
      if (s.has(categoria)) s.delete(categoria);
      else s.add(categoria);
      return s;
    });
  };

  const puntosVisibles = puntos.filter(
    (p) => !filtroSedes || filtroSedes.includes(p.locationId)
  );

  // Tablero de puntos de venta: solo ofrece las sedes activas del selector global.
  if (!punto) {
    const total = puntosVisibles.reduce(
      (acc, p) => ({
        disponible: acc.disponible + p.disponible,
        reservado: acc.reservado + p.reservado,
        agotadas: acc.agotadas + p.agotadas,
        bajo: acc.bajo + p.bajoReorden,
      }),
      { disponible: 0, reservado: 0, agotadas: 0, bajo: 0 },
    );

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="Package" /> Inventario
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Entra a un punto de venta para ver y mover sus existencias.
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Indicador rotulo="Disponible" valor={cantidad(total.disponible)} sufijo="unidades" />
          <Indicador rotulo="Reservado" valor={cantidad(total.reservado)} sufijo="en pedidos" />
          <Indicador
            rotulo="Agotadas"
            valor={cantidad(total.agotadas)}
            sufijo="referencias"
            alerta={total.agotadas > 0}
          />
          <Indicador
            rotulo="Bajo reorden"
            valor={cantidad(total.bajo)}
            sufijo="referencias"
            aviso={total.bajo > 0}
          />
        </div>

        {cargando ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-sm text-slate-400 text-center py-14">Cargando puntos de venta…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {puntosVisibles.map((p) => (
              <button
                key={p.locationId}
                onClick={() => void cargarPunto(p)}
                className="group flex flex-col text-left bg-white rounded-xl border border-slate-200 hover:border-[#004F9F] shadow-2xs hover:shadow-lg transition-all overflow-hidden"
              >
                <FotoPunto
                  referencia={p.referencia}
                  urlRemota={p.imageUrl}
                  ciudad={p.ciudad}
                  alto="h-24"
                />

                {/* Alinea las cifras aunque el nombre ocupe dos renglones. */}
                <div className="p-5 flex flex-col flex-1">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-900 leading-snug">{p.punto}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" /> {p.ciudad}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t border-slate-100">
                  <Mini rotulo="Referencias" valor={cantidad(p.referencias)} />
                  <Mini rotulo="Disponible" valor={cantidad(p.disponible)} />
                  <Mini rotulo="Reservado" valor={cantidad(p.reservado)} />
                </div>

                {(p.agotadas > 0 || p.bajoReorden > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {p.agotadas > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                        <PackageX className="w-3 h-3" /> {p.agotadas} agotada
                        {p.agotadas > 1 ? 's' : ''}
                      </span>
                    )}
                    {p.bajoReorden > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <AlertTriangle className="w-3 h-3" /> {p.bajoReorden} bajo reorden
                      </span>
                    )}
                  </div>
                )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Dentro de un punto de venta
  const enAtencion = existencias.filter((e) => situacion(e) !== 'ok').length;
  const porClasificar = existencias.filter((e) => sinClasificar(e) && e.disponible > 0).length;

  return (
    <div className="space-y-5">
      <button
        onClick={() => setPunto(null)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Todos los puntos de venta
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{punto.punto}</h1>
          <p className="text-sm text-slate-500 font-medium flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {punto.ciudad} · {punto.referencias} referencias
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Indicador rotulo="Disponible" valor={cantidad(punto.disponible)} sufijo="unidades" />
        <Indicador rotulo="Reservado" valor={cantidad(punto.reservado)} sufijo="en pedidos" />
        <Indicador rotulo="Neto" valor={cantidad(punto.neto)} sufijo="libre para vender" />
        <Indicador
          rotulo="Requieren atención"
          valor={cantidad(punto.agotadas + punto.bajoReorden)}
          sufijo="referencias"
          alerta={punto.agotadas > 0}
          aviso={punto.agotadas === 0 && punto.bajoReorden > 0}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(['existencias', 'movimientos'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPestana(p)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              pestana === p
                ? 'bg-[#004F9F] text-white shadow-2xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {p === 'existencias' ? 'Existencias' : 'Movimientos'}
          </button>
        ))}
      </div>

      {pestana === 'existencias' ? (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto, presentación, código, categoría o color…"
                className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
              />
            </div>
            <div className="relative w-full sm:w-56">
              <Palette className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={filtroColor}
                onChange={(e) => setFiltroColor(e.target.value)}
                placeholder="Filtrar por color…"
                aria-label="Filtrar por color"
                className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
              />
            </div>
            <button
              onClick={() => setSoloAtencion((v) => !v)}
              className={`px-4 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                soloAtencion
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Solo lo que requiere atención ({enAtencion})
            </button>

            {/* Exporta las existencias visibles del punto abierto. */}
            <ExportarBoton<Existencia>
              filas={filtradas}
              nombre={`inventario-${punto?.ciudad ?? 'punto'}`}
              titulo={`Existencias · ${punto?.punto ?? ''}`}
              filtros={[
                punto?.punto ?? '',
                soloAtencion ? 'Solo lo que requiere atención' : 'Todas las referencias',
                busqueda.trim() ? `Búsqueda: ${busqueda.trim()}` : '',
                filtroColor.trim() ? `Color: ${filtroColor.trim()}` : '',
              ].filter(Boolean).join(' · ')}
              columnas={[
                { titulo: 'Código', valor: (e) => e.codigo },
                { titulo: 'Producto', valor: (e) => e.producto },
                { titulo: 'Presentación', valor: (e) => e.presentacion },
                { titulo: 'Color', valor: (e) => textoColor(e) },
                { titulo: 'Código de color', valor: (e) => e.color?.codigo ?? '' },
                { titulo: 'Categoría', valor: (e) => e.categoria },
                { titulo: 'Marca', valor: (e) => e.marca },
                { titulo: 'Bodega', valor: (e) => e.bodega },
                { titulo: 'Ciudad', valor: (e) => e.ciudad },
                { titulo: 'Disponible', valor: (e) => e.disponible, numerica: true },
                { titulo: 'Reservado', valor: (e) => e.reservado, numerica: true },
                { titulo: 'Neto', valor: (e) => e.neto, numerica: true },
                { titulo: 'Mínimo', valor: (e) => e.minimo, numerica: true },
              ]}
            />
          </div>

          {porClasificar > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg font-medium">
              {porClasificar} referencia{porClasificar > 1 ? 's tienen' : ' tiene'} existencias sin
              clasificar por color. Usa «Clasificar» en esas filas para asignarles su color real.
            </div>
          )}

          {grupos.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs text-center py-14 px-6">
              <p className="text-sm font-bold text-slate-700">Nada que mostrar</p>
              <p className="text-sm text-slate-500 mt-1.5">
                {soloAtencion
                  ? 'Ninguna referencia de este punto está agotada ni bajo su punto de reorden.'
                  : 'Ninguna referencia coincide con la búsqueda.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {grupos.map(([categoria, filas]) => {
                const plegado = plegados.has(categoria);
                const alerta = filas.filter((f) => situacion(f) !== 'ok').length;
                return (
                  <div
                    key={categoria}
                    className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden"
                  >
                    <button
                      onClick={() => alternarGrupo(categoria)}
                      className="w-full flex items-center gap-2.5 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                    >
                      {plegado ? (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                      <Boxes className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-extrabold text-slate-900">{categoria}</span>
                      <span className="text-xs text-slate-400">
                        · {filas.length} referencia{filas.length > 1 ? 's' : ''}
                      </span>
                      {alerta > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          {alerta} por reponer
                        </span>
                      )}
                      <span className="ml-auto text-xs font-semibold text-slate-500 tabular-nums">
                        {cantidad(filas.reduce((a, f) => a + f.neto, 0))} u. netas
                      </span>
                    </button>

                    {!plegado && (
                      <div className="overflow-x-auto border-t border-slate-100">
                        <table className="w-full text-sm min-w-[880px]">
                          <thead>
                            <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                              <th className="text-left px-5 py-2.5">Producto</th>
                              <th className="text-left px-3 py-2.5">Color</th>
                              <th className="text-right px-3 py-2.5">Disponible</th>
                              <th className="text-right px-3 py-2.5">Reservado</th>
                              <th className="text-right px-3 py-2.5">Neto</th>
                              <th className="text-right px-3 py-2.5">Reorden</th>
                              <th className="text-right px-5 py-2.5">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filas.map((e) => {
                              const s = situacion(e);
                              const pendiente = sinClasificar(e);
                              return (
                                <tr
                                  key={`${e.variantId}-${e.locationId}-${e.colorId ?? 'sin-color'}`}
                                  className={`border-t border-slate-100 ${pendiente ? 'bg-amber-50/60' : ''}`}
                                >
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`w-1.5 h-8 rounded-full shrink-0 ${
                                          s === 'agotado'
                                            ? 'bg-rose-500'
                                            : s === 'bajo'
                                              ? 'bg-amber-400'
                                              : 'bg-emerald-400'
                                        }`}
                                      />
                                      <div className="min-w-0">
                                        <p className="font-semibold text-slate-900">{e.producto}</p>
                                        <p className="text-xs text-slate-500">
                                          {[e.presentacion, e.codigo].filter(Boolean).join(' · ')}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3">
                                    <CeldaColor existencia={e} />
                                  </td>
                                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                                    {cantidad(e.disponible)}
                                  </td>
                                  <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                                    {cantidad(e.reservado)}
                                  </td>
                                  <td className="px-3 py-3 text-right">
                                    <span
                                      className={`inline-block tabular-nums font-bold px-2 py-0.5 rounded-full text-xs border ${
                                        s === 'agotado'
                                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                                          : s === 'bajo'
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      }`}
                                    >
                                      {cantidad(e.neto)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-right text-xs tabular-nums text-slate-500">
                                    {e.minimo > 0 ? cantidad(e.minimo) : '—'}
                                  </td>
                                  <td className="px-5 py-3">
                                    {escribe && (
                                      <div className="flex justify-end gap-1.5">
                                        {pendiente && e.neto > 0 && (
                                          <Button size="sm" variant="outline" onClick={() => setClasificando(e)}>
                                            Clasificar
                                          </Button>
                                        )}
                                        <button
                                          onClick={() => setReordenando(e)}
                                          title="Punto de reorden"
                                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-[#004F9F] hover:bg-slate-50"
                                        >
                                          <Target className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => setTrasladando(e)}
                                          title="Trasladar a otro punto"
                                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-[#004F9F] hover:bg-slate-50"
                                        >
                                          <ArrowRightLeft className="w-3.5 h-3.5" />
                                        </button>
                                        <Button size="sm" variant="outline" onClick={() => setMoviendo(e)}>
                                          Movimiento
                                        </Button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          {movimientos.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-14">
              Este punto de venta todavía no registra movimientos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                    <th className="text-left px-5 py-2.5">Fecha</th>
                    <th className="text-left px-3 py-2.5">Movimiento</th>
                    <th className="text-left px-3 py-2.5">Producto</th>
                    <th className="text-left px-3 py-2.5">Color</th>
                    <th className="text-right px-3 py-2.5">Cantidad</th>
                    <th className="text-right px-3 py-2.5">Saldo</th>
                    <th className="text-left px-5 py-2.5">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatearFecha(m.fecha, {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-bold text-slate-700">
                          {ETIQUETA_MOVIMIENTO[m.tipo] ?? m.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{m.producto}</td>
                      <td className="px-3 py-3">
                        {m.color ? <EtiquetaColor color={m.color} /> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">
                        {(() => {
                          const signo = signoMovimiento(m.tipo);
                          // El ajuste por conteo fija el saldo: va sin signo.
                          if (signo === 0) {
                            return (
                              <span className="text-slate-600">
                                {cantidad(Math.abs(m.cantidad))} <span className="text-slate-400">dif.</span>
                              </span>
                            );
                          }
                          return (
                            <span className={signo < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                              {signo < 0 ? '−' : '+'}
                              {cantidad(Math.abs(m.cantidad))}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                        {cantidad(m.saldo)}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{m.autor ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {moviendo && (
        <MovimientoModal
          existencia={moviendo}
          existencias={existencias}
          onCerrar={() => setMoviendo(null)}
          onListo={async () => {
            setMoviendo(null);
            await refrescar();
          }}
        />
      )}

      {trasladando && (
        <TrasladoModal
          existencia={trasladando}
          existencias={existencias}
          puntos={puntos}
          onCerrar={() => setTrasladando(null)}
          onListo={async () => {
            setTrasladando(null);
            await refrescar();
          }}
        />
      )}

      {reordenando && (
        <ReordenModal
          existencia={reordenando}
          onCerrar={() => setReordenando(null)}
          onListo={async () => {
            setReordenando(null);
            await refrescar();
          }}
        />
      )}

      {clasificando && (
        <ClasificarModal
          existencia={clasificando}
          existencias={existencias}
          onCerrar={() => setClasificando(null)}
          onListo={async () => {
            setClasificando(null);
            await refrescar();
          }}
        />
      )}
    </div>
  );
};

// Piezas
const Indicador: React.FC<{
  rotulo: string;
  valor: string;
  sufijo?: string;
  alerta?: boolean;
  aviso?: boolean;
}> = ({ rotulo, valor, sufijo, alerta, aviso }) => (
  <div
    className={`bg-white rounded-xl border shadow-2xs p-4 ${
      alerta ? 'border-rose-200' : aviso ? 'border-amber-200' : 'border-slate-200'
    }`}
  >
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{rotulo}</p>
    <p
      className={`text-2xl font-extrabold tabular-nums mt-1 ${
        alerta ? 'text-rose-700' : aviso ? 'text-amber-700' : 'text-slate-900'
      }`}
    >
      {valor}
    </p>
    {sufijo && <p className="text-[11px] text-slate-400 font-medium">{sufijo}</p>}
  </div>
);

const Mini: React.FC<{ rotulo: string; valor: string }> = ({ rotulo, valor }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{rotulo}</p>
    <p className="text-sm font-bold text-slate-800 tabular-nums">{valor}</p>
  </div>
);

const Marco: React.FC<{
  titulo: string;
  subtitulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}> = ({ titulo, subtitulo, onCerrar, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4">
    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-slate-900">{titulo}</h3>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitulo}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

/** Texto plano del color de una fila, para exportar. */
const textoColor = (e: Existencia): string =>
  e.color ? e.color.nombre : sinClasificar(e) ? 'Sin clasificar' : '—';

const Muestra: React.FC<{ hex: string; grande?: boolean }> = ({ hex, grande }) => (
  <span
    aria-hidden
    className={`${grande ? 'w-6 h-6' : 'w-4 h-4'} rounded-full border border-slate-300 shrink-0`}
    style={{ backgroundColor: hex }}
  />
);

const EtiquetaColor: React.FC<{ color: ColorInventario }> = ({ color }) => (
  <span className="inline-flex items-center gap-2 min-w-0">
    <Muestra hex={color.hex} />
    <span className="min-w-0">
      <span className="block text-xs font-semibold text-slate-800 truncate">{color.nombre}</span>
      <span className="block text-[10px] text-slate-400 tabular-nums">{color.codigo}</span>
    </span>
  </span>
);

const CeldaColor: React.FC<{ existencia: Existencia }> = ({ existencia: e }) => {
  if (e.color) return <EtiquetaColor color={e.color} />;
  if (sinClasificar(e)) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
        <AlertTriangle className="w-3 h-3" /> Sin clasificar
      </span>
    );
  }
  return <span className="text-xs text-slate-400">—</span>;
};

/** Saldo de la presentación en ese color y punto; 0 si aún no hay fila. */
function saldoDe(
  existencias: Existencia[], base: Existencia, colorId: string | null,
): { disponible: number; reservado: number } {
  const f = existencias.find(
    (x) => x.variantId === base.variantId && x.locationId === base.locationId && x.colorId === colorId,
  );
  return { disponible: f?.disponible ?? 0, reservado: f?.reservado ?? 0 };
}

/** Solo los colores de la carta del producto; con la muestra del elegido al lado. */
const SelectorColor: React.FC<{
  colores: ColorInventario[];
  valor: string;
  onCambio: (id: string) => void;
  etiqueta?: string;
  existencias?: Existencia[];
  base?: Existencia;
}> = ({ colores, valor, onCambio, etiqueta = 'Color', existencias, base }) => {
  const elegido = colores.find((c) => c.id === valor);
  return (
    <div className="flex items-end gap-2.5">
      <div className="flex-1 min-w-0">
        <Select
          label={etiqueta}
          required
          options={[
            { value: '', label: 'Selecciona el color…' },
            ...colores.map((c) => {
              const saldo = existencias && base ? saldoDe(existencias, base, c.id).disponible : null;
              return {
                value: c.id,
                label: `${c.nombre} · ${c.codigo}${saldo !== null ? ` (${cantidad(saldo)} disp.)` : ''}`,
              };
            }),
          ]}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
        />
      </div>
      <div className="h-[42px] flex items-center">
        {elegido ? <Muestra hex={elegido.hex} grande /> : <span className="w-6 h-6 rounded-full border border-dashed border-slate-300" />}
      </div>
    </div>
  );
};

const AvisoSinCarta: React.FC = () => (
  <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
    No se pudo cargar la carta de colores de este producto. Revísala en Catálogo antes de moverlo.
  </p>
);

/** Entrada, salida o ajuste por conteo sobre una referencia de esta bodega. */
const MovimientoModal: React.FC<{
  existencia: Existencia;
  existencias: Existencia[];
  onCerrar: () => void;
  onListo: () => void;
}> = ({ existencia, existencias, onCerrar, onListo }) => {
  const [tipo, setTipo] = useState<TipoMovimiento>('ENTRADA');
  const [colorId, setColorId] = useState(existencia.colorId ?? '');
  const [cant, setCant] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const saldo = existencia.tieneCarta
    ? saldoDe(existencias, existencia, colorId || null)
    : { disponible: existencia.disponible, reservado: existencia.reservado };
  const color = existencia.coloresProducto.find((c) => c.id === colorId);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const n = Number(cant);
    if (existencia.tieneCarta && !colorId) {
      setError('Elige el color: este producto se lleva en inventario por color.');
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      setError('La cantidad debe ser un número mayor que cero.');
      return;
    }
    setGuardando(true);
    try {
      await inventarioService.registrar({
        variantId: existencia.variantId,
        locationId: existencia.locationId,
        tipo,
        cantidad: n,
        colorId: existencia.tieneCarta ? colorId : null,
        notas: notas.trim() || undefined,
      });
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar el movimiento.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Marco
      titulo="Registrar movimiento"
      subtitulo={`${existencia.producto} · ${existencia.presentacion}`}
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4 text-left">
        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        {existencia.tieneCarta && (
          existencia.coloresProducto.length > 0 ? (
            <SelectorColor
              colores={existencia.coloresProducto}
              valor={colorId}
              onCambio={setColorId}
              existencias={existencias}
              base={existencia}
            />
          ) : <AvisoSinCarta />
        )}

        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          {existencia.tieneCarta && !colorId ? (
            'Elige el color para ver su saldo en esta bodega.'
          ) : (
            <>
              Saldo actual en {existencia.bodega}
              {color ? ` (${color.nombre})` : ''}: <strong>{cantidad(saldo.disponible)}</strong>{' '}
              disponibles, {cantidad(saldo.reservado)} reservadas.
            </>
          )}
        </div>

        <Select
          label="Tipo de movimiento"
          options={TIPOS_MOVIMIENTO.filter((t) => !t.startsWith('TRASLADO')).map((t) => ({
            value: t,
            label: ETIQUETA_MOVIMIENTO[t] ?? t,
          }))}
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoMovimiento)}
        />
        <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
          Los traslados entre puntos de venta se hacen con el botón de traslado: mueven las dos
          bodegas a la vez.
        </p>

        <Input
          label="Cantidad"
          type="number"
          min="1"
          value={cant}
          onChange={(e) => setCant(e.target.value)}
          required
          autoFocus={!existencia.tieneCarta || Boolean(colorId)}
        />

        <Input
          label="Notas (opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej. remisión 4471, conteo del 30 de agosto"
        />

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" variant="pintuco" isLoading={guardando}>
            Registrar
          </Button>
        </div>
      </form>
    </Marco>
  );
};

/** Traslado entre puntos de venta: las dos patas en una sola operación. */
const TrasladoModal: React.FC<{
  existencia: Existencia;
  existencias: Existencia[];
  puntos: ResumenPunto[];
  onCerrar: () => void;
  onListo: () => void;
}> = ({ existencia, existencias, puntos, onCerrar, onListo }) => {
  const [destino, setDestino] = useState('');
  const [colorId, setColorId] = useState(existencia.colorId ?? '');
  const [cant, setCant] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const otros = puntos.filter((p) => p.locationId !== existencia.locationId);
  const disponible = existencia.tieneCarta
    ? saldoDe(existencias, existencia, colorId || null).disponible
    : existencia.disponible;
  const color = existencia.coloresProducto.find((c) => c.id === colorId);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const n = Number(cant);
    if (existencia.tieneCarta && !colorId) {
      setError('Elige el color que vas a trasladar.');
      return;
    }
    if (!destino) {
      setError('Elige el punto de venta de destino.');
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      setError('La cantidad debe ser un número mayor que cero.');
      return;
    }
    setGuardando(true);
    try {
      await inventarioService.trasladar({
        variantId: existencia.variantId,
        origen: existencia.locationId,
        destino,
        cantidad: n,
        colorId: existencia.tieneCarta ? colorId : null,
        notas: notas.trim() || undefined,
      });
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible trasladar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Marco
      titulo="Trasladar a otro punto"
      subtitulo={`${existencia.producto} · ${existencia.presentacion}`}
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4 text-left">
        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        {existencia.tieneCarta && (
          existencia.coloresProducto.length > 0 ? (
            <>
              <SelectorColor
                colores={existencia.coloresProducto}
                valor={colorId}
                onCambio={setColorId}
                etiqueta="Color a trasladar"
                existencias={existencias}
                base={existencia}
              />
              {!existencia.colorId && (
                <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
                  Lo que está sin clasificar no se traslada: clasifícalo primero por color.
                </p>
              )}
            </>
          ) : <AvisoSinCarta />
        )}

        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          {existencia.tieneCarta && !colorId ? (
            'Elige el color para ver cuánto hay en el origen.'
          ) : (
            <>
              Sale de <strong>{existencia.bodega}</strong>, que tiene{' '}
              <strong>{cantidad(disponible)}</strong> unidades disponibles
              {color ? ` en ${color.nombre}` : ''}.
            </>
          )}
        </div>

        <Select
          label="Punto de venta de destino"
          options={[
            { value: '', label: 'Selecciona…' },
            ...otros.map((p) => ({ value: p.locationId, label: `${p.punto} · ${p.ciudad}` })),
          ]}
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          required
        />

        <Input
          label="Cantidad a trasladar"
          type="number"
          min="1"
          max={String(disponible)}
          value={cant}
          onChange={(e) => setCant(e.target.value)}
          required
        />

        <Input
          label="Notas (opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej. reposición solicitada por la tienda"
        />

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Se registran los dos movimientos —salida y entrada— con la misma referencia, dentro de
          una sola operación.
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" variant="pintuco" isLoading={guardando}>
            Trasladar
          </Button>
        </div>
      </form>
    </Marco>
  );
};

/** Punto de reorden de una referencia (y su color) en esta bodega. */
const ReordenModal: React.FC<{
  existencia: Existencia;
  onCerrar: () => void;
  onListo: () => void;
}> = ({ existencia, onCerrar, onListo }) => {
  const [minimo, setMinimo] = useState(String(existencia.minimo));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const n = Number(minimo);
    if (!Number.isInteger(n) || n < 0) {
      setError('El punto de reorden debe ser un número entero de 0 en adelante.');
      return;
    }
    setGuardando(true);
    try {
      await inventarioService.fijarPuntoReorden(
        existencia.variantId, existencia.locationId, n, existencia.colorId,
      );
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Marco
      titulo="Punto de reorden"
      subtitulo={`${existencia.producto} · ${existencia.presentacion}${
        existencia.tieneCarta ? ` · ${textoColor(existencia)}` : ''
      }`}
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4 text-left">
        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        <p className="text-xs text-slate-600 leading-relaxed">
          Por debajo de esta cantidad, <strong>{existencia.bodega}</strong> aparecerá como
          pendiente de reponer. Va por referencia{existencia.tieneCarta ? ', color' : ''} y bodega,
          porque cada tienda rota distinto.
        </p>

        <Input
          label="Unidades"
          type="number"
          min="0"
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
          required
          autoFocus
        />
        <p className="text-[11px] text-slate-400 -mt-2">
          En 0 no se avisa por cantidad baja; solo cuando la referencia queda agotada.
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" variant="pintuco" isLoading={guardando}>
            Guardar
          </Button>
        </div>
      </form>
    </Marco>
  );
};

/** Asigna su color real a existencias que entraron antes de llevar el inventario por color. */
const ClasificarModal: React.FC<{
  existencia: Existencia;
  existencias: Existencia[];
  onCerrar: () => void;
  onListo: () => void;
}> = ({ existencia, existencias, onCerrar, onListo }) => {
  // Lo reservado queda sin clasificar hasta que se despache su pedido.
  const maximo = Math.max(0, existencia.neto);
  const [colorId, setColorId] = useState('');
  const [cant, setCant] = useState(String(maximo));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const n = Number(cant);
    if (!colorId) {
      setError('Elige el color al que pertenecen estas unidades.');
      return;
    }
    if (!Number.isInteger(n) || n <= 0) {
      setError('La cantidad debe ser un número entero mayor que cero.');
      return;
    }
    if (n > maximo) {
      setError(`Solo hay ${cantidad(maximo)} unidades libres sin clasificar.`);
      return;
    }
    setGuardando(true);
    try {
      await inventarioService.clasificarPorColor({
        variantId: existencia.variantId,
        locationId: existencia.locationId,
        colorId,
        cantidad: n,
      });
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible clasificar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Marco
      titulo="Clasificar por color"
      subtitulo={`${existencia.producto} · ${existencia.presentacion}`}
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4 text-left">
        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        <p className="text-xs text-slate-600 leading-relaxed">
          Pasa unidades «sin clasificar» al color que realmente son; el total de{' '}
          <strong>{existencia.bodega}</strong> no cambia.
        </p>

        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          Sin clasificar: <strong>{cantidad(existencia.disponible)}</strong> disponibles
          {existencia.reservado > 0
            ? `, de las que ${cantidad(existencia.reservado)} están reservadas en pedidos y no se pueden clasificar`
            : ''}
          .
        </div>

        {existencia.coloresProducto.length > 0 ? (
          <SelectorColor
            colores={existencia.coloresProducto}
            valor={colorId}
            onCambio={setColorId}
            etiqueta="Color real"
            existencias={existencias}
            base={existencia}
          />
        ) : <AvisoSinCarta />}

        <Input
          label={`Cantidad (máximo ${cantidad(maximo)})`}
          type="number"
          min="1"
          max={String(maximo)}
          value={cant}
          onChange={(e) => setCant(e.target.value)}
          required
        />

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" variant="pintuco" isLoading={guardando}>
            Clasificar
          </Button>
        </div>
      </form>
    </Marco>
  );
};
