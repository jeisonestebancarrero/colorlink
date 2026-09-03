import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ubicacionService, type Barrio, type Departamento, type Municipio, type Pais } from '../../services/ubicaciones';

/**
 * País → Departamento → Ciudad → Barrio, todo de listado cerrado.
 *
 * Se usa igual en el registro, en el perfil, en el carrito y en las sedes de la
 * empresa: si cada pantalla resolviera la ciudad a su manera, volveríamos a
 * tener 'Bogotá' en una y 'Bogotá D.C.' en otra, que es el problema que esto
 * viene a cerrar.
 *
 * El barrio es el único campo que admite escribir, y solo cuando su municipio
 * no tiene lista. No existe listado oficial de barrios de todo Colombia
 * (DIVIPOLA llega hasta municipio), así que lo que escribe el primer cliente
 * de ese municipio queda incorporado y los siguientes ya lo eligen. El
 * servidor normaliza el nombre, de modo que no se duplica.
 */

export interface ValorUbicacion {
  countryCode: string;
  departmentCode: string;
  municipalityCode: string;
  neighborhoodId: string | null;
  /** Barrio escrito a mano que todavía no se ha registrado en el servidor. */
  neighborhoodName: string;
}

export type ErroresUbicacion =
  Partial<Record<'departmentCode' | 'municipalityCode' | 'neighborhoodName', string>>;

export const UBICACION_VACIA: ValorUbicacion = {
  countryCode: 'CO',
  departmentCode: '',
  municipalityCode: '',
  neighborhoodId: null,
  neighborhoodName: '',
};

interface Props {
  valor: ValorUbicacion;
  onChange: (valor: ValorUbicacion) => void;
  /** Marca los campos con asterisco y expone el error de cada uno. */
  requerido?: boolean;
  errores?: ErroresUbicacion;
  /** El barrio se puede omitir en formularios donde no aporta. */
  pedirBarrio?: boolean;
  compacto?: boolean;
}

const claseCampo =
  'w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 ' +
  'focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30 focus:border-[#004F9F] transition-shadow ' +
  'disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed';

