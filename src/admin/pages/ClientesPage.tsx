import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, Search, MapPin, Users, Loader2, Pencil, Plus, Star, ChevronLeft,
  LayoutGrid, List, User, Mail, Phone, ShoppingBag, IdCard,
} from 'lucide-react';
import {
  clientesAdminService, type ClienteEmpresa, type ClientePersona,
  type DireccionDeCliente,
} from '../../services/clientesAdmin';
import {
  sedeService, type SedeEmpresa, type DatosSede,
} from '../../services/direcciones';
import {
  SelectorUbicacion, UBICACION_VACIA, validarUbicacion, resolverBarrio,
  type ValorUbicacion, type ErroresUbicacion,
} from '../../components/common/SelectorUbicacion';
import { ExportarBoton } from '../ExportarBoton';
import { Button } from '../../components/common/Button';
import { CreditoPanel } from '../CreditoPanel';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { IconoModulo } from '../IconosDeModulo';
import { AvatarCliente } from '../AvatarCliente';
import { FormularioCliente } from '../FormularioCliente';
import { SolicitudesDeVinculacion } from '../../components/common/SolicitudesDeVinculacion';
import { accesoService } from '../../services/admin';

/**
 * Clientes: empresas y personas naturales.
 *
 * Antes solo listaba `companies`, y faltaba la otra mitad del negocio: el
 * maestro de obra, el pintor independiente, el arquitecto que compra a su
 * nombre. Ahora se ven las dos clases y se pueden separar con un filtro.
 *
 * La vista por DEFECTO es de tarjetas. Una tabla de sesenta filas con el
 * mismo texto en todas —que es como se ve hoy— no deja distinguir un cliente
 * de otro; con foto o iniciales de color cada uno se reconoce de lejos. La
 * tabla sigue estando a un clic, porque para comparar cifras en columna sirve
 * mejor.
 *
 * Para qué sirve: despacho necesita ver y corregir a dónde va la mercancía de
 * un cliente sin pedirle a la empresa que entre a su perfil. Un teléfono mal
 * escrito o una sede sin indicaciones de portería se resolvían por chat y
 * quedaban solo ahí.
 *
 * Las sedes se pueden EDITAR con `users.manage`. Las direcciones personales de
 * los usuarios son de SOLO LECTURA a propósito: el personal tiene que poder
 * verlas para despachar, pero la dirección de casa de alguien la corrige esa
 * persona. Eso lo impone RLS, no esta pantalla.
 */

const CLAVE_VISTA = 'colorlink.admin.clientes.vista.v1';

/**
 * Una fila de la lista, sea empresa o persona.
 *
 * Los campos comunes se aplanan para poder pintar una sola tarjeta, y se
 * conserva el registro original en `empresa` / `persona` porque el detalle de
 * una empresa necesita sus sedes y el de una persona sus pedidos.
 */
type FilaCliente = {
  clave: string;
  tipo: 'EMPRESA' | 'PERSONA';
  nombre: string;
  documento: string | null;
  ciudad: string | null;
  correo: string | null;
  telefono: string | null;
  fotoUrl: string | null;
  estado: string;
  empresa?: ClienteEmpresa;
  persona?: ClientePersona;
};

interface BorradorSede extends DatosSede {
  id: string | null;
  ubicacion: ValorUbicacion;
}

const SEDE_VACIA: BorradorSede = {
  id: null, name: '', addressLine: '', municipalityCode: '',
  neighborhoodId: null, contactName: '', contactPhone: '', notes: '',
  isDefault: false, ubicacion: UBICACION_VACIA,
};

/** El código DIVIPOLA del municipio empieza por el del departamento. */
const ubicacionDe = (municipalityCode: string, neighborhoodId: string | null): ValorUbicacion => ({
  ...UBICACION_VACIA,
  departmentCode: municipalityCode.slice(0, 2),
  municipalityCode,
  neighborhoodId,
});

