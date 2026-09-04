import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Package, Plus, Trash2, Pencil, Loader2, AlertTriangle, CheckCircle2,
  ArrowUp, ArrowDown, Archive, X, ImagePlus,
} from 'lucide-react';
import {
  kitsService, catalogoService, FASES_KIT,
  type KitCatalogo, type PasoKit, type ProductoCatalogo,
} from '../services/catalogoAdmin';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

/**
 * Kits de solución, desde el catálogo.
 *
 * Hasta ahora los kits solo existían como datos sembrados: para cambiar un
 * paso, un precio o un descuento había que entrar a la base. Eso no lo puede
 * hacer quien administra el negocio, así que en la práctica no se hacía — y se
 * notaba: cinco de los once pasos cotizaban presentaciones que no existen.
 *
 * LA REGLA QUE EVITA QUE VUELVA A PASAR: un paso se arma eligiendo un PRODUCTO
 * y una PRESENTACIÓN del catálogo activo. No hay campo de precio ni de
 * etiqueta libre. El precio sale de la presentación, así que sube y baja con
 * el catálogo y no puede quedarse viejo.
 *
 * Y no hay copia intermedia: la tienda lee las mismas tablas. Lo que se
 * archive, edite o borre aquí, el cliente lo ve al recargar.
 */

const pesos = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

interface FormularioKit {
  nombre: string; subtitulo: string; descripcion: string; problema: string;
  garantia: string; descuento: number; estado: 'ACTIVO' | 'INACTIVO';
  categoriaId: string; imagen: string | null;
}

const KIT_VACIO: FormularioKit = {
  nombre: '', subtitulo: '', descripcion: '', problema: '', garantia: '',
  descuento: 0, estado: 'ACTIVO', categoriaId: '', imagen: null,
};

