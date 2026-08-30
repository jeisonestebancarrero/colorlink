import { supabase } from '../lib/supabase';
import type {
  ColorSwatch,
  PintucoStore,
  SolutionCatalogItem,
  SolutionKit,
  StoreProduct,
  StoreProductPresentation,
} from '../types';
import {
  aColorSwatch,
  aPintucoStore,
  aSolutionCatalogItem,
  aSolutionKit,
  aStoreProduct,
  type ColorRow,
  type PickupLocationRow,
  type ProductRow,
  type SolutionRow,
} from './catalogMappers';

/**
 * Servicios de catálogo (MÓDULO 35).
 *
 * Sustituyen a los arrays de src/data/*.ts. Devuelven los mismos tipos, de
 * modo que las páginas solo cambian DE DÓNDE vienen los datos, nunca cómo
 * se pintan.
 *
 * Todas las consultas piden columnas explícitas (nunca `select *`) y aplican
 * filtros y paginación en el servidor, no en el navegador (MÓDULO 45/46).
 */

function errorLegible(contexto: string, error: { message: string }): Error {
  console.error(`[catalog] ${contexto}:`, error.message);
  return new Error('No fue posible cargar la información del catálogo. Inténtalo nuevamente.');
}

// ============================================================
// CACHÉ EN MEMORIA CON DEDUPLICACIÓN
// ============================================================
// MÓDULO 45: "no hacer consultas innecesarias".
//
// Varios componentes piden el mismo catálogo a la vez (StorePage, el
// buscador del Navbar y el Dashboard piden todos los productos). Sin
// deduplicación eso serían tres peticiones idénticas simultáneas, porque el
// proyecto no usa React Query ni ninguna caché de estado servidor.
//
// Se cachea la PROMESA, no el resultado: si tres componentes montan en el
// mismo tick, los tres comparten una única petición en vuelo. El catálogo
// cambia con muy poca frecuencia, de ahí los 5 minutos de vigencia.
// Un error nunca se cachea: se descarta para que el botón "Reintentar"
// vuelva a consultar de verdad.
const TTL_CATALOGO_MS = 5 * 60 * 1000;
const cacheCatalogo = new Map<string, { expiraEn: number; promesa: Promise<unknown> }>();

function memo<T>(clave: string, cargar: () => Promise<T>): Promise<T> {
  const ahora = Date.now();
  const guardado = cacheCatalogo.get(clave);
  if (guardado && guardado.expiraEn > ahora) return guardado.promesa as Promise<T>;

  const promesa = cargar().catch((e: unknown) => {
    cacheCatalogo.delete(clave);
    throw e;
  });
  cacheCatalogo.set(clave, { expiraEn: ahora + TTL_CATALOGO_MS, promesa });
  return promesa;
}

/**
 * Vacía la caché del catálogo. Se usará cuando un administrador edite el
 * catálogo (fase de back-office) y desde las pruebas.
 */
export function invalidarCacheCatalogo(): void {
  cacheCatalogo.clear();
}

// ============================================================
// DISPONIBILIDAD
// ============================================================
/**
 * Estado de existencias por variante, derivado del inventario real.
 * Se consulta la vista pública, que expone el estado pero nunca las
 * cantidades exactas.
 */
async function cargarDisponibilidad(): Promise<
  Map<string, StoreProductPresentation['stockStatus']>
> {
  const { data, error } = await supabase
    .from('v_variant_availability')
    .select('variant_id, stock_status');

  const mapa = new Map<string, StoreProductPresentation['stockStatus']>();
  if (error || !data) {
    // La disponibilidad es un adorno: si falla, el catálogo debe seguir
    // mostrándose. Cada presentación caerá a 'PreOrder'.
    if (error) console.warn('[catalog] disponibilidad no disponible:', error.message);
    return mapa;
  }
  for (const fila of data as Array<{ variant_id: string; stock_status: string }>) {
    mapa.set(fila.variant_id, fila.stock_status as StoreProductPresentation['stockStatus']);
  }
  return mapa;
}

// ============================================================
// PRODUCTOS
// ============================================================
const PRODUCT_SELECT = `
  id, external_ref, code, name, tagline, description, environment, finish,
  coverage, spread_rate_m2_per_gal, drying_time, features, image_url,
  tech_sheet_url, rating, reviews_count, is_popular, badge,
  categories!inner ( name ),
  product_variants ( id, label, price_cop, volume_liters, sort_order ),
  product_colors ( sort_order, colors ( code, name, hex, rgb, family, recommended_product, description ) ),
  product_surfaces ( surfaces ( name ) )
`;

export interface ProductFilters {
  category?: string;
  search?: string;
  /** Paginación (MÓDULO 46). Por defecto trae el catálogo completo, que hoy son 11 filas. */
  page?: number;
  limit?: number;
}

