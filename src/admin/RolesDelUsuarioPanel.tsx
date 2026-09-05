import React, { useEffect, useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { rolService, usuarioService, ETIQUETA_ROL, type RolConfigurable } from '../services/admin';

/**
 * Cambiarle el rol a alguien que YA existe.
 *
 * Al dar de alta a una persona sí se le eligen roles; lo que faltaba era
 * poder tocarlos después. Un ascenso, un cambio de área o una salida obligaban
 * a entrar a la base de datos, y era además la única forma de nombrar al
 * primer administrador.
 *
 * Los roles se leen de la configuración y no de una lista fija en el código:
 * el portal deja crear roles propios, y una lista fija los volvería
 * inasignables —crearlos habría sido un callejón sin salida—.
 *
 * Cada cambio sale de inmediato contra el servidor en vez de acumularse hasta
 * un botón «Guardar». Con permisos conviene que lo que se ve sea lo que hay:
 * un formulario a medio guardar deja dudando si la persona ya tiene el acceso.
 * Quien manda es `grant_role` / `revoke_role`, que exigen ser administrador y
 * se niegan a dejar el sistema sin ninguno.
 */
export const RolesDelUsuarioPanel: React.FC<{
  userId: string;
  rolesActuales: string[];
  onCambio: (roles: string[]) => void;
}> = ({ userId, rolesActuales, onCambio }) => {
  const [disponibles, setDisponibles] = useState<RolConfigurable[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    rolService
      .configuracion()
      .then((c) => setDisponibles(c.roles.filter((r) => r.activo)))
      .catch((e) => setError(e instanceof Error ? e.message : 'No fue posible cargar los roles.'))
      .finally(() => setCargando(false));
  }, []);

  const alternar = async (codigo: string, tenia: boolean) => {
    setError('');
    setOcupado(codigo);
    try {
      if (tenia) {
        await usuarioService.revocarRol(userId, codigo);
        onCambio(rolesActuales.filter((r) => r !== codigo));
      } else {
        await usuarioService.otorgarRol(userId, codigo);
        onCambio([...rolesActuales, codigo]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cambiar el rol.');
    } finally {
      setOcupado(null);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando roles…
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <BadgeCheck className="w-4 h-4 text-slate-500" />
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Roles</h4>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
        Definen el acceso base. Cada cambio se guarda al momento.
      </p>

      {error && (
        <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {disponibles.map((r) => {
          const tenia = rolesActuales.includes(r.codigo);
          return (
            <label
              key={r.codigo}
              className={`flex items-center gap-2 text-xs font-medium px-2.5 py-2 rounded-lg border cursor-pointer transition-colors ${
                tenia
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              } ${ocupado ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={tenia}
                disabled={ocupado !== null}
                onChange={() => alternar(r.codigo, tenia)}
                className="rounded border-slate-300"
              />
              <span className="truncate">{r.etiqueta || ETIQUETA_ROL[r.codigo] || r.codigo}</span>
              {ocupado === r.codigo && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
            </label>
          );
        })}
      </div>
    </div>
  );
};
