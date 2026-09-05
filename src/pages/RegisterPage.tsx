import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { BrandLogo } from '../components/common/BrandLogo';
import { AvisoCarritoEnEspera } from '../components/cart/AvisoCarritoEnEspera';
import {
  SelectorUbicacion, UBICACION_VACIA, validarUbicacion, resolverBarrio,
  type ValorUbicacion, type ErroresUbicacion,
} from '../components/common/SelectorUbicacion';
import { GoogleButton, SeparadorAcceso } from '../components/common/GoogleButton';
import { TIPOS_DOCUMENTO, ETIQUETA_DOCUMENTO } from '../schemas/auth';
import {
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Lock,
  IdCard,
  Hash,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Store,
  Briefcase,
  Clock,
} from 'lucide-react';

interface RegisterPageProps {
  onNavigate: (page: string, param?: string) => void;
}

type TipoCuenta = 'PERSONA' | 'EMPRESA';

const CLIENTES_EMPRESA = ['Constructor', 'Empresa', 'Profesional', 'Distribuidor'] as const;

/**
 * Registro bifurcado.
 *
 * El formulario anterior era uno solo y le exigía razón social a todo el
 * mundo, así que un particular tenía que inventarse una empresa para poder
 * comprar. Se separa en dos caminos porque los datos son realmente distintos:
 * una persona natural se identifica con su cédula y una empresa con su NIT.
 *
 * El INICIO DE SESIÓN, en cambio, sigue siendo uno solo: cuando entra la
 * contraseña el sistema ya sabe quién eres, y obligar a elegir portal antes
 * de identificarse solo produce el clásico "usuario no existe" por haber
 * tocado la puerta equivocada.
 */
