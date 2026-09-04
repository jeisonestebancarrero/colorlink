import { supabase } from '../lib/supabase';

/**
 * Catálogo y recepción de mercancía — administración.
 *
 * Toda la escritura pasa por funciones del servidor y no por PATCH directo.
 * No es preferencia de estilo: desde que el costo dejó de ser una columna
 * pública, nadie tiene SELECT sobre `product_variants` completa, y PostgREST
 * necesita ese SELECT para devolver la fila que acaba de modificar. Con
 * funciones eso deja de importar y, de paso, las validaciones viven en un
 * solo sitio.
 */

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[catalogo] ${contexto}:`, error.message);
  const m = error.message ?? '';
  if (/FORBIDDEN/.test(m)) return new Error('No tienes permiso para esta operación.');
  if (/CAMPOS_OBLIGATORIOS/.test(m)) {
    const detalle = m.split('CAMPOS_OBLIGATORIOS:')[1]?.split('\n')[0]?.trim();
    return new Error(detalle || 'Faltan campos obligatorios.');
  }
  if (/CODIGO_DUPLICADO/.test(m)) return new Error('Ya existe otro registro con ese código.');
  if (/SKU_DUPLICADO/.test(m)) return new Error('Ya existe otra presentación con ese SKU.');
  if (/PRECIO_INVALIDO/.test(m)) return new Error('El precio debe ser mayor que cero.');
  if (/IVA_INVALIDO/.test(m)) return new Error('El IVA debe ser 0 %, 5 % o 19 %.');
  if (/HEX_INVALIDO/.test(m)) return new Error('El color debe ir en formato #RRGGBB.');
  if (/BAD_COST/.test(m)) return new Error('El costo no puede ser negativo.');
  if (/YA_PROCESADA/.test(m)) return new Error('Esta recepción ya fue procesada.');
  if (/YA_CONFIRMADA/.test(m)) {
    return new Error(
      'Una recepción confirmada no se anula. Si llegó mercancía de menos, corrígelo con un ajuste por conteo.',
    );
  }
  if (/SIN_LINEAS/.test(m)) return new Error('Agrega al menos un producto antes de confirmar.');
  if (/SIN_BODEGA/.test(m)) return new Error('Indica a qué punto de venta llega la mercancía.');
  if (/NOMBRE_DUPLICADO/.test(m)) return new Error('Ya existe una categoría con ese nombre.');
  if (/TIPO_INVALIDO/.test(m)) return new Error('Ese tipo de categoría no es válido.');
  if (/exceeded the maximum allowed size|Payload too large/i.test(m)) {
    return new Error('La imagen pesa más de 5 MB. Usa una más liviana.');
  }
  if (/mime type|not allowed/i.test(m)) {
    return new Error('Formato no admitido. Usa JPG, PNG, WebP o AVIF.');
  }
  if (/NOT_FOUND/.test(m)) return new Error('Ese registro ya no existe.');
  return new Error('No fue posible completar la operación. Inténtalo nuevamente.');
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const formatearCOP = (n: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
    .format(n);

// ============================================================
// CATÁLOGO
// ============================================================
export const ESTADOS_CATALOGO = ['ACTIVO', 'INACTIVO', 'DESCONTINUADO'] as const;
export type EstadoCatalogo = (typeof ESTADOS_CATALOGO)[number];

export const ETIQUETA_CATALOGO: Record<EstadoCatalogo, string> = {
  ACTIVO: 'Publicado',
  INACTIVO: 'Oculto',
  DESCONTINUADO: 'Descontinuado',
};

export const COLOR_CATALOGO: Record<EstadoCatalogo, string> = {
  ACTIVO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INACTIVO: 'bg-slate-100 text-slate-600 border-slate-200',
  DESCONTINUADO: 'bg-rose-50 text-rose-700 border-rose-200',
};

export interface Presentacion {
  id: string;
  productId: string;
  label: string;
  sku: string | null;
  barcode: string | null;
  precio: number;
  volumenLitros: number | null;
  unidad: string | null;
  orden: number;
  estado: EstadoCatalogo;
  /** Solo llega si la persona tiene el permiso costs.read. */
  costoEstandar: number | null;
  costoPromedio: number | null;
  margenPct: number | null;
}

export interface ProductoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  lema: string | null;
  descripcion: string | null;
  categoria: string | null;
  categoriaId: string | null;
  marca: string | null;
  marcaId: string | null;
  ambiente: string | null;
  acabado: string | null;
  rendimiento: number | null;
  secado: string | null;
  cobertura: string | null;
  imagenUrl: string | null;
  fichaUrl: string | null;
  distintivo: string | null;
  iva: number;
  estado: EstadoCatalogo;
  presentaciones: Presentacion[];
}

const SELECT_PRODUCTO = `
  id, code, name, tagline, description, brand_id, category_id, environment,
  finish, coverage, spread_rate_m2_per_gal, drying_time, image_url,
  tech_sheet_url, badge, tax_rate, status,
  brands ( name ), categories ( name ),
  product_variants ( id, product_id, label, sku, barcode, price_cop, volume_liters, unit, sort_order, status )