export const SelectorUbicacion: React.FC<Props> = ({
  valor, onChange, requerido = false, errores, pedirBarrio = true, compacto = false,
}) => {
  const [paises, setPaises] = useState<Pais[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [cargandoMunicipios, setCargandoMunicipios] = useState(false);
  const [cargandoBarrios, setCargandoBarrios] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  // Escribir el barrio solo se ofrece si el municipio no tiene lista, o si la
  // persona dice explícitamente que el suyo no aparece.
  const [barrioAMano, setBarrioAMano] = useState(false);

  useEffect(() => {
    let activo = true;
    Promise.all([ubicacionService.getPaises(), ubicacionService.getDepartamentos()])
      .then(([p, d]) => {
        if (!activo) return;
        setPaises(p);
        setDepartamentos(d);
      })
      .catch((e) => activo && setFallo(e instanceof Error ? e.message : 'Error de carga'));
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    let activo = true;
    if (!valor.departmentCode) {
      setMunicipios([]);
      return;
    }
    setCargandoMunicipios(true);
    ubicacionService.getMunicipios(valor.departmentCode)
      .then((m) => activo && setMunicipios(m))
      .catch((e) => activo && setFallo(e instanceof Error ? e.message : 'Error de carga'))
      .finally(() => activo && setCargandoMunicipios(false));
    return () => { activo = false; };
  }, [valor.departmentCode]);

  useEffect(() => {
    let activo = true;
    if (!valor.municipalityCode || !pedirBarrio) {
      setBarrios([]);
      return;
    }
    setCargandoBarrios(true);
    ubicacionService.getBarrios(valor.municipalityCode)
      .then((b) => {
        if (!activo) return;
        setBarrios(b);
        // Un municipio sin lista no puede dejar al cliente sin poder seguir.
        setBarrioAMano(b.length === 0);
      })
      .catch((e) => activo && setFallo(e instanceof Error ? e.message : 'Error de carga'))
      .finally(() => activo && setCargandoBarrios(false));
    return () => { activo = false; };
  }, [valor.municipalityCode, pedirBarrio]);

  /** Los centros poblados van aparte: un corregimiento no es un barrio. */
  const agrupados = useMemo(() => ({
    barrios: barrios.filter((b) => b.kind === 'BARRIO'),
    centros: barrios.filter((b) => b.kind === 'CENTRO_POBLADO'),
  }), [barrios]);

  const marca = requerido ? ' *' : '';
  const rejilla = compacto ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-3';

  return (
    <div className="space-y-3">
      {fallo && (
        <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
          {fallo}
        </p>
      )}

      <div className={rejilla}>
        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1">País{marca}</span>
          <select
            className={claseCampo}
            value={valor.countryCode}
            onChange={(e) => onChange({ ...valor, countryCode: e.target.value })}
          >
            {paises.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
          {paises.length === 1 && (
            <span className="block text-[11px] text-slate-500 mt-1">
              Por ahora solo despachamos dentro de Colombia.
            </span>
          )}
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1">
            Departamento{marca}
          </span>
          <select
            className={claseCampo}
            value={valor.departmentCode}
            onChange={(e) => onChange({
              ...valor,
              departmentCode: e.target.value,
              // Cambiar de departamento invalida la ciudad y el barrio: dejarlos
              // puestos guardaría un municipio que no pertenece al departamento.
              municipalityCode: '',
              neighborhoodId: null,
              neighborhoodName: '',
            })}
          >
            <option value="">Selecciona el departamento</option>
            {departamentos.map((d) => (
              <option key={d.code} value={d.code}>{d.name}</option>
            ))}
          </select>
          {errores?.departmentCode && (
            <span className="block text-[11px] text-rose-600 mt-1">{errores?.departmentCode}</span>
          )}
        </label>
      </div>

      <div className={rejilla}>
        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1">
            Ciudad / Municipio{marca}
          </span>
          <div className="relative">
            <select
              className={claseCampo}
              value={valor.municipalityCode}
              disabled={!valor.departmentCode || cargandoMunicipios}
              onChange={(e) => onChange({
                ...valor,
                municipalityCode: e.target.value,
                neighborhoodId: null,
                neighborhoodName: '',
              })}
            >
              <option value="">
                {!valor.departmentCode
                  ? 'Elige primero el departamento'
                  : cargandoMunicipios ? 'Cargando…' : 'Selecciona la ciudad'}
              </option>
              {municipios.map((m) => (
                <option key={m.code} value={m.code}>{m.name}</option>
              ))}
            </select>
            {cargandoMunicipios && (
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-8 top-3 pointer-events-none" />
            )}
          </div>
          {valor.departmentCode && municipios.length > 0 && (
            <span className="block text-[11px] text-slate-500 mt-1">
              {municipios.length} municipios en este departamento.
            </span>
          )}
          {errores?.municipalityCode && (
            <span className="block text-[11px] text-rose-600 mt-1">{errores?.municipalityCode}</span>
          )}
        </label>

        {pedirBarrio && (
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">
              Barrio / Corregimiento{marca}
            </span>

            {barrioAMano ? (
              <>
                <input
                  type="text"
                  className={claseCampo}
                  placeholder="Escribe el nombre del barrio"
                  value={valor.neighborhoodName}
                  disabled={!valor.municipalityCode}
                  onChange={(e) => onChange({
                    ...valor, neighborhoodId: null, neighborhoodName: e.target.value,
                  })}
                />
                {barrios.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBarrioAMano(false);
                      onChange({ ...valor, neighborhoodName: '' });
                    }}
                    className="text-[11px] font-semibold text-[#004F9F] hover:underline mt-1"
                  >
                    Volver al listado
                  </button>
                ) : (
                  <span className="block text-[11px] text-slate-500 mt-1">
                    Esta ciudad todavía no tiene barrios en el listado. El que
                    escribas queda disponible para los demás.
                  </span>
                )}
              </>
            ) : (
              <>
                <div className="relative">
                  <select
                    className={claseCampo}
                    value={valor.neighborhoodId ?? ''}
                    disabled={!valor.municipalityCode || cargandoBarrios}
                    onChange={(e) => onChange({
                      ...valor, neighborhoodId: e.target.value || null, neighborhoodName: '',
                    })}
                  >
                    <option value="">
                      {!valor.municipalityCode
                        ? 'Elige primero la ciudad'
                        : cargandoBarrios ? 'Cargando…' : 'Selecciona el barrio'}
                    </option>
                    {agrupados.barrios.length > 0 && (
                      <optgroup label="Barrios">
                        {agrupados.barrios.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {agrupados.centros.length > 0 && (
                      <optgroup label="Corregimientos y centros poblados">
                        {agrupados.centros.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {cargandoBarrios && (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-8 top-3 pointer-events-none" />
                  )}
                </div>
                {valor.municipalityCode && !cargandoBarrios && (
                  <button
                    type="button"
                    onClick={() => {
                      setBarrioAMano(true);
                      onChange({ ...valor, neighborhoodId: null });
                    }}
                    className="text-[11px] font-semibold text-[#004F9F] hover:underline mt-1"
                  >
                    Mi barrio no aparece en la lista
                  </button>
                )}
              </>
            )}

            {errores?.neighborhoodName && (
              <span className="block text-[11px] text-rose-600 mt-1">{errores?.neighborhoodName}</span>
            )}
          </label>
        )}
      </div>
    </div>
  );
};

/**
 * Deja la ubicación lista para guardar: si el barrio se escribió a mano, lo
 * registra en el servidor y devuelve su id.
 *
 * Vive aquí y no en cada pantalla para que ninguna se olvide de hacerlo y
 * termine guardando una dirección con el barrio en blanco.
 */
export async function resolverBarrio(valor: ValorUbicacion): Promise<string | null> {
  if (valor.neighborhoodId) return valor.neighborhoodId;
  const nombre = valor.neighborhoodName.trim();
  if (!nombre || !valor.municipalityCode) return null;
  return ubicacionService.registrarBarrio(valor.municipalityCode, nombre);
}

/** Mensajes de error de la ubicación, para reusar la misma validación. */
export function validarUbicacion(
  valor: ValorUbicacion,
  opciones: { pedirBarrio?: boolean } = {}
): ErroresUbicacion {
  const errores: ErroresUbicacion = {};
  if (!valor.departmentCode) errores.departmentCode = 'Selecciona el departamento';
  if (!valor.municipalityCode) errores.municipalityCode = 'Selecciona la ciudad';
  if (opciones.pedirBarrio && !valor.neighborhoodId && !valor.neighborhoodName.trim()) {
    errores.neighborhoodName = 'Selecciona o escribe el barrio';
  }
  return errores;
}
