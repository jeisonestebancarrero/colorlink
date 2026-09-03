import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Building2, Plus, Trash2, Pencil, Star, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import {
  direccionService, sedeService,
  type DireccionCliente, type SedeEmpresa,
} from '../../services/direcciones';
import {
  SelectorUbicacion, UBICACION_VACIA, validarUbicacion, resolverBarrio,
  type ValorUbicacion, type ErroresUbicacion,
} from './SelectorUbicacion';
import { Button } from './Button';

/**
 * Mis direcciones y las sedes de mi empresa.
 *
 * Sin esta pantalla el cliente no podía cambiar su dirección ni agregar una
 * segunda: la única que existía era la del registro. Y sin poder registrar más
 * de una sede, la pregunta del carrito «¿a cuál sede va este pedido?» nunca
 * llegaba a aparecer.
 *
 * Las sedes solo las administra el OWNER o el ADMIN de la empresa. Un MEMBER
 * cualquiera las ve para poder elegir a cuál despachar, pero no las cambia;
 * eso lo decide RLS, y aquí solo se oculta el botón para no ofrecer algo que
 * el servidor va a rechazar.
 */

const claseInput =
  'w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 ' +
  'focus:outline-none focus:ring-2 focus:ring-[#004F9F]/30 focus:border-[#004F9F]';

type Modo = 'direccion' | 'sede';

interface Borrador {
  id: string | null;
  titulo: string;
  direccion: string;
  contactoNombre: string;
  contactoTelefono: string;
  notas: string;
  principal: boolean;
  ubicacion: ValorUbicacion;
}

/**
 * Reconstruye la ubicación de un registro guardado.
 *
 * El departamento se saca de los dos primeros dígitos del código DIVIPOLA del
 * municipio ('05001' → '05'), que es cómo está construida la nomenclatura del
 * DANE. Sin esto, al abrir una dirección para editarla el departamento salía
 * vacío y la ciudad quedaba deshabilitada: se veía como si el dato guardado se
 * hubiera perdido.
 */
function ubicacionDeGuardado(
  municipalityCode: string,
  neighborhoodId: string | null
): ValorUbicacion {
  return {
    ...UBICACION_VACIA,
    departmentCode: municipalityCode.slice(0, 2),
    municipalityCode,
    neighborhoodId,
  };
}

const BORRADOR_VACIO: Borrador = {
  id: null, titulo: '', direccion: '', contactoNombre: '', contactoTelefono: '',
  notas: '', principal: false, ubicacion: UBICACION_VACIA,
};

