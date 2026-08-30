import React, { useEffect, useState } from 'react';
import { Building2, MapPin, Phone, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';
import type { ClientType } from '../../types';
import { Modal } from './Modal';
import { Input } from './Input';
import { Select } from './Select';
import { Button } from './Button';

/**
 * Completar los datos que falten en el perfil.
 *
 * El caso típico es Google: entrega correo, nombre y foto, pero nunca
 * teléfono ni ciudad, y sin eso no se puede coordinar una entrega ni una
 * visita técnica. Se piden una sola vez, al entrar.
 *
 * La razón social solo se pide a quien compra como empresa. A una persona
 * natural no se le exige —antes se le exigía, y quedaba atrapada en este
 * modal justo después de registrarse, sin nada que pudiera responder.
 *
 * El aviso de Google solo aparece si la sesión realmente vino de Google:
 * decírselo a quien se registró con su correo es sencillamente mentirle.
 */
export const CompleteProfileModal: React.FC = () => {
  const { user, necesitaCompletarPerfil, completeProfile } = useAuth();

  const [omitido, setOmitido] = useState(false);
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    company: user?.company ?? '',
    phone: user?.phone ?? '',
    city: user?.city ?? '',
    clientType: (user?.clientType ?? 'Constructor') as ClientType,
  });

  useEffect(() => {
    if (necesitaCompletarPerfil) {
      authService.proveedorSesion().then(setProveedor).catch(() => setProveedor(null));
    }
  }, [necesitaCompletarPerfil]);

  if (!necesitaCompletarPerfil || omitido) return null;

  const esParticular = datos.clientType === 'Particular';

  const tiposCliente: ClientType[] = [
    'Particular', 'Constructor', 'Empresa', 'Profesional', 'Distribuidor',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!datos.firstName.trim()) return setError('Tu nombre es obligatorio.');
    if (!esParticular && !datos.company.trim()) {
      return setError('La empresa o razón social es obligatoria para cuentas empresariales.');
    }
    if (!datos.phone.trim()) return setError('El teléfono de contacto es obligatorio.');
    if (!datos.city.trim()) return setError('La ciudad es obligatoria.');

    setGuardando(true);
    try {
      await completeProfile(datos);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No fue posible guardar tus datos. Inténtalo de nuevo.'
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => setOmitido(true)}
      title="Completa tu perfil"
      subtitle="Necesitamos algunos datos para poder atender tus proyectos"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 font-medium">
          {proveedor === 'google'
            ? 'Iniciaste sesión con Google. Google no comparte tu teléfono ni tu ciudad, así que te los pedimos aquí una sola vez.'
            : 'Nos faltan un par de datos de contacto para poder coordinar tus entregas y visitas técnicas. Te los pedimos una sola vez.'}
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nombre"
            value={datos.firstName}
            onChange={(e) => setDatos({ ...datos, firstName: e.target.value })}
            leftIcon={<UserRound className="w-4 h-4" />}
            required
          />
          <Input
            label="Apellido"
            value={datos.lastName}
            onChange={(e) => setDatos({ ...datos, lastName: e.target.value })}
          />
        </div>

        <Select
          label="Tipo de cliente"
          options={tiposCliente}
          value={datos.clientType}
          onChange={(e) => setDatos({ ...datos, clientType: e.target.value as ClientType })}
        />

        {/* Solo quien compra a nombre de una empresa tiene razón social. */}
        {!esParticular && (
          <Input
            label="Empresa o razón social"
            value={datos.company}
            onChange={(e) => setDatos({ ...datos, company: e.target.value })}
            leftIcon={<Building2 className="w-4 h-4" />}
            placeholder="Constructora Ejemplo S.A.S."
            required
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Teléfono de contacto"
            value={datos.phone}
            onChange={(e) => setDatos({ ...datos, phone: e.target.value })}
            leftIcon={<Phone className="w-4 h-4" />}
            placeholder="+57 (300) 000-0000"
            required
          />
          <Input
            label="Ciudad"
            value={datos.city}
            onChange={(e) => setDatos({ ...datos, city: e.target.value })}
            leftIcon={<MapPin className="w-4 h-4" />}
            placeholder="Medellín"
            required
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setOmitido(true)}>
            Ahora no
          </Button>
          <Button type="submit" variant="pintuco" isLoading={guardando}>
            Guardar y continuar
          </Button>
        </div>
      </form>
    </Modal>
  );
};
