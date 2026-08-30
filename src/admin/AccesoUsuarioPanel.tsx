import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, Mail, RotateCcw, ShieldCheck, Smartphone, X } from 'lucide-react';
import { aplicacionService, usuarioService, ETIQUETA_ROL, type AccesoUsuario, type UsuarioAdmin } from '../services/admin';
import { Button } from '../components/common/Button';

/**
 * Accesos de una persona concreta.
 *
 * Muestra las tres capas por separado, porque confundirlas es lo que hace
 * imposible auditar quién puede qué:
 *   — lo que le concede su ROL (la línea base)
 *   — la EXCEPCIÓN personal, si alguien se la puso
 *   — el resultado EFECTIVO, que es lo que la persona ve al entrar
 *
 * Así se puede dar Analítica a un asesor concreto sin dársela a todos los
 * asesores, y retirarle un módulo sin tocar su rol.
 */
export const AccesoUsuarioPanel: React.FC<{
  usuario: UsuarioAdmin;
  onCerrar: () => void;
}> = ({ usuario, onCerrar }) => {
  const [accesos, setAccesos] = useState<AccesoUsuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reiniciandoMFA, setReiniciandoMFA] = useState(false);
  const [avisoMFA, setAvisoMFA] = useState('');
  const [confirmandoMFA, setConfirmandoMFA] = useState(false);
  const [mfa, setMfa] = useState<{ configurado: boolean; requerido: boolean; esInterno: boolean } | null>(null);
  const [cambiandoExigencia, setCambiandoExigencia] = useState(false);
  const [claveTemporal, setClaveTemporal] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [restableciendo, setRestableciendo] = useState<'correo' | 'temporal' | null>(null);
  const [confirmandoTemporal, setConfirmandoTemporal] = useState(false);

  const cargar = async () => {
    try {
      setAccesos(await aplicacionService.deUsuario(usuario.id, usuario.roles));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar los accesos.');
    } finally {
      setCargando(false);
    }
  };

  const cargarMFA = async () => {
    try {
      setMfa(await usuarioService.estadoMFA(usuario.id));
    } catch {
      setMfa(null);
    }
  };

  useEffect(() => { void cargar(); void cargarMFA(); }, [usuario.id]);

  const alternar = async (a: AccesoUsuario) => {
    setGuardando(a.code);
    setError('');
    try {
      // Si el resultado deseado coincide con lo que ya da el rol, se borra la
      // excepción en vez de guardar una redundante: menos reglas que auditar.
      const deseado = !a.efectivo;
      if (deseado === a.porRol) {
        await aplicacionService.restablecerUsuario(usuario.id, a.code);
      } else {
        await aplicacionService.concederAUsuario(usuario.id, a.code, deseado);
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cambiar el acceso.');
    } finally {
      setGuardando(null);
    }
  };

  const restablecer = async (code: string) => {
    setGuardando(code);
    try {
      await aplicacionService.restablecerUsuario(usuario.id, code);
      await cargar();
    } finally {
      setGuardando(null);
    }
  };

  const conExcepcion = accesos.filter((a) => a.excepcion !== null).length;

  const reiniciarMFA = async () => {
    setError('');
    setReiniciandoMFA(true);
    try {
      const retirados = await usuarioService.reiniciarMFA(usuario.id);
      await cargarMFA();
      setAvisoMFA(
        retirados > 0
          ? 'Verificación en dos pasos reiniciada. La próxima vez que entre, el portal le pedirá registrar su aplicación de códigos.'
          : 'Esta persona no tenía verificación en dos pasos configurada.',
      );
      setConfirmandoMFA(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible reiniciar la verificación.');
    } finally {
      setReiniciandoMFA(false);
    }
  };

  const restablecerPassword = async (modo: 'correo' | 'temporal') => {
    setError('');
    setAvisoMFA('');
    setClaveTemporal(null);
    setRestableciendo(modo);
    try {
      const r = await usuarioService.restablecerPassword(usuario.id, modo);
      if (modo === 'correo') {
        setAvisoMFA(
          `Le enviamos un enlace de recuperación a ${r.correo}. Elegirá su propia contraseña; tú nunca la conocerás.`,
        );
      } else {
        setClaveTemporal(r.password ?? null);
      }
      setConfirmandoTemporal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible restablecer la contraseña.');
    } finally {
      setRestableciendo(null);
    }
  };

  const cambiarExigencia = async (requerido: boolean) => {
    setError('');
    setAvisoMFA('');
    setCambiandoExigencia(true);
    try {
      await usuarioService.exigirMFA(usuario.id, requerido);
      await cargarMFA();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cambiar la exigencia.');
    } finally {
      setCambiandoExigencia(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight truncate">
              {usuario.nombre || usuario.email}
            </h2>
            <p className="text-xs text-slate-500 font-medium truncate">{usuario.email}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {usuario.roles.map((r) => (
                <span key={r} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                  {ETIQUETA_ROL[r] ?? r}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900 font-medium">
              Su rol define el acceso base. Aquí puedes concederle o retirarle
              aplicaciones <strong>solo a esta persona</strong>, sin afectar a
              nadie más con el mismo rol.
              {conExcepcion > 0 && (
                <> Tiene <strong>{conExcepcion}</strong> {conExcepcion === 1 ? 'excepción activa' : 'excepciones activas'}.</>
              )}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">{error}</div>
          )}

          {/* Restablecer la contraseña de otra persona.
              El camino por correo es el preferido: el administrador nunca
              llega a conocerla. La temporal existe porque en obra el correo
              corporativo no siempre es alcanzable. */}
          <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <KeyRound className="w-3.5 h-3.5 text-slate-500" />
              Contraseña
            </div>

            {claveTemporal ? (
              <div className="space-y-2">
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
                  Esta contraseña se muestra <strong>una sola vez</strong>. Cópiala y entrégasela
                  ahora; después no habrá forma de volver a verla. Dile que la cambie al entrar:
                  desde este momento dos personas la conocen.
                </p>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 text-white">
                  <code className="flex-1 font-mono text-sm break-all">{claveTemporal}</code>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(claveTemporal);
                        setCopiada(true);
                        window.setTimeout(() => setCopiada(false), 2000);
                      } catch {
                        setCopiada(false);
                      }
                    }}
                    aria-label="Copiar contraseña"
                    className="shrink-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/20"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {copiada && <p className="text-[11px] text-emerald-700 font-semibold">Copiada.</p>}
                <button
                  type="button"
                  onClick={() => setClaveTemporal(null)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                >
                  Ya la entregué, ocultarla
                </button>
              </div>
            ) : confirmandoTemporal ? (
              <div className="space-y-2.5">
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
                  Vas a fijarle una contraseña provisional que tú vas a ver. Prefiere el enlace por
                  correo siempre que puedas: así la contraseña la elige solo la persona. Esto queda
                  registrado en la auditoría.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmandoTemporal(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="pintuco"
                    isLoading={restableciendo === 'temporal'}
                    onClick={() => void restablecerPassword('temporal')}
                  >
                    Generar temporal
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Si perdió el acceso, envíale un enlace para que elija una nueva. La contraseña
                  nunca la fijas tú.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={restableciendo === 'correo'}
                    leftIcon={<Mail className="w-3.5 h-3.5" />}
                    onClick={() => void restablecerPassword('correo')}
                  >
                    Enviar enlace de recuperación
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmandoTemporal(true)}>
                    Generar contraseña temporal
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Perder el teléfono no puede equivaler a perder la cuenta: el
              propio interesado no puede retirar su factor, porque para eso
              tendría que superarlo. Solo un administrador puede destrabarlo,
              y queda registrado en la auditoría. */}
          <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                Verificación en dos pasos
              </div>
              {mfa && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    mfa.configurado
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : mfa.requerido && mfa.esInterno
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                >
                  {mfa.configurado
                    ? 'ACTIVA'
                    : mfa.requerido && mfa.esInterno
                      ? 'PENDIENTE'
                      : 'NO EXIGIDA'}
                </span>
              )}
            </div>

            {/* Exigirla o no, persona por persona. Hay casos legítimos: el
                operario de bodega en un equipo compartido sin teléfono
                corporativo. La regla base la sigue dando el rol. */}
            {/* El interruptor se muestra SIEMPRE, incluso con el factor
                activo. Antes se ocultaba en ese caso y no quedaba ninguna vía
                visible para quitar la exigencia: solo el botón de reiniciar,
                que retira el factor pero lo vuelve a pedir en el siguiente
                ingreso. Era un callejón sin salida. */}
            {mfa?.esInterno && (
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${
                  mfa.configurado
                    ? 'bg-slate-50/60 border-slate-200 cursor-not-allowed'
                    : 'bg-slate-50 border-slate-200 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={mfa.requerido}
                  disabled={cambiandoExigencia || mfa.configurado}
                  onChange={(e) => void cambiarExigencia(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F] disabled:opacity-50"
                />
                <span className="text-[11px] leading-relaxed">
                  <span className="font-bold text-slate-700 block">
                    Exigirle verificación en dos pasos
                  </span>
                  <span className="text-slate-500">
                    {mfa.configurado
                      ? 'Ya tiene su aplicación de códigos registrada. Para dejar de exigírsela, primero reinicia la verificación aquí abajo y luego desmarca esta casilla.'
                      : mfa.requerido
                        ? 'Al entrar tendrá que registrar su aplicación de códigos antes de poder trabajar.'
                        : 'Exento: entrará solo con su contraseña. Úsalo únicamente si no tiene teléfono donde generar los códigos.'}
                  </span>
                </span>
              </label>
            )}

            {avisoMFA ? (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 font-medium leading-relaxed">
                {avisoMFA}
              </p>
            ) : confirmandoMFA ? (
              <div className="space-y-2.5">
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
                  Vas a retirar su aplicación de códigos. Podrá entrar solo con su contraseña hasta
                  que registre una nueva. Hazlo únicamente si confirmaste su identidad por otro
                  medio: es exactamente el movimiento que haría alguien intentando apoderarse de
                  la cuenta.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmandoMFA(false)}
                    disabled={reiniciandoMFA}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="pintuco"
                    isLoading={reiniciandoMFA}
                    onClick={() => void reiniciarMFA()}
                  >
                    Sí, reiniciar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {mfa?.configurado ? (
                  <>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Si cambió de teléfono y no puede generar códigos, reinicia su segundo factor
                      para que registre el nuevo dispositivo.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Smartphone className="w-3.5 h-3.5" />}
                      onClick={() => setConfirmandoMFA(true)}
                    >
                      Reiniciar verificación
                    </Button>
                  </>
                ) : (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Todavía no ha registrado ninguna aplicación de códigos.
                  </p>
                )}
              </>
            )}
          </div>

          {cargando ? (
            <p className="text-sm text-slate-400 text-center py-10">Cargando accesos…</p>
          ) : (
            <div className="space-y-1.5">
              {accesos.map((a) => (
                <div key={a.code}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    a.excepcion !== null ? 'bg-amber-50/60 border-amber-200' : 'bg-white border-slate-200'
                  }`}>
                  <span className="w-2.5 h-8 rounded-full shrink-0"
                    style={{ backgroundColor: a.color ?? '#004F9F' }} aria-hidden />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{a.label}</p>
                    <p className="text-[11px] font-medium text-slate-500">
                      {a.excepcion === null
                        ? a.porRol ? 'Concedida por su rol' : 'No incluida en su rol'
                        : a.excepcion
                        ? a.porRol ? 'Concedida (su rol ya la incluía)' : 'Concedida como excepción'
                        : 'Retirada como excepción'}
                    </p>
                  </div>

                  {a.excepcion !== null && (
                    <button onClick={() => restablecer(a.code)} disabled={guardando === a.code}
                      title="Volver a lo que diga su rol"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <Button
                    variant={a.efectivo ? 'pintuco' : 'outline'}
                    size="sm"
                    isLoading={guardando === a.code}
                    onClick={() => alternar(a)}
                    className="shrink-0 w-24"
                  >
                    {a.efectivo ? 'Con acceso' : 'Sin acceso'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
