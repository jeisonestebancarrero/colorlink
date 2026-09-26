import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeySquare, Loader2, Lock, RotateCcw } from 'lucide-react';
import { permisoService, type PermisoDeUsuario } from '../services/admin';
import { Button } from '../components/common/Button';

/**
 * Permisos de una persona concreta.
 *
 * La base ya sabía guardar excepciones por persona (`user_permissions`) y
 * `has_permission` las respetaba, pero no había pantalla: dar a un asesor
 * concreto el permiso de facturar obligaba a dárselo a todos los asesores.
 *
 * Toda excepción pide un motivo. Es lo que se lee meses después en la
 * auditoría, cuando nadie recuerda por qué esa persona puede anular facturas.
 */

interface Props {
  userId: string;
  roles: string[];
}

export const PermisosDelUsuarioPanel: React.FC<Props> = ({ userId, roles }) => {
  const [permisos, setPermisos] = useState<PermisoDeUsuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<PermisoDeUsuario | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setPermisos(await permisoService.deUsuario(userId, roles));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los permisos.');
    } finally {
      setCargando(false);
    }
  }, [userId, roles]);

  useEffect(() => { void cargar(); }, [cargar]);

  const porModulo = useMemo(() => {
    const g = new Map<string, PermisoDeUsuario[]>();
    for (const p of permisos) g.set(p.module, [...(g.get(p.module) ?? []), p]);
    return [...g.entries()];
  }, [permisos]);

  const confirmar = async () => {
    if (!editando) return;
    setGuardando(true);
    setError('');
    try {
      await permisoService.fijarDeUsuario(userId, editando.code, !editando.efectivo, motivo);
      setEditando(null);
      setMotivo('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar la excepción.');
    } finally {
      setGuardando(false);
    }
  };

  const restablecer = async (p: PermisoDeUsuario) => {
    setError('');
    try {
      await permisoService.restablecerDeUsuario(userId, p.code);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible restablecer el permiso.');
    }
  };

  if (cargando) {
    return (
      <p className="text-xs text-slate-500 flex items-center gap-2 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando permisos…
      </p>
    );
  }

  const excepciones = permisos.filter((p) => p.excepcion !== null).length;

  return (
    <div className="space-y-3">
      <header>
        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <KeySquare className="w-3.5 h-3.5 text-[#004F9F]" /> Permisos de esta persona
        </h4>
        <p className="text-[11px] text-slate-500 leading-snug mt-0.5 max-w-md">
          Lo normal es que los dé el rol. Aquí se concede o se retira uno a una sola
          persona, con un motivo que queda en la auditoría.
          {excepciones > 0 && <> Tiene <strong>{excepciones}</strong> {excepciones === 1 ? 'excepción' : 'excepciones'}.</>}
        </p>
      </header>

      {error && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-medium">{error}</div>
      )}

      {editando && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
          <p className="text-[11px] text-amber-900 font-semibold">
            {editando.efectivo ? 'Retirar' : 'Conceder'} «{editando.label}» solo a esta persona
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Motivo (obligatorio): por ejemplo, cubre la caja de Guayabal en vacaciones"
            className="w-full text-xs rounded-lg border border-amber-300 p-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditando(null); setMotivo(''); }}>Cancelar</Button>
            <Button
              variant="primary" size="sm" isLoading={guardando}
              disabled={motivo.trim() === ''}
              onClick={() => void confirmar()}
              className="bg-[#004F9F] text-white text-xs font-bold"
            >
              Guardar excepción
            </Button>
          </div>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
        {porModulo.map(([modulo, lista]) => (
          <div key={modulo}>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">{modulo}</p>
            <ul className="space-y-1">
              {lista.map((p) => (
                <li key={p.code} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={p.efectivo}
                    onChange={() => { setEditando(p); setMotivo(''); }}
                    className="rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F] w-4 h-4 cursor-pointer"
                    aria-label={`${p.label}: ${p.efectivo ? 'concedido' : 'sin conceder'}`}
                  />
                  <span className="font-semibold text-slate-700 flex-1 flex items-center gap-1">
                    {p.label}
                    {p.isCritical && <Lock className="w-3 h-3 text-amber-600" aria-label="Permiso crítico" />}
                  </span>
                  {p.excepcion === null ? (
                    <span className="text-[10px] text-slate-400">{p.porRol ? 'por su rol' : '—'}</span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span
                        title={p.motivo ?? undefined}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.excepcion ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                      >
                        {p.excepcion ? 'concedido aparte' : 'retirado aparte'}
                      </span>
                      <button
                        onClick={() => void restablecer(p)}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                        aria-label={`Volver a lo que dice el rol para ${p.label}`}
                        title="Volver a lo que dice su rol"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};