export const KitsPanel: React.FC = () => {
  const [kits, setKits] = useState<KitCatalogo[]>([]);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [editando, setEditando] = useState<KitCatalogo | null>(null);
  const [form, setForm] = useState<FormularioKit>(KIT_VACIO);
  const [creando, setCreando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivoKit = useRef<HTMLInputElement>(null);

  const subirImagenKit = async (f: File) => {
    setSubiendo(true);
    setAviso(null);
    try {
      const url = await kitsService.subirImagen(f, form.nombre || 'kit');
      setForm((x) => ({ ...x, imagen: url }));
      setAviso({ tipo: 'ok', texto: 'Imagen cargada. Guarda el kit para que quede.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setSubiendo(false);
      if (archivoKit.current) archivoKit.current.value = '';
    }
  };

  const cargar = useCallback(async () => {
    try {
      const [k, p] = await Promise.all([kitsService.listar(), catalogoService.productos()]);
      setKits(k);
      // Solo productos ACTIVOS, y solo sus presentaciones activas: un kit no
      // puede armarse con algo que no se vende.
      setProductos(p.filter((x) => x.estado === 'ACTIVO'));
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const abrir = (k: KitCatalogo | null) => {
    setEditando(k);
    setCreando(k === null);
    setForm(k ? {
      nombre: k.nombre, subtitulo: k.subtitulo ?? '', descripcion: k.descripcion ?? '',
      problema: k.problema ?? '', garantia: k.garantia ?? '', descuento: k.descuento,
      estado: k.estado, categoriaId: k.categoriaId ?? '', imagen: k.imagen,
    } : KIT_VACIO);
    setAviso(null);
  };

  const guardarCabecera = async () => {
    if (!form.nombre.trim()) {
      setAviso({ tipo: 'error', texto: 'El kit necesita un nombre.' });
      return;
    }
    setGuardando(true);
    try {
      const id = await kitsService.guardar({
        id: editando?.id, ...form,
        categoriaId: form.categoriaId || null,
      });
      await cargar();
      const recien = (await kitsService.listar()).find((k) => k.id === id) ?? null;
      setEditando(recien);
      setCreando(false);
      setAviso({ tipo: 'ok', texto: 'Kit guardado. El cliente ya lo ve así.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const guardarPaso = async (paso: PasoKit) => {
    if (!editando) return;
    setGuardando(true);
    try {
      await kitsService.guardarPaso(editando.id, paso);
      await kitsService.renumerar(editando.id);
      const lista = await kitsService.listar();
      setKits(lista);
      setEditando(lista.find((k) => k.id === editando.id) ?? null);
      setAviso({ tipo: 'ok', texto: 'Paso guardado.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const quitarPaso = async (pasoId: string) => {
    if (!editando) return;
    setGuardando(true);
    try {
      await kitsService.quitarPaso(pasoId);
      await kitsService.renumerar(editando.id);
      const lista = await kitsService.listar();
      setKits(lista);
      setEditando(lista.find((k) => k.id === editando.id) ?? null);
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const mover = async (paso: PasoKit, delta: number) => {
    if (!editando) return;
    const otro = editando.pasos.find((p) => p.stepNumber === paso.stepNumber + delta);
    if (!otro) return;
    setGuardando(true);
    try {
      // Se cruzan los números por un valor temporal alto: el índice único
      // (solution_id, step_number) rechaza el intercambio directo.
      await kitsService.guardarPaso(editando.id, { ...paso, stepNumber: 9000 });
      await kitsService.guardarPaso(editando.id, { ...otro, stepNumber: paso.stepNumber });
      await kitsService.guardarPaso(editando.id, { ...paso, stepNumber: paso.stepNumber + delta });
      const lista = await kitsService.listar();
      setKits(lista);
      setEditando(lista.find((k) => k.id === editando.id) ?? null);
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando kits…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {aviso && (
        <div className={`flex items-start gap-2 text-xs font-semibold rounded-lg px-3 py-2.5 ${
          aviso.tipo === 'ok'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {aviso.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
            : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
          <span>{aviso.texto}</span>
        </div>
      )}

      {!editando && !creando && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {kits.length} kit(s). El precio de cada paso sale de la presentación del catálogo,
              así que se actualiza solo.
            </p>
            <Button size="sm" variant="pintuco" className="text-xs font-bold"
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => abrir(null)}>
              Nuevo kit
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {kits.map((k) => {
              const conDescuento = k.totalSinDescuento * (1 - k.descuento / 100);
              return (
                <div key={k.id}
                     className={`border rounded-xl p-4 space-y-2 ${
                       k.estado === 'ACTIVO' ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{k.nombre}</p>
                    <span className={`shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      k.estado === 'ACTIVO' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                      {k.estado}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">{k.problema ?? k.descripcion ?? ''}</p>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-base font-extrabold text-slate-900">{pesos(conDescuento)}</span>
                    {k.descuento > 0 && (
                      <>
                        <span className="text-xs text-slate-400 line-through">{pesos(k.totalSinDescuento)}</span>
                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          −{k.descuento}%
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">{k.pasos.length} paso(s)</p>
                  <Button size="sm" variant="outline" className="text-xs w-full"
                          leftIcon={<Pencil className="w-3.5 h-3.5" />}
                          onClick={() => abrir(k)}>
                    Editar
                  </Button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {(editando || creando) && (
        <div className="border border-slate-200 rounded-xl p-5 space-y-5 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#004F9F]" />
              {creando ? 'Nuevo kit' : editando?.nombre}
            </h3>
            <button onClick={() => { setEditando(null); setCreando(false); }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Cerrar">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nombre del kit" value={form.nombre}
                   onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <Input label="Para qué problema" value={form.problema}
                   onChange={(e) => setForm({ ...form, problema: e.target.value })} />
            <Input label="Subtítulo" value={form.subtitulo}
                   onChange={(e) => setForm({ ...form, subtitulo: e.target.value })} />
            <Input label="Garantía" value={form.garantia}
                   onChange={(e) => setForm({ ...form, garantia: e.target.value })} />
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Descuento del kit (%)
              </label>
              <input type="number" min={0} max={100} step={1} value={form.descuento}
                     onChange={(e) => setForm({ ...form, descuento: Number(e.target.value) })}
                     className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm
                                focus:outline-none focus:border-[#004F9F] focus:ring-2 focus:ring-[#004F9F]/20" />
              <p className="text-[11px] text-slate-400 mt-1">
                Se aplica sobre la suma de los pasos. La base rechaza más de 100.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Estado</label>
              <select value={form.estado}
                      onChange={(e) => setForm({ ...form, estado: e.target.value as 'ACTIVO' | 'INACTIVO' })}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm
                                 focus:outline-none focus:border-[#004F9F]">
                <option value="ACTIVO">Activo — visible en la tienda</option>
                <option value="INACTIVO">Inactivo — oculto para el cliente</option>
              </select>
            </div>
          </div>

          {/* Imagen del kit. Es la que ve el cliente en la tarjeta de
              «Soluciones»; sin ella la tarjeta sale con un hueco. */}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <div className="w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden
                            flex items-center justify-center shrink-0">
              {form.imagen
                ? <img src={form.imagen} alt="" className="w-full h-full object-cover" />
                : <ImagePlus className="w-5 h-5 text-slate-300" />}
            </div>
            <div className="space-y-1.5">
              <input ref={archivoKit} type="file" accept="image/*" className="hidden"
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirImagenKit(f); }} />
              <Button size="sm" variant="outline" className="text-xs"
                      isLoading={subiendo}
                      leftIcon={<ImagePlus className="w-3.5 h-3.5" />}
                      onClick={() => archivoKit.current?.click()}>
                {form.imagen ? 'Cambiar imagen' : 'Subir imagen del kit'}
              </Button>
              {form.imagen && (
                <button type="button" onClick={() => setForm({ ...form, imagen: null })}
                        className="block text-[11px] text-rose-600 hover:underline cursor-pointer">
                  Quitar imagen
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="pintuco" className="text-xs font-bold"
                    isLoading={guardando} onClick={() => void guardarCabecera()}>
              {creando ? 'Crear kit' : 'Guardar cambios'}
            </Button>
            {!creando && form.estado === 'ACTIVO' && (
              <Button size="sm" variant="outline" className="text-xs"
                      leftIcon={<Archive className="w-3.5 h-3.5" />}
                      onClick={() => { setForm({ ...form, estado: 'INACTIVO' }); }}>
                Marcar inactivo
              </Button>
            )}
          </div>

          {editando && !creando && (
            <PasosDelKit
              kit={editando}
              productos={productos}
              guardando={guardando}
              onGuardar={guardarPaso}
              onQuitar={quitarPaso}
              onMover={mover}
            />
          )}
          {creando && (
            <p className="text-xs text-slate-500 border-t border-slate-100 pt-4">
              Crea el kit primero y después le agregas los pasos.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/** Miniatura del paso, con subida propia y respaldo a la imagen del producto. */
const ImagenPaso: React.FC<{ paso: PasoKit; onSubida: (url: string) => void }> = ({ paso, onSubida }) => {
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const mostrada = paso.imagen || paso.imagenProducto;

  return (
    <div className="shrink-0">
      <input ref={archivo} type="file" accept="image/*" className="hidden"
             onChange={async (e) => {
               const f = e.target.files?.[0];
               if (!f) return;
               setSubiendo(true);
               try {
                 onSubida(await kitsService.subirImagen(f, paso.productoNombre ?? 'paso'));
               } finally {
                 setSubiendo(false);
                 if (archivo.current) archivo.current.value = '';
               }
             }} />
      <button
        type="button"
        onClick={() => archivo.current?.click()}
        title={paso.imagen ? 'Cambiar la imagen de este paso' : 'Subir una imagen propia para este paso'}
        className="w-11 h-11 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden
                   flex items-center justify-center hover:border-[#004F9F] transition-colors cursor-pointer"
      >
        {subiendo
          ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          : mostrada
            ? <img src={mostrada} alt="" className="w-full h-full object-cover" />
            : <ImagePlus className="w-4 h-4 text-slate-300" />}
      </button>
    </div>
  );
};

/* ────────────────────────── Los pasos ────────────────────────── */

const PasosDelKit: React.FC<{
  kit: KitCatalogo;
  productos: ProductoCatalogo[];
  guardando: boolean;
  onGuardar: (p: PasoKit) => void;
  onQuitar: (id: string) => void;
  onMover: (p: PasoKit, delta: number) => void;
}> = ({ kit, productos, guardando, onGuardar, onQuitar, onMover }) => {
  const [nuevo, setNuevo] = useState<PasoKit>({
    stepNumber: kit.pasos.length + 1, fase: 'Acabado',
    productId: '', variantId: null, cantidad85m2: 1, descripcionRol: '',
  });

  const productoElegido = useMemo(
    () => productos.find((p) => p.id === nuevo.productId),
    [productos, nuevo.productId],
  );
  const presentaciones = (productoElegido?.presentaciones ?? [])
    .filter((v) => v.estado === 'ACTIVO');

  const total = kit.pasos.reduce((t, p) => t + (p.precioCop ?? 0) * p.cantidad85m2, 0);
  const conDescuento = total * (1 - kit.descuento / 100);

  return (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
        Pasos del sistema
      </h4>

      {kit.pasos.length === 0 && (
        <p className="text-xs text-slate-500">Todavía no tiene pasos.</p>
      )}

      <ul className="space-y-2">
        {kit.pasos.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 border border-slate-200 rounded-lg p-3">
            <span className="w-7 h-7 rounded-full bg-[#004F9F] text-white text-xs font-extrabold
                             flex items-center justify-center shrink-0">
              {p.stepNumber}
            </span>
            {/* La del paso si la subieron; si no, la del producto. Un paso sin
                imagen propia no debe salir con el hueco roto. */}
            <ImagenPaso paso={p} onSubida={(url) => onGuardar({ ...p, imagen: url })} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate">{p.productoNombre}</p>
              <p className="text-xs text-slate-500">
                {p.fase} · {p.presentacion} · {p.cantidad85m2} u. para 85 m²
              </p>
            </div>
            <span className="text-sm font-bold text-slate-800 shrink-0">
              {pesos((p.precioCop ?? 0) * p.cantidad85m2)}
            </span>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => onMover(p, -1)} disabled={p.stepNumber === 1 || guardando}
                      className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                      aria-label="Subir">
                <ArrowUp className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button onClick={() => onMover(p, 1)}
                      disabled={p.stepNumber === kit.pasos.length || guardando}
                      className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                      aria-label="Bajar">
                <ArrowDown className="w-3.5 h-3.5 text-slate-600" />
              </button>
              <button onClick={() => p.id && onQuitar(p.id)} disabled={guardando}
                      className="p-1.5 rounded hover:bg-rose-50 cursor-pointer" aria-label="Quitar">
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {kit.pasos.length > 0 && (
        <div className="flex items-baseline justify-end gap-2 text-sm pt-1">
          <span className="text-slate-500">Kit para 85 m²:</span>
          {kit.descuento > 0 && <span className="text-slate-400 line-through">{pesos(total)}</span>}
          <span className="font-extrabold text-slate-900">{pesos(conDescuento)}</span>
        </div>
      )}

      {/* Agregar paso. El producto y la presentación salen del catálogo activo:
          no hay campo de precio, y por eso no puede volver a haber uno viejo. */}
      <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-3 bg-slate-50/50">
        <p className="text-xs font-bold text-slate-600">Agregar un paso</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={nuevo.productId}
            onChange={(e) => setNuevo({ ...nuevo, productId: e.target.value, variantId: null })}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white
                       focus:outline-none focus:border-[#004F9F]"
          >
            <option value="">Producto del catálogo…</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
            ))}
          </select>

          <select
            value={nuevo.variantId ?? ''}
            onChange={(e) => setNuevo({ ...nuevo, variantId: e.target.value || null })}
            disabled={!productoElegido}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white
                       disabled:bg-slate-100 focus:outline-none focus:border-[#004F9F]"
          >
            <option value="">Presentación…</option>
            {presentaciones.map((v) => (
              <option key={v.id} value={v.id}>{v.label} — {pesos(v.precio)}</option>
            ))}
          </select>

          <select
            value={nuevo.fase}
            onChange={(e) => setNuevo({ ...nuevo, fase: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white
                       focus:outline-none focus:border-[#004F9F]"
          >
            {FASES_KIT.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>

          <div>
            <input
              type="number" min={0.5} step={0.5} value={nuevo.cantidad85m2}
              onChange={(e) => setNuevo({ ...nuevo, cantidad85m2: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white
                         focus:outline-none focus:border-[#004F9F]"
            />
            <p className="text-[11px] text-slate-400 mt-1">Unidades para 85 m²</p>
          </div>
        </div>

        <Button
          size="sm" variant="pintuco" className="text-xs font-bold"
          disabled={!nuevo.productId || !nuevo.variantId || guardando}
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => {
            onGuardar({ ...nuevo, stepNumber: kit.pasos.length + 1 });
            setNuevo({
              stepNumber: kit.pasos.length + 2, fase: 'Acabado',
              productId: '', variantId: null, cantidad85m2: 1, descripcionRol: '',
            });
          }}
        >
          Agregar paso
        </Button>
      </div>
    </div>
  );
};
