import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Search, MapPin, Ruler, CalendarClock, UserPlus, X,
  Stethoscope, ClipboardList, Wrench, AlertTriangle, Building2, Phone, Mail,
} from 'lucide-react';
import {
  formatearFecha,
  proyectoService, visitaService,
  ESTADOS_PROYECTO, ETIQUETA_PROYECTO, COLOR_PROYECTO,
  ETIQUETA_VISITA, COLOR_VISITA,
  type EstadoProyecto, type ProyectoLista, type ProyectoDetalle,
} from '../../services/proyectosBackoffice';
import { useAdminAuth } from '../AdminAuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { ProgramarVisita } from '../ProgramarVisita';

const fecha = formatearFecha;

/**
 * Proyectos de obra en el back-office.
 *
 * Qué ve cada persona lo decide el servidor, no esta pantalla: administración
 * y quien tenga el permiso `projects.read` ven todos los proyectos; un técnico
 * ve solo los que le asignaron. Por eso la lista vacía de un técnico no es un
 * error: es que todavía no le han asignado obra.
 */
export const ProyectosPage: React.FC = () => {
  const { puede } = useAdminAuth();
  const [proyectos, setProyectos] = useState<ProyectoLista[]>([]);
  const [detalle, setDetalle] = useState<ProyectoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState<EstadoProyecto | 'TODOS'>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [accionando, setAccionando] = useState(false);
  const [nota, setNota] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [tecnicos, setTecnicos] = useState<Array<{ id: string; nombre: string; rol: string }>>([]);
  const [aAsignar, setAAsignar] = useState('');
  const [rolAsignar, setRolAsignar] = useState<'TECNICO' | 'ASESOR'>('TECNICO');
  const [programando, setProgramando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      setProyectos(await proyectoService.listar());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar los proyectos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  useEffect(() => {
    if (asignando && tecnicos.length === 0) {
      visitaService
        .tecnicos()
        .then(setTecnicos)
        .catch((e) =>
          setError(e instanceof Error ? e.message : 'No fue posible cargar el personal interno.'),
        );
    }
  }, [asignando, tecnicos.length]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return proyectos.filter(
      (p) =>
        (estado === 'TODOS' || p.estado === estado) &&
        (!q ||
          p.codigo.toLowerCase().includes(q) ||
          p.nombre.toLowerCase().includes(q) ||
          p.cliente.toLowerCase().includes(q) ||
          (p.empresa ?? '').toLowerCase().includes(q) ||
          p.ciudad.toLowerCase().includes(q)),
    );
  }, [proyectos, estado, busqueda]);

  const abrir = async (id: string) => {
    setError('');
    setNota('');
    try {
      setDetalle(await proyectoService.detalle(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible abrir el proyecto.');
    }
  };

  const refrescar = async () => {
    if (detalle) setDetalle(await proyectoService.detalle(detalle.id));
    await cargar();
  };

  const cambiarEstado = async (nuevo: EstadoProyecto) => {
    if (!detalle) return;
    setAccionando(true);
    setError('');
    try {
      await proyectoService.cambiarEstado(detalle.id, nuevo, nota.trim() || undefined);
      setNota('');
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cambiar el estado.');
    } finally {
      setAccionando(false);
    }
  };

  const asignar = async () => {
    if (!detalle || !aAsignar) return;
    setAccionando(true);
    setError('');
    try {
      await proyectoService.asignar(detalle.id, aAsignar, rolAsignar);
      setAsignando(false);
      setAAsignar('');
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible asignar.');
    } finally {
      setAccionando(false);
    }
  };

  const retirar = async (userId: string) => {
    if (!detalle) return;
    setAccionando(true);
    try {
      await proyectoService.retirarAsignacion(detalle.id, userId);
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible retirar la asignación.');
    } finally {
      setAccionando(false);
    }
  };

  // ── Detalle ───────────────────────────────────────────────────────────────
  if (detalle) {
    return (
      <div className="space-y-5">
        <button
          onClick={() => setDetalle(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a proyectos
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {detalle.nombre}
              </h1>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${COLOR_PROYECTO[detalle.estado]}`}
              >
                {ETIQUETA_PROYECTO[detalle.estado]}
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {detalle.codigo} · {detalle.cliente}
              {detalle.empresa ? ` · ${detalle.empresa}` : ''} · creado el {fecha(detalle.creado)}
            </p>
          </div>

          {puede('projects.write') && (
            <Button
              variant="pintuco"
              size="sm"
              leftIcon={<Wrench className="w-3.5 h-3.5" />}
              onClick={() => setProgramando(true)}
            >
              Programar visita
            </Button>
          )}
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">
            {/* Datos de la obra */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
              <h3 className="text-sm font-extrabold text-slate-900 mb-4">La obra</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <Dato icono={<MapPin className="w-3.5 h-3.5" />} rotulo="Ciudad" valor={detalle.ciudad} />
                <Dato
                  icono={<Ruler className="w-3.5 h-3.5" />}
                  rotulo="Área"
                  valor={detalle.areaM2 ? `${detalle.areaM2} m²` : '—'}
                />
                <Dato icono={<ClipboardList className="w-3.5 h-3.5" />} rotulo="Tipo" valor={detalle.tipo} />
                <Dato
                  icono={<CalendarClock className="w-3.5 h-3.5" />}
                  rotulo="Requerido"
                  valor={fecha(detalle.requeridoPara)}
                />
              </div>

              {(detalle.direccion || detalle.superficie || detalle.ambiente) && (
                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  {detalle.direccion && <Dato rotulo="Dirección" valor={detalle.direccion} />}
                  {detalle.superficie && <Dato rotulo="Superficie" valor={detalle.superficie} />}
                  {detalle.ambiente && <Dato rotulo="Ambiente" valor={detalle.ambiente} />}
                </div>
              )}

              {detalle.descripcion && (
                <p className="text-sm text-slate-600 mt-4 pt-4 border-t border-slate-100 leading-relaxed">
                  {detalle.descripcion}
                </p>
              )}
              {detalle.notasCliente && (
                <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Notas del cliente
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">{detalle.notasCliente}</p>
                </div>
              )}
            </div>

            {/* Diagnóstico */}
            {(detalle.diagnosticos.some((d) => d.resumen || d.resumenTecnico) ||
              detalle.patologias.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
                <h3 className="text-sm font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-slate-400" /> Diagnóstico
                </h3>
                <div className="space-y-3">
                  {detalle.diagnosticos
                    .filter((d) => d.resumen || d.resumenTecnico || d.requiereVisita)
                    .map((d) => (
                    <div key={d.id} className="rounded-lg border border-slate-200 p-3.5">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-slate-800">
                          {d.tipo.replace(/_/g, ' ')}
                        </span>
                        {d.nivel && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            {d.nivel}
                          </span>
                        )}
                        {d.requiereVisita && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Requiere visita
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 ml-auto">{fecha(d.creado)}</span>
                      </div>
                      {d.resumenTecnico && (
                        <p className="text-sm text-slate-700 leading-relaxed">{d.resumenTecnico}</p>
                      )}
                      {d.resumen && !d.resumenTecnico && (
                        <p className="text-sm text-slate-600 leading-relaxed">{d.resumen}</p>
                      )}
                    </div>
                  ))}
                </div>

                {detalle.patologias.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Patologías detectadas
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {detalle.patologias.map((p, i) => (
                        <span
                          key={i}
                          className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200"
                        >
                          {p.nombre}
                          {p.severidad ? ` · ${p.severidad}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Visitas */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-extrabold text-slate-900">Visitas técnicas</h3>
              </div>
              {detalle.visitas.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  Todavía no se ha programado ninguna visita.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {detalle.visitas.map((v) => (
                    <div key={v.id} className="px-5 py-3.5 flex flex-wrap items-center gap-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COLOR_VISITA[v.estado]}`}
                      >
                        {ETIQUETA_VISITA[v.estado]}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">
                        {fecha(v.fecha)}
                        {v.hora ? ` · ${v.hora}` : ''}
                      </span>
                      <span className="text-xs text-slate-500">{v.tecnico ?? 'Sin técnico'}</span>
                      {v.resultado && (
                        <p className="w-full text-xs text-slate-600 leading-relaxed pt-1">
                          {v.resultado}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cronología */}
            {detalle.cronologia.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
                <h3 className="text-sm font-extrabold text-slate-900 mb-4">Cronología</h3>
                <ol className="space-y-3">
                  {detalle.cronologia.map((c) => (
                    <li key={c.numero} className="flex gap-3">
                      <span
                        className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                          c.estado === 'COMPLETADO'
                            ? 'bg-emerald-100 text-emerald-700'
                            : c.estado === 'EN_CURSO'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {c.numero}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{c.titulo}</p>
                        {c.descripcion && (
                          <p className="text-xs text-slate-500 leading-relaxed">{c.descripcion}</p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {[fecha(c.fecha), c.responsable].filter((x) => x && x !== '—').join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Columna lateral */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
              <h3 className="text-sm font-extrabold text-slate-900 mb-3">Cliente</h3>
              <p className="text-sm font-semibold text-slate-800">{detalle.cliente}</p>
              {detalle.empresa && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> {detalle.empresa}
                </p>
              )}
              {detalle.correoCliente && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 break-all">
                  <Mail className="w-3.5 h-3.5 shrink-0" /> {detalle.correoCliente}
                </p>
              )}
              {detalle.telefonoCliente && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> {detalle.telefonoCliente}
                </p>
              )}
            </div>

            {/* Equipo asignado */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold text-slate-900">Equipo asignado</h3>
                {puede('projects.assign') && !asignando && (
                  <button
                    onClick={() => setAsignando(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#004F9F] hover:underline"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Asignar
                  </button>
                )}
              </div>

              {detalle.asignados.length === 0 && !asignando && (
                <p className="text-xs text-slate-400">
                  Nadie asignado todavía. Un técnico solo puede abrir el proyecto si está asignado.
                </p>
              )}

              <div className="space-y-1.5">
                {detalle.asignados.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{a.nombre}</p>
                      <p className="text-[11px] text-slate-500">
                        {a.rol === 'TECNICO' ? 'Técnico de campo' : 'Asesor comercial'}
                      </p>
                    </div>
                    {puede('projects.assign') && (
                      <button
                        onClick={() => void retirar(a.id)}
                        disabled={accionando}
                        aria-label={`Retirar a ${a.nombre}`}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {asignando && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
                  <Select
                    label="Persona"
                    options={[
                      { value: '', label: 'Selecciona…' },
                      ...tecnicos.map((t) => ({ value: t.id, label: t.nombre })),
                    ]}
                    value={aAsignar}
                    onChange={(e) => setAAsignar(e.target.value)}
                  />
                  <Select
                    label="Rol en el proyecto"
                    options={[
                      { value: 'TECNICO', label: 'Técnico de campo' },
                      { value: 'ASESOR', label: 'Asesor comercial' },
                    ]}
                    value={rolAsignar}
                    onChange={(e) => setRolAsignar(e.target.value as 'TECNICO' | 'ASESOR')}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setAsignando(false)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      variant="pintuco"
                      isLoading={accionando}
                      disabled={!aAsignar}
                      onClick={() => void asignar()}
                    >
                      Asignar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Estado */}
            {puede('projects.write') && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
                <h3 className="text-sm font-extrabold text-slate-900 mb-3">Cambiar estado</h3>
                <Input
                  label="Nota para el cliente (opcional)"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Ej. Falta confirmar el color del zócalo"
                />
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  El cliente recibe una notificación con el estado y esta nota.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {ESTADOS_PROYECTO.filter((s) => s !== detalle.estado).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === 'CANCELADO' ? 'outline' : 'secondary'}
                      isLoading={accionando}
                      onClick={() => void cambiarEstado(s)}
                    >
                      {ETIQUETA_PROYECTO[s]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {detalle.solicitudes.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
                <h3 className="text-sm font-extrabold text-slate-900 mb-3">
                  Acompañamiento solicitado
                </h3>
                <div className="space-y-2">
                  {detalle.solicitudes.map((s) => (
                    <div key={s.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-800">
                          {s.tipo.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 ml-auto">
                          {s.estado.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {s.descripcion && (
                        <p className="text-xs text-slate-600 leading-relaxed">{s.descripcion}</p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1">
                        Solicitado el {fecha(s.solicitada)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {programando && (
          <ProgramarVisita
            projectId={detalle.id}
            direccionSugerida={detalle.direccion ?? detalle.ciudad}
            solicitudes={detalle.solicitudes}
            onCerrar={() => setProgramando(false)}
            onProgramada={() => {
              setProgramando(false);
              void refrescar();
            }}
          />
        )}
      </div>
    );
  }

  // ── Listado ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Proyectos</h1>
        <p className="text-sm text-slate-500 font-medium">
          Obras de los clientes, con su diagnóstico, su equipo y sus visitas.
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código, obra, cliente o ciudad…"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
          />
        </div>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoProyecto | 'TODOS')}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20"
        >
          <option value="TODOS">Todos los estados</option>
          {ESTADOS_PROYECTO.map((s) => (
            <option key={s} value={s}>
              {ETIQUETA_PROYECTO[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {cargando ? (
          <p className="text-sm text-slate-400 text-center py-14">Cargando proyectos…</p>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-14 px-6">
            <p className="text-sm font-bold text-slate-700">
              {proyectos.length === 0 ? 'Todavía no hay proyectos' : 'Ningún proyecto coincide'}
            </p>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
              {proyectos.length === 0
                ? 'Los proyectos los crean los clientes desde la tienda, al diagnosticar una superficie o pedir acompañamiento. Si eres técnico, aquí verás solo los que te asignen.'
                : 'Prueba con otro texto o cambia el filtro de estado.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="text-left px-5 py-3">Obra</th>
                  <th className="text-left px-3 py-3">Cliente</th>
                  <th className="text-left px-3 py-3">Ciudad</th>
                  <th className="text-right px-3 py-3">Área</th>
                  <th className="text-left px-3 py-3">Equipo</th>
                  <th className="text-left px-3 py-3">Estado</th>
                  <th className="text-right px-5 py-3">Creado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => void abrir(p.id)}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{p.nombre}</p>
                      <p className="text-xs text-slate-500">
                        {p.codigo} · {p.tipo}
                        {p.visitasPendientes > 0 && (
                          <span className="ml-2 text-amber-700 font-bold">
                            {p.visitasPendientes} visita{p.visitasPendientes > 1 ? 's' : ''} pendiente
                            {p.visitasPendientes > 1 ? 's' : ''}
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="text-slate-800">{p.cliente}</p>
                      {p.empresa && <p className="text-xs text-slate-500">{p.empresa}</p>}
                    </td>
                    <td className="px-3 py-3.5 text-slate-600">{p.ciudad}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-slate-600">
                      {p.areaM2 ? `${p.areaM2} m²` : '—'}
                    </td>
                    <td className="px-3 py-3.5 text-xs text-slate-600">
                      {p.asignados.length === 0 ? (
                        <span className="text-amber-700 font-semibold">Sin asignar</span>
                      ) : (
                        p.asignados.map((a) => a.nombre).join(', ')
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COLOR_PROYECTO[p.estado]}`}
                      >
                        {ETIQUETA_PROYECTO[p.estado]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-slate-500">
                      {fecha(p.creado)}
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

const Dato: React.FC<{ icono?: React.ReactNode; rotulo: string; valor: string }> = ({
  icono,
  rotulo,
  valor,
}) => (
  <div>
    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
      {icono}
      {rotulo}
    </p>
    <p className="text-sm text-slate-800 font-semibold mt-0.5">{valor}</p>
  </div>
);
