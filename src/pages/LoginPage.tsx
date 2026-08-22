import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import {
  Layers,
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Building2,
  CheckCircle2,
} from 'lucide-react';

interface LoginPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login, loadDemoAccount, isLoading } = useAuth();

  const [email, setEmail] = useState('carlos.mendoza@constructorahorizonte.com');
  const [password, setPassword] = useState('pintuco2025*');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Por favor ingresa tu correo electrónico corporativo');
      return;
    }

    if (!password.trim()) {
      setError('Por favor ingresa tu contraseña');
      return;
    }

    try {
      await login(email, password);
      onNavigate('dashboard');
    } catch (err) {
      setError('Credenciales inválidas. Por favor verifica tus datos.');
    }
  };

  const handleDemoLogin = async () => {
    await loadDemoAccount();
    onNavigate('dashboard');
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotEmail.trim()) {
      setForgotSent(true);
      setTimeout(() => {
        setForgotSent(false);
        setShowForgotModal(false);
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Brand Top */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div
          onClick={() => onNavigate('landing')}
          className="inline-flex items-center gap-3 cursor-pointer mb-3 select-none"
        >
          <div className="w-11 h-11 rounded-xl bg-[#004F9F] flex items-center justify-center text-white shadow-md">
            <Layers className="w-7 h-7" />
          </div>
          <div className="text-left">
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
              COLOR<span className="text-[#004F9F]">LINK</span>
            </span>
            <span className="text-xs text-slate-500 block font-medium">
              Transformación Digital en Pintuco
            </span>
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Ingreso a la Plataforma B2B
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Gestiona tus proyectos de pintura y soluciones técnicas Pintuco
        </p>
      </div>

      {/* Login Box */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-2xl shadow-xl border border-slate-200 text-left space-y-6">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Correo electrónico corporativo"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu.nombre@empresa.com"
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

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F]"
                />
                <span>Recordarme</span>
              </label>

              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-xs font-semibold text-[#004F9F] hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <Button
              type="submit"
              variant="pintuco"
              size="lg"
              isLoading={isLoading}
              className="w-full text-sm font-bold shadow-md shadow-[#004F9F]/20"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Iniciar sesión
            </Button>
          </form>

          {/* Quick Demo Shortcut */}
          <div className="pt-2 border-t border-slate-100">
            <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Modo Demostración Rápida</span>
              </div>
              <p className="text-[11px] text-blue-700 leading-snug">
                Accede directamente como <strong>Constructora Horizonte</strong> con el caso de fachada precargado para tu presentación.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDemoLogin}
                className="w-full bg-white text-[#004F9F] border-blue-200 hover:bg-blue-50 text-xs font-semibold"
              >
                Ingresar con Cuenta Demo Pintuco
              </Button>
            </div>
          </div>

          <div className="text-center pt-2 text-xs text-slate-600">
            ¿No tienes una cuenta aún?{' '}
            <button
              onClick={() => onNavigate('register')}
              className="font-bold text-[#004F9F] hover:underline"
            >
              Crear cuenta de cliente
            </button>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        title="Recuperar Contraseña"
        subtitle="Ingresa tu correo para recibir instrucciones de recuperación"
        maxWidth="md"
      >
        {forgotSent ? (
          <div className="text-center py-4 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-bold text-slate-900">Correo enviado</h4>
            <p className="text-xs text-slate-500">
              Hemos enviado un enlace de restablecimiento a <strong>{forgotEmail}</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-4 text-left">
            <Input
              label="Correo electrónico registrado"
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="tu.correo@empresa.com"
              required
              leftIcon={<Mail className="w-4 h-4" />}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForgotModal(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="pintuco">
                Enviar instrucciones
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
