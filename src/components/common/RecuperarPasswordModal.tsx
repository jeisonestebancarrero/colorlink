import React, { useEffect, useRef, useState } from 'react';
import { Mail, KeyRound, Lock, CheckCircle2, ArrowLeft, RotateCcw } from 'lucide-react';
import { authService } from '../../services/api';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';

/**
 * Recuperar la contraseña en tres pasos: correo → código → contraseña nueva.
 *
 * Se usa igual en el portal del cliente y en el interno; lo único que cambia
 * es el texto del encabezado, porque el mecanismo de identidad es el mismo.
 *
 * Por qué un código y no un enlace: el enlace solo funciona en el navegador
 * donde se abre el correo. En obra la gente pide el cambio desde el
 * computador de la oficina y lee el correo en el celular, y el enlace las
 * deja atrapadas. El código se puede leer en cualquier parte y escribir donde
 * se necesite.
 *
 * Nunca se dice si un correo existe o no: responder "esa cuenta no existe"
 * convierte el formulario en una lista de clientes de Pintuco para cualquiera
 * que quiera probar correos.
 */
export const RecuperarPasswordModal: React.FC<{
  abierto: boolean;
  onClose: () => void;
  correoInicial?: string;
  contexto?: 'cliente' | 'interno';
}> = ({ abierto, onClose, correoInicial = '', contexto = 'cliente' }) => {
  const [paso, setPaso] = useState<'correo' | 'codigo' | 'listo'>('correo');
  const [correo, setCorreo] = useState(correoInicial);
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const temporizador = useRef<number | null>(null);

  // Al abrir se parte de cero: reabrir el modal no debe mostrar el código
  // que alguien escribió antes.
  useEffect(() => {
    if (abierto) {
      setPaso('correo');
      setCorreo(correoInicial);
      setCodigo('');
      setPassword('');
      setConfirmar('');
      setError('');
      setAviso('');
    }
  }, [abierto, correoInicial]);

  // Cuenta regresiva para poder reenviar el código.
  useEffect(() => {
    if (segundos <= 0) return;
    temporizador.current = window.setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
    };
  }, [segundos]);

  const enviarCodigo = async (reenvio = false) => {
    setError('');
    if (!correo.trim().includes('@')) {
      setError('Escribe un correo electrónico válido.');
      return;
    }
    setOcupado(true);
    try {
      await authService.requestPasswordReset(correo.trim());
    } catch (err) {
      // Se sigue adelante pase lo que pase. Distinguir entre "correo enviado"
      // y "ese correo no existe" permitiría averiguar quién es cliente.
      console.error('[recuperar] solicitud de código', err);
    } finally {
      setOcupado(false);
    }
    setPaso('codigo');
    setSegundos(45);
    setAviso(reenvio ? 'Te enviamos un código nuevo.' : '');
  };

  const cambiarPassword = async () => {
    setError('');
    setAviso('');
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setOcupado(true);
    try {
      await authService.confirmarCodigoYCambiarPassword(correo.trim(), codigo, password);
      setPaso('listo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cambiar la contraseña.');
    } finally {
      setOcupado(false);
    }
  };

  const titulo =
    paso === 'listo'
      ? 'Contraseña actualizada'
      : paso === 'codigo'
        ? 'Escribe el código'
        : 'Recuperar contraseña';

  const subtitulo =
    paso === 'listo'
      ? 'Tu contraseña nueva ya está activa'
      : paso === 'codigo'
        ? `Enviamos un código de 6 dígitos a ${correo}`
        : contexto === 'interno'
          ? 'Te enviaremos un código a tu correo corporativo'
          : 'Te enviaremos un código de 6 dígitos a tu correo';

  return (
    <Modal isOpen={abierto} onClose={onClose} title={titulo} subtitle={subtitulo} maxWidth="md">
      <div className="space-y-4 text-left">
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}
        {aviso && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg font-medium">
            {aviso}
          </div>
        )}

        {paso === 'correo' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enviarCodigo();
            }}
            className="space-y-4"
          >
            <Input
              label="Correo electrónico registrado"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder={contexto === 'interno' ? 'tu.correo@colorlink.com' : 'tu.correo@empresa.com'}
              required
              autoFocus
              leftIcon={<Mail className="w-4 h-4" />}
            />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Si el correo está registrado recibirás un código. Por seguridad no confirmamos si
              existe o no una cuenta con ese correo.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="pintuco" isLoading={ocupado}>
                Enviarme el código
              </Button>
            </div>
          </form>
        )}

        {paso === 'codigo' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void cambiarPassword();
            }}
            className="space-y-4"
          >
            <Input
              label="Código de 6 dígitos"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              className="tracking-[0.5em] font-mono text-center text-base"
              leftIcon={<KeyRound className="w-4 h-4" />}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Contraseña nueva"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                leftIcon={<Lock className="w-4 h-4" />}
              />
              <Input
                label="Repite la contraseña"
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Debe coincidir"
                required
                leftIcon={<Lock className="w-4 h-4" />}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setPaso('correo')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F]"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Cambiar el correo
              </button>
              <button
                type="button"
                disabled={segundos > 0 || ocupado}
                onClick={() => void enviarCodigo(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#004F9F] hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {segundos > 0 ? `Reenviar en ${segundos}s` : 'Reenviar código'}
              </button>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="pintuco" isLoading={ocupado}>
                Cambiar contraseña
              </Button>
            </div>
          </form>
        )}

        {paso === 'listo' && (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <p className="text-sm text-slate-600 max-w-xs mx-auto leading-relaxed">
              Tu contraseña quedó actualizada y ya entramos a tu cuenta. Te enviamos un correo
              avisando del cambio: si no fuiste tú, contáctanos de inmediato.
            </p>
            <Button variant="pintuco" onClick={onClose} className="mt-2">
              Continuar
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
