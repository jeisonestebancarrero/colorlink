import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProjects } from '../context/ProjectContext';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { ClientType } from '../types';
import {
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  FolderKanban,
  CheckCircle2,
  Save,
  LogOut,
  Sparkles,
  IdCard,
} from 'lucide-react';
import { MisDireccionesYSedes } from '../components/common/MisDireccionesYSedes';
import { SolicitudesDeVinculacion } from '../components/common/SolicitudesDeVinculacion';
import { CambiarFoto } from '../components/common/CambiarFoto';
import { ContrasenaDeLaCuenta } from '../components/common/ContrasenaDeLaCuenta';
import { avatarService } from '../services/avatares';

interface ProfilePageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigate }) => {
  const { user, updateProfile, logout, access } = useAuth();
  const { projects, statusStats } = useProjects();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    company: user?.company || '',
    clientType: (user?.clientType || 'Constructor') as ClientType,
    email: user?.email || '',
    phone: user?.phone || '',
    city: user?.city || '',
  });

  // No hay flag de "es empresa": la señal fiable es pertenecer a una (lo resuelve `access`).
  const esCuentaDeEmpresa = access.companyIds.length > 0;
  const [logoEmpresa, setLogoEmpresa] = useState<string | null>(null);

  // Carga el logo guardado; si no, la empresa ve el marcador vacío.
  useEffect(() => {
    const companyId = access.companyIds[0];
    if (!companyId) return;
    let activo = true;
    avatarService.obtenerLogoDeEmpresa(companyId)
      .then((url) => { if (activo) setLogoEmpresa(url); })
      .catch(() => undefined);
    return () => { activo = false; };
  }, [access.companyIds]);

  const clientTypes: ClientType[] = [
    'Particular',
    'Constructor',
    'Empresa',
    'Profesional',
    'Distribuidor',
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile(formData);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    onNavigate('landing');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-left pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Mi cuenta
          </h1>
          <p className="text-xs text-slate-500">
            {esCuentaDeEmpresa
              ? 'Administra los datos de tu empresa, información de contacto y preferencias'
              : 'Administra tus datos de contacto, direcciones y contraseña'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="text-xs"
            >
              Editar datos
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            leftIcon={<LogOut className="w-4 h-4 text-rose-600" />}
            className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
          >
            Cerrar sesión
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Tus datos han sido actualizados satisfactoriamente.</span>
        </div>
      )}

      {/* Arriba a propósito: es lo único que otra persona está esperando. */}
      <SolicitudesDeVinculacion contexto="cliente" />

      {/* Main Profile Info Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-slate-100">
          {/* `avatar_url` antes solo lo llenaba Google; aquí cualquiera puede subirla. */}
          <CambiarFoto
            tipo="perfil"
            urlActual={user?.avatar}
            nombre={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`}
          />

          <div className="space-y-1 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">
                {user?.firstName} {user?.lastName}
              </h2>
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-50 text-[#004F9F] border border-blue-200 px-2.5 py-0.5 rounded-full">
                {user?.clientType}
              </span>
            </div>
            {user?.company && (
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {user.company}
              </p>
            )}
            <p className="text-xs text-slate-400">
              Cliente verificado Pintuco Colombia • ID: {user?.id}
            </p>
          </div>
        </div>

        {/* Edit or View Mode */}
        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-4 pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nombre"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
              <Input
                label="Apellido"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
              {/* Solo para cuentas de empresa: una persona natural no tiene razón social. */}
              {esCuentaDeEmpresa && (
                <Input
                  label="Empresa / Razón Social"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  required
                />
              )}
              <Select
                label="Tipo de cliente"
                options={clientTypes}
                value={formData.clientType}
                onChange={(e) =>
                  setFormData({ ...formData, clientType: e.target.value as ClientType })
                }
              />
              <Input
                label="Correo electrónico"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <Input
                label="Teléfono de contacto"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />

              {/* Solo lectura: identifica a la persona en la factura (DIAN). Lo cambia
                  administración con trazabilidad; un trigger lo bloquea igual en el servidor. */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                  Documento
                </label>
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50">
                  <IdCard className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-700">
                    {user?.documentNumber
                      ? `${user.documentType ?? 'CC'} ${user.documentNumber}`
                      : 'Sin documento registrado'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {user?.documentNumber
                    ? 'Aparece en tus facturas. Si está mal, escríbenos y lo corregimos.'
                    : 'Tu cuenta no tiene documento. Lo necesitamos para facturar: escríbenos o dilo al recoger tu primer pedido.'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Ciudad"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="pintuco"
                isLoading={isSaving}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Guardar cambios
              </Button>
            </div>
          </form>
        ) : (
          <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Datos de Contacto
              </span>
              <div className="flex items-center gap-2 text-slate-700">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-medium">{user?.email}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-medium">{user?.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-medium">{user?.city}</span>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Resumen de Proyectos
              </span>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                  <span className="text-lg font-bold text-[#004F9F]">
                    {projects.length}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    Proyectos Totales
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                  <span className="text-lg font-bold text-purple-600">
                    {statusStats.inProgress}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    En Atención
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('projects')}
                className="w-full text-xs"
              >
                Ver todos mis proyectos ({projects.length})
              </Button>
            </div>
          </div>
        )}
      </div>

      {esCuentaDeEmpresa && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <CambiarFoto
            tipo="empresa"
            urlActual={logoEmpresa}
            nombre={user?.company ?? 'Empresa'}
            companyId={access.companyIds[0]}
            onCambio={setLogoEmpresa}
          />
        </div>
      )}

      {/* Direcciones del cliente y sedes de la empresa (el carrito pregunta la sede). */}
      <MisDireccionesYSedes />

      {/* Quien entra con Google necesita crear clave: el portal interno solo acepta correo y clave. */}
      <ContrasenaDeLaCuenta />

      {/* Account Security Info */}
      <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <strong className="block font-semibold mb-0.5">
            {esCuentaDeEmpresa ? 'Cuenta corporativa segura Pintuco' : 'Cuenta segura Pintuco'}
          </strong>
          {esCuentaDeEmpresa
            ? 'Tus proyectos y diagnósticos quedan asociados a tu razón social para facilitar la emisión de garantías comerciales y el despacho de producto por distribuidores autorizados.'
            : 'Tus pedidos, proyectos y diagnósticos quedan asociados a tu documento para emitir tus facturas y respaldar las garantías.'}
        </div>
      </div>
    </div>
  );
};
