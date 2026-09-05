import React, { useEffect, useState } from 'react';
import { KeyRound, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { authService } from '../../services/api';
import { Input } from './Input';
import { Button } from './Button';

/**
 * Poner o cambiar la contraseña de la cuenta.
 *
 * Existe por un caso muy concreto: quien entra con Google NO TIENE
 * contraseña, y el portal interno solo acepta correo y contraseña —a
 * propósito, porque no se autoservicia—. Sin esta sección, a un empleado
 * que se registró con Google no había forma de darle acceso al back-office
 * salvo tocando la base de datos.
 *
 * La recuperación por correo no sirve para ese caso: manda un código de 6
 * dígitos que exige plantilla propia, y la plantilla exige SMTP propio.
 * Aquí no hace falta ninguna de las dos cosas: la persona ya demostró quién
 * es al tener la sesión abierta.
 *
 * Cuando la cuenta YA tiene contraseña se pide la actual y se comprueba de
 * verdad contra el servidor. Sin esa comprobación, una sesión olvidada en un
 * computador ajeno bastaría para quedarse con la cuenta.
 */
export const ContrasenaDeLaCuenta: React.FC = () => {
  const [tieneClave, setTieneClave] = useState<boolean | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Se le pregunta al servidor. Mirar las identidades de `getUser()` engaña:
  // al ponerle contraseña a una cuenta de Google, Supabase NO le agrega una
  // identidad `email`, así que la sección diría «crea una contraseña» para
  // siempre y nunca pediría la actual.
  useEffect(() => {
    authService
      .tengoPassword()
      .then(setTieneClave)
      .catch(() => setTieneClave(null));
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (nueva.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (nueva !== confirmar) return setError('Las dos contraseñas no coinciden.');

    setOcupado(true);
    try {
      if (tieneClave) {
        const { data } = await supabase.auth.getUser();
        const correo = data.user?.email;
        if (!correo) throw new Error('Tu sesión expiró. Vuelve a entrar.');
        // Se comprueba contra el servidor, no contra nada guardado aquí.
        const { error: fallo } = await supabase.auth.signInWithPassword({
          email: correo,
          password: actual,
        });
        if (fallo) throw new Error('La contraseña actual no es correcta.');
      }

      await authService.updatePassword(nueva);
      setListo(true);
      setAbierto(false);
      setActual('');
      setNueva('');
      setConfirmar('');
      setTieneClave(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cambiar la contraseña.');
    } finally {
      setOcupado(false);
    }
  };

  if (tieneClave === null) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-slate-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-800">
            {tieneClave ? 'Contraseña' : 'Crea una contraseña'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {tieneClave
              ? 'Puedes cambiarla cuando quieras. Te pediremos la actual.'
              : 'Entraste con Google, así que tu cuenta todavía no tiene contraseña. Si te creas una, seguirás entrando con Google y además podrás hacerlo con tu correo y esta contraseña.'}
          </p>

          {listo && !abierto && (
            <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Check className="w-3.5 h-3.5" />
              Listo. Ahora entras con Google o con tu correo y esta contraseña.
            </div>
          )}

          {!abierto && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => {
                setAbierto(true);
                setListo(false);
                setError('');
              }}
            >
              {tieneClave ? 'Cambiar contraseña' : 'Crear contraseña'}
            </Button>
          )}
        </div>
      </div>

      {abierto && (
        <form onSubmit={guardar} className="mt-4 space-y-3">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          {tieneClave && (
            <Input
              label="Contraseña actual"
              type="password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              autoComplete="current-password"
              required
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Contraseña nueva"
              type="password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Input
              label="Repítela"
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="pintuco" size="sm" isLoading={ocupado}>
              Guardar contraseña
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