`;

export const catalogoService = {
  async productos(): Promise<ProductoCatalogo[]> {
    const { data, error } = await supabase
      .from('products')
      .select(SELECT_PRODUCTO)
      .order('name');
    if (error) throw errorLegible('productos', error);

    // Los costos llegan por una vista aparte: la columna es confidencial y
    // solo la ve quien tiene el permiso. Si no lo tiene, la consulta
    // devuelve vacío y la pantalla simplemente no muestra esa columna.
    const costos = new Map<string, { estandar: number | null; promedio: number | null; margen: number | null }>();
    const { data: filasCosto } = await supabase
      .from('v_costos_catalogo')
      .select('variant_id, costo_estandar, costo_promedio, margen_pct');
    for (const c of (filasCosto ?? []) as unknown as Array<Record<string, unknown>>) {
      costos.set(String(c.variant_id), {
        estandar: c.costo_estandar === null ? null : num(c.costo_estandar),
        promedio: c.costo_promedio === null ? null : num(c.costo_promedio),
        margen: c.margen_pct === null ? null : num(c.margen_pct),
      });
    }

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      codigo: String(p.code ?? ''),
      nombre: String(p.name ?? ''),
      lema: (p.tagline as string) ?? null,
      descripcion: (p.description as string) ?? null,
      categoria: (p.categories as { name?: string } | null)?.name ?? null,
      categoriaId: (p.category_id as string) ?? null,
      marca: (p.brands as { name?: string } | null)?.name ?? null,
      marcaId: (p.brand_id as string) ?? null,
      ambiente: (p.environment as string) ?? null,
      acabado: (p.finish as string) ?? null,
      rendimiento: p.spread_rate_m2_per_gal === null ? null : num(p.spread_rate_m2_per_gal),
      secado: (p.drying_time as string) ?? null,
      cobertura: (p.coverage as string) ?? null,
      imagenUrl: (p.image_url as string) ?? null,
      fichaUrl: (p.tech_sheet_url as string) ?? null,
      distintivo: (p.badge as string) ?? null,
      iva: num(p.tax_rate ?? 19),
      estado: (p.status as EstadoCatalogo) ?? 'ACTIVO',
      presentaciones: ((p.product_variants ?? []) as Array<Record<string, unknown>>)
        .map((v) => {
          const c = costos.get(String(v.id));
          return {
            id: String(v.id),
            productId: String(v.product_id),
            label: String(v.label ?? ''),
            sku: (v.sku as string) ?? null,
            barcode: (v.barcode as string) ?? null,
            precio: num(v.price_cop),
            volumenLitros: v.volume_liters === null ? null : num(v.volume_liters),
            unidad: (v.unit as string) ?? null,
            orden: num(v.sort_order),
            estado: (v.status as EstadoCatalogo) ?? 'ACTIVO',
            costoEstandar: c?.estandar ?? null,
            costoPromedio: c?.promedio ?? null,
            margenPct: c?.margen ?? null,
          };
        })
        .sort((a, b) => a.orden - b.orden || a.label.localeCompare(b.label, 'es')),
    }));
  },

  /** ¿Esta persona puede ver costos? Se deduce de si la vista devuelve algo. */
  async puedeVerCostos(): Promise<boolean> {
    const { data, error } = await supabase
      .from('v_costos_catalogo')
      .select('variant_id')
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  },

  async guardarProducto(datos: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_product', { _datos: datos });
    if (error) throw errorLegible('guardarProducto', error);
    return String(data);
  },

  async guardarPresentacion(datos: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_variant', { _datos: datos });
    if (error) throw errorLegible('guardarPresentacion', error);
    return String(data);
  },

  async fijarCostoEstandar(variantId: string, costo: number): Promise<void> {
    const { error } = await supabase.rpc('set_standard_cost', {
      _variant_id: variantId,
      _costo: costo,
    });
    if (error) throw errorLegible('fijarCostoEstandar', error);
  },

  /**
   * Sube la imagen de un producto y devuelve su URL pública.
   *
   * El nombre lleva marca de tiempo: reutilizarlo haría que navegadores y CDN
   * siguieran mostrando la imagen vieja y pareciera que no se guardó.
   */
  async subirImagen(archivo: File, codigo: string): Promise<string> {
    const extension = (archivo.name.split('.').pop() ?? 'jpg').toLowerCase();
    const limpio = (codigo || 'producto').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40);
    const ruta = `${limpio}-${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from('productos')
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
    if (error) throw errorLegible('subirImagen', error);

    const { data } = supabase.storage.from('productos').getPublicUrl(ruta);
    return data.publicUrl;
  },

  async referencias(): Promise<{
    marcas: Array<{ id: string; nombre: string }>;
    categorias: Array<{ id: string; nombre: string }>;
  }> {
    const [marcas, categorias] = await Promise.all([
      supabase.from('brands').select('id, name').order('name'),
      // Solo las categorías de PRODUCTO. Las de SOLUTION agrupan los kits, y
      // clasificar un producto en una de ellas lo saca de su sección en la
      // tienda sin que nadie entienda por qué.
      // …y solo las hijas: la raíz del árbol ('Catálogo Pintuco') no es una
      // sección de la tienda, así que un producto colgado ahí no aparecería
      // bajo ningún filtro.
      supabase
        .from('categories')
        .select('id, name')
        .eq('kind', 'PRODUCT')
        .eq('status', 'ACTIVO')
        .not('parent_id', 'is', null)
        .order('sort_order')
        .order('name'),
    ]);
    return {
      marcas: ((marcas.data ?? []) as Array<{ id: string; name: string }>).map((m) => ({
        id: m.id,
        nombre: m.name,
      })),
      categorias: ((categorias.data ?? []) as Array<{ id: string; name: string }>).map((c) => ({
        id: c.id,
        nombre: c.name,
      })),
    };
  },
};