export const MisDireccionesYSedes: React.FC = () => {
  const { access } = useAuth();
  const { showToast } = useProjects();

  const [direcciones, setDirecciones] = useState<DireccionCliente[]>([]);
  const [sedes, setSedes] = useState<SedeEmpresa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState<Modo | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO);
  const [errores, setErrores] = useState<Record<string, string> & ErroresUbicacion>({});
  const [guardando, setGuardando] = useState(false);

  const esEmpresa = access.companyIds.length > 0;
  // Administrar sedes es de OWNER/ADMIN. RLS es quien manda; esto solo evita
  // mostrar un botón que el servidor va a rechazar.
  const [puedeAdministrarSedes, setPuedeAdministrarSedes] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [d, s, puede] = await Promise.all([
        direccionService.listar(),
        sedeService.listar().catch(() => [] as SedeEmpresa[]),
        sedeService.puedoAdministrar().catch(() => false),
      ]);
      setDirecciones(d);
      setSedes(s);
      setPuedeAdministrarSedes(puede);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudieron cargar tus direcciones', 'error');
    } finally {
      setCargando(false);
    }
  }, [showToast]);

  useEffect(() => { void recargar(); }, [recargar]);

  const abrirNuevo = (m: Modo) => {
    setModo(m);
    setBorrador(BORRADOR_VACIO);
    setErrores({});
  };

  const abrirDireccion = (d: DireccionCliente) => {
    setModo('direccion');
    setErrores({});
    setBorrador({
      id: d.id, titulo: d.label, direccion: d.addressLine,
      contactoNombre: '', contactoTelefono: '', notas: d.notes ?? '',
      principal: d.isDefault,
      ubicacion: ubicacionDeGuardado(d.municipalityCode, d.neighborhoodId),
    });
  };

  const abrirSede = (sd: SedeEmpresa) => {
    setModo('sede');
    setErrores({});
    setBorrador({
      id: sd.id, titulo: sd.name, direccion: sd.addressLine,
      contactoNombre: sd.contactName ?? '', contactoTelefono: sd.contactPhone ?? '',
      notas: sd.notes ?? '', principal: sd.isDefault,
      ubicacion: ubicacionDeGuardado(sd.municipalityCode, sd.neighborhoodId),
    });
  };

  const guardar = async () => {
    const errs: Record<string, string> & ErroresUbicacion = {};
    if (!borrador.titulo.trim()) {
      errs.titulo = modo === 'sede' ? 'Ponle un nombre a la sede' : 'Ponle un nombre a la dirección';
    }
    if (borrador.direccion.trim().length < 5) errs.direccion = 'Escribe la dirección completa';
    Object.assign(errs, validarUbicacion(borrador.ubicacion, { pedirBarrio: false }));

    setErrores(errs);
    if (Object.keys(errs).length > 0) return;

    setGuardando(true);
    try {
      const neighborhoodId = await resolverBarrio(borrador.ubicacion);
      const comunes = {
        addressLine: borrador.direccion.trim(),
        municipalityCode: borrador.ubicacion.municipalityCode,
        neighborhoodId,
        notes: borrador.notas.trim() || null,
        isDefault: borrador.principal,
      };

      if (modo === 'sede') {
        const companyId = access.companyIds[0];
        if (!companyId) throw new Error('Tu cuenta no está asociada a una empresa.');
        const datos = {
          ...comunes,
          name: borrador.titulo.trim(),
          contactName: borrador.contactoNombre.trim() || null,
          contactPhone: borrador.contactoTelefono.trim() || null,
        };
        setSedes(borrador.id
          ? await sedeService.actualizar(borrador.id, datos)
          : await sedeService.crear(companyId, datos));
        showToast(borrador.id ? 'Sede actualizada' : 'Sede registrada', 'success');
      } else {
        const datos = { ...comunes, label: borrador.titulo.trim() };
        setDirecciones(borrador.id
          ? await direccionService.actualizar(borrador.id, datos)
          : await direccionService.crear(datos));
        showToast(borrador.id ? 'Dirección actualizada' : 'Dirección guardada', 'success');
      }
      setModo(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No fue posible guardar', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarDireccion = async (d: DireccionCliente) => {
    try {
      setDirecciones(await direccionService.eliminar(d.id));
      showToast(`Se eliminó «${d.label}»`, 'info');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No fue posible eliminar', 'error');
    }
  };

  const desactivarSede = async (sd: SedeEmpresa) => {
    try {
      // Se desactiva, no se borra: los pedidos ya despachados apuntan a ella.
      setSedes(await sedeService.desactivar(sd.id));
      showToast(`Se desactivó «${sd.name}»`, 'info');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No fue posible desactivar', 'error');
    }
  };

  if (cargando) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando tus direcciones…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---------- Mis direcciones ---------- */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#004F9F]" /> Mis direcciones
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              La marcada como principal es la que el carrito propone al pedir un envío.
            </p>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => abrirNuevo('direccion')}
            className="text-xs font-bold shrink-0 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar
          </Button>
        </header>

        {direcciones.length === 0 ? (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
            Todavía no tienes direcciones guardadas. Agrega una y el carrito la
            propondrá en tus próximos pedidos.
          </p>
        ) : (
          <ul className="space-y-2">
            {direcciones.map((d) => (
              <li key={d.id} className="p-3 rounded-lg border border-slate-200 flex items-start justify-between gap-3">
                <div className="text-xs space-y-0.5">
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    {d.label}
                    {d.isDefault && (
                      <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5" /> PRINCIPAL
                      </span>
                    )}
                  </p>
                  <p className="text-slate-600">{d.addressLine}</p>
                  <p className="text-[11px] text-slate-500">
                    {[d.neighborhoodName, d.municipalityName, d.departmentName]
                      .filter(Boolean).join(' · ')}
                  </p>
                  {d.notes && <p className="text-[11px] text-slate-400 italic">{d.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => abrirDireccion(d)}
                    className="p-1.5 rounded text-slate-400 hover:text-[#004F9F] hover:bg-blue-50 transition-colors cursor-pointer"
                    aria-label={`Editar ${d.label}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => void eliminarDireccion(d)}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    aria-label={`Eliminar ${d.label}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Sedes de la empresa ---------- */}
      {esEmpresa && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#004F9F]" /> Sedes de mi empresa
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Con más de una sede, el carrito te preguntará a cuál va cada pedido.
              </p>
            </div>
            {puedeAdministrarSedes && (
              <Button
                variant="outline" size="sm"
                onClick={() => abrirNuevo('sede')}
                className="text-xs font-bold shrink-0 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar sede
              </Button>
            )}
          </header>

          {sedes.length === 0 ? (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              {puedeAdministrarSedes
                ? 'Tu empresa no tiene sedes registradas. Agrega la primera para poder dirigir pedidos a ella.'
                : 'Tu empresa no tiene sedes registradas. Pídele al administrador de la cuenta que las agregue.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {sedes.map((sd) => (
                <li key={sd.id} className="p-3 rounded-lg border border-slate-200 flex items-start justify-between gap-3">
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold text-slate-800 flex items-center gap-1.5">
                      {sd.name}
                      {sd.isDefault && (
                        <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" /> PRINCIPAL
                        </span>
                      )}
                    </p>
                    <p className="text-slate-600">{sd.addressLine}</p>
                    <p className="text-[11px] text-slate-500">
                      {[sd.neighborhoodName, sd.municipalityName, sd.departmentName]
                        .filter(Boolean).join(' · ')}
                    </p>
                    {(sd.contactName || sd.contactPhone) && (
                      <p className="text-[11px] text-slate-500">
                        Recibe: {sd.contactName ?? '—'}
                        {sd.contactPhone ? ` · ${sd.contactPhone}` : ''}
                      </p>
                    )}
                    {sd.notes && <p className="text-[11px] text-slate-400 italic">{sd.notes}</p>}
                  </div>
                  {puedeAdministrarSedes && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => abrirSede(sd)}
                        className="p-1.5 rounded text-slate-400 hover:text-[#004F9F] hover:bg-blue-50 transition-colors cursor-pointer"
                        aria-label={`Editar ${sd.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void desactivarSede(sd)}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        aria-label={`Desactivar ${sd.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------- Formulario ----------
           En PORTAL: esta pantalla vive dentro del perfil, que se dibuja en
           `<main class="relative z-10">`. Ese contenedor crea un contexto de
           apilamiento y el diálogo, por alto que tenga el `z`, quedaba debajo
           de la cabecera del sitio. Es el mismo fallo que se vio en el carrito
           y en la ficha de producto. */}
      {modo && createPortal(
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-8">
            <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">
                {borrador.id
                  ? (modo === 'sede' ? 'Editar sede' : 'Editar dirección')
                  : (modo === 'sede' ? 'Nueva sede' : 'Nueva dirección')}
              </h4>
              <button
                onClick={() => setModo(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="p-5 space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1">
                  {modo === 'sede' ? 'Nombre de la sede *' : 'Nombre de la dirección *'}
                </span>
                <input
                  type="text"
                  className={claseInput}
                  value={borrador.titulo}
                  onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })}
                  placeholder={modo === 'sede' ? 'Bodega Itagüí' : 'Casa, Oficina, Obra…'}
                />
                {errores.titulo && (
                  <span className="block text-[11px] text-rose-600 mt-1">{errores.titulo}</span>
                )}
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1">Dirección *</span>
                <input
                  type="text"
                  className={claseInput}
                  value={borrador.direccion}
                  onChange={(e) => setBorrador({ ...borrador, direccion: e.target.value })}
                  placeholder="Cra 43A # 18 Sur - 135, Torre 2, Apto 501"
                />
                {errores.direccion && (
                  <span className="block text-[11px] text-rose-600 mt-1">{errores.direccion}</span>
                )}
              </label>

              <SelectorUbicacion
                valor={borrador.ubicacion}
                onChange={(u) => setBorrador({ ...borrador, ubicacion: u })}
                errores={errores}
                requerido
                compacto
              />

              {modo === 'sede' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-600 mb-1">
                      Quién recibe en la sede
                    </span>
                    <input
                      type="text"
                      className={claseInput}
                      value={borrador.contactoNombre}
                      onChange={(e) => setBorrador({ ...borrador, contactoNombre: e.target.value })}
                      placeholder="Nombre del contacto"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-600 mb-1">
                      Teléfono de la sede
                    </span>
                    <input
                      type="tel"
                      className={claseInput}
                      value={borrador.contactoTelefono}
                      onChange={(e) => setBorrador({ ...borrador, contactoTelefono: e.target.value })}
                      placeholder="300 123 4567"
                    />
                  </label>
                </div>
              )}

              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1">
                  Indicaciones para el transportador
                </span>
                <input
                  type="text"
                  className={claseInput}
                  value={borrador.notas}
                  onChange={(e) => setBorrador({ ...borrador, notas: e.target.value })}
                  placeholder="Portería 2, entrada por la calle del parque…"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={borrador.principal}
                  onChange={(e) => setBorrador({ ...borrador, principal: e.target.checked })}
                  className="rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F]"
                />
                Marcar como principal
                <span className="text-slate-400">
                  (solo puede haber una; la anterior se desmarca)
                </span>
              </label>
            </div>

            <footer className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setModo(null)} className="text-xs">
                Cancelar
              </Button>
              <Button
                variant="primary" size="sm"
                onClick={() => void guardar()}
                isLoading={guardando}
                className="bg-[#004F9F] text-white text-xs font-bold"
              >
                Guardar
              </Button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
