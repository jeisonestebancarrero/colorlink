import React, { useState } from 'react';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import logoPintuco from '../../assets/brand/pintuco-logo.jpeg';
import { useAdminAuth } from './AdminAuthContext';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { RecuperarPasswordModal } from '../components/common/RecuperarPasswordModal';

/**
 * Acceso del personal interno.
 *
 * Deliberadamente sobrio y sin nada comercial: no hay registro, ni acceso con
 * Google, ni enlace a la tienda. Este portal no se autoservicia — las cuentas
 * las crea un administrador.
 */
export const AdminLogin: React.FC = () => {
  const { entrar } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await entrar(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-[#002D5C] via-[#003B71] to-[#004F9F] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <div className="w-40 mx-auto mb-4 rounded-2xl overflow-hidden border border-white/20 bg-white/5">
            <img src={logoPintuco} alt="Pintuco" className="w-full h-auto object-contain" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            COLOR<span className="text-yellow-400">LINK</span>
          </h1>
          <p className="text-sm text-blue-100/80 font-medium mt-1">
            Portal interno Pintuco
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-7 space-y-5">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          <form onSubmit={enviar} className="space-y-4">
            <Input
              label="Correo corporativo"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@pintuco.com"
              required
              leftIcon={<Mail className="w-4 h-4" />}
            />
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              leftIcon={<Lock className="w-4 h-4" />}
            />
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={() => setRecuperando(true)}
                className="text-xs font-semibold text-[#004F9F] hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <Button
              type="submit"
              variant="pintuco"
              size="lg"
              isLoading={enviando}
              className="w-full text-sm font-bold"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Ingresar
            </Button>
          </form>

          <p className="text-[11px] text-slate-400 text-center font-medium border-t border-slate-100 pt-4">
            Las cuentas de personal las crea el administrador del sistema.
            Si no tienes acceso, solicítalo a tu responsable de área.
          </p>
        </div>
      </div>

      {/* El personal interno recupera la contraseña por el mismo mecanismo que
          los clientes: el código llega al correo corporativo. No hay puerta
          trasera ni un administrador que pueda ver o dictar contraseñas. */}
      <RecuperarPasswordModal
        abierto={recuperando}
        onClose={() => setRecuperando(false)}
        correoInicial={email}
        contexto="interno"
      />
    </div>
  );
};