/**
 * Una tarjeta de cliente.
 *
 * Muestra de un vistazo lo que se pregunta por teléfono: quién es, con qué
 * documento, de qué ciudad y cómo contactarlo. Nada de cifras que haya que
 * comparar entre clientes —para eso está la vista de lista—.
 *
 * Solo las empresas abren detalle, porque el detalle es de sedes y una
 * persona natural no tiene. Una tarjeta que no lleva a ningún sitio no debe
 * parecer pulsable, así que la de persona no cambia con el puntero.
 */
const TarjetaCliente: React.FC<{
  fila: FilaCliente;
  /** Abre la ficha para consultarla y corregirla. Toda tarjeta la tiene. */
  onAbrir: () => void;
  /** Solo las empresas: lleva al detalle de sedes. */
  onVerSedes?: () => void;
}> = ({ fila, onAbrir, onVerSedes }) => {
  const cuerpo = (
    <>
      <div className="flex items-start gap-3">
        <AvatarCliente nombre={fila.nombre} fotoUrl={fila.fotoUrl} tipo={fila.tipo} tamano={44} />
        <div className="min-w-0 flex-1">
          {/* `truncate` con `min-w-0`: una razón social larga no puede
              estirar la tarjeta y descuadrar la cuadrícula. */}
          <p className="font-bold text-slate-900 text-sm leading-snug truncate" title={fila.nombre}>
            {fila.nombre}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            {fila.tipo === 'EMPRESA' ? 'Empresa' : (fila.persona?.segmento ?? 'Persona natural')}
          </p>
        </div>
        {fila.estado !== 'ACTIVO' && (
          <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5
                           rounded-md bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
            {fila.estado}
          </span>
        )}
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        {fila.documento && (
          <div className="flex items-center gap-1.5 text-slate-600">
            <IdCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <dd className="tabular-nums truncate">{fila.documento}</dd>
          </div>
        )}
        {fila.ciudad && (
          <div className="flex items-center gap-1.5 text-slate-600">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <dd className="truncate">{fila.ciudad}</dd>
          </div>
        )}
        {fila.correo && (
          <div className="flex items-center gap-1.5 text-slate-600">
            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <dd className="truncate" title={fila.correo}>{fila.correo}</dd>
          </div>
        )}
        {fila.telefono && (
          <div className="flex items-center gap-1.5 text-slate-600">
            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <dd className="tabular-nums truncate">{fila.telefono}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-3 text-[11px] font-bold">
        {fila.empresa ? (
          <>
            <span className={fila.empresa.sedes === 0 ? 'text-amber-700' : 'text-slate-600'}>
              {fila.empresa.sedes} {fila.empresa.sedes === 1 ? 'sede' : 'sedes'}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-600">
              <Users className="w-3 h-3 text-slate-400" /> {fila.empresa.miembros}
            </span>
            {onVerSedes && (
              <span
                role="button"
                tabIndex={0}
                // La tarjeta entera abre la ficha; esto lleva a las sedes, así
                // que tiene que dejar de propagar o haría las dos cosas.
                onClick={(ev) => { ev.stopPropagation(); onVerSedes(); }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault(); ev.stopPropagation(); onVerSedes();
                  }
                }}
                className="ml-auto text-[#004F9F] hover:underline cursor-pointer"
              >
                Ver sedes
              </span>
            )}
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-slate-600">
              <ShoppingBag className="w-3 h-3 text-slate-400" />
              {fila.persona?.pedidos ?? 0}{' '}
              {(fila.persona?.pedidos ?? 0) === 1 ? 'pedido' : 'pedidos'}
            </span>
            <span className="ml-auto text-[#004F9F]">Ver ficha</span>
          </>
        )}
      </div>
    </>
  );

  // `div` con rol y no `button`: dentro va «Ver sedes», que también es
  // pulsable, y un botón anidado dentro de otro es HTML inválido —el
  // navegador lo reacomoda y la tarjeta deja de responder—.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onAbrir(); }
      }}
      className="bg-white border border-slate-200 rounded-xl p-3.5 text-left shadow-2xs
                 hover:border-[#004F9F]/40 hover:shadow-md transition-all cursor-pointer
                 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[#004F9F]/25"
    >
      {cuerpo}
    </div>
  );
};