export const productService = {
  async getProducts(filtros: ProductFilters = {}): Promise<StoreProduct[]> {
    return memo(`products:${JSON.stringify(filtros)}`, async () => {
    let consulta = supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('status', 'ACTIVO')
      .order('is_popular', { ascending: false })
      .order('name');

    if (filtros.category && filtros.category !== 'Todos') {
      consulta = consulta.eq('categories.name', filtros.category);
    }
    if (filtros.search?.trim()) {
      // Búsqueda en servidor sobre nombre, código y descripción (MÓDULO 47).
      const q = filtros.search.trim().replace(/[%,()]/g, '');
      consulta = consulta.or(`name.ilike.%${q}%,code.ilike.%${q}%,description.ilike.%${q}%`);
    }
    if (filtros.limit) {
      const page = filtros.page ?? 1;
      const desde = (page - 1) * filtros.limit;
      consulta = consulta.range(desde, desde + filtros.limit - 1);
    }

    const [{ data, error }, disponibilidad] = await Promise.all([
      consulta,
      cargarDisponibilidad(),
    ]);
    if (error) throw errorLegible('getProducts', error);

    return ((data ?? []) as unknown as ProductRow[]).map((f) => aStoreProduct(f, disponibilidad));
    });
  },

  async getProductByRef(externalRef: string): Promise<StoreProduct | null> {
    const [{ data, error }, disponibilidad] = await Promise.all([
      supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('external_ref', externalRef)
        .eq('status', 'ACTIVO')
        .maybeSingle(),
      cargarDisponibilidad(),
    ]);
    if (error) throw errorLegible('getProductByRef', error);
    return data ? aStoreProduct(data as unknown as ProductRow, disponibilidad) : null;
  },

  /** Categorías de producto, para los filtros de StorePage. */
  async getCategories(): Promise<string[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('name, sort_order, parent_id')
      .eq('kind', 'PRODUCT')
      .eq('status', 'ACTIVO')
      .not('parent_id', 'is', null)
      .order('sort_order');
    if (error) throw errorLegible('getCategories', error);
    return (data ?? []).map((c) => (c as { name: string }).name);
  },
};

// ============================================================
// COLORES
// ============================================================
const COLOR_SELECT = 'code, name, hex, rgb, family, recommended_product, description';

export const colorService = {
  /**
   * Carta de color publicada. Solo `is_palette = true`: los colores que
   * existen únicamente como opción de un producto no forman parte de la
   * carta y no deben aparecer en el visualizador.
   */
  async getPalette(): Promise<ColorSwatch[]> {
    return memo('colors:palette', async () => {
    const { data, error } = await supabase
      .from('colors')
      .select(COLOR_SELECT)
      .eq('status', 'ACTIVO')
      .eq('is_palette', true)
      .order('code');
    if (error) throw errorLegible('getPalette', error);
    return ((data ?? []) as unknown as ColorRow[]).map(aColorSwatch);
    });
  },

  async searchColors(termino: string, familia?: string): Promise<ColorSwatch[]> {
    let consulta = supabase
      .from('colors')
      .select(COLOR_SELECT)
      .eq('status', 'ACTIVO')
      .eq('is_palette', true);

    if (termino.trim()) {
      const q = termino.trim().replace(/[%,()]/g, '');
      consulta = consulta.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
    }
    if (familia && familia !== 'Todas') {
      consulta = consulta.eq('family', familia);
    }

    const { data, error } = await consulta.order('code');
    if (error) throw errorLegible('searchColors', error);
    return ((data ?? []) as unknown as ColorRow[]).map(aColorSwatch);
  },
};

// ============================================================
// SOLUCIONES Y KITS
// ============================================================
const SOLUTION_BASE = `
  id, external_ref, name, description, image_url, badge, application,
  surface_summary, features, system_summary, durability_estimate,
  spread_rate_info, packagings, step_by_step_guide, color_swatches,
  subtitle, problem_target, ideal_for, warranty, discount_percent,
  tools_included, categories ( name )
`;

const KIT_SELECT = `
  ${SOLUTION_BASE},
  solution_products (
    step_number, phase, role_description, quantity_for_85m2, image_url,
    presentation_label, unit_price_cop,
    products ( external_ref, name ),
    product_variants ( price_cop )
  )
`;

export const solutionService = {
  /** Sistemas técnicos del catálogo (is_kit = false). */
  async getCatalog(categoria?: string, busqueda?: string): Promise<SolutionCatalogItem[]> {
    return memo(`solutions:catalog:${categoria ?? ''}:${busqueda ?? ''}`, async () => {
    let consulta = supabase
      .from('solutions')
      .select(SOLUTION_BASE)
      .eq('status', 'ACTIVO')
      .eq('is_kit', false);

    if (categoria && categoria !== 'Todas') {
      consulta = consulta.eq('categories.name', categoria);
    }
    if (busqueda?.trim()) {
      const q = busqueda.trim().replace(/[%,()]/g, '');
      consulta = consulta.or(
        `name.ilike.%${q}%,description.ilike.%${q}%,application.ilike.%${q}%,surface_summary.ilike.%${q}%`
      );
    }

    const { data, error } = await consulta.order('name');
    if (error) throw errorLegible('getCatalog', error);
    return ((data ?? []) as unknown as SolutionRow[]).map(aSolutionCatalogItem);
    });
  },

  /** Kits comprables con sus pasos (is_kit = true). */
  async getKits(): Promise<SolutionKit[]> {
    return memo('solutions:kits', async () => {
    const { data, error } = await supabase
      .from('solutions')
      .select(KIT_SELECT)
      .eq('status', 'ACTIVO')
      .eq('is_kit', true)
      .order('name');
    if (error) throw errorLegible('getKits', error);
    return ((data ?? []) as unknown as SolutionRow[]).map(aSolutionKit);
    });
  },
};

// ============================================================
// PUNTOS DE RETIRO
// ============================================================
export const storeService = {
  async getStores(ciudad?: string): Promise<PintucoStore[]> {
    return memo(`stores:${ciudad ?? 'todas'}`, async () => {
    let consulta = supabase
      .from('pickup_locations')
      .select(
        'id, external_ref, name, city, address, phone, hours, has_color_studio, has_tech_advisor, has_express_pickup, stock_readiness_hours, image_url'
      )
      .eq('status', 'ACTIVO');

    if (ciudad && ciudad !== 'Todas') consulta = consulta.eq('city', ciudad);

    const { data, error } = await consulta.order('city').order('name');
    if (error) throw errorLegible('getStores', error);
    return ((data ?? []) as unknown as PickupLocationRow[]).map(aPintucoStore);
    });
  },
};