// ============================================================
// CATEGORÍAS
// ============================================================
export interface CategoriaCatalogo {
  id: string;
  nombre: string;
  slug: string | null;
  descripcion: string | null;
  orden: number;
  activa: boolean;
  productos: number;
}

export const categoriaService = {
  /** Categorías de producto, con cuántos productos tiene cada una. */
  async listar(): Promise<CategoriaCatalogo[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug, description, sort_order, status, products(id)')
      .eq('kind', 'PRODUCT')
      .not('parent_id', 'is', null)
      .order('sort_order')
      .order('name');
    if (error) throw errorLegible('categorias', error);

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((c) => ({
      id: String(c.id),
      nombre: String(c.name ?? ''),
      slug: (c.slug as string) ?? null,
      descripcion: (c.description as string) ?? null,
      orden: num(c.sort_order),
      activa: c.status === 'ACTIVO',
      productos: ((c.products ?? []) as unknown[]).length,
    }));
  },

  async guardar(datos: {
    id?: string;
    nombre: string;
    descripcion?: string;
    orden?: number;
    activa?: boolean;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_category', {
      _datos: {
        id: datos.id ?? null,
        name: datos.nombre,
        kind: 'PRODUCT',
        description: datos.descripcion ?? null,
        sort_order: datos.orden ?? 0,
        status: datos.activa === false ? 'INACTIVO' : 'ACTIVO',
      },
    });
    if (error) throw errorLegible('guardarCategoria', error);
    return String(data);
  },
};