interface ClientesPageProps {
  /**
   * Empresa que pide la URL, por su NIT (`/clientes/901123456-7`).
   *
   * Se usa el NIT y no el uuid porque es lo que el personal reconoce y
   * pregunta por teléfono. Las empresas sin NIT no tienen enlace directo:
   * inventarles un código para la URL sería inventar un identificador.
   */
  idAbierto?: string | null;
  onAbrir?: (nit: string) => void;
  onCerrar?: () => void;
}

export const ClientesPage: React.FC<ClientesPageProps> = ({
  idAbierto, onAbrir, onCerrar,
}) => {
  const [empresas, setEmpresas] = useState<ClienteEmpresa[]>([]);
  const [personas, setPersonas] = useState<ClientePersona[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'TODOS' | 'EMPRESAS' | 'PERSONAS'>('TODOS');

  /* Solo el administrador de la plataforma resuelve vinculaciones ajenas: es
     lo que exige `resolve_join_request`. Pintar el bloque a todo el personal
     sería ofrecer un botón que el servidor rechaza. */
  const [esAdmin, setEsAdmin] = useState(false);
  useEffect(() => {
    let vigente = true;
    accesoService.miAcceso()
      .then((a) => { if (vigente) setEsAdmin(a.isAdmin); })
      .catch(() => undefined);
    return () => { vigente = false; };
  }, []);
  /* Tarjetas por defecto: ver arriba. Se recuerda la elección, porque quien
     prefiere la tabla la prefiere siempre. */
  const [vista, setVista] = useState<'tarjetas' | 'tabla'>(
    () => (localStorage.getItem(CLAVE_VISTA) === 'tabla' ? 'tabla' : 'tarjetas'),
  );
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [puedeEditar, setPuedeEditar] = useState(false);

  const [abierta, setAbierta] = useState<ClienteEmpresa | null>(null);
  const [sedes, setSedes] = useState<SedeEmpresa[]>([]);
  const [direcciones, setDirecciones] = useState<DireccionDeCliente[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  /** Ficha abierta para editar, sea persona o empresa. */
  const [editando, setEditando] = useState<
    { tipo: 'PERSONA' | 'EMPRESA'; id: string; nombre: string; fotoUrl: string | null } | null
  >(null);

  const [borrador, setBorrador] = useState<BorradorSede | null>(null);
  const [erroresSede, setErroresSede] = useState<Record<string, string> & ErroresUbicacion>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = async (q: string) => {
    setCargando(true);
    setError('');
    try {
      const [lista, gente, puede] = await Promise.all([
        clientesAdminService.listarEmpresas(q),
        // Si falla, las empresas se siguen viendo: quien no es personal
        // interno no puede listar personas, y eso no debe apagar la pantalla.
        clientesAdminService.listarPersonas(q).catch(() => []),
        clientesAdminService.puedoEditarSedes(),
      ]);
      setEmpresas(lista);
      setPersonas(gente);
      setPuedeEditar(puede);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar los clientes.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(''); }, []);

  // Abre la empresa que pide la URL, una sola vez.
  const [abrio, setAbrio] = useState<string | null>(null);
  useEffect(() => {
    if (!idAbierto || abrio === idAbierto || empresas.length === 0) return;
    setAbrio(idAbierto);
    const e = empresas.find((x) => x.nit === idAbierto);
    if (e) void abrir(e);
    else setError(`No se encontró una empresa con NIT ${idAbierto}.`);
    // `abrir` se recrea en cada render y añadirlo reabriría la empresa en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idAbierto, abrio, empresas]);

  const abrir = async (empresa: ClienteEmpresa) => {
    setAbierta(empresa);
    if (empresa.nit) onAbrir?.(empresa.nit);
    setCargandoDetalle(true);
    try {
      // Filtrado por empresa a propósito: RLS le deja ver al personal con
      // `users.manage` las sedes de TODOS los clientes, así que `listar()`
      // mezclaría las de todos en la pantalla de uno.
      const [susSedes, dirs] = await Promise.all([
        sedeService.listarDeEmpresa(empresa.id),
        clientesAdminService.direccionesDeEmpresa(empresa.id).catch(() => []),
      ]);
      setSedes(susSedes);
      setDirecciones(dirs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar el detalle.');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const guardarSede = async () => {
    if (!borrador || !abierta) return;
    const errs: Record<string, string> & ErroresUbicacion = {};
    if (!borrador.name.trim()) errs.name = 'Ponle un nombre a la sede';
    if (borrador.addressLine.trim().length < 5) errs.addressLine = 'Escribe la dirección completa';
    Object.assign(errs, validarUbicacion(borrador.ubicacion, { pedirBarrio: false }));
    setErroresSede(errs);
    if (Object.keys(errs).length > 0) return;

    setGuardando(true);
    try {
      const neighborhoodId = await resolverBarrio(borrador.ubicacion);
      const datos: DatosSede = {
        name: borrador.name.trim(),
        addressLine: borrador.addressLine.trim(),
        municipalityCode: borrador.ubicacion.municipalityCode,
        neighborhoodId,
        contactName: (borrador.contactName ?? '').trim() || null,
        contactPhone: (borrador.contactPhone ?? '').trim() || null,
        notes: (borrador.notes ?? '').trim() || null,
        isDefault: borrador.isDefault,
      };
      if (borrador.id) {
        await sedeService.actualizar(borrador.id, datos);
      } else {
        await sedeService.crear(abierta.id, datos);
      }
      setSedes(await sedeService.listarDeEmpresa(abierta.id));
      setBorrador(null);
      await cargar(busqueda);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar la sede.');
    } finally {
      setGuardando(false);
    }
  };

  const totales = useMemo(() => ({
    empresas: empresas.length,
    personas: personas.length,
    sinSede: empresas.filter((e) => e.sedes === 0).length,
  }), [empresas, personas]);

  /**
   * Las dos clases en una sola lista para pintarlas juntas.
   *
   * Se ordena por nombre y no por tipo: con el filtro en «Todos» lo que se
   * busca es un cliente concreto, y agrupar por tipo obligaría a saber de
   * antemano en cuál de los dos bloques está.
   */
  const visibles = useMemo(() => {
    const filas: FilaCliente[] = [];
    if (filtro !== 'PERSONAS') {
      for (const e of empresas) {
        filas.push({
          clave: `e-${e.id}`, tipo: 'EMPRESA', nombre: e.name,
          documento: e.nit, ciudad: e.city, correo: e.email, telefono: e.phone,
          fotoUrl: e.logoUrl, estado: e.status, empresa: e,
        });
      }
    }
    if (filtro !== 'EMPRESAS') {
      for (const p of personas) {
        filas.push({
          clave: `p-${p.id}`, tipo: 'PERSONA', nombre: p.nombre || '(sin nombre)',
          documento: p.documento, ciudad: p.ciudad, correo: p.correo,
          telefono: p.telefono, fotoUrl: p.fotoUrl, estado: p.estado, persona: p,
        });
      }
    }
    return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [empresas, personas, filtro]);

  // ----------------------------------------------------------
  // Detalle de una empresa
  // ----------------------------------------------------------
  if (abierta) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setAbierta(null); setSedes([]); setDirecciones([]); onCerrar?.(); }}
          className="text-xs font-bold text-[#004F9F] hover:underline flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Volver a clientes
        </button>

        <header className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#004F9F]" /> {abierta.name}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {[
              abierta.nit ? `NIT ${abierta.nit}` : 'Sin NIT',
              abierta.city, abierta.phone, abierta.email,
            ].filter(Boolean).join(' · ')}
          </p>
        </header>

        {error && (
          <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
            {error}
          </p>
        )}

        {/* Condición de pago: va arriba porque es lo que decide si esta
            empresa puede pedir sin pagar primero. */}
        <CreditoPanel companyId={abierta.id} nombre={abierta.name} />

        {cargandoDetalle ? (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </p>
        ) : (
          <>
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Sedes ({sedes.length})
                </h3>
                {puedeEditar && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setBorrador(SEDE_VACIA); setErroresSede({}); }}
                    className="text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar sede
                  </Button>
                )}
              </div>

              {sedes.length === 0 ? (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  Este cliente no tiene sedes registradas. Sin sede, sus pedidos
                  de envío tienen que llevar una dirección escrita cada vez.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {sedes.map((sd) => (
                    <li key={sd.id} className="py-2.5 flex items-start justify-between gap-3">
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
                        <p className="text-[11px] text-slate-500">
                          Recibe: {sd.contactName ?? '—'}
                          {sd.contactPhone ? ` · ${sd.contactPhone}` : ''}
                        </p>
                        {sd.notes && (
                          <p className="text-[11px] text-slate-400 italic">{sd.notes}</p>
                        )}
                      </div>
                      {puedeEditar && (
                        <button
                          onClick={() => {
                            setErroresSede({});
                            setBorrador({
                              id: sd.id, name: sd.name, addressLine: sd.addressLine,
                              municipalityCode: sd.municipalityCode,
                              neighborhoodId: sd.neighborhoodId,
                              contactName: sd.contactName ?? '',
                              contactPhone: sd.contactPhone ?? '',
                              notes: sd.notes ?? '', isDefault: sd.isDefault,
                              ubicacion: ubicacionDe(sd.municipalityCode, sd.neighborhoodId),
                            });
                          }}
                          className="p-1.5 rounded text-slate-400 hover:text-[#004F9F] hover:bg-blue-50 shrink-0 cursor-pointer"
                          aria-label={`Editar ${sd.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Direcciones de sus usuarios ({direcciones.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Solo lectura. La dirección personal de un cliente la corrige él
                desde su perfil.
              </p>
              {direcciones.length === 0 ? (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  Sus usuarios no tienen direcciones guardadas.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {direcciones.map((d) => (
                    <li key={d.id} className="py-2.5 text-xs space-y-0.5">
                      <p className="font-bold text-slate-800 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {d.label}
                        <span className="font-normal text-slate-400">— {d.usuario}</span>
                      </p>
                      <p className="text-slate-600 pl-5">{d.addressLine}</p>
                      <p className="text-[11px] text-slate-500 pl-5">
                        {[d.neighborhoodName, d.municipalityName, d.departmentName]
                          .filter(Boolean).join(' · ')}
                      </p>
                      {d.notes && (
                        <p className="text-[11px] text-slate-400 italic pl-5">{d.notes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {borrador && (
          <Modal
            isOpen
            title={borrador.id ? 'Editar sede' : 'Nueva sede'}
            onClose={() => setBorrador(null)}
          >
            <div className="space-y-3">
              <Input
                label="Nombre de la sede *"
                value={borrador.name}
                onChange={(e) => setBorrador({ ...borrador, name: e.target.value })}
                placeholder="Bodega Itagüí"
                error={erroresSede.name}
              />
              <Input
                label="Dirección *"
                value={borrador.addressLine}
                onChange={(e) => setBorrador({ ...borrador, addressLine: e.target.value })}
                placeholder="Cl 85 # 48 - 20, Bodega 7"
                error={erroresSede.addressLine}
              />
              <SelectorUbicacion
                valor={borrador.ubicacion}
                onChange={(u) => setBorrador({ ...borrador, ubicacion: u })}
                errores={erroresSede}
                requerido
                compacto
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Quién recibe en la sede"
                  value={borrador.contactName ?? ''}
                  onChange={(e) => setBorrador({ ...borrador, contactName: e.target.value })}
                />
                <Input
                  label="Teléfono de la sede"
                  value={borrador.contactPhone ?? ''}
                  onChange={(e) => setBorrador({ ...borrador, contactPhone: e.target.value })}
                  placeholder="300 123 4567"
                />
              </div>
              <Input
                label="Indicaciones para el transportador"
                value={borrador.notes ?? ''}
                onChange={(e) => setBorrador({ ...borrador, notes: e.target.value })}
                placeholder="Portería 2, entrada por la calle del parque…"
              />
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={borrador.isDefault}
                  onChange={(e) => setBorrador({ ...borrador, isDefault: e.target.checked })}
                  className="rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F]"
                />
                Marcar como sede principal
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setBorrador(null)} className="text-xs">
                  Cancelar
                </Button>
                <Button
                  variant="primary" size="sm"
                  onClick={() => void guardarSede()}
                  isLoading={guardando}
                  className="bg-[#004F9F] text-white text-xs font-bold"
                >
                  Guardar
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ----------------------------------------------------------
  // Listado
  // ----------------------------------------------------------
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* Era un `h2` pequeño, distinto al de los demás módulos: Clientes
              es un módulo del menú y su encabezado tiene que pesar igual. */}
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="Building2" /> Clientes
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {totales.empresas} empresas · {totales.personas} personas
            {totales.sinSede > 0 && ` · ${totales.sinSede} empresa(s) sin sede registrada`}
          </p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); void cargar(busqueda); }}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Razón social o NIT"
              className="pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm w-56
                         focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20"
            />
          </div>
          <Button variant="outline" size="sm" className="text-xs font-bold">Buscar</Button>

          {/* Exporta lo que se ve, con el filtro de tipo aplicado. Las
              columnas propias de cada clase van vacías en la otra: es un solo
              archivo y separarlo en dos obligaría a exportar dos veces. */}
          <ExportarBoton<FilaCliente>
            filas={visibles}
            nombre={filtro === 'EMPRESAS' ? 'clientes-empresa'
              : filtro === 'PERSONAS' ? 'clientes-persona-natural' : 'clientes'}
            titulo="Clientes"
            filtros={[
              filtro === 'TODOS' ? 'Empresas y personas'
                : filtro === 'EMPRESAS' ? 'Solo empresas' : 'Solo personas naturales',
              busqueda.trim() ? `Búsqueda: ${busqueda.trim()}` : null,
            ].filter(Boolean).join(' · ')}
            columnas={[
              { titulo: 'Tipo', valor: (f) => (f.tipo === 'EMPRESA' ? 'Empresa' : 'Persona natural') },
              { titulo: 'Nombre / Razón social', valor: (f) => f.nombre },
              { titulo: 'NIT / Documento', valor: (f) => f.documento ?? '' },
              { titulo: 'Ciudad', valor: (f) => f.ciudad ?? '' },
              { titulo: 'Teléfono', valor: (f) => f.telefono ?? '' },
              { titulo: 'Correo', valor: (f) => f.correo ?? '' },
              { titulo: 'Estado', valor: (f) => f.estado },
              { titulo: 'Segmento', valor: (f) => f.persona?.segmento ?? '' },
              { titulo: 'Sedes', valor: (f) => f.empresa?.sedes ?? '', numerica: true },
              { titulo: 'Usuarios', valor: (f) => f.empresa?.miembros ?? '', numerica: true },
              { titulo: 'Pedidos', valor: (f) => f.persona?.pedidos ?? '', numerica: true },
            ]}
          />
        </form>
      </header>

      {error && (
        <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
          {error}
        </p>
      )}

      {/* Vinculaciones que nadie más puede destrabar: una empresa cuyo dueño
          no vuelve a entrar deja a su gente esperando para siempre, y soporte
          no tenía dónde resolverlo. */}
      {esAdmin && <SolicitudesDeVinculacion contexto="portal" onCambio={() => void cargar(busqueda)} />}

      {/* ── Filtro de tipo y forma de ver ──────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Control segmentado: las tres opciones a la vista y con su cuenta.
            Un desplegable esconde cuántos hay de cada clase, que es
            justamente lo que se quiere saber antes de elegir. */}
        <div
          role="group"
          aria-label="Filtrar por tipo de cliente"
          className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200"
        >
          {([
            ['TODOS', 'Todos', Users, totales.empresas + totales.personas],
            ['EMPRESAS', 'Empresas', Building2, totales.empresas],
            ['PERSONAS', 'Personas', User, totales.personas],
          ] as const).map(([clave, texto, Icono, cuenta]) => {
            const activo = filtro === clave;
            return (
              <button
                key={clave}
                type="button"
                onClick={() => setFiltro(clave)}
                aria-pressed={activo}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold
                            transition-all cursor-pointer ${
                  activo
                    ? 'bg-white text-[#004F9F] shadow-2xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icono className="w-4 h-4" />
                {texto}
                <span className={`text-[11px] font-extrabold tabular-nums px-1.5 py-0.5 rounded-md ${
                  activo ? 'bg-[#004F9F]/10 text-[#004F9F]' : 'bg-slate-200/70 text-slate-500'
                }`}>
                  {cuenta}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tarjetas o tabla. La elección se guarda. */}
        <div
          role="group"
          aria-label="Forma de ver la lista"
          className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200"
        >
          {([
            ['tarjetas', 'Tarjetas', LayoutGrid],
            ['tabla', 'Lista', List],
          ] as const).map(([clave, texto, Icono]) => {
            const activo = vista === clave;
            return (
              <button
                key={clave}
                type="button"
                onClick={() => { setVista(clave); localStorage.setItem(CLAVE_VISTA, clave); }}
                aria-pressed={activo}
                title={texto}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                            transition-all cursor-pointer ${
                  activo
                    ? 'bg-white text-[#004F9F] shadow-2xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icono className="w-4 h-4" /> {texto}
              </button>
            );
          })}
        </div>
      </div>

      {cargando ? (
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando clientes…
        </p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">
          No hay clientes que coincidan con el filtro.
        </p>
      ) : vista === 'tarjetas' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
          {visibles.map((f) => (
            <TarjetaCliente
              key={f.clave}
              fila={f}
              // Abren las DOS clases. Antes la de persona no era pulsable
              // porque el único detalle era el de sedes, y una persona no
              // tiene; ahora abre su ficha para consultarla y corregirla.
              onAbrir={() => setEditando({
                tipo: f.tipo,
                id: f.tipo === 'EMPRESA' ? f.empresa!.id : f.persona!.id,
                nombre: f.nombre,
                fotoUrl: f.fotoUrl,
              })}
              onVerSedes={f.empresa ? () => void abrir(f.empresa!) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[52rem]">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">NIT / Documento</th>
                  <th className="text-left px-4 py-3">Ciudad</th>
                  <th className="text-left px-4 py-3">Contacto</th>
                  {/* Una columna por clase: en «Todos» la que no aplica va con
                      raya, que se lee mejor que un cero que parece un dato. */}
                  <th className="text-right px-4 py-3">Sedes</th>
                  <th className="text-right px-4 py-3">Usuarios</th>
                  <th className="text-right px-4 py-3">Pedidos</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map((f) => (
                  <tr
                    key={f.clave}
                    onClick={() => setEditando({
                      tipo: f.tipo,
                      id: f.tipo === 'EMPRESA' ? f.empresa!.id : f.persona!.id,
                      nombre: f.nombre,
                      fotoUrl: f.fotoUrl,
                    })}
                    className="hover:bg-slate-50/70 cursor-pointer"
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <AvatarCliente
                          nombre={f.nombre} fotoUrl={f.fotoUrl} tipo={f.tipo} tamano={28}
                        />
                        <span>
                          <span className="block font-semibold text-slate-800">{f.nombre}</span>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {f.tipo === 'EMPRESA' ? 'Empresa' : (f.persona?.segmento ?? 'Persona')}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 tabular-nums">{f.documento ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{f.ciudad ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {f.correo ?? f.telefono ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {f.empresa
                        ? (
                          <span className={f.empresa.sedes === 0
                            ? 'font-bold text-amber-700'
                            : 'font-bold text-slate-700'}>
                            {f.empresa.sedes}
                          </span>
                        )
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 font-semibold">
                      {f.empresa
                        ? (
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-400" /> {f.empresa.miembros}
                          </span>
                        )
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 font-semibold">
                      {f.persona
                        ? f.persona.pedidos
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {f.empresa
                        ? (
                          <button
                            onClick={(ev) => { ev.stopPropagation(); void abrir(f.empresa!); }}
                            className="text-[#004F9F] font-bold hover:underline cursor-pointer"
                          >
                            Ver sedes
                          </button>
                        )
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editando && (
        <FormularioCliente
          tipo={editando.tipo}
          id={editando.id}
          nombre={editando.nombre}
          fotoUrl={editando.fotoUrl}
          onCerrar={() => setEditando(null)}
          // La lista se refresca sola: el nombre o la ciudad que se acaban de
          // corregir tienen que verse ya en la tarjeta de atrás.
          onGuardado={() => void cargar(busqueda)}
        />
      )}
    </div>
  );
};
