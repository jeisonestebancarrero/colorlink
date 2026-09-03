import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ChevronDown, ChevronRight, FolderTree, ImagePlus, Package,
  Palette, Plus, Search, Tag, X, Loader2,
} from 'lucide-react';
import {
  catalogoService, colorService, categoriaService, formatearCOP,
  ESTADOS_CATALOGO, ETIQUETA_CATALOGO, COLOR_CATALOGO, FAMILIAS_COLOR,
  type ProductoCatalogo, type Presentacion, type ColorCatalogo, type EstadoCatalogo,
  type CategoriaCatalogo,
} from '../../services/catalogoAdmin';
import { ExportarBoton } from '../ExportarBoton';
import { useAdminAuth } from '../AdminAuthContext';
import { Button } from '../../components/common/Button';
import {
  ImagenConRespaldo, urlDeImagenSospechosa, verificarImagen,
} from '../../components/common/ImagenConRespaldo';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { IconoModulo } from '../IconosDeModulo';

// Valores tomados de los enums de la base (`product_environment`,
// `product_finish`). Si aquí apareciera uno que la base no conoce, guardar
// fallaría con un error de tipo que no le dice nada a quien lo ve.
const AMBIENTES = ['Interior', 'Exterior', 'Ambos', 'Industrial'];
const ACABADOS = ['Mate', 'Satinado', 'Brillante', 'Semibrillante', 'Texturizado', 'N/A'];

/**
 * Catálogo: qué vende Pintuco y a qué precio.
 *
 * Aquí va el PRECIO, que es lo que ve el cliente. El costo no se edita en
 * esta pantalla —entra con la recepción de mercancía— y solo se muestra a
 * quien tiene el permiso para verlo, porque revela el margen del negocio.
 *
 * Todo se guarda a través de funciones del servidor: la tabla de
 * presentaciones ya no admite lectura completa desde el navegador, justamente
 * porque una de sus columnas es confidencial.
 */
/** Etiqueta del grupo que reúne lo que todavía nadie clasificó. */
const SIN_CATEGORIA = 'Sin categoría';

