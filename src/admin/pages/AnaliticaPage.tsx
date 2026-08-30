import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Award, BarChart3, CalendarRange, Filter, LineChart, Package,
  ScatterChart, Store, Tag, X,
} from 'lucide-react';
import {
  analiticaService, formatearCOP,
  type AnaliticaDetallada, type CorteVentas, type OpcionesAnalitica, type Ranking,
} from '../../services/backoffice';
import {
  BarraComposicion, GraficoAnios, GraficoDispersion, GraficoLinea,
  type SerieAnual,
} from '../components/Graficos';

/**
 * Tablero de ventas.
 *
 * Todo se dibuja con CSS: para comparar magnitudes relativas no hace falta
 * traerse una librería de gráficos de 200 KB, y así el tablero abre al
 * instante incluso con la conexión de una tienda.
 *
 * Las cifras se calculan por LÍNEA de pedido, no por pedido. Es lo que permite
 * filtrar por producto sin tener que repartir el total del pedido entre sus
 * productos con una regla inventada.
 */

type Medida = 'ingresos' | 'margen' | 'pedidos';
type Corte = 'punto' | 'categoria' | 'producto';

/** Último día del mes de una fecha, en ISO. Evita el desfase de zona horaria. */
const finDeMes = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
const inicioDeMes = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);