export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate }) => {
  const { registrar, loginWithGoogle, isSubmitting } = useAuth();

  const [tipoCuenta, setTipoCuenta] = useState<TipoCuenta | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendienteAprobacion, setPendienteAprobacion] = useState(false);
  const avisoError = useRef<HTMLDivElement>(null);
  const [conGoogle, setConGoogle] = useState(false);

  useEffect(() => {
    authService
      .proveedoresHabilitados()
      .then((p) => setConGoogle(p.google === true))
      .catch(() => setConGoogle(false));
  }, []);

  // El aviso vive arriba del formulario y el botón está abajo: sin esto, quien
  // envía un formulario largo no ve nunca por qué no se creó su cuenta.
  useEffect(() => {
    if (errors.form) {
      avisoError.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [errors.form]);

  const [datos, setDatos] = useState({
    firstName: '',
    lastName: '',
    documentType: 'CC',
    documentNumber: '',
    company: '',
    companyNit: '',
    clientType: 'Constructor' as (typeof CLIENTES_EMPRESA)[number],
    email: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
  });

  // La ciudad ya no se escribe: se elige del diccionario DIVIPOLA. Antes el
  // campo venía con 'Medellín' puesto, así que quien no lo tocaba quedaba
  // registrado en Medellín sin haberlo dicho.
  const [ubicacion, setUbicacion] = useState<ValorUbicacion>(UBICACION_VACIA);
  const [erroresUbicacion, setErroresUbicacion] = useState<ErroresUbicacion>({});

  const set = (campo: keyof typeof datos, valor: string) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    // El error deja de mostrarse en cuanto la persona corrige el campo.
    setErrors((e) => (e[campo] ? { ...e, [campo]: '' } : e));
  };

  const validar = () => {
    const errs: Record<string, string> = {};

    if (tipoCuenta === 'EMPRESA') {
      if (!datos.company.trim()) errs.company = 'La razón social es obligatoria';
      if (datos.companyNit.trim().length < 5) errs.companyNit = 'Ingresa el NIT de la empresa';
      if (!datos.firstName.trim()) errs.firstName = 'El nombre del representante es obligatorio';
      if (!datos.lastName.trim()) errs.lastName = 'El apellido del representante es obligatorio';
    } else {
      if (!datos.firstName.trim()) errs.firstName = 'El nombre es obligatorio';
      if (!datos.lastName.trim()) errs.lastName = 'El apellido es obligatorio';
      if (datos.documentNumber.trim().length < 5) {
        errs.documentNumber = 'Ingresa un número de documento válido';
      }
    }

    if (!datos.email.trim() || !datos.email.includes('@')) {
      errs.email = 'Ingresa un correo electrónico válido';
    }
    if (!datos.phone.trim()) errs.phone = 'Ingresa un teléfono de contacto';
    if (datos.address.trim().length < 5) errs.address = 'Ingresa tu dirección';

    const errsUbic = validarUbicacion(ubicacion, { pedirBarrio: true });
    setErroresUbicacion(errsUbic);
    Object.assign(errs, errsUbic);
    if (datos.password.length < 6) errs.password = 'La contraseña debe tener al menos 6 caracteres';
    if (datos.password !== datos.confirmPassword) {
      errs.confirmPassword = 'Las contraseñas no coinciden';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleGoogleSignup = async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      setErrors({
        form:
          err instanceof Error
            ? err.message
            : 'No fue posible continuar con Google. Inténtalo de nuevo.',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar()) return;

    let neighborhoodId: string | null = null;
    try {
      // Si el barrio se escribió porque no estaba en la lista, se incorpora
      // ahora: el servidor lo normaliza y no lo duplica.
      neighborhoodId = await resolverBarrio(ubicacion);
    } catch (err) {
      setErroresUbicacion({
        neighborhoodName:
          err instanceof Error ? err.message : 'No fue posible guardar el barrio',
      });
      return;
    }

    const comunes = {
      email: datos.email.trim(),
      phone: datos.phone.trim(),
      password: datos.password,
      countryCode: ubicacion.countryCode,
      departmentCode: ubicacion.departmentCode,
      municipalityCode: ubicacion.municipalityCode,
      neighborhoodId,
      address: datos.address.trim(),
    };

    try {
      const vinculacionPendiente = await registrar(
        tipoCuenta === 'EMPRESA'
          ? {
              accountType: 'EMPRESA',
              company: datos.company.trim(),
              companyNit: datos.companyNit.trim(),
              clientType: datos.clientType,
              firstName: datos.firstName.trim(),
              lastName: datos.lastName.trim(),
              ...comunes,
            }
          : {
              accountType: 'PERSONA',
              firstName: datos.firstName.trim(),
              lastName: datos.lastName.trim(),
              documentType: datos.documentType as (typeof TIPOS_DOCUMENTO)[number],
              documentNumber: datos.documentNumber.trim(),
              ...comunes,
            },
      );

      // Cuando el NIT ya estaba registrado no se crea una empresa nueva: queda
      // una solicitud para que el dueño de esa cuenta la apruebe. Mandar a la
      // persona al tablero sin avisarle la dejaría preguntándose por qué no ve
      // los proyectos de su compañía.
      if (vinculacionPendiente) {
        setPendienteAprobacion(true);
        return;
      }
      onNavigate('dashboard');
    } catch (err) {
      // El servicio ya traduce el error a un mensaje presentable
      // (p. ej. "Ya existe una cuenta con este correo electrónico").
      setErrors({
        form:
          err instanceof Error ? err.message : 'No se pudo completar el registro. Intenta de nuevo.',
      });
    }
  };

  const encabezado = (
    <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center px-4">
      <div className="inline-flex mb-4">
        <BrandLogo onClick={() => onNavigate('landing')} />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
        {tipoCuenta === null
          ? 'Crea tu cuenta en ColorLink'
          : tipoCuenta === 'EMPRESA'
            ? 'Registro de empresa'
            : 'Registro de persona natural'}
      </h2>
      <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
        {tipoCuenta === null
          ? 'Elige cómo vas a comprar. Los datos que te pedimos cambian según el caso.'
          : tipoCuenta === 'EMPRESA'
            ? 'Facturamos a nombre de la empresa con su NIT y podrás sumar más usuarios al equipo.'
            : 'Compra a tu nombre. Facturamos con tu documento de identidad.'}
      </p>
      <div className="max-w-md mx-auto text-left">
        <AvisoCarritoEnEspera />
      </div>
    </div>
  );

  // ── Resultado: la empresa ya existía y la vinculación quedó en trámite ────
  if (pendienteAprobacion) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12">
        <div className="sm:mx-auto sm:w-full sm:max-w-lg px-4">
          <div className="flex justify-center mb-6">
            <BrandLogo onClick={() => onNavigate('landing')} />
          </div>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-5">
              <Clock className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Tu cuenta ya está creada</h2>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">
              Ese NIT ya está registrado en ColorLink, así que no creamos una empresa duplicada.
              Enviamos una <strong>solicitud de vinculación</strong> a quien administra la cuenta de{' '}
              <strong>{datos.company.trim()}</strong>.
            </p>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              Mientras la aprueban puedes navegar la tienda y comprar a tu nombre. Los proyectos,
              precios y facturación de la empresa aparecerán apenas te acepten.
            </p>
            <div className="mt-6 space-y-2">
              <Button
                variant="pintuco"
                size="lg"
                className="w-full text-sm font-bold"
                onClick={() => onNavigate('dashboard')}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Ir a mi cuenta
              </Button>
              <button
                onClick={() => onNavigate('store')}
                className="w-full text-xs font-semibold text-slate-500 hover:text-[#004F9F] py-2"
              >
                Explorar la tienda
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Paso 0: elegir el tipo de cuenta ──────────────────────────────────────
  if (tipoCuenta === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12">
        {encabezado}

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setTipoCuenta('PERSONA')}
              className="group text-left bg-white rounded-2xl border-2 border-slate-200 hover:border-[#004F9F] p-6 shadow-xs hover:shadow-lg transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-[#004F9F]/10 text-[#004F9F] flex items-center justify-center mb-4 group-hover:bg-[#004F9F] group-hover:text-white transition-colors">
                <Store className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Persona natural</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Compras para tu casa o para tu trabajo independiente. Te pedimos solo tu documento.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#004F9F] mt-4">
                Continuar <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTipoCuenta('EMPRESA')}
              className="group text-left bg-white rounded-2xl border-2 border-slate-200 hover:border-[#004F9F] p-6 shadow-xs hover:shadow-lg transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-[#FFB81C]/20 text-[#B27E00] flex items-center justify-center mb-4 group-hover:bg-[#FFB81C] group-hover:text-slate-900 transition-colors">
                <Briefcase className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Empresa</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Constructora, distribuidor o profesional con NIT. Facturamos a nombre de la empresa.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#004F9F] mt-4">
                Continuar <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>
          </div>

          <div className="mt-6 bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            {conGoogle && (
              <>
                <SeparadorAcceso />
                <GoogleButton
                  onClick={handleGoogleSignup}
                  disabled={isSubmitting}
                  texto="Registrarse con Google"
                />
                <p className="text-[11px] text-slate-400 text-center font-medium">
                  Con Google entras como persona natural y podrás registrar tu empresa después desde
                  tu perfil.
                </p>
              </>
            )}
            <div className={`text-center text-xs text-slate-600 ${conGoogle ? 'pt-3 border-t border-slate-100' : ''}`}>
              ¿Ya tienes una cuenta registrada?{' '}
              <button
                onClick={() => onNavigate('login')}
                className="font-bold text-[#004F9F] hover:underline"
              >
                Iniciar sesión
              </button>
            </div>
          </div>

          <div className="text-center mt-5">
            <button
              onClick={() => onNavigate('store')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a la tienda
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Paso 1: el formulario del camino elegido ──────────────────────────────
  const esEmpresa = tipoCuenta === 'EMPRESA';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12">
      {encabezado}

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-2xl px-4">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-2xl shadow-xl border border-slate-200 text-left space-y-6">
          <button
            type="button"
            onClick={() => {
              setTipoCuenta(null);
              setErrors({});
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Cambiar tipo de cuenta
          </button>

          {errors.form && (
            <div
              ref={avisoError}
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium"
            >
              {errors.form}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {esEmpresa && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Razón social"
                    value={datos.company}
                    onChange={(e) => set('company', e.target.value)}
                    placeholder="Ej. Constructora Horizonte S.A.S."
                    error={errors.company}
                    required
                    leftIcon={<Building2 className="w-4 h-4" />}
                  />
                  <Input
                    label="NIT"
                    value={datos.companyNit}
                    onChange={(e) => set('companyNit', e.target.value)}
                    placeholder="900.123.456-7"
                    error={errors.companyNit}
                    required
                    leftIcon={<Hash className="w-4 h-4" />}
                  />
                </div>
                <Select
                  label="Tipo de cliente"
                  options={[...CLIENTES_EMPRESA]}
                  value={datos.clientType}
                  onChange={(e) => set('clientType', e.target.value)}
                  required
                />
                <p className="text-[11px] text-slate-400 -mt-2 font-medium">
                  Determina las listas de precios y condiciones comerciales que verás.
                </p>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={esEmpresa ? 'Nombre del representante' : 'Nombre'}
                value={datos.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                placeholder="Ej. Carlos"
                error={errors.firstName}
                required
                leftIcon={<User className="w-4 h-4" />}
              />
              <Input
                label={esEmpresa ? 'Apellido del representante' : 'Apellido'}
                value={datos.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                placeholder="Ej. Mendoza"
                error={errors.lastName}
                required
                leftIcon={<User className="w-4 h-4" />}
              />
            </div>

            {!esEmpresa && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Tipo de documento"
                  options={TIPOS_DOCUMENTO.map((t) => ({ value: t, label: ETIQUETA_DOCUMENTO[t] }))}
                  value={datos.documentType}
                  onChange={(e) => set('documentType', e.target.value)}
                  required
                />
                <Input
                  label="Número de documento"
                  value={datos.documentNumber}
                  onChange={(e) => set('documentNumber', e.target.value)}
                  placeholder="1.020.304.050"
                  error={errors.documentNumber}
                  required
                  leftIcon={<IdCard className="w-4 h-4" />}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={esEmpresa ? 'Correo corporativo' : 'Correo electrónico'}
                type="email"
                value={datos.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder={esEmpresa ? 'carlos@constructorahorizonte.com' : 'carlos@correo.com'}
                error={errors.email}
                required
                leftIcon={<Mail className="w-4 h-4" />}
              />
              <Input
                label="Teléfono de contacto"
                value={datos.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+57 (312) 000-0000"
                error={errors.phone}
                required
                leftIcon={<Phone className="w-4 h-4" />}
              />
            </div>

            {/* Ubicación y dirección.
                Despachamos a todo el país, así que están los 33 departamentos
                y los 1.122 municipios del DANE, no una lista de ciudades
                principales. Se elige, no se escribe: así no vuelven a
                aparecer 'Bogotá' y 'Bogotá D.C.' como dos ciudades. */}
            <div className="space-y-3 pt-1">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                {esEmpresa ? 'Ubicación de la empresa' : '¿Dónde te encontramos?'}
              </p>

              <SelectorUbicacion
                valor={ubicacion}
                onChange={setUbicacion}
                errores={erroresUbicacion}
                requerido
                compacto
              />

              <Input
                label={esEmpresa ? 'Dirección de la sede principal' : 'Dirección'}
                value={datos.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Ej. Cra 43A # 18 Sur - 135, Torre 2, Apto 501"
                error={errors.address}
                required
                leftIcon={<MapPin className="w-4 h-4" />}
              />
              <p className="text-[11px] text-slate-500 leading-snug">
                {esEmpresa
                  ? 'Queda registrada como tu sede principal. Después puedes agregar más sedes y elegir a cuál va cada pedido.'
                  : 'Queda guardada como tu dirección principal, y el carrito la propone al pedir un envío. Puedes cambiarla en cualquier momento.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <Input
                label="Contraseña"
                type="password"
                value={datos.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Mínimo 6 caracteres"
                error={errors.password}
                required
                leftIcon={<Lock className="w-4 h-4" />}
              />
              <Input
                label="Confirmar contraseña"
                type="password"
                value={datos.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
                placeholder="Repite la contraseña"
                error={errors.confirmPassword}
                required
                leftIcon={<Lock className="w-4 h-4" />}
              />
            </div>

            <div className="flex items-start gap-2 pt-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Al registrarte autorizas el tratamiento de tus datos personales conforme a la Ley
                1581 de 2012 y aceptas los términos de servicio de Pintuco y ColorLink.
              </span>
            </div>

            <Button
              type="submit"
              variant="pintuco"
              size="lg"
              isLoading={isSubmitting}
              className="w-full text-sm font-bold shadow-md shadow-[#004F9F]/20 mt-4"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              {esEmpresa ? 'Registrar empresa' : 'Crear mi cuenta'}
            </Button>
          </form>

          <div className="text-center pt-2 text-xs text-slate-600 border-t border-slate-100">
            ¿Ya tienes una cuenta registrada?{' '}
            <button
              onClick={() => onNavigate('login')}
              className="font-bold text-[#004F9F] hover:underline"
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
