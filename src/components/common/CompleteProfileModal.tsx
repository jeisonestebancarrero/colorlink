import React, { useEffect, useState } from 'react';
import { Building2, Phone, UserRound, IdCard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';
import type { ClientType } from '../../types';
import { Modal } from './Modal';
import { Input } from './Input';
import { Select } from './Select';
import { TIPOS_DOCUMENTO, ETIQUETA_DOCUMENTO } from '../../schemas/auth';
import { normalizarDocumento, errorDocumento, errorTelefono, normalizarTelefono } from '../../schemas/documento';
import {
  SelectorUbicacion,
  UBICACION_VACIA,
  validarUbicacion,
  type ErroresUbicacion,
  type ValorUbicacion,
} from './SelectorUbicacion';
import { Button } from './Button';

/**
 * Pide al entrar los datos que falten (típicamente tras Google: teléfono, ciudad, documento).
 * La razón social solo a empresas; la ciudad sale de DIVIPOLA porque su código define tienda y asesor.
 */
export const CompleteProfileModal: React.FC = () => {
  const { user, necesitaCompletarPerfil, completeProfile } = useAuth();

  const [omitido, setOmitido] = useState(false);
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [ubicacion, setUbicacion] = useState<ValorUbicacion>(UBICACION_VACIA);
  const [erroresUbicacion, setErroresUbicacion] = useState<ErroresUbicacion>({});
  const [datos, setDatos] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    company: user?.company ?? '',
    phone: user?.phone ?? '',
    documentType: user?.documentType ?? 'CC',
    documentNumber: user?.documentNumber ?? '',
    clientType: (user?.clientType ?? 'Constructor') as ClientType,
  });

  useEffect(() => {
    if (necesitaCompletarPerfil) {
      authService.proveedorSesion().then(setProveedor).catch(() => setProveedor(null));
    }
  }, [necesitaCompletarPerfil]);

  if (!necesitaCompletarPerfil || omitido) return null;

  const esParticular = datos.clientType === 'Particular';
  // Si ya tiene ciudad guardada no se exige: el selector arranca vacío.
  const faltaCiudad = (user?.city ?? '').trim() === '';

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
    const malTel = errorTelefono(datos.phone);
    if (malTel) return setError(`${malTel}.`);
    // Sin documento no se factura, y quien entra con Google solo pasa por aquí.
    const malDoc = errorDocumento(datos.documentType, datos.documentNumber);
    if (malDoc) {
      return setError(
        datos.documentNumber.trim()
          ? `${malDoc}.`
          : 'El número de documento es obligatorio para poder facturarte.',
      );
    }

    // El barrio se pide al despachar; aquí basta la ciudad.
    const eligioAlgo = ubicacion.departmentCode !== '' || ubicacion.municipalityCode !== '';
    const fallos =
      faltaCiudad || eligioAlgo
        ? validarUbicacion(ubicacion, { pedirBarrio: false })
        : {};
    setErroresUbicacion(fallos);
    if (Object.keys(fallos).length > 0) {
      return setError('Selecciona tu departamento y tu ciudad.');
    }

    setGuardando(true);
    try {
      await completeProfile({
        ...datos,
        // Solo se envía lo respondido, para que la auditoría refleje el cambio real (la RPC hace `coalesce`).
        documentType: datos.documentType,
        documentNumber: datos.documentNumber.trim(),
        ...(ubicacion.municipalityCode
          ? {
              countryCode: ubicacion.countryCode,
              municipalityCode: ubicacion.municipalityCode,
            }
          : {}),
      });
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

        <Input
          label="Teléfono de contacto"
          value={datos.phone}
          onChange={(e) =>
                setDatos({ ...datos, phone: normalizarTelefono(e.target.value) })
              }
          leftIcon={<Phone className="w-4 h-4" />}
          placeholder="+57 (300) 000-0000"
          required
        />

        {/* Documento obligatorio para facturar; solo aparece si falta y no se edita aquí. */}
        {!user?.documentNumber && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Tipo de documento"
              options={TIPOS_DOCUMENTO.map((t) => ({ value: t, label: ETIQUETA_DOCUMENTO[t] }))}
              value={datos.documentType}
              onChange={(e) =>
                setDatos({
                  ...datos,
                  documentType: e.target.value,
                  documentNumber: normalizarDocumento(e.target.value, datos.documentNumber),
                })
              }
            />
            <Input
              label="Número de documento"
              value={datos.documentNumber}
              onChange={(e) =>
                setDatos({
                  ...datos,
                  documentNumber: normalizarDocumento(datos.documentType, e.target.value),
                })
              }
              leftIcon={<IdCard className="w-4 h-4" />}
              inputMode="numeric"
              placeholder="1020304050"
              required
            />
          </div>
        )}

        <SelectorUbicacion
          valor={ubicacion}
          onChange={setUbicacion}
          requerido={faltaCiudad}
          errores={erroresUbicacion}
          pedirBarrio={false}
          compacto
        />

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
