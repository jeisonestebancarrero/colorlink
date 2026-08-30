import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, KeyRound, Copy, Check, LogOut, Smartphone, AlertTriangle } from 'lucide-react';
import logoPintuco from '../../assets/brand/pintuco-logo.jpeg';
import { mfaService, type InscripcionMFA } from '../services/mfa';
import { useAdminAuth } from './AdminAuthContext';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

/**
 * Segundo factor del personal interno.
 *
 * Cubre los dos momentos: registrar la aplicación de códigos la primera vez,
 * y escribir el código en cada inicio de sesión posterior.
 *
 * Es una pantalla completa y sin salida —solo se puede cerrar sesión— porque
 * el portal interno mueve inventario, factura y mueve dinero. Un modal que se
 * pudiera esquivar con Escape no sería una barrera.
 *
 * Vale la pena insistir: esto NO es lo que protege el sistema. Lo que protege
 * es que `is_admin`, `is_staff` y `has_permission` devuelvan false en el
 * servidor mientras la sesión no haya superado el factor. Esta pantalla solo
 * lo explica y lo hace usable.
 */
export const MfaGate: React.FC<{ modo: 'registro' | 'codigo' }> = ({ modo }) => {
  const { email, revisar, salir } = useAdminAuth();

  const [inscripcion, setInscripcion] = useState<InscripcionMFA | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const iniciado = useRef(false);

  // El QR se pide una sola vez: cada llamada crea un factor nuevo en el
  // servidor, y en modo estricto de React el efecto corre dos veces.
  useEffect(() => {
    if (modo !== 'registro' || iniciado.current) return;
    iniciado.current = true;
    mfaService
      .inscribir()
      .then(setInscripcion)
      .catch((e) => setError(e instanceof Error ? e.message : 'No fue posible preparar el registro.'));
  }, [modo]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      if (modo === 'registro') {
        if (!inscripcion) throw new Error('Todavía se está preparando el registro.');
        await mfaService.confirmarInscripcion(inscripcion.factorId, codigo);
      } else {
        await mfaService.verificarCodigo(codigo);
      }
      await revisar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible verificar el código.');
      setCodigo('');
    } finally {
      setOcupado(false);
    }
  };

  const copiarSecreto = async () => {
    if (!inscripcion) return;
    try {
      await navigator.clipboard.writeText(inscripcion.secreto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles el secreto sigue visible para teclearlo.
      setCopiado(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-[#002D5C] via-[#003B71] to-[#004F9F] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-32 mx-auto mb-4 rounded-2xl overflow-hidden border border-white/20 bg-white/5">
            <img src={logoPintuco} alt="Pintuco" className="w-full h-auto object-contain" />
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            {modo === 'registro' ? 'Activa la verificación en dos pasos' : 'Verificación en dos pasos'}
          </h1>
          <p className="text-xs text-blue-100/80 mt-1.5 max-w-sm mx-auto leading-relaxed">
            {modo === 'registro'
              ? 'El portal interno mueve inventario, facturas y dinero. Antes de entrar, registra tu aplicación de códigos.'
              : 'Escribe el código que muestra tu aplicación de autenticación.'}
          </p>
          {email && <p className="text-[11px] text-blue-200/60 mt-2 font-medium">{email}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-7 space-y-5">
          {error && (
            <div
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium"
            >
              {error}
            </div>
          )}

          {modo === 'registro' && (
            <div className="space-y-4">
              <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>Abre Google Authenticator, Authy o 1Password.</li>
                <li>Escanea este código.</li>
                <li>Escribe abajo los 6 dígitos que aparezcan.</li>
              </ol>

              <div className="flex justify-center">
                {inscripcion ? (
                  <img
                    src={inscripcion.qr}
                    alt="Código QR para registrar la aplicación de autenticación"
                    className="w-44 h-44 rounded-xl border border-slate-200 bg-white p-2"
                  />
                ) : (
                  <div className="w-44 h-44 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-[#004F9F] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {inscripcion && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1.5">
                    <Smartphone className="w-3.5 h-3.5" />
                    ¿No puedes escanear? Escribe esta clave
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] font-mono text-slate-800 break-all leading-relaxed">
                      {inscripcion.secreto}
                    </code>
                    <button
                      type="button"
                      onClick={copiarSecreto}
                      className="shrink-0 p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-500"
                      title="Copiar clave"
                    >
                      {copiado ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Si cambias de teléfono perderás el acceso. Un administrador puede reiniciar tu
                  segundo factor desde <strong>Usuarios</strong>.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={enviar} className="space-y-4">
            <Input
              label="Código de 6 dígitos"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus={modo === 'codigo'}
              required
              className="tracking-[0.5em] font-mono text-center text-base"
              leftIcon={<KeyRound className="w-4 h-4" />}
            />

            <Button
              type="submit"
              variant="pintuco"
              size="lg"
              isLoading={ocupado}
              disabled={codigo.length !== 6 || (modo === 'registro' && !inscripcion)}
              className="w-full text-sm font-bold"
              rightIcon={<ShieldCheck className="w-4 h-4" />}
            >
              {modo === 'registro' ? 'Activar y entrar' : 'Verificar'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => void salir()}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F] border-t border-slate-100 pt-4"
          >
            <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
};
