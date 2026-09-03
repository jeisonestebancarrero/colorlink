import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CalendarClock, ClipboardList, MessageSquare,
  Package, PackageCheck, TrendingDown, TrendingUp, Truck,
} from 'lucide-react';
import { useSedes } from '../SedeContext';
import { useAdminAuth } from '../AdminAuthContext';
import { panelService, formatearCOP, formatearFecha, type ResumenPanel } from '../../services/backoffice';
import { ExportarBoton } from '../ExportarBoton';
import { IconoModulo } from '../IconosDeModulo';

/**
 * Panel: la bandeja del día.
 *
 * Antes mostraba cuántos pedidos, proyectos, usuarios y productos hay en total.
 * Nadie abre el sistema para saber que hay 163 pedidos; lo abre para saber qué
 * tiene que hacer hoy. Así que lo primero es lo que espera una acción, y cada
 * tarjeta lleva al módulo donde se resuelve.
 *
 * Los bloques que el rol no puede consultar llegan en `null` desde la base y no
 * se dibujan: un técnico de campo no debe ver un cero en "ventas de hoy", debe
 * no ver la tarjeta.
 */
/* Las dos listas que trae el resumen. Se nombran para poder tiparlas en el
   botón de exportar sin volver a escribir su forma. */
type FilaCritica = NonNullable<ResumenPanel['criticos']>[number];
type FilaAgenda = NonNullable<ResumenPanel['agenda']>[number];