/** Rangos rápidos. El nombre es el que usaría alguien de la tienda, no un rango técnico. */
function rangosRapidos(): Array<{ clave: string; texto: string; desde: string; hasta: string }> {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const atras = (meses: number) =>
    inicioDeMes(new Date(anio, hoy.getMonth() - meses + 1, 1));

  return [
    { clave: 'mes', texto: 'Este mes', desde: inicioDeMes(hoy), hasta: finDeMes(hoy) },
    { clave: '3m', texto: 'Últimos 3 meses', desde: atras(3), hasta: finDeMes(hoy) },
    { clave: '6m', texto: 'Últimos 6 meses', desde: atras(6), hasta: finDeMes(hoy) },
    { clave: '12m', texto: 'Últimos 12 meses', desde: atras(12), hasta: finDeMes(hoy) },
    { clave: 'todo', texto: 'Todo el histórico', desde: '', hasta: '' },
  ];
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** '2026-08' → 'agosto 2026'. Se parte el texto en vez de usar Date: un
 *  'YYYY-MM-01' se interpreta en UTC y en Colombia retrocede un mes. */
function nombreMes(iso: string): string {
  const [anio, mes] = iso.split('-');
  return `${MESES[Number(mes) - 1] ?? mes} ${anio}`;
}

/** Solo el mes, sin el año. Para el eje del gráfico. */
function soloMes(iso: string): string {
  return MESES[Number(iso.split('-')[1]) - 1] ?? iso;
}

export const AnaliticaPage: React.FC = () => {
  const [datos, setDatos] = useState<AnaliticaDetallada | null>(null);
  const [opciones, setOpciones] = useState<OpcionesAnalitica | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');

  const rangos = useMemo(rangosRapidos, []);

  const [rango, setRango] = useState('12m');
  const [desde, setDesde] = useState(rangos.find((r) => r.clave === '12m')!.desde);
  const [hasta, setHasta] = useState(rangos.find((r) => r.clave === '12m')!.hasta);

  const [puntos, setPuntos] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [producto, setProducto] = useState('');

  const [anio, setAnio] = useState<number | null>(null);
  const [historico, setHistorico] = useState<AnaliticaDetallada | null>(null);
  const [medida, setMedida] = useState<Medida>('ingresos');
  const [corte, setCorte] = useState<Corte>('punto');
  const [verFiltros, setVerFiltros] = useState(false);

  const cargar = useCallback(async () => {
    setRefrescando(true);
    setError('');
    try {
      const d = await analiticaService.detallada({
        desde: desde || undefined,
        hasta: hasta || undefined,
        puntos,
        categorias,
        productos: producto ? [producto] : undefined,
      });
      setDatos(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar la analítica.');
    } finally {
      setRefrescando(false);
      setCargando(false);
    }
  }, [desde, hasta, puntos, categorias, producto]);

  useEffect(() => { void cargar(); }, [cargar]);

  /**
   * La comparación entre años necesita el histórico completo, no el rango
   * elegido: acotar a 2026 dejaría una sola línea y el gráfico perdería su
   * razón de ser. Sí respeta los filtros de punto, categoría y producto.
   */
  useEffect(() => {
    (async () => {
      try {
        setHistorico(
          await analiticaService.detallada({
            puntos, categorias, productos: producto ? [producto] : undefined,
          }),
        );
      } catch {
        setHistorico(null);
      }
    })();
  }, [puntos, categorias, producto]);

  useEffect(() => {
    (async () => {
      try {
        const [o, k] = await Promise.all([
          analiticaService.opciones(),
          analiticaService.ranking(),
        ]);
        setOpciones(o);
        setRanking(k);
      } catch {
        // El tablero funciona sin los filtros; no se bloquea por esto.
      }
    })();
  }, []);

  const aplicarRango = (clave: string) => {
    const r = rangos.find((x) => x.clave === clave);
    if (!r) return;
    setAnio(null);
    setRango(clave);
    setDesde(r.desde);
    setHasta(r.hasta);
  };

  /**
   * Elegir un año acota TODO el tablero a ese año: el gráfico mensual, el
   * desglose por punto, por categoría y por producto. Es un filtro más, no una
   * vista aparte.
   */
  const aplicarAnio = (a: number | null) => {
    setAnio(a);
    setRango(a === null ? 'todo' : 'anio-elegido');
    setDesde(a === null ? '' : `${a}-01-01`);
    setHasta(a === null ? '' : `${a}-12-31`);
  };

  /** Al pulsar un mes del gráfico, el tablero entero se acota a ese mes. */
  const irAlMes = (iso: string) => {
    const [a, m] = iso.split('-').map(Number);
    const d = new Date(a, m - 1, 1);
    setRango('personalizado');
    setDesde(inicioDeMes(d));
    setHasta(finDeMes(d));
  };

  const alternar = (lista: string[], set: (v: string[]) => void, id: string) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  const limpiarFiltros = () => {
    setPuntos([]);
    setCategorias([]);
    setProducto('');
  };

  const filtrosActivos = puntos.length + categorias.length + (producto ? 1 : 0);

  // Los hooks van todos antes de cualquier `return`: React exige que se
  // ejecuten siempre en el mismo orden, y colocarlos después del estado de
  // carga dejaba la pantalla en blanco al terminar de cargar.
  /** El histórico pivotado a una línea por año, doce posiciones cada una. */
  const seriesAnuales: SerieAnual[] = useMemo(() => {
    const fuente = historico?.porMes ?? datos?.porMes ?? [];
    const porAnio = new Map<number, Array<number | null>>();
    for (const m of fuente) {
      const [a, mes] = m.mes.split('-').map(Number);
      if (!porAnio.has(a)) porAnio.set(a, Array<number | null>(12).fill(null));
      porAnio.get(a)![mes - 1] = m.ingresos;
    }
    return [...porAnio.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([a, meses]) => ({ anio: a, meses }));
  }, [historico, datos]);

  /** Productos con margen conocido, para la dispersión. */
  const dispersion = useMemo(
    () =>
      (datos?.porProducto ?? [])
        .filter((p) => p.margenPct !== null && p.margenPct !== undefined && (p.unidades ?? 0) > 0)
        .map((p) => ({
          etiqueta: p.etiqueta,
          x: p.unidades ?? 0,
          y: p.margenPct!,
          peso: p.ingresos,
        })),
    [datos],
  );


  if (cargando) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-10 h-10 border-4 border-[#004F9F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !datos) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-10 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-800">{error}</p>
      </div>
    );
  }

  const d = datos!;
  const margenPct =
    d.margen !== null && d.ingresos > 0 ? Math.round((d.margen / d.ingresos) * 1000) / 10 : null;

  const valorMes = (m: AnaliticaDetallada['porMes'][number]) =>
    medida === 'ingresos' ? m.ingresos : medida === 'pedidos' ? m.pedidos : (m.margen ?? 0);

  const maxMes = Math.max(1, ...d.porMes.map(valorMes));

  const cortes: Record<Corte, { titulo: string; icono: React.ReactNode; filas: CorteVentas[] }> = {
    punto: { titulo: 'Punto de venta', icono: <Store className="w-3.5 h-3.5" />, filas: d.porPunto },
    categoria: { titulo: 'Categoría', icono: <Tag className="w-3.5 h-3.5" />, filas: d.porCategoria },
    producto: { titulo: 'Producto', icono: <Package className="w-3.5 h-3.5" />, filas: d.porProducto },
  };
  const filasCorte = cortes[corte].filas;
  const maxCorte = Math.max(1, ...filasCorte.map((f) => f.ingresos));
  const maxAsesor = Math.max(1, ...(ranking?.asesores ?? []).map((a) => a.total));

  const tarjetas: Array<{ titulo: string; valor: string; pie: string; acento?: boolean }> = [
    { titulo: 'Ingresos', valor: formatearCOP(d.ingresos), pie: `${d.lineas} líneas vendidas` },
    ...(d.verCostos
      ? [{
          titulo: 'Margen',
          valor: d.margen === null ? '—' : formatearCOP(d.margen),
          pie: margenPct === null ? 'sin costos cargados' : `${margenPct} % sobre la venta`,
          acento: true,
        }]
      : []),
    { titulo: 'Pedidos', valor: String(d.pedidos), pie: 'sin contar cancelados' },
    { titulo: 'Unidades', valor: String(d.unidades), pie: 'todas las presentaciones' },
    { titulo: 'Ticket medio', valor: formatearCOP(d.ticketMedio), pie: 'por pedido' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Analítica</h1>
          <p className="text-sm text-slate-500 font-medium">
            Ventas, rentabilidad y comportamiento por punto, categoría y producto.
          </p>
        </div>
        <button
          onClick={() => setVerFiltros((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold border transition-colors ${
            filtrosActivos > 0
              ? 'bg-[#004F9F] text-white border-[#004F9F]'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros
          {filtrosActivos > 0 && (
            <span className="bg-white/25 rounded-full px-1.5 text-[11px] tabular-nums">
              {filtrosActivos}
            </span>
          )}
        </button>
      </div>

      {/* ── Periodo ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {rangos.map((r) => (
            <button
              key={r.clave}
              onClick={() => aplicarRango(r.clave)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                rango === r.clave
                  ? 'bg-[#004F9F] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {r.texto}
            </button>
          ))}
        </div>

        {(opciones?.anios.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
              Año
            </span>
            <button
              onClick={() => aplicarAnio(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                anio === null
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos
            </button>
            {opciones!.anios.map((a) => (
              <button
                key={a}
                onClick={() => aplicarAnio(a)}
                aria-pressed={anio === a}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                  anio === a
                    ? 'bg-[#004F9F] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-slate-100">
          <CalendarRange className="w-4 h-4 text-slate-400 mb-2" />
          {([['Desde', desde, setDesde], ['Hasta', hasta, setHasta]] as const).map(
            ([texto, valor, set]) => (
              <label key={texto} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {texto}
                <input
                  type="date"
                  value={valor}
                  onChange={(e) => { setRango('personalizado'); setAnio(null); set(e.target.value); }}
                  className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20"
                />
              </label>
            ),
          )}
          {refrescando && (
            <span className="text-xs text-slate-400 font-medium mb-2">Actualizando…</span>
          )}
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      {verFiltros && opciones && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">Filtrar</h2>
            {filtrosActivos > 0 && (
              <button
                onClick={limpiarFiltros}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-600"
              >
                <X className="w-3.5 h-3.5" /> Quitar todos
              </button>
            )}
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Puntos de venta
            </p>
            <div className="flex flex-wrap gap-1.5">
              {opciones.puntos.map((p) => {
                const activo = puntos.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => alternar(puntos, setPuntos, p.id)}
                    aria-pressed={activo}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors text-left ${
                      activo
                        ? 'bg-[#004F9F] text-white border-[#004F9F]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {p.nombre}
                    {p.ciudad && (
                      <span className={activo ? 'text-white/70' : 'text-slate-400'}> · {p.ciudad}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Categorías
            </p>
            <div className="flex flex-wrap gap-1.5">
              {opciones.categorias.map((c) => {
                const activo = categorias.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => alternar(categorias, setCategorias, c.id)}
                    aria-pressed={activo}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      activo
                        ? 'bg-[#004F9F] text-white border-[#004F9F]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {c.nombre}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-w-md">
            <label
              htmlFor="filtro-producto"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5"
            >
              Producto
            </label>
            <select
              id="filtro-producto"
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20"
            >
              <option value="">Todos los productos</option>
              {opciones.productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} · {p.codigo}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      {/* ── Indicadores ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tarjetas.map((t) => (
          <div
            key={t.titulo}
            className={`rounded-xl border shadow-2xs p-4 ${
              t.acento ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200'
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {t.titulo}
            </p>
            <p className={`text-xl font-extrabold mt-1 tabular-nums ${
              t.acento ? 'text-emerald-700' : 'text-slate-900'
            }`}>
              {t.valor}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{t.pie}</p>
          </div>
        ))}
      </div>

      {d.verCostos && (d.lineasSinCosto > 0 || d.lineasEstimadas > 0) && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 font-medium leading-relaxed">
          {d.lineasSinCosto > 0 && (
            <>
              {d.lineasSinCosto} líneas no tienen costo: quedan fuera del margen.{' '}
            </>
          )}
          {d.lineasEstimadas > 0 && (
            <>
              {d.lineasEstimadas} usan el costo estándar del catálogo, no el de la compra. El margen
              de esas líneas es una estimación y cambia cuando se registre la recepción real.
            </>
          )}
        </p>
      )}

      {/* ── Mejor mes ───────────────────────────────────────────────────── */}
      {d.mejorMes && (
        <div className="bg-gradient-to-r from-[#004F9F] to-[#0068d4] rounded-xl p-5 text-white shadow-2xs">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                {d.verCostos ? 'Mes de mayor ganancia' : 'Mes de mayores ingresos'}
              </p>
              <p className="text-2xl font-extrabold mt-0.5">{nombreMes(d.mejorMes.mes)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">Ingresos</p>
              <p className="text-lg font-bold tabular-nums mt-0.5">
                {formatearCOP(d.mejorMes.ingresos)}
              </p>
            </div>
            {d.mejorMes.margen !== null && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">Margen</p>
                <p className="text-lg font-bold tabular-nums mt-0.5">
                  {formatearCOP(d.mejorMes.margen)}
                </p>
              </div>
            )}
            <button
              onClick={() => irAlMes(d.mejorMes!.mes)}
              className="ml-auto text-xs font-bold bg-white/15 hover:bg-white/25 rounded-lg px-3.5 py-2 transition-colors"
            >
              Ver solo ese mes
            </button>
          </div>
        </div>
      )}

      {/* ── Evolución mensual ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-extrabold text-slate-900 inline-flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#004F9F]" />
            {anio === null ? 'Evolución mes a mes' : `Ingresos por mes · ${anio}`}
          </h2>
          <div className="flex gap-1">
            {([
              ['ingresos', 'Ingresos'],
              ...(d.verCostos ? [['margen', 'Margen'] as const] : []),
              ['pedidos', 'Pedidos'],
            ] as Array<[Medida, string]>).map(([clave, texto]) => (
              <button
                key={clave}
                onClick={() => setMedida(clave)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  medida === clave
                    ? 'bg-[#004F9F] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        {d.porMes.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">
            No hay ventas en el periodo elegido.
          </p>
        ) : (
          <>
            <GraficoLinea
              datos={d.porMes.map((m) => ({
                clave: m.mes,
                etiqueta: nombreMes(m.mes),
                valor: valorMes(m),
                valor2: medida === 'ingresos' && d.verCostos ? m.margen : null,
              }))}
              formato={medida === 'pedidos' ? (n) => String(n) : formatearCOP}
              nombre={medida === 'ingresos' ? 'Ingresos' : medida === 'margen' ? 'Margen' : 'Pedidos'}
              nombre2="Margen"
              color={medida === 'margen' ? '#059669' : '#004F9F'}
              onElegir={irAlMes}
            />

            {/* Con hasta 12 puntos cabe el nombre completo del mes; con más,
                solo tres letras, que es lo que entra sin encimarse. */}
            <div className="flex gap-1 mt-1.5">
              {d.porMes.map((m) => (
                <span
                  key={m.mes}
                  className="flex-1 min-w-[20px] text-center text-[10px] font-semibold text-slate-500 truncate capitalize"
                  title={nombreMes(m.mes)}
                >
                  {d.porMes.length <= 12 ? soloMes(m.mes) : soloMes(m.mes).slice(0, 3)}
                </span>
              ))}
            </div>
            {new Set(d.porMes.map((m) => m.mes.slice(0, 4))).size > 1 && (
              <div className="flex gap-1 mt-0.5">
                {d.porMes.map((m, i) => (
                  <span
                    key={m.mes}
                    className="flex-1 min-w-[20px] text-center text-[9px] font-bold text-slate-300 tabular-nums"
                  >
                    {i === 0 || m.mes.slice(0, 4) !== d.porMes[i - 1].mes.slice(0, 4)
                      ? m.mes.slice(0, 4)
                      : ''}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              Pasa el cursor para ver el detalle; pulsa un mes para acotar todo el tablero a él.
            </p>
          </>
        )}
      </div>

      {/* ── Estacionalidad: un año contra otro ──────────────────────────── */}
      {seriesAnuales.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
          <h2 className="text-sm font-extrabold text-slate-900 mb-1 inline-flex items-center gap-2">
            <LineChart className="w-4 h-4 text-[#004F9F]" />
            Estacionalidad — un año sobre otro
          </h2>
          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
            Los años superpuestos sobre el mismo eje enero-diciembre. Es lo que permite distinguir
            si un mes creció de verdad o si simplemente es un mes que siempre sube.
          </p>
          <GraficoAnios series={seriesAnuales} formato={formatearCOP} />
        </div>
      )}

      {/* ── Comparación por año ─────────────────────────────────────────── */}
      {d.porAnio.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <h2 className="px-5 py-3.5 text-sm font-extrabold text-slate-900 border-b border-slate-100">
            Comparación por año
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="text-left px-5 py-2.5">Año</th>
                  <th className="text-right px-3 py-2.5">Ingresos</th>
                  {d.verCostos && <th className="text-right px-3 py-2.5">Margen</th>}
                  <th className="text-right px-3 py-2.5">Pedidos</th>
                  <th className="text-right px-5 py-2.5">Variación</th>
                </tr>
              </thead>
              <tbody>
                {d.porAnio.map((a, i) => {
                  const previo = i > 0 ? d.porAnio[i - 1].ingresos : null;
                  const variacion =
                    previo && previo > 0
                      ? Math.round(((a.ingresos - previo) / previo) * 1000) / 10
                      : null;
                  return (
                    <tr key={a.anio} className="border-t border-slate-100">
                      <td className="px-5 py-3 font-bold text-slate-900 tabular-nums">{a.anio}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">
                        {formatearCOP(a.ingresos)}
                      </td>
                      {d.verCostos && (
                        <td className="px-3 py-3 text-right tabular-nums text-emerald-700 font-semibold">
                          {a.margen === null ? '—' : formatearCOP(a.margen)}
                        </td>
                      )}
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{a.pedidos}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-bold">
                        {variacion === null ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className={variacion >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {variacion >= 0 ? '+' : ''}{variacion} %
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {d.porAnio.length > 1 && (
            <p className="px-5 py-2.5 text-[11px] text-slate-400 border-t border-slate-100">
              El año en curso va incompleto: compararlo con uno cerrado siempre lo deja por debajo.
            </p>
          )}
        </div>
      )}

      {/* ── Aperturas ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-slate-900">Desglose</h2>
          <div className="flex gap-1">
            {(Object.keys(cortes) as Corte[]).map((c) => (
              <button
                key={c}
                onClick={() => setCorte(c)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  corte === c
                    ? 'bg-[#004F9F] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cortes[c].icono}
                {cortes[c].titulo}
              </button>
            ))}
          </div>
        </div>

        {filasCorte.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">Sin datos en este periodo.</p>
        ) : (
          <>
          {/* Composición antes del detalle: primero cuánto pesa cada uno sobre
              el total, después la cifra de cada uno. */}
          {filasCorte.length > 1 && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Participación en las ventas
              </p>
              <BarraComposicion
                partes={filasCorte.slice(0, 8).map((f) => ({ etiqueta: f.etiqueta, valor: f.ingresos }))}
                formato={formatearCOP}
              />
            </div>
          )}
          <div className="divide-y divide-slate-50">
            {filasCorte.map((f) => (
              <div key={f.etiqueta} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-1.5">
                  <span className="text-sm font-bold text-slate-800 min-w-0 truncate">
                    {f.etiqueta}
                    {f.detalle && <span className="text-xs text-slate-400 font-medium"> · {f.detalle}</span>}
                  </span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0">
                    {formatearCOP(f.ingresos)}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#004F9F] rounded-full"
                    style={{ width: `${(f.ingresos / maxCorte) * 100}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-slate-500 font-medium tabular-nums">
                  {f.pedidos !== undefined && <span>{f.pedidos} pedidos</span>}
                  {f.unidades !== undefined && <span>{f.unidades} unidades</span>}
                  {f.margen !== null && f.margen !== undefined && (
                    <span className="text-emerald-700 font-bold">
                      margen {formatearCOP(f.margen)}
                      {f.margenPct !== null && f.margenPct !== undefined && ` · ${f.margenPct} %`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* ── Rentabilidad contra volumen ─────────────────────────────────── */}
      {d.verCostos && dispersion.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
          <h2 className="text-sm font-extrabold text-slate-900 mb-1 inline-flex items-center gap-2">
            <ScatterChart className="w-4 h-4 text-[#004F9F]" />
            Rentabilidad contra volumen
          </h2>
          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
            Cada burbuja es un producto: a la derecha los que más unidades mueven, arriba los que
            dejan mejor margen. El tamaño es lo que facturó. Las líneas punteadas marcan la mediana,
            así que el cuadrante de abajo a la derecha es el que hay que mirar.
          </p>
          <GraficoDispersion
            datos={dispersion}
            ejeX="Unidades"
            ejeY="Margen"
            formatoPeso={formatearCOP}
          />
        </div>
      )}

      {/* ── Ranking comercial ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
        <h2 className="text-sm font-extrabold text-slate-900 mb-4 inline-flex items-center gap-2">
          <Award className="w-4 h-4 text-[#004F9F]" />
          Ranking comercial
        </h2>
        {(ranking?.asesores.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500 leading-relaxed">
            Ningún pedido está atribuido todavía a un asesor. La atribución se hace por el asesor
            asignado al proyecto que originó la venta.
          </p>
        ) : (
          <div className="space-y-2.5">
            {ranking!.asesores.map((a) => (
              <div key={a.nombre}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-sm font-semibold text-slate-700 truncate">{a.nombre}</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0">
                    {formatearCOP(a.total)}
                    <span className="text-[11px] text-slate-400 font-medium"> · {a.pedidos} ped.</span>
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${(a.total / maxAsesor) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {(ranking?.sinAsesor.pedidos ?? 0) > 0 && (
          <p className="text-[11px] text-slate-500 font-medium mt-4 pt-3 border-t border-slate-100 leading-relaxed">
            {ranking!.sinAsesor.pedidos} pedidos por {formatearCOP(ranking!.sinAsesor.total)} sin
            asesor asignado. No se reparten entre el equipo: falsearían el ranking y las comisiones.
          </p>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Las cifras se calculan por línea de pedido, que es lo que permite filtrar por producto. Los
        pedidos se cuentan como distintos, así que al filtrar por producto un mismo pedido puede
        aparecer en varias categorías sin duplicar su conteo.
      </p>
    </div>
  );
};
