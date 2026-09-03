import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, BellRing, Lock } from 'lucide-react';
import {
  clientesAdminService, type FichaPersona, type FichaEmpresa, type Resultado,
} from '../services/clientesAdmin';
import {
  SelectorUbicacion, UBICACION_VACIA, resolverBarrio,
  type ValorUbicacion,
} from '../components/common/SelectorUbicacion';
import { ubicacionService } from '../services/ubicaciones';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { AvatarCliente } from './AvatarCliente';

/**
 * Ficha editable de un cliente, persona o empresa.
 *
 * Antes esta pantalla solo dejaba mirar: corregir un teléfono mal escrito
 * había que pedírselo al cliente, y mientras tanto el despacho salía con el
 * dato malo.
 *
 * EL AVISO AL CLIENTE NO SE MANDA DESDE AQUÍ. Lo inserta la propia función de
 * base, en la misma transacción que el cambio, así que no hay forma de
 * actualizar sin notificar: o pasan las dos cosas, o no pasa ninguna. Esta
 * pantalla solo muestra a cuánta gente se avisó.
 *
 * Lo que se guarda es lo que CAMBIÓ: los campos que no se tocan no se mandan,
 * y si no cambia nada la base no manda aviso. Abrir la ficha, mirarla y
 * cerrarla no le llega al cliente como una alerta.
 */

interface Props {
  tipo: 'PERSONA' | 'EMPRESA';
  id: string;
  /** Para el avatar mientras carga la ficha. */
  nombre: string;
  fotoUrl?: string | null;
  onCerrar: () => void;
  /** Se llama tras guardar, para refrescar la lista de atrás. */
  onGuardado: () => void;
}

const TIPOS_DOCUMENTO = ['CC', 'CE', 'NIT', 'PASAPORTE', 'PEP'] as const;
const TIPOS_CLIENTE = ['Particular', 'Constructor', 'Profesional', 'Empresa'] as const;