export const PanelPage: React.FC<{ onIr?: (ruta: string) => void }> = ({ onIr }) => {
  const { nombre } = useAdminAuth();
  // El Panel se acota a las sedes activas del selector. El cruce con las
  // PERMITIDAS lo hace el servidor: `resumen_panel` es SECURITY DEFINER, así
  // que RLS no aplica dentro y no puede confiar en lo que le manden.
  const { filtroSedes } = useSedes();
  const [r, setR] = useState<ResumenPanel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      try {
        const datos = await panelService.resumen(filtroSedes);
        if (activo) setR(datos);
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : 'No fue posible cargar el panel.');
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
    // Cambiar de sede recarga el panel: sin esta dependencia se quedaría con
    // las cifras de la selección anterior.
  }, [filtroSedes]);

  const saludo = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  })();

  if (cargando) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-10 h-10 border-4 border-[#004F9F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !r) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-10 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-800">{error || 'Sin datos.'}</p>
      </div>
    );
  }

  // Lo que espera una acción. Solo se listan las que tienen algo pendiente:
  // una fila de ceros solo obliga a leer para descubrir que no hay nada.
  const pendientes = [
    {
      clave: 'confirmar', valor: r.porConfirmar, ruta: '/pedidos',
      texto: 'Pedidos por confirmar', icono: <ClipboardList className="w-4 h-4" />,
      urgente: true,
    },
    {
      clave: 'alistar', valor: r.porAlistar, ruta: '/despacho',
      texto: 'Por alistar', icono: <Package className="w-4 h-4" />,
    },
    {
      clave: 'retiro', valor: r.listosParaRetiro, ruta: '/despacho',
      texto: 'Listos para retiro', icono: <PackageCheck className="w-4 h-4" />,
    },
    {
      clave: 'transito', valor: r.enTransito, ruta: '/despacho',
      texto: 'En tránsito', icono: <Truck className="w-4 h-4" />,
    },
    {
      clave: 'chat', valor: r.sinResponder, ruta: '/conversaciones',
      texto: 'Conversaciones sin responder', icono: <MessageSquare className="w-4 h-4" />,
      urgente: true,
    },
    {
      clave: 'vencidas', valor: r.visitasVencidas, ruta: '/visitas',
      texto: 'Visitas vencidas sin cerrar', icono: <CalendarClock className="w-4 h-4" />,
      urgente: true,
    },
    {
      clave: 'sinAsesor', valor: r.proyectosSinAsesor, ruta: '/proyectos',
      texto: 'Proyectos sin asesor', icono: <ClipboardList className="w-4 h-4" />,
    },
  ].filter((x) => x.valor !== null && x.valor > 0);

  const variacion =
    r.ventasMes !== null && r.ventasMesAnterior !== null && r.ventasMesAnterior > 0
      ? Math.round(((r.ventasMes - r.ventasMesAnterior) / r.ventasMesAnterior) * 1000) / 10
      : null;

  const Ir: React.FC<{ ruta: string; children: React.ReactNode; className?: string }> = ({
    ruta, children, className = '',
  }) =>
    onIr ? (
      <button onClick={() => onIr(ruta)} className={`text-left w-full ${className}`}>
        {children}
      </button>
    ) : (
      <div className={className}>{children}</div>
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
          <IconoModulo nombre="LayoutDashboard" /> {saludo}, {nombre?.split(' ')[0] ?? 'equipo'}
        </h1>
        <p className="text-sm text-slate-500 font-medium mt-0.5 first-letter:uppercase">
          {formatearFecha(new Date().toISOString().slice(0, 10))}
        </p>
      </div>

      {/* ── Lo que espera una acción ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <h2 className="px-5 py-3.5 text-sm font-extrabold text-slate-900 border-b border-slate-100">
          Pendiente de atender
        </h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10 font-medium">
            No hay nada esperando. Todo lo que llegó está atendido.
          </p>
        ) : (
          <div className="divide-y divide-slate-50">
            {pendientes.map((p) => (
              <Ir
                key={p.clave}
                ruta={p.ruta}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
              >
                <span
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    p.urgente ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {p.icono}
                </span>
                <span className="text-sm font-semibold text-slate-700 flex-1 min-w-0">
                  {p.texto}
                </span>
                <span
                  className={`text-lg font-extrabold tabular-nums ${
                    p.urgente ? 'text-amber-700' : 'text-slate-900'
                  }`}
                >
                  {p.valor}
                </span>
                {onIr && (
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#004F9F] shrink-0" />
                )}
              </Ir>
            ))}
          </div>
        )}
      </div>

      {/* ── Cómo va la venta ────────────────────────────────────────────── */}
      {r.ventasMes !== null && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Ventas de hoy
            </p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
              {formatearCOP(r.ventasHoy ?? 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {r.pedidosHoy ?? 0} {r.pedidosHoy === 1 ? 'pedido' : 'pedidos'}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Lo que va del mes
            </p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
              {formatearCOP(r.ventasMes)}
            </p>
            {variacion !== null && (
              <p
                className={`text-[11px] font-bold mt-0.5 inline-flex items-center gap-1 ${
                  variacion >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {variacion >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {variacion >= 0 ? '+' : ''}{variacion} % contra el mismo tramo del mes pasado
              </p>
            )}
          </div>

          <Ir
            ruta="/analitica"
            className="bg-[#004F9F] rounded-xl shadow-2xs p-5 text-white hover:bg-[#0068d4] transition-colors"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
              Analítica
            </p>
            <p className="text-sm font-bold mt-1 leading-snug">
              Ver la evolución, la estacionalidad y el margen por punto y producto
            </p>
            {onIr && (
              <span className="inline-flex items-center gap-1 text-xs font-bold mt-2">
                Abrir <ArrowRight className="w-3.5 h-3.5" />
              </span>
            )}
          </Ir>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ── Inventario ────────────────────────────────────────────────── */}
        {r.bajoMinimo !== null && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold text-slate-900">Inventario en alerta</h2>
              <div className="flex gap-3 text-[11px] font-bold tabular-nums">
                <span className={r.bajoMinimo > 0 ? 'text-amber-700' : 'text-slate-400'}>
                  {r.bajoMinimo} bajo mínimo
                </span>
                {(r.agotados ?? 0) > 0 && (
                  <span className="text-rose-600">{r.agotados} agotados</span>
                )}
              </div>

              {/* El faltante es la lista que se lleva a compras. Salir a
                  pedirlo con las cifras en la pantalla es cómo se pide de
                  menos. */}
              <ExportarBoton<FilaCritica>
                filas={r.criticos ?? []}
                nombre="inventario-en-alerta"
                titulo="Inventario en alerta"
                filtros={`${r.bajoMinimo} bajo mínimo · ${r.agotados ?? 0} agotados`}
                columnas={[
                  { titulo: 'Producto', valor: (c) => c.producto },
                  { titulo: 'Presentación', valor: (c) => c.presentacion },
                  { titulo: 'Punto de venta', valor: (c) => c.punto },
                  { titulo: 'Existencia', valor: (c) => c.existencia, numerica: true },
                  { titulo: 'Mínimo', valor: (c) => c.minimo, numerica: true },
                  { titulo: 'Faltante', valor: (c) => c.faltante, numerica: true },
                ]}
              />
            </div>

            {(r.criticos?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10 font-medium">
                Ninguna referencia por debajo de su punto de reorden.
              </p>
            ) : (
              <div className="divide-y divide-slate-50">
                {r.criticos!.map((c, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-bold text-slate-800 min-w-0 truncate">
                        {c.producto}
                        <span className="text-xs text-slate-400 font-medium"> · {c.presentacion}</span>
                      </span>
                      <span
                        className={`text-sm font-extrabold tabular-nums shrink-0 ${
                          c.existencia <= 0 ? 'text-rose-600' : 'text-amber-700'
                        }`}
                      >
                        {c.existencia} / {c.minimo}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{c.punto}</p>
                  </div>
                ))}
              </div>
            )}

            {onIr && (
              <button
                onClick={() => onIr('/inventario')}
                className="w-full px-5 py-2.5 text-xs font-bold text-[#004F9F] hover:bg-slate-50 border-t border-slate-100 text-left"
              >
                Abrir inventario →
              </button>
            )}
          </div>
        )}

        {/* ── Agenda ────────────────────────────────────────────────────── */}
        {r.visitasSemana !== null && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold text-slate-900">Próximas visitas</h2>
              <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                {r.visitasHoy ?? 0} hoy · {r.visitasSemana} esta semana
              </span>

              <ExportarBoton<FilaAgenda>
                filas={r.agenda ?? []}
                nombre="proximas-visitas"
                titulo="Próximas visitas técnicas"
                filtros={`${r.visitasHoy ?? 0} hoy · ${r.visitasSemana} esta semana`}
                columnas={[
                  { titulo: 'Fecha', valor: (v) => v.fecha },
                  { titulo: 'Hora', valor: (v) => v.hora },
                  { titulo: 'Obra', valor: (v) => v.proyecto },
                  { titulo: 'Ciudad', valor: (v) => v.ciudad },
                  { titulo: 'Técnico', valor: (v) => v.tecnico },
                ]}
              />
            </div>

            {(r.agenda?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10 font-medium">
                No hay visitas programadas.
              </p>
            ) : (
              <div className="divide-y divide-slate-50">
                {r.agenda!.map((v, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-bold text-slate-800 min-w-0 truncate">
                        {v.proyecto}
                      </span>
                      <span className="text-xs font-bold text-slate-600 tabular-nums shrink-0">
                        {formatearFecha(v.fecha)}
                        {v.hora ? ` · ${v.hora}` : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {v.tecnico ?? 'Sin técnico asignado'}
                      {v.ciudad ? ` · ${v.ciudad}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {onIr && (
              <button
                onClick={() => onIr('/visitas')}
                className="w-full px-5 py-2.5 text-xs font-bold text-[#004F9F] hover:bg-slate-50 border-t border-slate-100 text-left"
              >
                Abrir la agenda →
              </button>
            )}
          </div>
        )}
      </div>

      {r.proyectosActivos !== null && r.proyectosActivos > 0 && (
        <p className="text-[11px] text-slate-400">
          {r.proyectosActivos} proyectos abiertos en este momento.
        </p>
      )}
    </div>
  );
};
