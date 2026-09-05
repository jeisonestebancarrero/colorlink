import React, { useEffect, useState } from 'react';
import { MapPin, Building2, Plus, Check, Phone, User, IdCard } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { SelectorUbicacion } from '../common/SelectorUbicacion';
import { ubicacionService } from '../../services/ubicaciones';

/**
 * A dónde va el pedido y quién lo recibe.
 *
 * Antes esto era un solo campo de texto precargado con una dirección de
 * demostración escrita en el código, y la ciudad no se podía cambiar. Ahora:
 *
 *   * La dirección arranca EN BLANCO y es obligatoria para confirmar. Ninguna
 *     dirección inventada puede colarse en un pedido real por no haberla
 *     tocado.
 *   * El cliente con dirección guardada la ve propuesta y puede cambiarla.
 *   * La empresa con más de una sede elige a cuál va, y ve la sede completa:
 *     dirección, barrio, ciudad, departamento y contacto.
 *   * Siempre queda la opción de escribir una dirección nueva, porque una obra
 *     no es una sede registrada.
 *   * La ciudad sale del diccionario DIVIPOLA: los 1.122 municipios del país.
 */

const claseInput =
  'w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 ' +
  'focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20';
const claseInputError = 'border-rose-400 bg-rose-50/40';

