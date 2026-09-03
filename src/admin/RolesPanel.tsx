import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, Plus, Check, X, AlertTriangle, Archive, Users, Loader2, Pencil,
} from 'lucide-react';
import {
  rolService, type ConfiguracionRoles, type RolConfigurable,
} from '../services/admin';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

/**
 * Roles: crearlos y decidir qué aplicación ve cada uno.
 *
 * Esto faltaba entero. `set_role_view` existía en la base desde el principio
 * pero sin pantalla: decir «que Bodega ya no vea Inventario» solo se podía
 * hacer entrando a la base. Lo único configurable desde el portal era la
 * excepción POR PERSONA, y eso obliga a repetir la misma configuración en cada
 * alta y a que dos personas del mismo cargo acaben con accesos distintos sin
 * que nadie lo note.
 *
 * DOS COSAS QUE CONVIENE SABER ANTES DE USARLA:
 *
 *   · Un rol creado NO se puede eliminar. En PostgreSQL un valor de enum se
 *     añade pero no se borra, así que lo que se hace es ARCHIVARLO: deja de
 *     ofrecerse y de aparecer, pero el valor queda. Piensa el nombre antes.
 *   · Un rol nuevo nace SIN NADA. Heredar los permisos de otro sería la forma
 *     más silenciosa de dar acceso de más.
 *
 * Esta pantalla decide qué se VE. Lo que se puede HACER dentro de cada
 * aplicación son los permisos, que están en su propia matriz: ver una pantalla
 * y poder escribir en ella son dos cosas distintas, y quien reparte accesos
 * tiene que poder decidirlas por separado.
 */
