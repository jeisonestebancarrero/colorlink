import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { BrandLogo } from '../components/common/BrandLogo';
import { GoogleButton, SeparadorAcceso } from '../components/common/GoogleButton';
import { RecuperarPasswordModal } from '../components/common/RecuperarPasswordModal';
import {
  Mail,
  Lock,
  ArrowLeft,
  ArrowRight,
  PackageCheck,
  Palette,
  Calculator,
} from 'lucide-react';

interface LoginPageProps {
  onNavigate: (page: string, param?: string) => void;
}

/** Lo que la cuenta habilita. Es el motivo real para iniciar sesión. */
const VENTAJAS = [
  {
    icono: PackageCheck,
    titulo: 'Tus pedidos y su rastreo',
    texto: 'Sigue cada despacho en el mapa y guarda tus facturas en un solo lugar.',
  },
  {
    icono: Palette,
    titulo: 'Tus colores guardados',
    texto: 'Las paletas que simulaste quedan asociadas a cada proyecto.',
  },
  {
    icono: Calculator,
    titulo: 'Cálculos por obra',
    texto: 'Galones y rendimiento por metraje, con acompañamiento técnico de Pintuco.',
  },
];

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login, loginWithGoogle, isSubmitting } = useAuth();

  // Los campos van vacíos. Traían las credenciales de la cuenta demo escritas,
  // lo que en un sistema que va a producción es entregar una contraseña real
  // a cualquiera que abra la pantalla de ingreso.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [recuperando, setRecuperando] = useState(false);
  // Un botón que lleva a una página de error no debería estar en pantalla.
  const [conGoogle, setConGoogle] = useState(false);

  useEffect(() => {
    authService
      .proveedoresHabilitados()
      .then((p) => setConGoogle(p.google === true))
      .catch(() => setConGoogle(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Por favor ingresa tu correo electrónico');
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
      setError(
        err instanceof Error ? err.message : 'Credenciales inválidas. Por favor verifica tus datos.',
      );
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No fue posible continuar con Google. Inténtalo de nuevo.',
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      {/* ── Panel de marca ────────────────────────────────────────────────
          Antes el ingreso era una tarjeta blanca sobre fondo gris: correcta
          pero sin identidad. Este panel usa el azul Pintuco y dice para qué
          sirve la cuenta, que es lo que decide a alguien a iniciar sesión. */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#00306B] p-12 xl:p-16">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(0,110,210,0.55),transparent_58%),radial-gradient(circle_at_85%_88%,rgba(255,184,28,0.20),transparent_55%)]"
        />
        {/* Marca de agua del isotipo, muy atenuada. */}
        <div
          aria-hidden
          className="absolute -bottom-24 -right-24 w-[420px] h-[420px] rounded-full border-[36px] border-white/[0.035]"
        />

        <div className="relative">
          <BrandLogo onClick={() => onNavigate('landing')} claro />
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl xl:text-[2.75rem] font-extrabold text-white leading-[1.1] tracking-tight">
            Tu obra, tus colores y tus pedidos{' '}
            <span className="text-[#FFB81C]">en un solo lugar.</span>
          </h1>
          <p className="text-sm text-blue-100/80 mt-4 leading-relaxed">
            El ecosistema digital oficial de Pintuco para clientes, constructoras y
            profesionales en Colombia.
          </p>

          <ul className="mt-10 space-y-5">
            {VENTAJAS.map(({ icono: Icono, titulo, texto }) => (
              <li key={titulo} className="flex gap-4">
                <span className="shrink-0 w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-[#FFB81C]">
                  <Icono className="w-5 h-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">{titulo}</span>
                  <span className="block text-xs text-blue-100/70 mt-0.5 leading-relaxed">
                    {texto}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Franja de color: es una marca de pinturas, se nota. */}
        <div className="relative flex items-center gap-3">
          <div className="flex rounded-full overflow-hidden shadow-lg shadow-black/20">
            {['#004F9F', '#FFB81C', '#C8102E', '#00843D', '#5B2C8D'].map((c) => (
              <span key={c} className="w-11 h-2.5" style={{ backgroundColor: c }} />
            ))}
          </div>
          <span className="text-[11px] font-semibold text-blue-100/60 tracking-wide">
            Más de 2.000 colores certificados
          </span>
        </div>
      </aside>

      {/* ── Formulario ───────────────────────────────────────────────────── */}
      <main className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-12 xl:px-16">
        <div className="w-full max-w-md mx-auto">
          {/* En móvil el panel de marca no se muestra: el logo va aquí. */}
          <div className="lg:hidden flex justify-center mb-6">
            <BrandLogo onClick={() => onNavigate('landing')} />
          </div>

          <button
            type="button"
            onClick={() => onNavigate('store')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F] transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a la tienda sin iniciar sesión
          </button>

          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Iniciar sesión</h2>
          <p className="text-sm text-slate-500 mt-1.5">
            Entra con el correo con el que te registraste.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <Input
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu.nombre@correo.com"
              autoComplete="email"
              required
              leftIcon={<Mail className="w-4 h-4" />}
            />

            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
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
              isLoading={isSubmitting}
              className="w-full text-sm font-bold shadow-md shadow-[#004F9F]/20"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Iniciar sesión
            </Button>
          </form>

          {conGoogle && (
            <>
              <div className="mt-6">
                <SeparadorAcceso />
              </div>
              <div className="mt-4">
                <GoogleButton onClick={handleGoogleLogin} disabled={isSubmitting} />
              </div>
            </>
          )}

          <p className="text-center mt-7 text-xs text-slate-600">
            ¿No tienes una cuenta aún?{' '}
            <button
              onClick={() => onNavigate('register')}
              className="font-bold text-[#004F9F] hover:underline"
            >
              Crear cuenta de cliente
            </button>
          </p>
        </div>
      </main>

      <RecuperarPasswordModal
        abierto={recuperando}
        onClose={() => setRecuperando(false)}
        correoInicial={email}
        contexto="cliente"
      />
    </div>
  );
};