/** '2026-09-04' → 'viernes 4 de septiembre'. */
function formatearFecha(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  // Se construye en hora local a mediodía: con `new Date(iso)` la fecha se
  // interpreta en UTC y en Colombia (-5) se muestra el día anterior. Ya pasó
  // antes en este proyecto con las fechas corridas un día.
  const f = new Date(a, m - 1, d, 12, 0, 0);
  return f.toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

const TIPOS_DOCUMENTO = [
  { valor: 'CC', etiqueta: 'Cédula de ciudadanía' },
  { valor: 'CE', etiqueta: 'Cédula de extranjería' },
  { valor: 'PASAPORTE', etiqueta: 'Pasaporte' },
  { valor: 'PEP', etiqueta: 'Permiso especial de permanencia' },
  { valor: 'NIT', etiqueta: 'NIT' },
];

export const DestinoEnvioSelector: React.FC = () => {
  const {
    destino, setDestino, direccionesGuardadas, sedesEmpresa, erroresEntrega,
  } = useCart();

  const sedeElegida = sedesEmpresa.find((x) => x.id === destino.companyBranchId);
  const dirElegida = direccionesGuardadas.find((x) => x.id === destino.customerAddressId);

  /**
   * Municipio al que realmente va el pedido, según el modo elegido. Es lo que
   * decide la fecha de entrega, así que no puede leerse solo del formulario de
   * dirección nueva.
   */
  const municipioDestino =
    destino.modo === 'sede' ? sedeElegida?.municipalityCode
    : destino.modo === 'guardada' ? dirElegida?.municipalityCode
    : destino.ubicacion.municipalityCode;

  const [entrega, setEntrega] = useState<{ dias: number; fecha: string } | null>(null);

  useEffect(() => {
    let activo = true;
    if (!municipioDestino) {
      setEntrega(null);
      return;
    }
    ubicacionService.estimarEntrega(municipioDestino)
      .then((e) => { if (activo) setEntrega(e); })
      .catch(() => { if (activo) setEntrega(null); });
    return () => { activo = false; };
  }, [municipioDestino]);

  /** Una sola sede no es una pregunta: se muestra y no se hace elegir. */
  const hayVariasSedes = sedesEmpresa.length > 1;

  const opciones: Array<{ modo: 'guardada' | 'sede' | 'nueva'; etiqueta: string; icono: React.ReactNode }> = [
    ...(direccionesGuardadas.length > 0
      ? [{ modo: 'guardada' as const, etiqueta: 'Mis direcciones', icono: <MapPin className="w-3.5 h-3.5" /> }]
      : []),
    ...(sedesEmpresa.length > 0
      ? [{ modo: 'sede' as const, etiqueta: hayVariasSedes ? 'Una de mis sedes' : 'Mi sede', icono: <Building2 className="w-3.5 h-3.5" /> }]
      : []),
    { modo: 'nueva' as const, etiqueta: 'Otra dirección', icono: <Plus className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="mt-3 p-3 bg-white rounded-lg border border-blue-100 space-y-3">
      {/* Elegir de dónde sale la dirección */}
      {opciones.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {opciones.map((o) => (
            <button
              key={o.modo}
              type="button"
              onClick={() => setDestino({ ...destino, modo: o.modo })}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                destino.modo === o.modo
                  ? 'bg-[#004F9F] text-white border-[#004F9F]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {o.icono}
              {o.etiqueta}
            </button>
          ))}
        </div>
      )}

      {erroresEntrega.destino && (
        <p className="text-[11px] font-semibold text-rose-600">{erroresEntrega.destino}</p>
      )}

      {/* ---- Direcciones guardadas ---- */}
      {destino.modo === 'guardada' && (
        <div className="space-y-1.5">
          {direccionesGuardadas.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDestino({ ...destino, customerAddressId: d.id, companyBranchId: null })}
              className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                destino.customerAddressId === d.id
                  ? 'border-[#004F9F] bg-blue-50/70 ring-1 ring-[#004F9F]'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    {d.label}
                    {d.isDefault && (
                      <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                        PRINCIPAL
                      </span>
                    )}
                  </p>
                  <p className="text-slate-600 mt-0.5">{d.addressLine}</p>
                  <p className="text-[11px] text-slate-500">
                    {[d.neighborhoodName, d.municipalityName, d.departmentName]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                {destino.customerAddressId === d.id && (
                  <Check className="w-4 h-4 text-[#004F9F] shrink-0 mt-0.5" />
                )}
              </div>
            </button>
          ))}
          {dirElegida && (
            <p className="text-[11px] text-slate-500">
              Puedes elegir otra o usar «Otra dirección» si el pedido va a una obra.
            </p>
          )}
        </div>
      )}

      {/* ---- Sedes de la empresa ---- */}
      {destino.modo === 'sede' && (
        <div className="space-y-1.5">
          {hayVariasSedes && (
            <p className="text-[11px] font-semibold text-slate-600">
              Tu empresa tiene {sedesEmpresa.length} sedes. ¿A cuál va este pedido?
            </p>
          )}
          {sedesEmpresa.map((sd) => {
            const elegida = destino.companyBranchId === sd.id;
            return (
              <button
                key={sd.id}
                type="button"
                onClick={() => setDestino({ ...destino, companyBranchId: sd.id, customerAddressId: null })}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  elegida
                    ? 'border-[#004F9F] bg-blue-50/70 ring-1 ring-[#004F9F]'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#004F9F]" />
                      {sd.name}
                      {sd.isDefault && (
                        <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                          PRINCIPAL
                        </span>
                      )}
                    </p>
                    <p className="text-slate-600">{sd.addressLine}</p>
                    <p className="text-[11px] text-slate-500">
                      {[sd.neighborhoodName, sd.municipalityName, sd.departmentName]
                        .filter(Boolean).join(' · ')}
                    </p>
                    {(sd.contactName || sd.contactPhone) && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-2 pt-0.5">
                        {sd.contactName && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> {sd.contactName}
                          </span>
                        )}
                        {sd.contactPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {sd.contactPhone}
                          </span>
                        )}
                      </p>
                    )}
                    {sd.notes && (
                      <p className="text-[11px] text-slate-400 italic">{sd.notes}</p>
                    )}
                  </div>
                  {elegida && <Check className="w-4 h-4 text-[#004F9F] shrink-0 mt-0.5" />}
                </div>
              </button>
            );
          })}
          {sedeElegida && (
            <p className="text-[11px] text-slate-500">
              La dirección la toma el sistema de la sede registrada.
            </p>
          )}
        </div>
      )}

      {/* ---- Dirección nueva ---- */}
      {destino.modo === 'nueva' && (
        <div className="space-y-2.5">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700">
              Dirección de entrega *
            </label>
            <input
              type="text"
              value={destino.direccion}
              onChange={(e) => setDestino({ ...destino, direccion: e.target.value })}
              placeholder="Cra 43A # 18 Sur - 135, Torre 2, frente de obra"
              className={`${claseInput} ${erroresEntrega.direccion ? claseInputError : ''}`}
            />
            {erroresEntrega.direccion && (
              <p className="text-[11px] font-semibold text-rose-600">{erroresEntrega.direccion}</p>
            )}
          </div>

          {/* La ciudad SÍ se puede cambiar: sale del diccionario DIVIPOLA, con
              los 33 departamentos y los 1.122 municipios del país. */}
          <SelectorUbicacion
            valor={destino.ubicacion}
            onChange={(u) => setDestino({ ...destino, ubicacion: u })}
            errores={{
              departmentCode: erroresEntrega.departmentCode,
              municipalityCode: erroresEntrega.municipalityCode,
            }}
            requerido
            pedirBarrio
            compacto
          />
        </div>
      )}

      {/* Antes decía "24-48 horas" escrito a mano, lo mismo para Medellín que
          para Mitú. Ahora es la fecha que calcula el servidor y que queda
          guardada en el pedido. */}
      <p className="text-[11px] font-semibold text-right">
        {entrega ? (
          <span className="text-blue-700">
            Entrega estimada: {formatearFecha(entrega.fecha)}
            <span className="text-slate-500 font-medium">
              {' '}({entrega.dias} {entrega.dias === 1 ? 'día hábil' : 'días hábiles'})
            </span>
          </span>
        ) : (
          <span className="text-slate-400">
            Elige la ciudad para ver la fecha de entrega
          </span>
        )}
      </p>

      <QuienRecibeFormulario />
    </div>
  );
};