export const CatalogoPage: React.FC = () => {
  const { puede } = useAdminAuth();
  const [pestana, setPestana] = useState<'productos' | 'categorias' | 'colores'>('productos');
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [colores, setColores] = useState<ColorCatalogo[]>([]);
  const [referencias, setReferencias] = useState<{
    marcas: Array<{ id: string; nombre: string }>;
    categorias: Array<{ id: string; nombre: string }>;
  }>({ marcas: [], categorias: [] });
  const [verCostos, setVerCostos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoCatalogo | 'TODOS'>('TODOS');
  const [ocupado, setOcupado] = useState(false);

  const [editandoProducto, setEditandoProducto] = useState<Partial<ProductoCatalogo> | null>(null);
  /** Resultado de intentar cargar la imagen de la URL escrita. */
  const [avisoImagen, setAvisoImagen] = useState<string | null>(null);
  const [verificandoImagen, setVerificandoImagen] = useState(false);
  const [editandoColor, setEditandoColor] = useState<Partial<ColorCatalogo> | null>(null);
  const [editandoPres, setEditandoPres] = useState<
    (Partial<Presentacion> & { precioTexto?: string }) | null
  >(null);
  const [categorias, setCategorias] = useState<CategoriaCatalogo[]>([]);
  const [editandoCategoria, setEditandoCategoria] = useState<Partial<CategoriaCatalogo> | null>(null);
  const [plegadas, setPlegadas] = useState<Set<string>>(new Set());
  const [subiendo, setSubiendo] = useState(false);
  const archivoImagen = useRef<HTMLInputElement>(null);

  const escribe = puede('catalog.write');

  const cargar = async () => {
    setCargando(true);
    try {
      const [prods, cols, refs, costos, cats] = await Promise.all([
        catalogoService.productos(),
        colorService.listar(),
        catalogoService.referencias(),
        catalogoService.puedeVerCostos(),
        categoriaService.listar(),
      ]);
      setProductos(prods);
      setColores(cols);
      setReferencias(refs);
      setVerCostos(costos);
      setCategorias(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cargar el catálogo.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter(
      (p) =>
        (estado === 'TODOS' || p.estado === estado) &&
        (!q ||
          p.nombre.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          (p.categoria ?? '').toLowerCase().includes(q) ||
          p.presentaciones.some((v) => (v.sku ?? '').toLowerCase().includes(q))),
    );
  }, [productos, busqueda, estado]);

  /**
   * Lista de precios: una fila por PRESENTACIÓN, no por producto.
   *
   * Es lo que se pide cuando alguien dice «mándame la lista de precios»: el
   * precio y el SKU viven en la presentación, así que un archivo con una fila
   * por producto no serviría para cotizar ni para cargar en otro sistema.
   */
  const filasDePrecios = useMemo(
    () => productosFiltrados.flatMap((p) =>
      p.presentaciones.map((v) => ({ p, v }))),
    [productosFiltrados],
  );

  /* Los costos solo llegan del servidor a quien tiene `costs.read`; si no, son
     null. Se omiten las columnas en vez de exportarlas vacías, que se leería
     como «este producto no tiene costo». */
  const conCostos = useMemo(
    () => filasDePrecios.some(({ v }) => v.costoEstandar !== null || v.costoPromedio !== null),
    [filasDePrecios],
  );

  const coloresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return colores.filter(
      (c) =>
        (estado === 'TODOS' || c.estado === estado) &&
        (!q ||
          c.nombre.toLowerCase().includes(q) ||
          c.codigo.toLowerCase().includes(q) ||
          c.familia.toLowerCase().includes(q)),
    );
  }, [colores, busqueda, estado]);

  const guardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoProducto) return;
    setError('');
    setOcupado(true);
    try {
      await catalogoService.guardarProducto({
        id: editandoProducto.id ?? null,
        code: editandoProducto.codigo,
        name: editandoProducto.nombre,
        tagline: editandoProducto.lema,
        description: editandoProducto.descripcion,
        brand_id: editandoProducto.marcaId,
        category_id: editandoProducto.categoriaId,
        environment: editandoProducto.ambiente,
        finish: editandoProducto.acabado,
        coverage: editandoProducto.cobertura,
        spread_rate_m2_per_gal: editandoProducto.rendimiento,
        drying_time: editandoProducto.secado,
        image_url: editandoProducto.imagenUrl,
        tax_rate: editandoProducto.iva,
        status: editandoProducto.estado ?? 'ACTIVO',
      });
      setEditandoProducto(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar.');
    } finally {
      setOcupado(false);
    }
  };

  const guardarPresentacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoPres) return;
    setError('');
    const precio = Number(editandoPres.precioTexto ?? '');
    if (!Number.isFinite(precio) || precio <= 0) {
      setError('El precio debe ser un número mayor que cero.');
      return;
    }
    setOcupado(true);
    try {
      await catalogoService.guardarPresentacion({
        id: editandoPres.id ?? null,
        product_id: editandoPres.productId,
        label: editandoPres.label,
        sku: editandoPres.sku,
        barcode: editandoPres.barcode,
        price_cop: precio,
        volume_liters: editandoPres.volumenLitros,
        unit: editandoPres.unidad,
        sort_order: editandoPres.orden ?? 0,
        status: editandoPres.estado ?? 'ACTIVO',
      });
      setEditandoPres(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la presentación.');
    } finally {
      setOcupado(false);
    }
  };

  const guardarColor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoColor) return;
    setError('');
    setOcupado(true);
    try {
      await colorService.guardar({
        id: editandoColor.id ?? null,
        code: editandoColor.codigo,
        name: editandoColor.nombre,
        hex: editandoColor.hex,
        family: editandoColor.familia,
        description: editandoColor.descripcion,
        recommended_product: editandoColor.productoRecomendado,
        is_palette: editandoColor.enCarta ?? false,
        status: editandoColor.estado ?? 'ACTIVO',
      });
      setEditandoColor(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el color.');
    } finally {
      setOcupado(false);
    }
  };

  const subirImagen = async (f: File) => {
    if (!editandoProducto) return;
    setError('');
    setSubiendo(true);
    try {
      const url = await catalogoService.subirImagen(f, editandoProducto.codigo ?? 'producto');
      setEditandoProducto({ ...editandoProducto, imagenUrl: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible subir la imagen.');
    } finally {
      setSubiendo(false);
      if (archivoImagen.current) archivoImagen.current.value = '';
    }
  };

  const guardarCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoCategoria?.nombre?.trim()) return;
    setOcupado(true);
    setError('');
    try {
      await categoriaService.guardar({
        id: editandoCategoria.id,
        nombre: editandoCategoria.nombre.trim(),
        descripcion: editandoCategoria.descripcion ?? undefined,
        orden: editandoCategoria.orden ?? 0,
        activa: editandoCategoria.activa !== false,
      });
      setEditandoCategoria(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la categoría.');
    } finally {
      setOcupado(false);
    }
  };

  /**
   * Los productos, repartidos por categoría y en el mismo orden en que las
   * categorías se muestran en la tienda. Los que no tienen categoría van al
   * final en su propio grupo: esconderlos haría que un producto publicado
   * pareciera perdido.
   */
  const grupos = useMemo(() => {
    const orden = new Map<string, number>(referencias.categorias.map((c, i) => [c.nombre, i]));
    const porNombre = new Map<string, ProductoCatalogo[]>();
    for (const p of productosFiltrados) {
      const clave = p.categoria ?? SIN_CATEGORIA;
      const lista = porNombre.get(clave);
      if (lista) lista.push(p);
      else porNombre.set(clave, [p]);
    }
    return [...porNombre.entries()]
      .map(([nombre, items]) => ({ nombre, items }))
      .sort((a, b) => {
        if (a.nombre === SIN_CATEGORIA) return 1;
        if (b.nombre === SIN_CATEGORIA) return -1;
        return (orden.get(a.nombre) ?? 999) - (orden.get(b.nombre) ?? 999);
      });
  }, [productosFiltrados, referencias.categorias]);

  const categoriasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return categorias;
    return categorias.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.descripcion ?? '').toLowerCase().includes(q),
    );
  }, [categorias, busqueda]);

  const alternarGrupo = (nombre: string) => {
    setPlegadas((antes) => {
      const copia = new Set(antes);
      if (copia.has(nombre)) copia.delete(nombre);
      else copia.add(nombre);
      return copia;
    });
  };

  // ── Formulario de producto ────────────────────────────────────────────────
  if (editandoProducto) {
    const p = editandoProducto;
    return (
      <div className="space-y-5 max-w-3xl">
        <button
          onClick={() => setEditandoProducto(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#004F9F]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al catálogo
        </button>

        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          {p.id ? p.nombre : 'Nuevo producto'}
        </h1>

        {error && (
          <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
            {error}
          </div>
        )}

        <form onSubmit={guardarProducto} className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nombre"
                value={p.nombre ?? ''}
                onChange={(e) => setEditandoProducto({ ...p, nombre: e.target.value })}
                required
              />
              <Input
                label="Código"
                value={p.codigo ?? ''}
                onChange={(e) => setEditandoProducto({ ...p, codigo: e.target.value })}
                placeholder="PNT-EXT-001"
                required
              />
            </div>

            <Input
              label="Lema comercial"
              value={p.lema ?? ''}
              onChange={(e) => setEditandoProducto({ ...p, lema: e.target.value })}
              placeholder="Ej. Máxima protección para fachadas"
            />

            <div>
              <label htmlFor="desc-producto" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Descripción
              </label>
              <textarea
                id="desc-producto"
                rows={3}
                value={p.descripcion ?? ''}
                onChange={(e) => setEditandoProducto({ ...p, descripcion: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Categoría"
                options={[
                  { value: '', label: 'Sin categoría' },
                  ...referencias.categorias.map((c) => ({ value: c.id, label: c.nombre })),
                ]}
                value={p.categoriaId ?? ''}
                onChange={(e) => setEditandoProducto({ ...p, categoriaId: e.target.value })}
              />
              <Select
                label="Marca"
                options={[
                  { value: '', label: 'Sin marca' },
                  ...referencias.marcas.map((m) => ({ value: m.id, label: m.nombre })),
                ]}
                value={p.marcaId ?? ''}
                onChange={(e) => setEditandoProducto({ ...p, marcaId: e.target.value })}
              />
              <Select
                label="Ambiente"
                options={AMBIENTES}
                value={p.ambiente ?? 'Interior'}
                onChange={(e) => setEditandoProducto({ ...p, ambiente: e.target.value })}
              />
              <Select
                label="Acabado"
                options={ACABADOS}
                value={p.acabado ?? 'Mate'}
                onChange={(e) => setEditandoProducto({ ...p, acabado: e.target.value })}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">Imagen del producto</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed -mt-2">
              Es la foto que el cliente ve en la tienda. Puedes pegar la URL de una imagen que ya
              esté publicada o subir el archivo desde tu computador.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-full sm:w-40 shrink-0">
                <div className="aspect-square rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                  {p.imagenUrl ? (
                    /* Antes, al fallar la carga, la imagen se ocultaba con
                       `visibility: hidden` y quedaba un cuadro vacío sin
                       explicación: parecía que el producto no tenía foto
                       cuando lo que pasaba es que la URL no servía. */
                    <ImagenConRespaldo
                      src={p.imagenUrl}
                      alt={p.nombre ? `Imagen de ${p.nombre}` : 'Imagen del producto'}
                      className="w-full h-full object-cover"
                      avisarAlPersonal
                    />
                  ) : (
                    <Package className="w-8 h-8 text-slate-300" />
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-2.5">
                {/* Cargar por URL sigue siendo válido: la mayoría del
                    catálogo está así. El aviso solo ataja el error concreto de
                    pegar la página de resultados de un buscador en lugar de la
                    imagen, que es lo que dejó un producto con la foto rota. */}
                <Input
                  label="URL de la imagen"
                  type="url"
                  value={p.imagenUrl ?? ''}
                  onChange={(e) => {
                    setAvisoImagen(null);
                    setEditandoProducto({ ...p, imagenUrl: e.target.value || null });
                  }}
                  // Al salir del campo se INTENTA CARGAR la imagen. Es la única
                  // comprobación que no se puede engañar: ya se guardaron dos
                  // URL que eran páginas —una de Google Imágenes y una ficha de
                  // producto de pintuco.com.co— y las dos pasaban cualquier
                  // validación por patrón.
                  onBlur={async () => {
                    const url = (p.imagenUrl ?? '').trim();
                    if (url === '') { setAvisoImagen(null); return; }
                    setVerificandoImagen(true);
                    try {
                      const r = await verificarImagen(url);
                      setAvisoImagen(r.ok ? null : (r.aviso ?? 'La imagen no carga.'));
                    } finally {
                      setVerificandoImagen(false);
                    }
                  }}
                  placeholder="https://…"
                  error={avisoImagen ?? urlDeImagenSospechosa(p.imagenUrl ?? '') ?? undefined}
                />
                {verificandoImagen && (
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Comprobando la imagen…
                  </p>
                )}
                <input
                  ref={archivoImagen}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void subirImagen(f);
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={subiendo}
                    leftIcon={<ImagePlus className="w-3.5 h-3.5" />}
                    onClick={() => archivoImagen.current?.click()}
                  >
                    Subir archivo
                  </Button>
                  {p.imagenUrl && (
                    <button
                      type="button"
                      onClick={() => setEditandoProducto({ ...p, imagenUrl: null })}
                      className="text-[11px] font-semibold text-slate-500 hover:text-rose-600"
                    >
                      Quitar la imagen
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  JPG, PNG, WebP o AVIF, hasta 5 MB. Al subir un archivo la URL se llena sola;
                  el cambio queda publicado cuando guardes el producto.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">Datos técnicos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Rendimiento (m² por galón)"
                inputMode="decimal"
                value={p.rendimiento === null || p.rendimiento === undefined ? '' : String(p.rendimiento)}
                onChange={(e) =>
                  setEditandoProducto({
                    ...p,
                    rendimiento: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Ej. 40"
              />
              <Input
                label="Tiempo de secado"
                value={p.secado ?? ''}
                onChange={(e) => setEditandoProducto({ ...p, secado: e.target.value })}
                placeholder="Ej. 4 horas al tacto"
              />
            </div>
            <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
              El rendimiento alimenta la calculadora de galones del cliente. En una herramienta va
              en blanco: un rendimiento de cero haría dividir por cero al calcular.
            </p>

            <Select
              label="IVA"
              options={[
                { value: '19', label: '19 % — tarifa general' },
                { value: '5', label: '5 % — tarifa reducida' },
                { value: '0', label: '0 % — excluido' },
              ]}
              value={String(p.iva ?? 19)}
              onChange={(e) => setEditandoProducto({ ...p, iva: Number(e.target.value) })}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <Select
              label="Estado en la tienda"
              options={ESTADOS_CATALOGO.map((s) => ({ value: s, label: ETIQUETA_CATALOGO[s] }))}
              value={p.estado ?? 'ACTIVO'}
              onChange={(e) => setEditandoProducto({ ...p, estado: e.target.value as EstadoCatalogo })}
            />
            <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
              Solo lo <strong>publicado</strong> aparece en la tienda del cliente. Ocultar un
              producto no borra su historial ni su inventario.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditandoProducto(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="pintuco" isLoading={ocupado}>
              {p.id ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </div>
        </form>

        {/* Presentaciones */}
        {p.id && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Presentaciones y precios</h3>
              {escribe && (
                <button
                  onClick={() =>
                    setEditandoPres({ productId: p.id, estado: 'ACTIVO', orden: 0, precioTexto: '' })
                  }
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#004F9F] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {(productos.find((x) => x.id === p.id)?.presentaciones ?? []).map((v) => (
                <button
                  key={v.id}
                  onClick={() =>
                    escribe && setEditandoPres({ ...v, precioTexto: String(v.precio) })
                  }
                  disabled={!escribe}
                  className="w-full flex flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 disabled:cursor-default"
                >
                  <span className="text-sm font-semibold text-slate-900 flex-1">{v.label}</span>
                  {v.sku && <span className="text-xs text-slate-400">{v.sku}</span>}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COLOR_CATALOGO[v.estado]}`}>
                    {ETIQUETA_CATALOGO[v.estado]}
                  </span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    {formatearCOP(v.precio)}
                  </span>
                  {verCostos && (
                    <span className="text-xs text-slate-500 tabular-nums w-full sm:w-auto">
                      {v.costoPromedio !== null
                        ? `costo ${formatearCOP(v.costoPromedio)}`
                        : v.costoEstandar
                          ? `costo estándar ${formatearCOP(v.costoEstandar)}`
                          : 'sin costo'}
                      {v.margenPct !== null && ` · margen ${v.margenPct} %`}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {verCostos && (
              <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-100 leading-relaxed">
                El costo no se edita aquí: entra con la <strong>recepción de mercancía</strong>, que
                es donde se conoce de verdad. Lo que se ve es el promedio ponderado de las bodegas.
              </p>
            )}
          </div>
        )}

        {editandoPres && (
          <FormularioPresentacion
            valor={editandoPres}
            onCambiar={setEditandoPres}
            onGuardar={guardarPresentacion}
            onCerrar={() => setEditandoPres(null)}
            ocupado={ocupado}
          />
        )}
      </div>
    );
  }

  // ── Listado ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <IconoModulo nombre="Palette" /> Catálogo
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Lo que Pintuco vende y a qué precio. Es lo que el cliente ve en la tienda.
          </p>
        </div>
        {escribe && (
          <Button
            variant="pintuco"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => {
              if (pestana === 'productos') {
                setEditandoProducto({ estado: 'ACTIVO', iva: 19, ambiente: 'Interior', acabado: 'Mate' });
              } else if (pestana === 'categorias') {
                setEditandoCategoria({ nombre: '', orden: categorias.length, activa: true });
              } else {
                setEditandoColor({ estado: 'ACTIVO', hex: '#FFFFFF', familia: FAMILIAS_COLOR[0], enCarta: false });
              }
            }}
          >
            {pestana === 'productos'
              ? 'Nuevo producto'
              : pestana === 'categorias'
                ? 'Nueva categoría'
                : 'Nuevo color'}
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {([
          ['productos', 'Productos', Package],
          ['categorias', 'Categorías', FolderTree],
          ['colores', 'Colores', Palette],
        ] as const).map(
          ([clave, texto, Icono]) => (
            <button
              key={clave}
              onClick={() => setPestana(clave)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                pestana === clave
                  ? 'bg-[#004F9F] text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icono className="w-3.5 h-3.5" />
              {texto}
            </button>
          ),
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={
              pestana === 'productos'
                ? 'Buscar producto, código o SKU…'
                : pestana === 'categorias'
                  ? 'Buscar categoría…'
                  : 'Buscar color, código o familia…'
            }
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20 focus:border-[#004F9F]"
          />
        </div>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoCatalogo | 'TODOS')}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#004F9F]/20"
        >
          <option value="TODOS">Todos los estados</option>
          {ESTADOS_CATALOGO.map((s) => (
            <option key={s} value={s}>{ETIQUETA_CATALOGO[s]}</option>
          ))}
        </select>

        {/* Uno por pestaña: la lista de precios, la carta de colores y las
            categorías son tres documentos distintos que se piden por separado. */}
        <div className="ml-auto">
          {pestana === 'productos' && (
            <ExportarBoton<{ p: ProductoCatalogo; v: Presentacion }>
              filas={filasDePrecios}
              nombre="lista-de-precios"
              titulo="Lista de precios"
              filtros={[
                estado === 'TODOS' ? 'Todos los estados' : ETIQUETA_CATALOGO[estado],
                busqueda.trim() ? `Búsqueda: ${busqueda.trim()}` : null,
                `${productosFiltrados.length} productos`,
              ].filter(Boolean).join(' · ')}
              columnas={[
                { titulo: 'Código', valor: ({ p }) => p.codigo },
                { titulo: 'Producto', valor: ({ p }) => p.nombre },
                { titulo: 'Categoría', valor: ({ p }) => p.categoria },
                { titulo: 'Marca', valor: ({ p }) => p.marca },
                { titulo: 'Presentación', valor: ({ v }) => v.label },
                { titulo: 'SKU', valor: ({ v }) => v.sku },
                { titulo: 'Código de barras', valor: ({ v }) => v.barcode },
                { titulo: 'Litros', valor: ({ v }) => v.volumenLitros, numerica: true },
                { titulo: 'Precio', valor: ({ v }) => v.precio, numerica: true },
                { titulo: 'IVA (%)', valor: ({ p }) => p.iva, numerica: true },
                { titulo: 'Acabado', valor: ({ p }) => p.acabado },
                { titulo: 'Ambiente', valor: ({ p }) => p.ambiente },
                { titulo: 'Rendimiento (m²/gal)', valor: ({ p }) => p.rendimiento, numerica: true },
                { titulo: 'Estado', valor: ({ v }) => v.estado },
                // Solo para quien puede ver costos. Ver la nota de `conCostos`.
                ...(conCostos ? [
                  { titulo: 'Costo estándar', valor: ({ v }: { v: Presentacion }) => v.costoEstandar, numerica: true },
                  { titulo: 'Costo promedio', valor: ({ v }: { v: Presentacion }) => v.costoPromedio, numerica: true },
                  { titulo: 'Margen (%)', valor: ({ v }: { v: Presentacion }) => v.margenPct, numerica: true },
                ] : []),
              ]}
            />
          )}

          {pestana === 'colores' && (
            <ExportarBoton<ColorCatalogo>
              filas={coloresFiltrados}
              nombre="carta-de-colores"
              titulo="Carta de colores"
              filtros={busqueda.trim() ? `Búsqueda: ${busqueda.trim()}` : 'Todos'}
              columnas={[
                { titulo: 'Código', valor: (c) => c.codigo },
                { titulo: 'Nombre', valor: (c) => c.nombre },
                { titulo: 'Familia', valor: (c) => c.familia },
                { titulo: 'Hex', valor: (c) => c.hex },
                { titulo: 'RGB', valor: (c) => c.rgb },
                { titulo: 'En carta', valor: (c) => (c.enCarta ? 'Sí' : 'No') },
                { titulo: 'Producto recomendado', valor: (c) => c.productoRecomendado },
              ]}
            />
          )}

          {pestana === 'categorias' && (
            <ExportarBoton<CategoriaCatalogo>
              filas={categoriasFiltradas}
              nombre="categorias"
              titulo="Categorías del catálogo"
              filtros={busqueda.trim() ? `Búsqueda: ${busqueda.trim()}` : 'Todas'}
              columnas={[
                { titulo: 'Nombre', valor: (c) => c.nombre },
                { titulo: 'Slug', valor: (c) => c.slug },
                { titulo: 'Descripción', valor: (c) => c.descripcion },
                { titulo: 'Orden', valor: (c) => c.orden, numerica: true },
                { titulo: 'Productos', valor: (c) => c.productos, numerica: true },
                { titulo: 'Activa', valor: (c) => (c.activa ? 'Sí' : 'No') },
              ]}
            />
          )}
        </div>
      </div>

      {cargando ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-sm text-slate-400 text-center py-14">Cargando catálogo…</p>
        </div>
      ) : pestana === 'productos' ? (
        <div className="space-y-3">
          {grupos.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-sm text-slate-400 text-center py-14">Ningún producto coincide.</p>
            </div>
          ) : (
            grupos.map((grupo) => {
              const plegado = plegadas.has(grupo.nombre);
              return (
                <div
                  key={grupo.nombre}
                  className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden"
                >
                  <button
                    onClick={() => alternarGrupo(grupo.nombre)}
                    aria-expanded={!plegado}
                    className="w-full flex items-center gap-2.5 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                  >
                    {plegado ? (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span
                      className={`text-sm font-extrabold ${
                        grupo.nombre === SIN_CATEGORIA ? 'text-amber-700' : 'text-slate-900'
                      }`}
                    >
                      {grupo.nombre}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 tabular-nums">
                      {grupo.items.length}
                    </span>
                    {grupo.nombre === SIN_CATEGORIA && (
                      <span className="text-[11px] text-amber-600 font-medium">
                        el cliente no los encuentra navegando por categorías
                      </span>
                    )}
                  </button>

                  {!plegado && (
                    <div className="overflow-x-auto border-t border-slate-100">
                      <table className="w-full text-sm min-w-[760px]">
                        <thead>
                          <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                            <th className="text-left px-5 py-2.5">Producto</th>
                            <th className="text-left px-3 py-2.5">Marca</th>
                            <th className="text-right px-3 py-2.5">Presentaciones</th>
                            <th className="text-right px-3 py-2.5">Desde</th>
                            <th className="text-left px-5 py-2.5">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.items.map((p) => {
                            const desde = p.presentaciones.length
                              ? Math.min(...p.presentaciones.map((v) => v.precio))
                              : null;
                            return (
                              <tr
                                key={p.id}
                                onClick={() => setEditandoProducto(p)}
                                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                              >
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                                      {p.imagenUrl ? (
                                        <ImagenConRespaldo
                                          src={p.imagenUrl}
                                          alt=""
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <Package className="w-4 h-4 text-slate-300" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-slate-900 truncate">{p.nombre}</p>
                                      <p className="text-xs text-slate-500">
                                        {p.codigo}
                                        {p.acabado ? ` · ${p.acabado}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-slate-600 text-xs">{p.marca ?? '—'}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                                  {p.presentaciones.length}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums font-semibold">
                                  {desde === null ? '—' : formatearCOP(desde)}
                                </td>
                                <td className="px-5 py-3">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COLOR_CATALOGO[p.estado]}`}>
                                    {ETIQUETA_CATALOGO[p.estado]}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : pestana === 'categorias' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <p className="px-5 py-3 text-[11px] text-slate-500 border-b border-slate-100 leading-relaxed">
            Las categorías son como el cliente navega la tienda. El orden es el que verá en
            pantalla, y una categoría oculta deja de aparecer aunque sus productos sigan publicados.
          </p>
          {categoriasFiltradas.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-14">Ninguna categoría coincide.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {categoriasFiltradas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => escribe && setEditandoCategoria(c)}
                  disabled={!escribe}
                  className="w-full flex flex-wrap items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 disabled:cursor-default transition-colors"
                >
                  <span className="text-[11px] font-bold text-slate-400 tabular-nums w-6 shrink-0">
                    {c.orden}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-bold text-slate-900 block truncate">{c.nombre}</span>
                    {c.descripcion && (
                      <span className="text-xs text-slate-500 block truncate">{c.descripcion}</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {c.productos} {c.productos === 1 ? 'producto' : 'productos'}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      c.activa
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {c.activa ? 'Visible' : 'Oculta'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {coloresFiltrados.map((c) => (
            <button
              key={c.id}
              onClick={() => escribe && setEditandoColor(c)}
              disabled={!escribe}
              className="text-left bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-[#004F9F] transition-all overflow-hidden disabled:cursor-default"
            >
              <div className="h-20 w-full border-b border-slate-100" style={{ backgroundColor: c.hex }} />
              <div className="p-3.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{c.nombre}</p>
                    <p className="text-[11px] text-slate-500">{c.codigo} · {c.hex}</p>
                  </div>
                  {c.enCarta && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                      CARTA
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COLOR_CATALOGO[c.estado]}`}>
                    {ETIQUETA_CATALOGO[c.estado]}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">{c.familia}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {editandoCategoria && (
        <Marco
          titulo={editandoCategoria.id ? 'Editar categoría' : 'Nueva categoría'}
          onCerrar={() => setEditandoCategoria(null)}
        >
          <form onSubmit={guardarCategoria} className="space-y-4">
            <Input
              label="Nombre"
              value={editandoCategoria.nombre ?? ''}
              onChange={(e) =>
                setEditandoCategoria({ ...editandoCategoria, nombre: e.target.value })
              }
              placeholder="Ej. Pinturas de exterior"
              required
            />
            <Input
              label="Descripción"
              value={editandoCategoria.descripcion ?? ''}
              onChange={(e) =>
                setEditandoCategoria({ ...editandoCategoria, descripcion: e.target.value })
              }
              placeholder="Una línea que le diga al cliente qué encuentra aquí"
            />
            <Input
              label="Orden en la tienda"
              inputMode="numeric"
              value={String(editandoCategoria.orden ?? 0)}
              onChange={(e) =>
                setEditandoCategoria({
                  ...editandoCategoria,
                  orden: e.target.value === '' ? 0 : Number(e.target.value),
                })
              }
            />
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={editandoCategoria.activa !== false}
                onChange={(e) =>
                  setEditandoCategoria({ ...editandoCategoria, activa: e.target.checked })
                }
                className="mt-0.5 rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F]"
              />
              <span className="text-xs leading-relaxed">
                <span className="font-bold text-slate-800 block">Visible en la tienda</span>
                <span className="text-slate-500">
                  Al ocultarla, sus productos dejan de aparecer al navegar por categorías.
                </span>
              </span>
            </label>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setEditandoCategoria(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="pintuco" isLoading={ocupado}>
                {editandoCategoria.id ? 'Guardar cambios' : 'Crear categoría'}
              </Button>
            </div>
          </form>
        </Marco>
      )}

      {editandoColor && (
        <FormularioColor
          valor={editandoColor}
          onCambiar={setEditandoColor}
          onGuardar={guardarColor}
          onCerrar={() => setEditandoColor(null)}
          ocupado={ocupado}
        />
      )}
    </div>
  );
};

// ============================================================
// Formularios
// ============================================================
const Marco: React.FC<{ titulo: string; onCerrar: () => void; children: React.ReactNode }> = ({
  titulo, onCerrar, children,
}) => (
  <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4 py-8 overflow-y-auto">
    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-extrabold text-slate-900">{titulo}</h3>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const FormularioPresentacion: React.FC<{
  valor: Partial<Presentacion> & { precioTexto?: string };
  onCambiar: (v: Partial<Presentacion> & { precioTexto?: string }) => void;
  onGuardar: (e: React.FormEvent) => void;
  onCerrar: () => void;
  ocupado: boolean;
}> = ({ valor, onCambiar, onGuardar, onCerrar, ocupado }) => (
  <Marco titulo={valor.id ? 'Editar presentación' : 'Nueva presentación'} onCerrar={onCerrar}>
    <form onSubmit={onGuardar} className="space-y-4 text-left">
      <Input
        label="Presentación"
        value={valor.label ?? ''}
        onChange={(e) => onCambiar({ ...valor, label: e.target.value })}
        placeholder="Ej. 1 Galón (3.785 L)"
        required
        leftIcon={<Tag className="w-4 h-4" />}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="SKU"
          value={valor.sku ?? ''}
          onChange={(e) => onCambiar({ ...valor, sku: e.target.value })}
          placeholder="PNT-EXT-001-V1"
        />
        <Input
          label="Precio al cliente"
          inputMode="decimal"
          value={valor.precioTexto ?? ''}
          onChange={(e) => onCambiar({ ...valor, precioTexto: e.target.value })}
          placeholder="142900"
          required
        />
      </div>
      <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
        Es el precio de venta, IVA incluido. El costo no se escribe aquí: entra con la recepción de
        mercancía.
      </p>
      <Select
        label="Estado"
        options={ESTADOS_CATALOGO.map((s) => ({ value: s, label: ETIQUETA_CATALOGO[s] }))}
        value={valor.estado ?? 'ACTIVO'}
        onChange={(e) => onCambiar({ ...valor, estado: e.target.value as EstadoCatalogo })}
      />
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
        <Button type="submit" variant="pintuco" isLoading={ocupado}>Guardar</Button>
      </div>
    </form>
  </Marco>
);

const FormularioColor: React.FC<{
  valor: Partial<ColorCatalogo>;
  onCambiar: (v: Partial<ColorCatalogo>) => void;
  onGuardar: (e: React.FormEvent) => void;
  onCerrar: () => void;
  ocupado: boolean;
}> = ({ valor, onCambiar, onGuardar, onCerrar, ocupado }) => (
  <Marco titulo={valor.id ? 'Editar color' : 'Nuevo color'} onCerrar={onCerrar}>
    <form onSubmit={onGuardar} className="space-y-4 text-left">
      <div className="flex items-center gap-3">
        <div
          className="w-16 h-16 rounded-xl border border-slate-200 shrink-0"
          style={{ backgroundColor: valor.hex ?? '#FFFFFF' }}
        />
        <div className="flex-1 space-y-2">
          <Input
            label="Código"
            value={valor.codigo ?? ''}
            onChange={(e) => onCambiar({ ...valor, codigo: e.target.value.toUpperCase() })}
            placeholder="PNT-101"
            required
          />
          <Input
            label="Hexadecimal"
            value={valor.hex ?? ''}
            onChange={(e) => onCambiar({ ...valor, hex: e.target.value.toUpperCase() })}
            placeholder="#F5F3EF"
            required
          />
        </div>
      </div>
      <p className="text-[11px] text-slate-400 -mt-2 leading-relaxed">
        El RGB se calcula solo a partir del hexadecimal. Tenerlos por separado garantizaba que
        tarde o temprano dijeran colores distintos, y ya pasó en la carta original.
      </p>

      <Input
        label="Nombre"
        value={valor.nombre ?? ''}
        onChange={(e) => onCambiar({ ...valor, nombre: e.target.value })}
        placeholder="Blanco Absoluto"
        required
      />

      <Select
        label="Familia"
        options={[...FAMILIAS_COLOR]}
        value={valor.familia ?? FAMILIAS_COLOR[0]}
        onChange={(e) => onCambiar({ ...valor, familia: e.target.value })}
      />

      <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer">
        <input
          type="checkbox"
          checked={valor.enCarta ?? false}
          onChange={(e) => onCambiar({ ...valor, enCarta: e.target.checked })}
          className="mt-0.5 rounded border-slate-300 text-[#004F9F] focus:ring-[#004F9F]"
        />
        <span className="text-xs leading-relaxed">
          <span className="font-bold text-slate-800 block">Incluir en la carta de color</span>
          <span className="text-slate-500">
            Aparece en «Encuentra tu color». Los que no están en la carta se pueden preparar, pero
            no se muestran como sugerencia.
          </span>
        </span>
      </label>

      <Select
        label="Estado"
        options={ESTADOS_CATALOGO.map((s) => ({ value: s, label: ETIQUETA_CATALOGO[s] }))}
        value={valor.estado ?? 'ACTIVO'}
        onChange={(e) => onCambiar({ ...valor, estado: e.target.value as EstadoCatalogo })}
      />

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
        <Button type="submit" variant="pintuco" isLoading={ocupado}>Guardar</Button>
      </div>
    </form>
  </Marco>
);