// ============================================================
// COLORES
// ============================================================
export const FAMILIAS_COLOR = [
  'Blancos & Neutros', 'Cálidos & Tierras', 'Azules & Frescos',
  'Verdes & Naturales', 'Vibrantes & Acentos', 'Tendencias 2025',
] as const;

export interface ColorCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  hex: string;
  rgb: string | null;
  familia: string;
  descripcion: string | null;
  productoRecomendado: string | null;
  enCarta: boolean;
  estado: EstadoCatalogo;
}

export const colorService = {
  async listar(): Promise<ColorCatalogo[]> {
    const { data, error } = await supabase
      .from('colors')
      .select('id, code, name, hex, rgb, family, description, recommended_product, is_palette, status')
      .order('code');
    if (error) throw errorLegible('colores', error);

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((c) => ({
      id: String(c.id),
      codigo: String(c.code ?? ''),
      nombre: String(c.name ?? ''),
      hex: String(c.hex ?? '#000000'),
      rgb: (c.rgb as string) ?? null,
      familia: String(c.family ?? ''),
      descripcion: (c.description as string) ?? null,
      productoRecomendado: (c.recommended_product as string) ?? null,
      enCarta: Boolean(c.is_palette),
      estado: (c.status as EstadoCatalogo) ?? 'ACTIVO',
    }));
  },

  async guardar(datos: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_color', { _datos: datos });
    if (error) throw errorLegible('guardarColor', error);
    return String(data);
  },
};

// ============================================================
// RECEPCIÓN DE MERCANCÍA
// ============================================================
export type EstadoRecepcion = 'BORRADOR' | 'CONFIRMADA' | 'ANULADA';

export const ETIQUETA_RECEPCION: Record<EstadoRecepcion, string> = {
  BORRADOR: 'Borrador',
  CONFIRMADA: 'Confirmada',
  ANULADA: 'Anulada',
};

export const COLOR_RECEPCION: Record<EstadoRecepcion, string> = {
  BORRADOR: 'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ANULADA: 'bg-slate-100 text-slate-500 border-slate-200',
};

export interface Proveedor {
  id: string;
  nit: string | null;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  activo: boolean;
}

