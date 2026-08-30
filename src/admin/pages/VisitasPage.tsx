import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, MapPin, Search, UserCog, X, Clock } from 'lucide-react';
import {
  formatearFecha, hoyISO,
  visitaService, ESTADOS_VISITA, ETIQUETA_VISITA, COLOR_VISITA, TRANSICIONES_VISITA,
  type EstadoVisita, type VisitaLista,
} from '../../services/proyectosBackoffice';
import { useAdminAuth } from '../AdminAuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

// `toISOString` da la fecha en UTC: después de las 7 p. m. en Colombia
// habría propuesto el día siguiente como fecha por defecto.
const HOY = hoyISO;

const fechaLarga = (iso: string | null): string =>
  iso ? formatearFecha(iso, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Sin fecha';

/** Agrupa por día: una agenda se lee por jornadas, no como una lista plana. */
function agrupar(visitas: VisitaLista[]): Array<[string, VisitaLista[]]> {
  const mapa = new Map<string, VisitaLista[]>();
  for (const v of visitas) {
    const clave = v.fecha ?? 'sin-fecha';
    mapa.set(clave, [...(mapa.get(clave) ?? []), v]);
  }
  return [...mapa.entries()].sort(([a], [b]) => {
    if (a === 'sin-fecha') return -1;
    if (b === 'sin-fecha') return 1;
    return a.localeCompare(b);
  });
}

/**
 * Agenda de visitas técnicas.
 *
 * Se ordena por fecha ascendente y las visitas sin programar van primero: son
 * justamente las que exigen una decisión, y enterrarlas al final equivaldría
 * a no tenerlas.
 */
export const VisitasPage: React.FC = () => {
  const { puede } = useAdminAuth();
  const [visitas, setVisitas] = useState<VisitaLista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState<EstadoVisita | 'ABIERTAS' | 'TODAS'>('ABIERTAS');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState<VisitaLista | null>(null);
  const [resultado, setResultado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [reprogramando, setReprogramando] = useState<VisitaLista | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevaHora, setNuevaHora] = useState('');
  const [accionando, setAccionando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      setVisitas(await visitaService.listar());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar las visitas.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return visitas.filter((v) => {
      const porEstado =
        estado === 'TODAS'
          ? true
          : estado === 'ABIERTAS'
            ? !['REALIZADA', 'CANCELADA'].includes(v.estado)
            : v.estado === estado;
      const porTexto =
        !q ||
        v.proyecto.toLowerCase().includes(q) ||
        v.codigoProyecto.toLowerCase().includes(q) ||
        v.cliente.toLowerCase().includes(q) ||
        v.ciudad.toLowerCase().includes(q) ||
        (v.tecnico ?? '').toLowerCase().includes(q);
      return porEstado && porTexto;
    });
  }, [visitas, estado, busqueda]);

  const grupos = useMemo(() => agrupar(filtradas), [filtradas]);

  const mover = async (v: VisitaLista, nuevo: EstadoVisita) => {
    // Cerrar una visita exige informe; reprogramar exige fecha. Se piden en un
    // formulario en vez de rechazarlo después con un error del servidor.
    if (nuevo === 'REALIZADA') {
      setCerrando(v);
      setResultado('');
      setObservaciones('');
      return;
    }
    if (nuevo === 'REPROGRAMADA') {
      setReprogramando(v);
      setNuevaFecha(v.fecha ?? HOY());
      setNuevaHora(v.hora ?? '');
      return;
    }

    setAccionando(true);
    setError('');
    try {
      await visitaService.actualizar({ visitId: v.id, estado: nuevo });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible actualizar la visita.');
    } finally {
      setAccionando(false);
    }
  };

  const cerrarVisita = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cerrando) return;
    setAccionando(true);
    setError('');
    try {
      await visitaService.actualizar({
        visitId: cerrando.id,
        estado: 'REALIZADA',
        resultado,
        observaciones: observaciones || undefined,
      });
      setCerrando(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cerrar la visita.');
    } finally {
      setAccionando(false);
    }
  };

  const reprogramar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reprogramando) return;
    setAccionando(true);
    setError('');
    try {
      await visitaService.actualizar({
        visitId: reprogramando.id,
        estado: 'REPROGRAMADA',
        fecha: nuevaFecha,
        hora: nuevaHora || undefined,
      });
      setReprogramando(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible reprogramar.');
    } finally {
      setAccionando(false);
    }
  };

  const abiertas = visitas.filter((v) => !['REALIZADA', 'CANCELADA'].includes(v.estado)).length;
  const sinTecnico = visitas.filter(
    (v) => !v.tecnicoId && !['REALIZADA', 'CANCELADA'].includes(v.estado),
  ).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Visitas técnicas</h1>
        <p className="text-sm text-slate-500 font-medium">
          Agenda de campo. Las visitas se programan desde el proyecto.
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      {sinTecnico > 0 && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg font-medium flex items-center gap-2">
          <UserCog className="w-4 h-4 shrink-0" />
          {sinTecnico} visita{sinTecnico > 1 ? 's' : ''} abierta{sinTecnico > 1 ? 's' : ''} sin
          técnico asignado. Ábrelas desde el proyecto para asignar a quién va.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por obra, cliente, ciudad o técnico…"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
          />
        </div>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoVisita | 'ABIERTAS' | 'TODAS')}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20"
        >
          <option value="ABIERTAS">Abiertas ({abiertas})</option>
          <option value="TODAS">Todas</option>
          {ESTADOS_VISITA.map((s) => (
            <option key={s} value={s}>
              {ETIQUETA_VISITA[s]}
            </option>
          ))}
        </select>
      </div>

      {cargando ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-sm text-slate-400 text-center py-14">Cargando agenda…</p>
        </div>
      ) : grupos.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs text-center py-14 px-6">
          <p className="text-sm font-bold text-slate-700">
            {visitas.length === 0 ? 'No hay visitas programadas' : 'Ninguna visita coincide'}
          </p>
          <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
            {visitas.length === 0
              ? 'Las visitas se programan desde el proyecto, en Proyectos → abrir la obra → Programar visita. También se generan cuando un cliente pide acompañamiento técnico.'
              : 'Prueba con otro texto o cambia el filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(([dia, delDia]) => (
            <div key={dia}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {dia === 'sin-fecha' ? 'Sin fecha definida' : fechaLarga(dia)}
                </h2>
                <span className="text-[11px] text-slate-400">
                  · {delDia.length} visita{delDia.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs divide-y divide-slate-100 overflow-hidden">
                {delDia.map((v) => (
                  <div key={v.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COLOR_VISITA[v.estado]}`}
                          >
                            {ETIQUETA_VISITA[v.estado]}
                          </span>
                          {v.hora && (
                            <span className="text-xs font-semibold text-slate-600 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {v.hora}
                            </span>
                          )}
                          <span className="text-sm font-bold text-slate-900">{v.proyecto}</span>
                          <span className="text-xs text-slate-400">{v.codigoProyecto}</span>
                        </div>

                        <p className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>{v.cliente}</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {v.direccion || v.ciudad}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 ${
                              v.tecnico ? '' : 'text-amber-700 font-semibold'
                            }`}
                          >
                            <UserCog className="w-3 h-3" /> {v.tecnico ?? 'Sin técnico'}
                          </span>
                        </p>

                        {v.resultado && (
                          <div className="mt-2.5 p-3 rounded-lg bg-emerald-50/60 border border-emerald-200">
                            <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
                              Informe
                            </p>
                            <p className="text-xs text-emerald-900 leading-relaxed">{v.resultado}</p>
                          </div>
                        )}
                        {v.observaciones && (
                          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                            {v.observaciones}
                          </p>
                        )}
                      </div>

                      {puede('projects.write') && TRANSICIONES_VISITA[v.estado].length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {TRANSICIONES_VISITA[v.estado].map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant={s === 'CANCELADA' ? 'outline' : s === 'REALIZADA' ? 'pintuco' : 'secondary'}
                              disabled={accionando}
                              onClick={() => void mover(v, s)}
                            >
                              {s === 'REALIZADA' ? 'Cerrar con informe' : ETIQUETA_VISITA[s]}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cerrar la visita con su informe */}
      {cerrando && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4">
          <form
            onSubmit={cerrarVisita}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Cerrar la visita</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cerrando.proyecto} · {cerrando.cliente}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCerrando(null)}
                aria-label="Cancelar"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label
                htmlFor="informe-visita"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Qué se encontró en la obra <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="informe-visita"
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                rows={4}
                required
                placeholder="Estado de la superficie, patologías confirmadas, recomendación de sistema…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
              />
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Este texto le llega al cliente como informe de la visita. Es la única constancia de
                qué se vio en la obra.
              </p>
            </div>

            <Input
              label="Observaciones internas (opcional)"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas para el equipo; no se envían al cliente"
            />

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setCerrando(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="pintuco"
                isLoading={accionando}
                disabled={!resultado.trim()}
              >
                Cerrar visita
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Reprogramar */}
      {reprogramando && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4">
          <form
            onSubmit={reprogramar}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Reprogramar visita</h3>
                <p className="text-xs text-slate-500 mt-0.5">{reprogramando.proyecto}</p>
              </div>
              <button
                type="button"
                onClick={() => setReprogramando(null)}
                aria-label="Cancelar"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nueva fecha"
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                required
                leftIcon={<CalendarClock className="w-4 h-4" />}
              />
              <Input
                label="Hora"
                value={nuevaHora}
                onChange={(e) => setNuevaHora(e.target.value)}
                placeholder="Ej. 9:00 a. m."
                leftIcon={<Clock className="w-4 h-4" />}
              />
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              El cliente recibe una notificación con la fecha nueva.
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setReprogramando(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="pintuco" isLoading={accionando} disabled={!nuevaFecha}>
                Reprogramar
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