export const FormularioCliente: React.FC<Props> = ({
  tipo, id, nombre, fotoUrl, onCerrar, onGuardado,
}) => {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<Resultado | null>(null);

  const [persona, setPersona] = useState<FichaPersona | null>(null);
  const [empresa, setEmpresa] = useState<FichaEmpresa | null>(null);
  const [ubicacion, setUbicacion] = useState<ValorUbicacion>(UBICACION_VACIA);
  /** Copia de lo que se cargó, para mandar solo lo que cambió. */
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [campos, setCampos] = useState<Record<string, string>>({});

  const poner = (k: string, v: string) => setCampos((c) => ({ ...c, [k]: v }));

  useEffect(() => {
    let vigente = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        if (tipo === 'PERSONA') {
          const f = await clientesAdminService.fichaPersona(id);
          if (!vigente || !f) return;
          setPersona(f);
          const base = {
            first_name: f.firstName, last_name: f.lastName, phone: f.phone,
            address: f.address, document_type: f.documentType,
            document_number: f.documentNumber, client_type: f.clientType,
          };
          setOriginal(base);
          setCampos(base);
          setUbicacion({
            ...UBICACION_VACIA,
            countryCode: f.countryCode || 'CO',
            // El código DIVIPOLA del municipio empieza por el del departamento.
            departmentCode: f.municipalityCode.slice(0, 2),
            municipalityCode: f.municipalityCode,
            neighborhoodId: f.neighborhoodId,
          });
        } else {
          const f = await clientesAdminService.fichaEmpresa(id);
          if (!vigente || !f) return;
          setEmpresa(f);
          const base = {
            name: f.name, legal_name: f.legalName, nit: f.nit,
            phone: f.phone, email: f.email, address: f.address,
            logo_url: f.logoUrl ?? '',
          };
          setOriginal(base);
          setCampos(base);
          setUbicacion({
            ...UBICACION_VACIA,
            countryCode: f.countryCode || 'CO',
            departmentCode: f.municipalityCode.slice(0, 2),
            municipalityCode: f.municipalityCode,
            neighborhoodId: f.neighborhoodId,
          });
        }
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : 'No fue posible cargar la ficha.');
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [tipo, id]);

  const municipioOriginal = tipo === 'PERSONA'
    ? (persona?.municipalityCode ?? '')
    : (empresa?.municipalityCode ?? '');

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    setGuardando(true);
    try {
      // Solo lo que cambió. Mandar todo haría que la base comparase valores
      // idénticos y, sobre todo, obligaría a acertar con campos que este
      // formulario ni siquiera muestra.
      const datos: Record<string, string> = {};
      for (const clave of Object.keys(campos)) {
        const valor = campos[clave] ?? '';
        if ((original[clave] ?? '') !== valor) datos[clave] = valor.trim();
      }

      if (ubicacion.municipalityCode && ubicacion.municipalityCode !== municipioOriginal) {
        datos.municipality_code = ubicacion.municipalityCode;
        datos.country_code = ubicacion.countryCode || 'CO';
        // `city` se guarda ADEMÁS como texto porque la factura y los
        // documentos impresos lo leen de ahí y no resuelven el código
        // DIVIPOLA. Si solo se guardara el código, la ciudad de la factura se
        // quedaría con la anterior.
        const municipios = await ubicacionService.getMunicipios(ubicacion.departmentCode);
        const m = municipios.find((x) => x.code === ubicacion.municipalityCode);
        if (m) datos.city = m.name;
      }
      const barrio = await resolverBarrio(ubicacion);
      if (barrio && barrio !== (tipo === 'PERSONA' ? persona?.neighborhoodId : empresa?.neighborhoodId)) {
        datos.neighborhood_id = barrio;
      }

      if (Object.keys(datos).length === 0) {
        setHecho({ cambios: 0, aviso: false, avisados: 0, detalle: [] });
        return;
      }

      const r = tipo === 'PERSONA'
        ? await clientesAdminService.actualizarPersona(id, datos)
        : await clientesAdminService.actualizarEmpresa(id, datos);
      setHecho(r);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const campo = (
    clave: string, etiqueta: string, extra: Partial<React.ComponentProps<typeof Input>> = {},
  ) => (
    <Input
      label={etiqueta}
      value={campos[clave] ?? ''}
      onChange={(e) => poner(clave, e.target.value)}
      {...extra}
    />
  );

  return (
    <Modal
      isOpen
      onClose={onCerrar}
      title={tipo === 'PERSONA' ? 'Ficha del cliente' : 'Ficha de la empresa'}
      subtitle="Al guardar se le avisa al cliente"
      maxWidth="2xl"
    >
      {cargando ? (
        <p className="text-sm text-slate-500 flex items-center gap-2 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando ficha…
        </p>
      ) : hecho ? (
        // ── Confirmación ────────────────────────────────────────────────
        <div className="space-y-4">
          {hecho.cambios === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">
              No cambiaste nada, así que no se guardó ni se avisó al cliente.
            </div>
          ) : (
            <>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-px" />
                <div className="text-sm text-emerald-900">
                  <p className="font-bold">
                    {hecho.cambios} {hecho.cambios === 1 ? 'dato actualizado' : 'datos actualizados'}.
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs font-medium">
                    {hecho.detalle.map((d) => <li key={d}>· {d}</li>)}
                  </ul>
                </div>
              </div>

              {hecho.aviso && (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-2.5">
                  <BellRing className="w-4 h-4 text-[#004F9F] shrink-0 mt-px" />
                  <p className="text-xs text-blue-900 font-medium">
                    Se avisó {hecho.avisados === 1 ? 'al cliente' : `a ${hecho.avisados} usuarios`} con
                    la fecha, la hora, tu nombre y el detalle del cambio. Lo verá en sus
                    notificaciones la próxima vez que entre.
                  </p>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end">
            <Button variant="pintuco" onClick={onCerrar}>Cerrar</Button>
          </div>
        </div>
      ) : (
        // ── Formulario ──────────────────────────────────────────────────
        <form onSubmit={guardar} className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <AvatarCliente
              nombre={nombre}
              fotoUrl={fotoUrl ?? persona?.avatarUrl ?? empresa?.logoUrl}
              tipo={tipo === 'PERSONA' ? 'PERSONA' : 'EMPRESA'}
              tamano={44}
            />
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">{nombre}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {tipo === 'PERSONA' ? 'Persona natural' : 'Empresa'}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-2">
            <BellRing className="w-4 h-4 text-[#004F9F] shrink-0 mt-px" />
            <p className="text-[11px] text-blue-900 font-medium leading-snug">
              Al guardar, {tipo === 'PERSONA' ? 'el cliente recibe' : 'los usuarios de la empresa reciben'} un
              aviso con la fecha, la hora, tu nombre y qué cambió. Su perfil queda
              actualizado también en la tienda.
            </p>
          </div>

          {error && (
            <p role="alert" className="p-3 rounded-lg text-xs font-medium bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {error}
            </p>
          )}

          {tipo === 'PERSONA' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {campo('first_name', 'Nombres')}
                {campo('last_name', 'Apellidos')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-xs font-bold text-slate-600">
                  Tipo de documento
                  <select
                    value={campos.document_type ?? ''}
                    onChange={(e) => poner('document_type', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal
                               focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
                  >
                    <option value="">—</option>
                    {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <div className="sm:col-span-2">
                  {campo('document_number', 'Número de documento', {
                    helperText: 'Se guarda sin puntos, como lo pide la DIAN.',
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {campo('phone', 'Teléfono', {
                  helperText: 'Se guarda con indicativo (+57).',
                })}
                <label className="text-xs font-bold text-slate-600">
                  Tipo de cliente
                  <select
                    value={campos.client_type ?? ''}
                    onChange={(e) => poner('client_type', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal
                               focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
                  >
                    <option value="">—</option>
                    {TIPOS_CLIENTE.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>

              {/* El correo es la cuenta de acceso: cambiarlo solo en el perfil
                  lo desincronizaría de la contraseña y el cliente no podría
                  entrar. Se muestra, no se edita. */}
              <div>
                <Input
                  label="Correo de acceso"
                  value={persona?.email ?? ''}
                  readOnly
                  disabled
                  leftIcon={<Lock className="w-4 h-4" />}
                  helperText="Es su usuario de acceso; se cambia desde su cuenta."
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {campo('name', 'Nombre comercial')}
                {campo('legal_name', 'Razón social')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {campo('nit', 'NIT', { helperText: 'Sin puntos, con el guion del dígito de verificación.' })}
                {campo('phone', 'Teléfono')}
              </div>
              {campo('email', 'Correo de contacto', { type: 'email' })}
              {campo('logo_url', 'Logotipo (URL)', {
                helperText: 'Si lo pones, aparece en la tarjeta del cliente.',
              })}
            </>
          )}

          <SelectorUbicacion valor={ubicacion} onChange={setUbicacion} pedirBarrio={false} />

          {campo('address', 'Dirección', {
            helperText: 'Se guarda en mayúsculas, igual que el resto de direcciones.',
          })}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" variant="pintuco" isLoading={guardando}>
              Guardar y avisar al cliente
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