export const RolesPanel: React.FC = () => {
  const [cfg, setCfg] = useState<ConfiguracionRoles | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ codigo: '', etiqueta: '', descripcion: '' });
  const [editando, setEditando] = useState<RolConfigurable | null>(null);

  const cargar = async () => {
    try {
      setCfg(await rolService.configuracion());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar los roles.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const alternar = async (rol: string, viewCode: string, tiene: boolean) => {
    const clave = `${rol}:${viewCode}`;
    setOcupado(clave);
    setError('');
    // Se pinta el cambio antes de que responda el servidor: una matriz de 17
    // columnas en la que cada clic tarda medio segundo es inservible. Si
    // falla, se recarga y vuelve a su sitio.
    setCfg((c) => {
      if (!c) return c;
      const actuales = c.porRol[rol] ?? [];
      return {
        ...c,
        porRol: {
          ...c.porRol,
          [rol]: tiene ? actuales.filter((v) => v !== viewCode) : [...actuales, viewCode],
        },
      };
    });
    try {
      await rolService.cambiarVista(rol, viewCode, !tiene);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cambiar el acceso.');
      await cargar();
    } finally {
      setOcupado(null);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado('nuevo');
    setError('');
    try {
      await rolService.crear(nuevo.codigo, nuevo.etiqueta, nuevo.descripcion);
      setNuevo({ codigo: '', etiqueta: '', descripcion: '' });
      setCreando(false);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear el rol.');
    } finally {
      setOcupado(null);
    }
  };

  if (cargando) {
    return (
      <p className="text-sm text-slate-500 flex items-center gap-2 py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando roles…
      </p>
    );
  }
  if (!cfg) return null;

  const visibles = cfg.roles.filter((r) => r.activo);
  const archivados = cfg.roles.filter((r) => !r.activo);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#004F9F]" /> Qué ve cada rol
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Marca las aplicaciones que ve cada rol. El cambio alcanza a todas las
            personas que lo tengan, sin tocarlas una por una. Lo que pueden HACER
            dentro de cada aplicación se decide en la matriz de permisos.
          </p>
        </div>
        {!creando && (
          <Button variant="outline" size="sm" onClick={() => setCreando(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}>
            Crear rol
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="p-3 rounded-lg text-xs font-medium bg-rose-50
                                   border border-rose-200 text-rose-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {error}
        </p>
      )}

      {creando && (
        <form onSubmit={crear} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-px" />
            <p className="text-[11px] text-amber-900 font-medium leading-snug">
              Un rol creado <strong>no se puede eliminar</strong>, solo archivar: así
              funcionan los valores de este tipo en la base. Piensa el nombre antes.
              Nace <strong>sin ningún acceso</strong>; se los das tú abajo.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nombre visible"
              value={nuevo.etiqueta}
              onChange={(e) => setNuevo({ ...nuevo, etiqueta: e.target.value })}
              placeholder="Ej.: Jefe de tienda"
              autoFocus
            />
            <Input
              label="Código"
              value={nuevo.codigo}
              onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
              placeholder="JEFE_DE_TIENDA"
              helperText="Sin tildes ni espacios. Es permanente."
            />
          </div>
          <Input
            label="Para qué es (opcional)"
            value={nuevo.descripcion}
            onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
            placeholder="Responsable de un punto de venta"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreando(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="pintuco" size="sm" isLoading={ocupado === 'nuevo'}
              disabled={!nuevo.etiqueta.trim() || nuevo.codigo.trim().length < 3}>
              Crear rol
            </Button>
          </div>
        </form>
      )}

      {/* La matriz. Roles en filas, aplicaciones en columnas. */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-bold text-slate-600 sticky left-0 bg-slate-50 z-10">
                  Rol
                </th>
                {cfg.vistas.map((v) => (
                  <th key={v.code} className="px-2 py-3 font-bold text-slate-500 text-[10px]">
                    {/* En vertical: diecisiete columnas horizontales no caben
                        en ninguna pantalla. */}
                    <span className="block whitespace-nowrap [writing-mode:vertical-rl] rotate-180 mx-auto h-24">
                      {v.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((r) => (
                <tr key={r.codigo} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 whitespace-nowrap">{r.etiqueta}</p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Users className="w-2.5 h-2.5" /> {r.personas}
                          {r.delSistema && <span className="ml-1">· del sistema</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => setEditando(r)}
                        aria-label={`Renombrar ${r.etiqueta}`}
                        className="ml-auto p-1 rounded text-slate-300 hover:text-slate-600
                                   hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  {cfg.vistas.map((v) => {
                    const tiene = (cfg.porRol[r.codigo] ?? []).includes(v.code);
                    const clave = `${r.codigo}:${v.code}`;
                    return (
                      <td key={v.code} className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => void alternar(r.codigo, v.code, tiene)}
                          disabled={ocupado === clave}
                          aria-label={`${tiene ? 'Quitar' : 'Dar'} ${v.label} a ${r.etiqueta}`}
                          aria-pressed={tiene}
                          className={`w-6 h-6 rounded-md border transition-colors cursor-pointer
                                      inline-flex items-center justify-center
                                      disabled:opacity-50 disabled:cursor-wait ${
                            tiene
                              ? 'bg-[#004F9F] border-[#004F9F] text-white hover:bg-[#003B77]'
                              : 'bg-white border-slate-200 text-transparent hover:border-slate-400'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {archivados.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" /> Archivados
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Ya no se ofrecen para asignar. No se pueden eliminar del todo.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {archivados.map((r) => (
              <button
                key={r.codigo}
                onClick={() => void rolService.actualizar(r.codigo, { activo: true }).then(cargar)}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px]
                           font-bold text-slate-600 hover:border-[#004F9F] cursor-pointer"
              >
                {r.etiqueta} · restaurar
              </button>
            ))}
          </div>
        </div>
      )}

      {editando && (
        <EditarRol
          rol={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); void cargar(); }}
        />
      )}
    </div>
  );
};

/** Renombrar o archivar un rol. */
const EditarRol: React.FC<{
  rol: RolConfigurable;
  onCerrar: () => void;
  onGuardado: () => void;
}> = ({ rol, onCerrar, onGuardado }) => {
  const [etiqueta, setEtiqueta] = useState(rol.etiqueta);
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? '');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const guardar = async (accion: 'guardar' | 'archivar') => {
    setOcupado(true);
    setError('');
    try {
      await rolService.actualizar(rol.codigo, accion === 'archivar'
        ? { activo: false }
        : { etiqueta, descripcion });
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded-xl p-4 space-y-3 shadow-md">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">{rol.codigo}</h3>
        <button onClick={onCerrar} aria-label="Cerrar"
          className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
          {error}
        </p>
      )}

      <Input label="Nombre visible" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} />
      <Input label="Para qué es" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />

      <div className="flex flex-wrap justify-between gap-2 pt-1">
        {/* Archivar solo tiene sentido en los que no son del sistema y no los
            tiene nadie puesto. La base lo comprueba igual; aquí solo se evita
            ofrecer un botón que va a fallar. */}
        {!rol.delSistema && rol.personas === 0 ? (
          <Button size="sm" variant="ghost" onClick={() => void guardar('archivar')}
            className="text-rose-600 hover:bg-rose-50"
            leftIcon={<Archive className="w-3.5 h-3.5" />}>
            Archivar
          </Button>
        ) : (
          <span className="text-[11px] text-slate-400 self-center">
            {rol.delSistema
              ? 'Del sistema: no se archiva.'
              : `${rol.personas} persona(s) lo tienen.`}
          </span>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button size="sm" variant="pintuco" isLoading={ocupado}
            onClick={() => void guardar('guardar')}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
};
