import React, { useCallback, useEffect, useState } from 'react';
import {
  UserPlus, Check, X, Loader2, Mail, Phone, MapPin, Building2,
  AlertTriangle, CheckCircle2, History, RotateCcw,
} from 'lucide-react';
import {
  vinculacionesService, type SolicitudVinculacion,
} from '../../services/vinculaciones';
import { Button } from './Button';

/**
 * Aprobar o rechazar la vinculación de una persona a una cuenta empresarial.
 *
 * Sin esta pantalla el flujo se cortaba a la mitad: el segundo empleado de una
 * constructora se registraba con el NIT de su empresa, el alta dejaba la
 * solicitud, se le avisaba al dueño… y no había dónde resolverla. La persona
 * quedaba con cuenta personal, sin ver los proyectos ni los precios de su
 * empresa, y sin manera de saber por qué.
 *
 * El mismo componente sirve en los dos lados y por eso no depende de ningún
 * contexto de una sola aplicación (ni ProjectContext ni AdminAuthContext):
 *   · `cliente`  — el dueño o administrador de la empresa, en su perfil.
 *   · `portal`   — el administrador de la plataforma, para destrabar soporte
 *                  cuando el dueño de esa cuenta no aparece. Muestra además de
 *                  quién es la empresa, porque ahí se ven las de todos.
 *
 * QUIÉN VE QUÉ no se decide aquí. `solicitudes_de_vinculacion()` solo devuelve
 * lo que quien pregunta puede resolver; si no administra ninguna empresa la
 * lista llega vacía y el bloque no se dibuja.
 */

interface Props {
  contexto: 'cliente' | 'portal';
  /** Avisa al padre para que refresque contadores propios. */
  onCambio?: () => void;
}

const COLORES = ['#004F9F', '#0F766E', '#7C3AED', '#B45309', '#BE123C', '#1D4ED8'];

/** Color estable por nombre: la misma persona conserva su color entre cargas. */
function colorDe(texto: string): string {
  let suma = 0;
  for (const c of texto) suma += c.charCodeAt(0);
  return COLORES[suma % COLORES.length];
}

