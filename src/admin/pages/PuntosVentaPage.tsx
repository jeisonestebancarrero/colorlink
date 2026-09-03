import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Building2, Clock, ImagePlus, MapPin, Phone, Plus, Search, Store, X,
} from 'lucide-react';
import { puntoVentaService, type PuntoVenta } from '../../services/puntosVentaAdmin';
import { ExportarBoton } from '../ExportarBoton';
import { useAdminAuth } from '../AdminAuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { FotoPunto } from '../../components/common/FotoPunto';
import { IconoModulo } from '../IconosDeModulo';

/**
 * El formulario guarda los campos numéricos como TEXTO.
 *
 * No es un capricho: si se convierte a número en cada pulsación, escribir
 * «4.6626» es imposible. Al teclear «4.» sale `Number('4.') === 4`, se
 * vuelve a pintar «4» y el punto desaparece; el resultado era una latitud de
 * 46626. Y al empezar una longitud negativa, `Number('-')` da `NaN` y el
 * campo se queda en «NaN». Se convierte una sola vez, al guardar.
 */
interface Formulario extends Omit<PuntoVenta, 'latitud' | 'longitud' | 'horasAlistamiento'> {
  latitud: string;
  longitud: string;
  horasAlistamiento: string;
}

const aFormulario = (p: PuntoVenta): Formulario => ({
  ...p,
  latitud: p.latitud === null ? '' : String(p.latitud),
  longitud: p.longitud === null ? '' : String(p.longitud),
  horasAlistamiento: String(p.horasAlistamiento),
});

const aPunto = (f: Formulario): PuntoVenta => ({
  ...f,
  latitud: f.latitud.trim() === '' ? null : Number(f.latitud),
  longitud: f.longitud.trim() === '' ? null : Number(f.longitud),
  horasAlistamiento: Number(f.horasAlistamiento) || 24,
});

const VACIO = (): Formulario => aFormulario({
  id: '',
  referencia: null,
  nombre: '',
  ciudad: '',
  direccion: '',
  telefono: '',
  horario: '',
  imagenUrl: null,
  tieneEstudioColor: false,
  tieneAsesorTecnico: false,
  tieneRetiroExpress: false,
  horasAlistamiento: 24,
  latitud: null,
  longitud: null,
  activo: true,
});

/**
 * Puntos de venta.
 *
 * Es la misma tabla que lee la tienda del cliente, así que lo que se guarde
 * aquí aparece allá: no hay una segunda copia que mantener al día. Lo único
 * que se interpone es el cache del catálogo en el navegador del cliente, que
 * dura cinco minutos; por eso la pantalla lo dice en vez de dejar a alguien
 * recargando sin entender por qué no ve el cambio.
 */