export interface LineaRecepcion {
  id: string;
  variantId: string;
  producto: string;
  presentacion: string;
  sku: string | null;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

export interface Recepcion {
  id: string;
  numero: string;
  proveedor: string | null;
  proveedorId: string | null;
  punto: string;
  puntoId: string;
  documento: string | null;
  fecha: string;
  estado: EstadoRecepcion;
  notas: string | null;
  total: number;
  creadaPor: string | null;
  confirmadaPor: string | null;
  lineas: LineaRecepcion[];
}

const SELECT_RECEPCION = `
  id, receipt_number, supplier_id, location_id, document_ref, received_on,
  status, notes, total_cop,
  suppliers ( name ),
  pickup_locations ( name ),
  creador:created_by ( first_name, last_name ),
  confirmador:confirmed_by ( first_name, last_name ),
  purchase_receipt_items (
    id, variant_id, quantity, unit_cost_cop, subtotal_cop,
    product_variants ( label, sku, products ( name ) )
  )
`;

const aRecepcion = (r: Record<string, unknown>): Recepcion => {
  const nombre = (p: unknown) => {
    const x = p as { first_name?: string; last_name?: string } | null;
    return x ? `${x.first_name ?? ''} ${x.last_name ?? ''}`.trim() : null;
  };
  return {
    id: String(r.id),
    numero: String(r.receipt_number ?? ''),
    proveedor: (r.suppliers as { name?: string } | null)?.name ?? null,
    proveedorId: (r.supplier_id as string) ?? null,
    punto: (r.pickup_locations as { name?: string } | null)?.name ?? '—',
    puntoId: String(r.location_id),
    documento: (r.document_ref as string) ?? null,
    fecha: String(r.received_on),
    estado: (r.status as EstadoRecepcion) ?? 'BORRADOR',
    notas: (r.notes as string) ?? null,
    total: num(r.total_cop),
    creadaPor: nombre(r.creador),
    confirmadaPor: nombre(r.confirmador),
    lineas: ((r.purchase_receipt_items ?? []) as Array<Record<string, unknown>>).map((l) => {
      const v = l.product_variants as
        | { label?: string; sku?: string; products?: { name?: string } | null }
        | null;
      return {
        id: String(l.id),
        variantId: String(l.variant_id),
        producto: v?.products?.name ?? '—',
        presentacion: v?.label ?? '',
        sku: v?.sku ?? null,
        cantidad: num(l.quantity),
        costoUnitario: num(l.unit_cost_cop),
        subtotal: num(l.subtotal_cop),
      };
    }),
  };
};

export const recepcionService = {
  async listar(): Promise<Recepcion[]> {
    const { data, error } = await supabase
      .from('purchase_receipts')
      .select(SELECT_RECEPCION)
      .order('created_at', { ascending: false });
    if (error) throw errorLegible('recepciones', error);
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(aRecepcion);
  },

  async detalle(id: string): Promise<Recepcion> {
    const { data, error } = await supabase
      .from('purchase_receipts')
      .select(SELECT_RECEPCION)
      .eq('id', id)
      .maybeSingle();
    if (error) throw errorLegible('detalleRecepcion', error);
    if (!data) throw new Error('Esa recepción ya no existe.');
    return aRecepcion(data as unknown as Record<string, unknown>);
  },

  async crear(datos: {
    puntoId: string;
    proveedorId?: string;
    documento?: string;
    fecha?: string;
    notas?: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('create_purchase_receipt', {
      _location_id: datos.puntoId,
      _supplier_id: datos.proveedorId ?? null,
      _document_ref: datos.documento ?? null,
      _received_on: datos.fecha ?? null,
      _notes: datos.notas ?? null,
    });
    if (error) throw errorLegible('crearRecepcion', error);
    return String(data);
  },

  async agregarLinea(datos: {
    recepcionId: string;
    variantId: string;
    cantidad: number;
    costoUnitario: number;
  }): Promise<void> {
    const { error } = await supabase.from('purchase_receipt_items').insert({
      receipt_id: datos.recepcionId,
      variant_id: datos.variantId,
      quantity: datos.cantidad,
      unit_cost_cop: datos.costoUnitario,
      subtotal_cop: datos.cantidad * datos.costoUnitario,
    });
    if (error) {
      if (/una_linea_por_variante/.test(error.message)) {
        throw new Error('Esa presentación ya está en la recepción. Edita su cantidad.');
      }
      throw errorLegible('agregarLinea', error);
    }
  },

  async quitarLinea(lineaId: string): Promise<void> {
    const { error } = await supabase.from('purchase_receipt_items').delete().eq('id', lineaId);
    if (error) throw errorLegible('quitarLinea', error);
  },

  async confirmar(id: string): Promise<{ lineas: number; total: number }> {
    const { data, error } = await supabase.rpc('confirm_purchase_receipt', { _receipt_id: id });
    if (error) throw errorLegible('confirmar', error);
    const r = data as { lineas: number; total: number };
    return { lineas: num(r.lineas), total: num(r.total) };
  },

  async anular(id: string): Promise<void> {
    const { error } = await supabase.rpc('void_purchase_receipt', { _receipt_id: id });
    if (error) throw errorLegible('anular', error);
  },
};

export const proveedorService = {
  async listar(): Promise<Proveedor[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, nit, name, contact, phone, email, city, status')
      .order('name');
    if (error) throw errorLegible('proveedores', error);
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      nit: (p.nit as string) ?? null,
      nombre: String(p.name ?? ''),
      contacto: (p.contact as string) ?? null,
      telefono: (p.phone as string) ?? null,
      email: (p.email as string) ?? null,
      ciudad: (p.city as string) ?? null,
      activo: p.status === 'ACTIVO',
    }));
  },

  async guardar(p: { id?: string; nombre: string; nit?: string; telefono?: string; email?: string; ciudad?: string; contacto?: string }): Promise<void> {
    const fila = {
      name: p.nombre,
      nit: p.nit || null,
      phone: p.telefono || null,
      email: p.email || null,
      city: p.ciudad || null,
      contact: p.contacto || null,
    };
    const { error } = p.id
      ? await supabase.from('suppliers').update(fila).eq('id', p.id)
      : await supabase.from('suppliers').insert(fila);
    if (error) {
      if (/suppliers_nit_key/.test(error.message)) {
        throw new Error('Ya existe un proveedor con ese NIT.');
      }
      throw errorLegible('guardarProveedor', error);
    }
  },
};

