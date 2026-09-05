import React, { useEffect, useState } from 'react';
import { UserPlus, ShieldCheck, Copy, Check } from 'lucide-react';
import {
  usuarioService, ROLES_INTERNOS, ETIQUETA_ROL, type UsuarioAdmin,
} from '../../services/admin';
import { Button } from '../../components/common/Button';
import { ExportarBoton } from '../ExportarBoton';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import {
  SelectorUbicacion,
  UBICACION_VACIA,
  type ValorUbicacion,
} from '../../components/common/SelectorUbicacion';
import { AccesoUsuarioPanel } from '../AccesoUsuarioPanel';
import { IconoModulo } from '../IconosDeModulo';

/** Alta y consulta del personal. Las cuentas internas no se autorregistran. */
export const UsuariosPage: React.FC = () => {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [soloInternos, setSoloInternos] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [claveTemporal, setClaveTemporal] = useState<string | null>(null);
  /** Lo que de verdad pasó al crear la cuenta, para no prometer de más. */
  const [altaHecha, setAltaHecha] = useState<{ correoEnviado: boolean } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [usuarioAbierto, setUsuarioAbierto] = useState<UsuarioAdmin | null>(null);

  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', phone: '', city: '',
    roles: [] as string[],
  });

  const cargar = async (internos: boolean) => {
    setCargando(true);
    try {
      setUsuarios(await usuarioService.listar(internos));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar los usuarios.');
    } finally {
      setCargando(false);
    }
  };

  // La ciudad se elige del diccionario oficial, no se escribe. Con texto libre
  // el perfil quedaba sin código de municipio, y sin él este empleado no puede
  // entrar en el reparto de pedidos por sede.
  const [ubicacion, setUbicacion] = useState<ValorUbicacion>(UBICACION_VACIA);

  useEffect(() => { void cargar(soloInternos); }, [soloInternos]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.roles.length === 0) return setError('Selecciona al menos un rol.');

    setGuardando(true);
    try {
      const r = await usuarioService.crear({
        ...form,
        ...(ubicacion.municipalityCode
          ? { municipalityCode: ubicacion.municipalityCode, countryCode: ubicacion.countryCode }
          : {}),
      });
      setClaveTemporal(r.temporaryPassword);
      setAltaHecha({ correoEnviado: r.correoEnviado });
      setForm({ email: '', firstName: '', lastName: '', phone: '', city: '', roles: [] });
      setUbicacion(UBICACION_VACIA);
      await cargar(soloInternos);
      if (!r.temporaryPassword) setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible crear el usuario.');
    } finally {
      setGuardando(false);
    }
  };

  const alternarRol = (rol: string) =>
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(rol) ? f.roles.filter((r) => r !== rol) : [...f.roles, rol],
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="Users" /> Usuarios
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            El personal interno no se registra solo: se crea aquí, con sus roles.
          </p>
        </div>
        <Button variant="pintuco" leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => { setClaveTemporal(null); setAbierto(true); }}>
          Crear usuario
        </Button>
      </div>

      <div className="flex gap-2">
        {[
          { v: true, t: 'Personal interno' },
          { v: false, t: 'Todos los usuarios' },
        ].map((o) => (
          <button
            key={String(o.v)}
            onClick={() => setSoloInternos(o.v)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              soloInternos === o.v
                ? 'bg-[#004F9F] text-white border-[#004F9F]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {o.t}
          </button>
        ))}

        <div className="ml-auto">
          {/* Un listado del personal con sus roles es lo que pide auditoría y
              lo que se revisa cuando alguien entra o sale de la empresa. */}
          <ExportarBoton<UsuarioAdmin>
            filas={usuarios}
            nombre={soloInternos ? 'personal-interno' : 'usuarios'}
            titulo={soloInternos ? 'Personal interno' : 'Usuarios del sistema'}
            filtros={soloInternos ? 'Personal interno' : 'Todos los usuarios'}
            columnas={[
              { titulo: 'Persona', valor: (u) => u.nombre },
              { titulo: 'Correo', valor: (u) => u.email },
              { titulo: 'Teléfono', valor: (u) => u.telefono },
              { titulo: 'Ciudad', valor: (u) => u.ciudad },
              { titulo: 'Empresa', valor: (u) => u.empresa },
              // Los roles legibles, no los códigos: el archivo lo lee alguien
              // de recursos humanos, no la base de datos.
              { titulo: 'Roles', valor: (u) => u.roles.map((r) => ETIQUETA_ROL[r] ?? r).join(', ') },
              { titulo: 'Estado', valor: (u) => u.estado },
              { titulo: 'Creado', valor: (u) => new Date(u.creadoEn).toLocaleDateString('es-CO') },
            ]}
          />
        </div>
      </div>

      {error && !abierto && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
              <th className="text-left px-4 py-3">Persona</th>
              <th className="text-left px-4 py-3">Correo</th>
              <th className="text-left px-4 py-3">Empresa</th>
              <th className="text-left px-4 py-3">Roles</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Accesos</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">Cargando…</td></tr>
            )}
            {!cargando && usuarios.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">No hay usuarios que mostrar.</td></tr>
            )}
            {usuarios.map((u) => (
              <tr key={u.id} onClick={() => setUsuarioAbierto(u)}
                className="border-t border-slate-100 hover:bg-slate-50/70 cursor-pointer">
                <td className="px-4 py-3 font-semibold text-slate-900">{u.nombre || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3 text-slate-500">{u.empresa ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          r === 'ADMINISTRADOR'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : r.startsWith('CLIENTE')
                            ? 'bg-slate-50 text-slate-600 border-slate-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        {ETIQUETA_ROL[r] ?? r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {u.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold text-[#004F9F] hover:underline">
                    Gestionar →
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {usuarioAbierto && (
        <AccesoUsuarioPanel
          usuario={usuarioAbierto}
          onCerrar={() => { setUsuarioAbierto(null); void cargar(soloInternos); }}
        />
      )}

      {/* El subtítulo decía «se le enviará una contraseña temporal que deberá
          cambiar», y las dos mitades eran falsas: no se enviaba ningún correo
          y nada la obligaba a cambiarla. Ahora sale un correo con un enlace
          para que ponga la suya —la contraseña nunca viaja por correo— y la
          cuenta queda obligada a cambiarla al entrar. */}
      <Modal isOpen={abierto} onClose={() => setAbierto(false)} title="Crear usuario interno"
        subtitle="Recibe un enlace para poner su contraseña, y tendrá que cambiar la provisional al entrar">
        {claveTemporal ? (
          <div className="space-y-4 text-left">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-sm font-bold text-emerald-900">Usuario creado</p>
              <p className="text-xs text-emerald-800 mt-1">
                {altaHecha?.correoEnviado
                  ? 'Le enviamos un correo con un enlace para que ponga su propia '
                    + 'contraseña. Esta provisional es el respaldo por si no le llega; '
                    + 'no volverá a mostrarse.'
                  : 'El correo no salió, así que tienes que entregarle esta contraseña '
                    + 'provisional. No volverá a mostrarse.'}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900">
                  {claveTemporal}
                </code>
                <Button
                  variant="outline" size="sm"
                  leftIcon={copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  onClick={() => { void navigator.clipboard.writeText(claveTemporal); setCopiado(true); }}
                >
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Al entrar con la provisional, el sistema le pedirá cambiarla antes
              de dejarle hacer nada.
            </p>

            <Button variant="pintuco" className="w-full"
              onClick={() => { setClaveTemporal(null); setAltaHecha(null); setAbierto(false); }}>
              Entendido
            </Button>
          </div>
        ) : (
          <form onSubmit={crear} className="space-y-4 text-left">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Nombre" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              <Input label="Apellido" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <Input label="Correo corporativo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

            {/* Del catálogo, igual que en el registro del cliente. Escrita a
                mano quedaba sin código de municipio y el empleado no entraba en
                el reparto de pedidos por sede. */}
            <SelectorUbicacion
              valor={ubicacion}
              onChange={setUbicacion}
              pedirBarrio={false}
              compacto
            />

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Roles <span className="text-slate-400 font-medium">— determinan qué pantallas verá</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
                {ROLES_INTERNOS.map((r) => (
                  <label key={r} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-slate-300 cursor-pointer text-xs font-semibold text-slate-700">
                    <input type="checkbox" checked={form.roles.includes(r)} onChange={() => alternarRol(r)}
                      className="rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F]" />
                    {ETIQUETA_ROL[r]}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button type="submit" variant="pintuco" isLoading={guardando} leftIcon={<ShieldCheck className="w-4 h-4" />}>
                Crear usuario
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