export const PuntosVentaPage: React.FC = () => {
  const { puede } = useAdminAuth();
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [editando, setEditando] = useState<Formulario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const administra = puede('settings.manage');

  const cargar = async () => {
    setCargando(true);
    try {
      setPuntos(await puntoVentaService.listar());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar los puntos de venta.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return puntos;
    return puntos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.ciudad.toLowerCase().includes(q) ||
        p.direccion.toLowerCase().includes(q),
    );
  }, [puntos, busqueda]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setError('');
    setGuardando(true);
    try {
      const punto = aPunto(editando);
      if (editando.latitud.trim() !== '' && !Number.isFinite(punto.latitud)) {
        throw new Error('La latitud no es un número válido.');
      }
      if (editando.longitud.trim() !== '' && !Number.isFinite(punto.longitud)) {
        throw new Error('La longitud no es un número válido.');
      }
      await puntoVentaService.guardar(punto);
      setAviso(
        editando.id
          ? 'Punto de venta actualizado. El cambio aparece en la tienda del cliente en pocos minutos.'
          : 'Punto de venta creado. Ya está disponible para retiro en la tienda del cliente.',
      );
      setEditando(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const subirFoto = async (f: File) => {
    if (!editando) return;
    setError('');
    setSubiendo(true);
    try {
      const url = await puntoVentaService.subirFoto(
        f,
        editando.referencia ?? editando.nombre.toLowerCase().replace(/\s+/g, '-').slice(0, 40),
      );
      setEditando({ ...editando, imagenUrl: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible subir la imagen.');
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = '';
    }
  };

  // ── Formulario ────────────────────────────────────────────────────────────
  if (editando) {
    const nuevo = !editando.id;
    return (
      <div className="space-y-5 max-w-3xl">
        <button
          onClick={() => setEditando(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a puntos de venta
        </button>

        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {nuevo ? 'Nuevo punto de venta' : editando.nombre}
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Lo que guardes aquí es lo que el cliente ve en Puntos de Retiro.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        <form onSubmit={guardar} className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">Identificación</h3>

            <Input
              label="Nombre de la tienda"
              value={editando.nombre}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              placeholder="Ej. Pintuco Store - Medellín Laureles"
              required
              leftIcon={<Store className="w-4 h-4" />}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Ciudad"
                value={editando.ciudad}
                onChange={(e) => setEditando({ ...editando, ciudad: e.target.value })}
                placeholder="Medellín"
                required
                leftIcon={<Building2 className="w-4 h-4" />}
              />
              <Input
                label="Teléfono"
                value={editando.telefono ?? ''}
                onChange={(e) => setEditando({ ...editando, telefono: e.target.value })}
                placeholder="+57 (604) 000-0000"
                leftIcon={<Phone className="w-4 h-4" />}
              />
            </div>

            <Input
              label="Dirección"
              value={editando.direccion}
              onChange={(e) => setEditando({ ...editando, direccion: e.target.value })}
              placeholder="Cra 43A # 18 Sur - 135"
              required
              leftIcon={<MapPin className="w-4 h-4" />}
            />

            <Input
              label="Horario de atención"
              value={editando.horario ?? ''}
              onChange={(e) => setEditando({ ...editando, horario: e.target.value })}
              placeholder="Lun - Vie: 7:30 AM - 6:00 PM | Sáb: 8:00 AM - 2:00 PM"
              leftIcon={<Clock className="w-4 h-4" />}
            />

            {nuevo && (
              <>
                <Input
                  label="Identificador interno (opcional)"
                  value={editando.referencia ?? ''}
                  onChange={(e) => setEditando({ ...editando, referencia: e.target.value })}
                  placeholder="store-med-laureles"
                />
                <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
                  Si lo dejas vacío se genera a partir del nombre. No se puede cambiar después:
                  es la llave con la que el resto del sistema reconoce la tienda.
                </p>
              </>
            )}
          </div>

          {/* Imagen */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">Imagen</h3>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-full sm:w-64 rounded-xl overflow-hidden border border-slate-200">
                <FotoPunto
                  referencia={editando.referencia}
                  urlRemota={editando.imagenUrl}
                  ciudad={editando.ciudad || undefined}
                  alto="h-36"
                />
              </div>

              <div className="flex-1 space-y-2.5">
                <input
                  ref={archivo}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void subirFoto(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={subiendo}
                  leftIcon={<ImagePlus className="w-3.5 h-3.5" />}
                  onClick={() => archivo.current?.click()}
                >
                  Subir foto de la tienda
                </Button>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  JPG, PNG, WebP o AVIF, hasta 5 MB. Se publica en la tienda del cliente, así que
                  conviene una foto de la fachada, horizontal y bien iluminada.
                </p>
                {editando.imagenUrl && (
                  <button
                    type="button"
                    onClick={() => setEditando({ ...editando, imagenUrl: null })}
                    className="text-[11px] font-semibold text-slate-500 hover:text-rose-600"
                  >
                    Quitar la foto
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Servicios */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">Servicios de la tienda</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed -mt-2">
              Son las etiquetas que el cliente ve al elegir dónde retirar. Marcar un servicio que
              la tienda no presta genera un viaje en vano.
            </p>

            {[
              ['tieneRetiroExpress', 'Retiro express', 'El pedido queda listo en pocas horas.'],
              ['tieneEstudioColor', 'Centro de color', 'Prepara cualquier tono de la carta al instante.'],
              ['tieneAsesorTecnico', 'Asesoría en obra', 'Tiene asesor técnico para acompañamiento.'],
            ].map(([campo, titulo, detalle]) => (
              <label
                key={campo}
                className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={Boolean(editando[campo as keyof Formulario])}
                  onChange={(e) => setEditando({ ...editando, [campo]: e.target.checked })}
                  className="mt-0.5 rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F]"
                />
                <span className="text-xs leading-relaxed">
                  <span className="font-bold text-slate-800 block">{titulo}</span>
                  <span className="text-slate-500">{detalle}</span>
                </span>
              </label>
            ))}

            <Input
              label="Horas de alistamiento"
              type="number"
              min="1"
              value={editando.horasAlistamiento}
              onChange={(e) => setEditando({ ...editando, horasAlistamiento: e.target.value })}
            />
            <p className="text-[11px] text-slate-400 -mt-2">
              Lo que se le promete al cliente: «listo en{' '}
              {editando.horasAlistamiento.trim() === '' ? '24' : editando.horasAlistamiento} hrs».
            </p>
          </div>

          {/* Ubicación en el mapa */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">Ubicación en el mapa</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Latitud"
                inputMode="decimal"
                value={editando.latitud}
                onChange={(e) => setEditando({ ...editando, latitud: e.target.value })}
                placeholder="6.2088"
              />
              <Input
                label="Longitud"
                inputMode="decimal"
                value={editando.longitud}
                onChange={(e) => setEditando({ ...editando, longitud: e.target.value })}
                placeholder="-75.5648"
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              En Colombia la latitud es positiva y la longitud negativa. El servidor rechaza un
              punto fuera del país: casi siempre significa que están invertidas.
            </p>
          </div>

          {/* Estado */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={editando.activo}
                onChange={(e) => setEditando({ ...editando, activo: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F]"
              />
              <span className="text-xs leading-relaxed">
                <span className="font-bold text-slate-800 block">Disponible para retiro</span>
                <span className="text-slate-500">
                  Al desmarcarlo desaparece de la tienda del cliente, pero su inventario y su
                  historial se conservan.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="pintuco" isLoading={guardando}>
              {nuevo ? 'Crear punto de venta' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ── Listado ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="Store" /> Puntos de venta
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Las tiendas que el cliente ve para retirar. Es la misma información en los dos portales.
          </p>
        </div>
        {administra && (
          <Button
            variant="pintuco"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setAviso('');
              setEditando(VACIO());
            }}
          >
            Nuevo punto de venta
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}
      {aviso && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium flex items-start gap-2">
          <span className="flex-1">{aviso}</span>
          <button onClick={() => setAviso('')} aria-label="Cerrar aviso">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[15rem] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, ciudad o dirección…"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
          />
        </div>

        {/* El directorio de tiendas se pide fuera del sistema: para el sitio
            web, para un volante, para el call center. Sale con coordenadas y
            horario, que es lo que nadie tiene a mano. */}
        <ExportarBoton<PuntoVenta>
          filas={filtrados}
          nombre="puntos-de-venta"
          titulo="Puntos de venta"
          filtros={busqueda.trim() ? `Búsqueda: ${busqueda.trim()}` : 'Todos'}
          columnas={[
            { titulo: 'Nombre', valor: (p) => p.nombre },
            { titulo: 'Ciudad', valor: (p) => p.ciudad },
            { titulo: 'Dirección', valor: (p) => p.direccion },
            { titulo: 'Teléfono', valor: (p) => p.telefono },
            { titulo: 'Horario', valor: (p) => p.horario },
            { titulo: 'Estudio de color', valor: (p) => (p.tieneEstudioColor ? 'Sí' : 'No') },
            { titulo: 'Asesor técnico', valor: (p) => (p.tieneAsesorTecnico ? 'Sí' : 'No') },
            { titulo: 'Retiro express', valor: (p) => (p.tieneRetiroExpress ? 'Sí' : 'No') },
            { titulo: 'Horas de alistamiento', valor: (p) => p.horasAlistamiento, numerica: true },
            { titulo: 'Latitud', valor: (p) => p.latitud, numerica: true },
            { titulo: 'Longitud', valor: (p) => p.longitud, numerica: true },
            { titulo: 'Estado', valor: (p) => (p.activo ? 'ACTIVO' : 'INACTIVO') },
            { titulo: 'Referencia', valor: (p) => p.referencia },
          ]}
        />
      </div>

      {cargando ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-sm text-slate-400 text-center py-14">Cargando puntos de venta…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrados.map((p) => (
            <button
              key={p.id}
              onClick={() => administra && setEditando(aFormulario(p))}
              disabled={!administra}
              className={`group flex flex-col text-left bg-white rounded-xl border shadow-2xs transition-all overflow-hidden ${
                p.activo ? 'border-slate-200' : 'border-slate-200 opacity-60'
              } ${administra ? 'hover:border-[#004F9F] hover:shadow-lg' : 'cursor-default'}`}
            >
              <FotoPunto
                referencia={p.referencia}
                urlRemota={p.imagenUrl}
                ciudad={p.ciudad}
                alto="h-28"
              />
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start gap-2">
                  <p className="text-sm font-extrabold text-slate-900 leading-snug flex-1">
                    {p.nombre}
                  </p>
                  {!p.activo && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                      Inactiva
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{p.direccion}</p>

                <div className="flex flex-wrap gap-1 mt-auto pt-3">
                  {p.tieneRetiroExpress && (
                    <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                      Express {p.horasAlistamiento}h
                    </span>
                  )}
                  {p.tieneEstudioColor && (
                    <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                      Centro de color
                    </span>
                  )}
                  {p.tieneAsesorTecnico && (
                    <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                      Asesoría
                    </span>
                  )}
                  {p.latitud === null && (
                    <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                      Sin ubicación en el mapa
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
