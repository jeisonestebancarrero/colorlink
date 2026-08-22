import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { ClientType } from '../types';
import {
  Layers,
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Lock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface RegisterPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate }) => {
  const { register, isLoading } = useAuth();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    clientType: 'Constructor' as ClientType,
    company: '',
    email: '',
    phone: '',
    city: 'Medellín',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.firstName.trim()) errs.firstName = 'El nombre es obligatorio';
    if (!formData.lastName.trim()) errs.lastName = 'El apellido es obligatorio';
    if (!formData.company.trim()) errs.company = 'La empresa o razón social es obligatoria';
    if (!formData.email.trim() || !formData.email.includes('@')) {
      errs.email = 'Ingresa un correo electrónico válido';
    }
    if (!formData.phone.trim()) errs.phone = 'Ingresa un teléfono de contacto';
    if (!formData.city.trim()) errs.city = 'La ciudad es requerida';
    if (!formData.password || formData.password.length < 6) {
      errs.password = 'La contraseña debe tener al menos 6 caracteres';
    }
    if (formData.password !== formData.confirmPassword) {
      errs.confirmPassword = 'Las contraseñas no coinciden';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      await register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        clientType: formData.clientType,
        company: formData.company,
        email: formData.email,
        phone: formData.phone,
        city: formData.city,
      });
      onNavigate('dashboard');
    } catch (err) {
      setErrors({ form: 'No se pudo completar el registro. Intenta de nuevo.' });
    }
  };

  const clientTypes: ClientType[] = [
    'Particular',
    'Constructor',
    'Empresa',
    'Profesional',
    'Distribuidor',
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center">
        <div
          onClick={() => onNavigate('landing')}
          className="inline-flex items-center gap-3 cursor-pointer mb-3 select-none"
        >
          <div className="w-10 h-10 rounded-xl bg-[#004F9F] flex items-center justify-center text-white shadow-md">
            <Layers className="w-6 h-6" />
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

        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Crea tu Cuenta de Cliente Pintuco
        </h2>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Accede al gestor inteligente de proyectos, especificaciones técnicas de recubrimientos y acompañamiento directo en obra.
        </p>
      </div>

      {/* Form Card */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-2xl px-4">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-2xl shadow-xl border border-slate-200 text-left space-y-6">
          {errors.form && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
              {errors.form}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nombre"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="Ej. Carlos"
                error={errors.firstName}
                required
                leftIcon={<User className="w-4 h-4" />}
              />
              <Input
                label="Apellido"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Ej. Mendoza"
                error={errors.lastName}
                required
                leftIcon={<User className="w-4 h-4" />}
              />
            </div>

            {/* Row 2: Client Type & Company */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Tipo de cliente"
                options={clientTypes}
                value={formData.clientType}
                onChange={(e) =>
                  setFormData({ ...formData, clientType: e.target.value as ClientType })
                }
                required
              />
              <Input
                label="Empresa o Razón Social"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Ej. Constructora Horizonte S.A.S."
                error={errors.company}
                required
                leftIcon={<Building2 className="w-4 h-4" />}
              />
            </div>

            {/* Row 3: Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Correo electrónico corporativo"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="carlos@constructorahorizonte.com"
                error={errors.email}
                required
                leftIcon={<Mail className="w-4 h-4" />}
              />
              <Input
                label="Teléfono de contacto"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+57 (312) 000-0000"
                error={errors.phone}
                required
                leftIcon={<Phone className="w-4 h-4" />}
              />
            </div>

            {/* Row 4: City */}
            <Input
              label="Ciudad principal de operación"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="Ej. Medellín, Bogotá, Cali, Barranquilla..."
              error={errors.city}
              required
              leftIcon={<MapPin className="w-4 h-4" />}
            />

            {/* Row 5: Passwords */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <Input
                label="Contraseña"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
                error={errors.password}
                required
                leftIcon={<Lock className="w-4 h-4" />}
              />
              <Input
                label="Confirmar contraseña"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Repite la contraseña"
                error={errors.confirmPassword}
                required
                leftIcon={<Lock className="w-4 h-4" />}
              />
            </div>

            {/* Terms note */}
            <div className="flex items-start gap-2 pt-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Al registrarte aceptas las políticas de tratamiento de datos y términos de servicio de Pintuco y ColorLink.
              </span>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              variant="pintuco"
              size="lg"
              isLoading={isLoading}
              className="w-full text-sm font-bold shadow-md shadow-[#004F9F]/20 mt-4"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Registrar cuenta de cliente
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