/* ══════════════════════════════════════════════════════════════════
   KITS DE SOLUCIÓN
   ══════════════════════════════════════════════════════════════════
   Un kit es catálogo, no una entidad aparte: se arma con los productos y
   presentaciones que YA existen y están activos.

   Por qué el paso guarda `variant_id` y no una etiqueta escrita a mano: cinco
   de los once pasos sembrados llevaban etiquetas y precios inventados
   —«Pack Completo Obra» a $64.700, «2 Cuñetes» cotizados como uno— y la
   tienda los mostraba tal cual. Con la presentación enlazada, el precio sale
   del catálogo y no puede volver a separarse.

   Y no hay copia intermedia: la tienda lee las MISMAS tablas, así que lo que
   se cambie aquí lo ve el cliente en cuanto recarga. Si se archiva un kit,
   desaparece; si sube el precio de una presentación, el kit lo refleja solo.
   ══════════════════════════════════════════════════════════════════ */

export interface PasoKit {
  id?: string;
  stepNumber: number;
  fase: string;
  productId: string;
  variantId: string | null;
  /** Solo lectura: se muestran para armar el paso. */
  productoNombre?: string;
  presentacion?: string;
  precioCop?: number;
  cantidad85m2: number;
  descripcionRol: string;
  /**
   * Imagen propia del paso. Si va vacía, la tienda cae a la del producto: un
   * paso sin foto propia no debe salir con el hueco roto.
   */
  imagen?: string | null;
  /** Solo lectura: la del producto, para saber qué se ve si no se sube nada. */
  imagenProducto?: string | null;
}

export interface KitCatalogo {
  id: string;
  nombre: string;
  subtitulo: string | null;
  descripcion: string | null;
  problema: string | null;
  garantia: string | null;
  descuento: number;
  imagen: string | null;
  categoriaId: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
  pasos: PasoKit[];
  /** Suma de los pasos con el precio real del catálogo, antes del descuento. */
  totalSinDescuento: number;
}

/** Las fases válidas salen del enum `solution_phase` de la base. */
export const FASES_KIT = ['Preparación', 'Sellado', 'Acabado', 'Aplicación', 'Herramienta'] as const;

interface FilaKit {
  id: string; name: string; subtitle: string | null; description: string | null;
  problem_target: string | null; warranty: string | null;
  discount_percent: string | number; image_url: string | null;
  category_id: string | null; status: 'ACTIVO' | 'INACTIVO';
  solution_products: Array<{
    id: string; step_number: number; phase: string | null;
    product_id: string; variant_id: string | null;
    quantity_for_85m2: string | number | null; role_description: string | null;
    image_url: string | null;
    products: { name: string; image_url: string | null } | null;
    product_variants: { label: string; price_cop: string | number } | null;
  }> | null;
}