function inicialesDe(texto: string): string {
  const partes = texto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export const SolicitudesDeVinculacion: React.FC<Props> = ({ contexto, onCambio }) => {
  const [solicitudes, setSolicitudes] = useState<SolicitudVinculacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  /** Id de la solicitud cuyo rechazo está esperando confirmación. */
  const [confirmandoRechazo, setConfirmandoRechazo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setSolicitudes(await vinculacionesService.listar());
    } catch (err) {
      // Quien no administra empresas no recibe error, recibe lista vacía. Un
      // error aquí es real y hay que decirlo, no dejar el bloque en blanco.
      setAviso({ tipo: 'error', texto: (err as Error).message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const resolver = async (s: SolicitudVinculacion, aprobar: boolean) => {
    setProcesando(s.id);
    setConfirmandoRechazo(null);
    setAviso(null);
    try {
      await vinculacionesService.resolver(s.id, aprobar);
      const quien = s.nombre ?? s.email ?? 'La persona';
      setAviso({
        tipo: 'ok',
        texto: aprobar
          ? `${quien} ya hace parte de ${s.empresa}. Se le avisó.`
          : `Se rechazó la vinculación de ${quien}. Se le avisó.`,
      });
      await cargar();
      onCambio?.();
    } catch (err) {
      setAviso({ tipo: 'error', texto: (err as Error).message });
      // Una solicitud que ya resolvió otra persona sigue apareciendo hasta que
      // se recarga: sin esto, el botón se queda ofreciendo algo imposible.
      await cargar();
    } finally {
      setProcesando(null);
    }
  };

  const reabrir = async (s: SolicitudVinculacion) => {
    setProcesando(s.id);
    setAviso(null);
    try {
      await vinculacionesService.reabrir(s.id);
      setAviso({
        tipo: 'ok',
        texto: `La solicitud de ${s.nombre ?? s.email ?? 'esta persona'} vuelve a estar pendiente.`,
      });
      await cargar();
      onCambio?.();
    } catch (err) {
      setAviso({ tipo: 'error', texto: (err as Error).message });
      await cargar();
    } finally {
      setProcesando(null);
    }
  };

  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE');
  const historial = solicitudes.filter((s) => s.estado !== 'PENDIENTE');

  // En la tienda el bloque solo existe si hay algo que mirar: a un cliente
  // particular no se le anuncia una función de empresas que no tiene.
  if (cargando && contexto === 'cliente') return null;
  if (contexto === 'cliente' && solicitudes.length === 0 && !aviso) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#004F9F]/10 flex items-center justify-center shrink-0">
            <UserPlus className="w-4.5 h-4.5 text-[#004F9F]" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Solicitudes de vinculación
            </h3>
            <p className="text-xs text-slate-500">
              {contexto === 'portal'
                ? 'Personas que pidieron entrar a una cuenta empresarial'
                : 'Personas que pidieron entrar a tu cuenta empresarial'}
            </p>
          </div>
        </div>
        {pendientes.length > 0 && (
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold">
            {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {aviso && (
        <div
          className={`flex items-start gap-2 text-xs font-semibold rounded-lg px-3 py-2.5 ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {aviso.tipo === 'ok'
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
            : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
          <span>{aviso.texto}</span>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Cargando solicitudes…</span>
        </div>
      ) : pendientes.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">
          No hay solicitudes pendientes.
        </p>
      ) : (
        <ul className="space-y-3">
          {pendientes.map((s) => {
            const quien = s.nombre ?? s.email ?? 'Sin nombre';
            const enCurso = procesando === s.id;
            return (
              <li
                key={s.id}
                className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-extrabold shrink-0"
                    style={{ backgroundColor: colorDe(quien) }}
                  >
                    {inicialesDe(quien)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{quien}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      {s.email && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{s.email}</span>
                        </span>
                      )}
                      {s.telefono && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 shrink-0" />{s.telefono}
                        </span>
                      )}
                      {s.ciudad && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />{s.ciudad}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {contexto === 'portal' && (
                        <span className="inline-flex items-center gap-1 mr-2 font-semibold text-slate-700">
                          <Building2 className="w-3.5 h-3.5" />{s.empresa}
                        </span>
                      )}
                      Se registró con el NIT{' '}
                      <strong className="text-slate-700">{s.nitEscrito ?? 'sin NIT'}</strong>
                      {' · '}{fecha(s.creada)}
                    </p>
                  </div>
                </div>

                {confirmandoRechazo === s.id ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2.5">
                    <p className="text-xs text-rose-800 font-semibold">
                      ¿Rechazar a {quien}?
                    </p>
                    <p className="text-[11px] text-rose-700 leading-relaxed">
                      Se le avisa que no fue aprobado. Su cuenta personal sigue
                      funcionando, pero <strong>no podrá volver a pedirlo desde
                      el registro</strong>: si te equivocas, la reabres tú desde
                      «ya resueltas».
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="danger" className="text-xs"
                        onClick={() => void resolver(s, false)}
                      >
                        Sí, rechazar
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="text-xs"
                        onClick={() => setConfirmandoRechazo(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {/* El icono va por `leftIcon`, no como hijo: metido dentro
                        de `children` el botón lo envuelve junto al texto en un
                        mismo span y la etiqueta se parte en dos renglones. */}
                    <Button
                      size="sm" variant="pintuco" className="text-xs font-bold"
                      isLoading={enCurso} disabled={enCurso}
                      leftIcon={<Check className="w-3.5 h-3.5" />}
                      onClick={() => void resolver(s, true)}
                    >
                      Aprobar vinculación
                    </Button>
                    <Button
                      size="sm" variant="outline" className="text-xs font-bold"
                      disabled={enCurso}
                      leftIcon={<X className="w-3.5 h-3.5" />}
                      onClick={() => setConfirmandoRechazo(s.id)}
                    >
                      Rechazar
                    </Button>
                  </div>
                )}

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Al aprobar, esta persona ve los proyectos, los pedidos y los
                  precios de {contexto === 'portal' ? s.empresa : 'tu empresa'}.
                  Apruébala solo si trabaja contigo.
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {historial.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setVerHistorial((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#004F9F] cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            {verHistorial ? 'Ocultar' : 'Ver'} las {historial.length} ya resueltas
          </button>
          {verHistorial && (
            <ul className="mt-2.5 space-y-1.5">
              {historial.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 border-b border-slate-100 pb-1.5"
                >
                  <span
                    className={`px-1.5 py-0.5 rounded font-extrabold text-[10px] ${
                      s.estado === 'APROBADA'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {s.estado}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {s.nombre ?? s.email ?? 'Sin nombre'}
                  </span>
                  {contexto === 'portal' && <span>· {s.empresa}</span>}
                  {s.resuelta && <span>· {fecha(s.resuelta)}</span>}
                  {s.resueltaPor && <span>· por {s.resueltaPor}</span>}
                  {/* Solo las rechazadas. Deshacer una APROBADA sería sacar a
                      alguien de la empresa por la puerta de atrás, y para eso
                      está la baja del miembro. */}
                  {s.estado === 'RECHAZADA' && (
                    <button
                      type="button"
                      disabled={procesando === s.id}
                      onClick={() => void reabrir(s)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#004F9F]
                                 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reabrir
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
