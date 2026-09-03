import React, { useState } from 'react';
import { KeyRound, AlertTriangle, LogOut, Eye, EyeOff, Check } from 'lucide-react';
import logoPintuco from '../../../assets/brand/pintuco-logo.jpeg';
import { claveTemporalService, LARGO_MINIMO_CLAVE } from '../../services/claveTemporal';
import { Button } from './Button';
import { Input } from './Input';

/**
 * Cambio obligatorio de la contraseña provisional.
 *
 * Pantalla completa y sin salida —solo cerrar sesión—, igual que el segundo
 * factor: si se pudiera esquivar con Escape no sería una obligación, y la
 * contraseña que un administrador dictó por teléfono seguiría sirviendo.
 *
 * Se explica POR QUÉ aparece. Una pantalla que exige algo sin decir el motivo
 * se lee como un fallo del sistema, y lo primero que hace la gente es llamar a
 * soporte.
 */
export const CambiarClaveObligatorio: React.FC<{
  correo: string | null;
  onListo: () => void;
  onSalir: () => void;
}> = ({ correo, onListo, onSalir }) => {
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verla, setVerla] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cortita = clave.length > 0 && clave.length < LARGO_MINIMO_CLAVE;
  const noCoinciden = repetida.length > 0 && clave !== repetida;
  const lista = clave.length >= LARGO_MINIMO_CLAVE && clave === repetida;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lista || ocupado) return;
    setOcupado(true);
    setError('');
    try {
      await claveTemporalService.cambiar(clave);
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cambiar la contraseña.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-[#002D5C] via-[#003B71] to-[#004F9F]
                    flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-32 mx-auto mb-4 rounded-2xl overflow-hidden border border-white/20">
            <img src={logoPintuco} alt="Pintuco" className="w-full" />
          </div>
          <h1 className="text-xl font-extrabold text-white">Cambia tu contraseña</h1>
          {correo && <p className="text-sm text-blue-200 mt-1">{correo}</p>}
        </div>

        <form
          onSubmit={enviar}
          className="bg-white rounded-2xl shadow-2xl p-6 space-y-4"
        >
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
            <KeyRound className="w-4 h-4 text-amber-700 shrink-0 mt-px" />
            <p className="text-xs text-amber-900 font-medium leading-snug">
              Entraste con una contraseña <strong>provisional</strong> que creó otra
              persona. Elige la tuya para continuar: nadie más debe conocerla.
            </p>
          </div>

          {error && (
            <p role="alert" className="p-3 rounded-lg text-xs font-medium bg-rose-50
                                       border border-rose-200 text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {error}
            </p>
          )}

          <Input
            label="Nueva contraseña"
            type={verla ? 'text' : 'password'}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoFocus
            autoComplete="new-password"
            error={cortita ? `Mínimo ${LARGO_MINIMO_CLAVE} caracteres` : undefined}
            rightIcon={
              <button
                type="button"
                onClick={() => setVerla((v) => !v)}
                aria-label={verla ? 'Ocultar contraseña' : 'Ver contraseña'}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {verla ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

          <Input
            label="Repítela"
            type={verla ? 'text' : 'password'}
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            autoComplete="new-password"
            error={noCoinciden ? 'No coincide con la anterior' : undefined}
            rightIcon={lista ? <Check className="w-4 h-4 text-emerald-600" /> : undefined}
          />

          <Button type="submit" variant="pintuco" className="w-full" isLoading={ocupado} disabled={!lista}>
            Guardar y continuar
          </Button>

          <button
            type="button"
            onClick={onSalir}
            className="w-full text-xs font-bold text-slate-500 hover:text-slate-700
                       inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
};