export const kitsService = {
  /**
   * Sube la imagen de un kit o de uno de sus pasos.
   *
   * Va al mismo bucket `productos` que usa el catálogo: es imagen de catálogo
   * y no tiene sentido repartir permisos y políticas entre dos sitios.
   */
  async subirImagen(archivo: File, nombre: string): Promise<string> {
    return catalogoService.subirImagen(archivo, `kit-${nombre}`);
  },

  async listar(): Promise<KitCatalogo[]> {
    const { data, error } = await supabase
      .from('solutions')
      .select(
        'id, name, subtitle, description, problem_target, warranty, discount_percent, ' +
        'image_url, category_id, status, ' +
        'solution_products ( id, step_number, phase, product_id, variant_id, ' +
        'quantity_for_85m2, role_description, image_url, ' +
        'products(name, image_url), product_variants(label, price_cop) )'
      )
      .eq('is_kit', true)
      .order('name');
    if (error) throw errorLegible('listarKits', error);

    return ((data as unknown as FilaKit[]) ?? []).map((k) => {
      const pasos: PasoKit[] = [...(k.solution_products ?? [])]
        .sort((a, b) => a.step_number - b.step_number)
        .map((p) => ({
          id: p.id,
          stepNumber: p.step_number,
          fase: p.phase ?? 'Acabado',
          productId: p.product_id,
          variantId: p.variant_id,
          productoNombre: p.products?.name ?? '',
          presentacion: p.product_variants?.label ?? '',
          precioCop: num(p.product_variants?.price_cop ?? 0),
          cantidad85m2: num(p.quantity_for_85m2 ?? 1),
          descripcionRol: p.role_description ?? '',
          imagen: p.image_url,
          imagenProducto: p.products?.image_url ?? null,
        }));

      return {
        id: k.id,
        nombre: k.name,
        subtitulo: k.subtitle,
        descripcion: k.description,
        problema: k.problem_target,
        garantia: k.warranty,
        descuento: num(k.discount_percent),
        imagen: k.image_url,
        categoriaId: k.category_id,
        estado: k.status,
        pasos,
        totalSinDescuento: pasos.reduce(
          (t, p) => t + (p.precioCop ?? 0) * p.cantidad85m2, 0,
        ),
      };
    });
  },

  /** Crea o actualiza la cabecera del kit. Devuelve su id. */
  async guardar(datos: {
    id?: string; nombre: string; subtitulo?: string; descripcion?: string;
    problema?: string; garantia?: string; descuento: number;
    imagen?: string | null; categoriaId?: string | null;
    estado: 'ACTIVO' | 'INACTIVO';
  }): Promise<string> {
    const fila = {
      name: datos.nombre.trim(),
      subtitle: datos.subtitulo?.trim() || null,
      description: datos.descripcion?.trim() || null,
      problem_target: datos.problema?.trim() || null,
      warranty: datos.garantia?.trim() || null,
      discount_percent: datos.descuento,
      image_url: datos.imagen || null,
      category_id: datos.categoriaId || null,
      status: datos.estado,
      is_kit: true,
    };

    if (datos.id) {
      const { error } = await supabase.from('solutions').update(fila).eq('id', datos.id);
      if (error) throw errorLegible('guardarKit', error);
      return datos.id;
    }
    const { data, error } = await supabase.from('solutions').insert(fila).select('id').single();
    if (error) throw errorLegible('crearKit', error);
    return (data as { id: string }).id;
  },

  /**
   * Guarda un paso.
   *
   * `variant_id` es OBLIGATORIO aquí, aunque la columna lo permita nulo: un
   * paso sin presentación real es exactamente el que acaba mostrando un precio
   * escrito a mano.
   */
  async guardarPaso(kitId: string, paso: PasoKit): Promise<void> {
    if (!paso.variantId) {
      throw new Error('Elige la presentación del producto: sin ella el kit no puede calcular el precio.');
    }
    const fila = {
      solution_id: kitId,
      step_number: paso.stepNumber,
      phase: paso.fase,
      product_id: paso.productId,
      variant_id: paso.variantId,
      quantity_for_85m2: paso.cantidad85m2,
      role_description: paso.descripcionRol?.trim() || null,
      image_url: paso.imagen || null,
    };
    const { error } = paso.id
      ? await supabase.from('solution_products').update(fila).eq('id', paso.id)
      : await supabase.from('solution_products').insert(fila);
    if (error) throw errorLegible('guardarPasoKit', error);
  },

  async quitarPaso(pasoId: string): Promise<void> {
    const { error } = await supabase.from('solution_products').delete().eq('id', pasoId);
    if (error) throw errorLegible('quitarPasoKit', error);
  },

  /**
   * Renumera los pasos de 1 en adelante.
   *
   * Borrar el paso 1 deja el kit empezando en «2», y en pantalla eso se lee
   * como un error del sistema y no como un kit de dos pasos. Ya pasó con los
   * datos sembrados.
   */
  async renumerar(kitId: string): Promise<void> {
    const { data } = await supabase
      .from('solution_products').select('id, step_number')
      .eq('solution_id', kitId).order('step_number');
    const filas = (data ?? []) as Array<{ id: string; step_number: number }>;
    for (let i = 0; i < filas.length; i += 1) {
      if (filas[i].step_number !== i + 1) {
        await supabase.from('solution_products')
          .update({ step_number: i + 1 }).eq('id', filas[i].id);
      }
    }
  },
};