/**
 * Quién recibe el pedido.
 *
 * Obligatorio también cuando se retira en tienda: el punto de venta tiene que
 * saber a quién le entrega la mercancía y con qué documento verificarlo. El
 * servidor lo exige igual, así que esto solo adelanta el aviso.
 */
export const QuienRecibeFormulario: React.FC = () => {
  const { quienRecibe, setQuienRecibe, erroresEntrega } = useCart();
  const { user } = useAuth();

  const campo = (k: keyof typeof quienRecibe, v: string) =>
    setQuienRecibe({ ...quienRecibe, [k]: v });

  /**
   * «Yo recibo».
   *
   * Antes había que escribir el nombre, el documento y el teléfono en CADA
   * pedido, aunque quien compra sea quien recoge —que es el caso normal—. Tres
   * campos repetidos en cada compra es de las cosas que hacen abandonar un
   * carrito, y encima invitan a escribir cualquier cosa para pasar de pantalla:
   * justo lo contrario de lo que el dato busca.
   *
   * Lo que el perfil no tenga se deja en blanco y se escribe una sola vez.
   */
  const yoRecibo = () =>
    setQuienRecibe({
      ...quienRecibe,
      nombre: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
      tipoDocumento: user?.documentType || quienRecibe.tipoDocumento,
      // Si el perfil no lo tiene, se deja lo que ya estuviera escrito en vez de
      // borrarlo: pulsar «yo recibo» no puede hacerte perder lo que ya pusiste.
      numeroDocumento: user?.documentNumber || quienRecibe.numeroDocumento,
      telefono: user?.phone || quienRecibe.telefono,
    });

  // Quien entra con Google no trae documento, y el registro por correo tampoco
  // lo guardaba siempre. Sin decirlo, «yo recibo» parece que falla.
  const faltaDocumentoEnPerfil = !!user && !user.documentNumber;

  const esMiNombre =
    !!user &&
    quienRecibe.nombre.trim().toLowerCase() ===
      `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim().toLowerCase() &&
    quienRecibe.nombre.trim() !== '';

  return (
    <div className="pt-2.5 border-t border-slate-100 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
          Quién recibe el pedido *
        </p>
        {user && !esMiNombre && (
          <button
            type="button"
            onClick={yoRecibo}
            className="text-[11px] font-bold text-[#004F9F] hover:underline cursor-pointer"
          >
            Yo recibo
          </button>
        )}
      </div>

      <div className="space-y-1">
        <div className="relative">
          <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={quienRecibe.nombre}
            onChange={(e) => campo('nombre', e.target.value)}
            placeholder="Nombre completo de quien recibe"
            className={`${claseInput} pl-8 ${erroresEntrega.nombre ? claseInputError : ''}`}
          />
        </div>
        {erroresEntrega.nombre && (
          <p className="text-[11px] font-semibold text-rose-600">{erroresEntrega.nombre}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={quienRecibe.tipoDocumento}
          onChange={(e) => campo('tipoDocumento', e.target.value)}
          className={claseInput}
        >
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
          ))}
        </select>

        <div className="space-y-1">
          <div className="relative">
            <IdCard className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              inputMode="numeric"
              value={quienRecibe.numeroDocumento}
              onChange={(e) => campo('numeroDocumento', e.target.value)}
              placeholder="Número de documento"
              className={`${claseInput} pl-8 ${erroresEntrega.numeroDocumento ? claseInputError : ''}`}
            />
          </div>
          {erroresEntrega.numeroDocumento && (
            <p className="text-[11px] font-semibold text-rose-600">
              {erroresEntrega.numeroDocumento}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="relative">
          <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="tel"
            value={quienRecibe.telefono}
            onChange={(e) => campo('telefono', e.target.value)}
            placeholder="Teléfono de quien recibe"
            className={`${claseInput} pl-8 ${erroresEntrega.telefono ? claseInputError : ''}`}
          />
        </div>
        {erroresEntrega.telefono && (
          <p className="text-[11px] font-semibold text-rose-600">{erroresEntrega.telefono}</p>
        )}
      </div>

      <p className="text-[11px] text-slate-500 leading-snug">
        {esMiNombre && faltaDocumentoEnPerfil ? (
          <>
            Tu cuenta todavía no tiene documento guardado. Escríbelo una vez y
            queda en tu perfil para las próximas compras.
          </>
        ) : (
          <>
            El documento se guarda sin puntos y al teléfono se le agrega el
            indicativo (+57) automáticamente. Quien entrega verifica el documento.
          </>
        )}
      </p>
    </div>
  );
};
