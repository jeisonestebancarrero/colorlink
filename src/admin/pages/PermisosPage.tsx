import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Info } from 'lucide-react';
import { permisoService, ROLES_INTERNOS, ETIQUETA_ROL, type Permiso } from '../../services/admin';
import { IconoModulo } from '../IconosDeModulo';
import { RolesPanel } from '../RolesPanel';

/**
 * Matriz de permisos editable.
 *
 * Es la pantalla que sustituye a "desplegar código para cambiar un acceso".
 * Cada casilla escribe en `role_permissions` mediante una función que
 * verifica administrador en el servidor.
 *
 * Importante: esto decide qué se OFRECE. Las políticas RLS siguen siendo la
 * última línea de defensa; un permiso mal configurado no expone filas ajenas.
 */
export const PermisosPage: React.FC = () => {
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [matriz, setMatriz] = useState<Record<string, Set<string>>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardandoCelda, setGuardandoCelda] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cat, m] = await Promise.all([permisoService.catalogo(), permisoService.matriz()]);
        setPermisos(cat);
        setMatriz(m);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No fue posible cargar los permisos.');
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const porModulo = useMemo(() => {
    const g = new Map<string, Permiso[]>();
    for (const p of permisos) g.set(p.module, [...(g.get(p.module) ?? []), p]);
    return [...g.entries()];
  }, [permisos]);

  const alternar = async (rol: string, permiso: Permiso) => {
    const clave = `${rol}:${permiso.code}`;
    const concedidoAhora = matriz[rol]?.has(permiso.code) ?? false;
    setGuardandoCelda(clave);
    setError('');

    // Optimista: la casilla responde de inmediato y se revierte si falla.
    setMatriz((m) => {
      const copia = { ...m };
      const set = new Set(copia[rol] ?? []);
      concedidoAhora ? set.delete(permiso.code) : set.add(permiso.code);
      copia[rol] = set;
      return copia;
    });

    try {
      await permisoService.cambiar(rol, permiso.code, !concedidoAhora);
    } catch (e) {
      setMatriz((m) => {
        const copia = { ...m };
        const set = new Set(copia[rol] ?? []);
        concedidoAhora ? set.add(permiso.code) : set.delete(permiso.code);
        copia[rol] = set;
        return copia;
      });
      setError(e instanceof Error ? e.message : 'No fue posible cambiar el permiso.');
    } finally {
      setGuardandoCelda(null);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-12 h-12 border-4 border-[#004F9F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="ShieldCheck" /> Permisos
          </h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Crea roles, decide qué ve cada uno y qué puede hacer. Los cambios se aplican
          de inmediato, sin desplegar.
        </p>
      </div>

      {/* Qué VE cada rol. Va primero porque es la pregunta que se hace uno al
          crear un cargo nuevo; los permisos afinan lo que puede hacer dentro. */}
      <RolesPanel />

      <div className="pt-2 border-t border-slate-200">
        <h2 className="text-base font-extrabold text-slate-900">Qué puede hacer cada rol</h2>
        <p className="text-xs text-slate-500 mt-1">
          Ver una pantalla y poder escribir en ella son cosas distintas. Aquí se decide
          lo segundo.
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
      )}

      <div className="flex items-start gap-2.5 p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-900 font-medium">
          Los permisos deciden qué módulos y acciones se ofrecen. El acceso a los
          datos lo sigue controlando la base: un permiso mal configurado nunca
          expondrá información de otro cliente o de otra empresa.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-slate-500 font-bold sticky left-0 bg-slate-50 z-10 min-w-[240px]">
                Permiso
              </th>
              {ROLES_INTERNOS.map((r) => (
                <th key={r} className="px-2 py-3 text-[10px] font-bold text-slate-500 text-center align-bottom">
                  <span className="block leading-tight">{ETIQUETA_ROL[r]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porModulo.map(([modulo, lista]) => (
              <React.Fragment key={modulo}>
                <tr>
                  <td colSpan={ROLES_INTERNOS.length + 1}
                    className="px-4 py-2 bg-slate-100/70 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                    {modulo}
                  </td>
                </tr>
                {lista.map((p) => (
                  <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800">{p.label}</span>
                        {p.isCritical && (
                          <Lock className="w-3 h-3 text-amber-600 shrink-0" aria-label="Permiso crítico" />
                        )}
                      </div>
                      <code className="text-[10px] text-slate-400">{p.code}</code>
                    </td>
                    {ROLES_INTERNOS.map((rol) => {
                      const concedido = matriz[rol]?.has(p.code) ?? false;
                      const clave = `${rol}:${p.code}`;
                      return (
                        <td key={rol} className="px-2 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={concedido}
                            disabled={guardandoCelda === clave}
                            onChange={() => void alternar(rol, p)}
                            className="rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F] w-4 h-4 cursor-pointer disabled:opacity-40"
                            aria-label={`${p.label} para ${ETIQUETA_ROL[rol]}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <Lock className="w-3 h-3 text-amber-600" />
        Permiso crítico: no puede retirarse al administrador, para no dejar el sistema sin quien lo gestione.
      </p>
    </div>
  );
};
