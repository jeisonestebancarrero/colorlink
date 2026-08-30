import type {
  ColorSwatch,
  PintucoStore,
  SolutionCatalogItem,
  SolutionKit,
  StoreProduct,
  StoreProductPresentation,
} from '../types';

/**
 * Traductores de fila de Postgres al tipo que ya consume el frontend.
 * ============================================================
 * Esta es la pieza que permite cambiar el origen de los datos sin tocar una
 * sola línea de JSX: los servicios devuelven objetos IDÉNTICOS en forma a los
 * que hoy exportan src/data/*.ts.
 *
 * CONVENIO SOBRE `id`:
 * Se devuelve `external_ref` ('prod-koraza-5'), no el UUID de la base. Hay
 * referencias literales a esos identificadores en el código existente
 * (por ejemplo el producto por defecto de PaintCalculatorPage) y en los pasos
 * de los kits. Cambiarlos rompería esas referencias. El UUID real viaja en
 * `dbId` para las fases de carrito y pedidos, que sí lo necesitan.
 */

// ---------- filas tal como llegan de PostgREST ----------
export interface ColorRow {
  code: string;
  name: string;
  hex: string;
  rgb: string | null;
  family: ColorSwatch['family'];
  recommended_product: string | null;
  description: string | null;
}

export interface VariantRow {
  id: string;
  label: string;
  price_cop: string | number;
  volume_liters: string | number | null;
  sort_order: number;
}

export interface ProductRow {
  id: string;
  external_ref: string | null;
  code: string;
  name: string;
  tagline: string | null;
  description: string | null;
  environment: StoreProduct['environment'] | null;
  finish: StoreProduct['finish'] | null;
  coverage: string | null;
  spread_rate_m2_per_gal: string | number | null;
  drying_time: string | null;
  features: string[] | null;
  image_url: string | null;
  tech_sheet_url: string | null;
  rating: string | number | null;
  reviews_count: number | null;
  is_popular: boolean | null;
  badge: string | null;
  categories: { name: string } | null;
  product_variants: VariantRow[] | null;
  product_colors: Array<{ sort_order: number; colors: ColorRow | null }> | null;
  product_surfaces: Array<{ surfaces: { name: string } | null }> | null;
}

const num = (v: string | number | null | undefined, porDefecto = 0): number => {
  if (v === null || v === undefined) return porDefecto;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : porDefecto;
};

/** Deriva "R, G, B" a partir del hex. No inventa: es el mismo color. */
export function hexARgb(hex: string): string {
  const limpio = hex.replace('#', '');
  const r = parseInt(limpio.slice(0, 2), 16);
  const g = parseInt(limpio.slice(2, 4), 16);
  const b = parseInt(limpio.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function aColorSwatch(row: ColorRow): ColorSwatch {
  return {
    code: row.code,
    name: row.name,
    hex: row.hex,
    family: row.family,
    // `rgb` es obligatorio en ColorSwatch. Si la fila no lo trae, se calcula
    // desde el hex en lugar de dejarlo vacío.
    rgb: row.rgb ?? hexARgb(row.hex),
    recommendedProduct: row.recommended_product ?? '',
    description: row.description ?? '',
  };
}

export function aPresentacion(
  row: VariantRow,
  disponibilidad: Map<string, StoreProductPresentation['stockStatus']>
): StoreProductPresentation {
  return {
    // El UUID real: el carrito y los pedidos lo necesitarán para validar
    // precio y existencias contra el servidor (FASES 8 y 9).
    id: row.id,
    label: row.label,
    priceCOP: num(row.price_cop),
    volumeLiters: row.volume_liters === null ? undefined : num(row.volume_liters),
    // Derivada del inventario real, nunca escrita a mano (MÓDULO 20).
    stockStatus: disponibilidad.get(row.id) ?? 'PreOrder',
  };
}

export function aStoreProduct(
  row: ProductRow,
  disponibilidad: Map<string, StoreProductPresentation['stockStatus']>
): StoreProduct {
  const variantes = [...(row.product_variants ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const colores = [...(row.product_colors ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((pc) => pc.colors)
    .filter((c): c is ColorRow => c !== null);

  return {
    id: row.external_ref ?? row.id,
    code: row.code,
    name: row.name,
    brand: 'Pintuco',
    tagline: row.tagline ?? '',
    category: (row.categories?.name ?? 'Herramientas & Complementos') as StoreProduct['category'],
    rating: num(row.rating),
    reviewsCount: row.reviews_count ?? 0,
    description: row.description ?? '',
    features: row.features ?? [],
    image: row.image_url ?? '',
    surface: (row.product_surfaces ?? [])
      .map((ps) => ps.surfaces?.name)
      .filter((n): n is string => Boolean(n)),
    environment: row.environment ?? 'Ambos',
    finish: row.finish ?? 'N/A',
    coverage: row.coverage ?? '',
    // Las herramientas no tienen rendimiento: se guardan como NULL en la base
    // y aquí se proyectan como 0, que es lo que el tipo del frontend espera.
    spreadRateM2PerGal: num(row.spread_rate_m2_per_gal),
    dryingTime: row.drying_time ?? '',
    isPopular: row.is_popular ?? false,
    badge: row.badge ?? undefined,
    availableColors: colores.map((c) => ({
      name: c.name,
      code: c.code,
      hex: c.hex,
      family: c.family,
    })),
    presentations: variantes.map((v) => aPresentacion(v, disponibilidad)),
    techSheetUrl: row.tech_sheet_url ?? undefined,
  };
}

// ---------- soluciones ----------
export interface SolutionRow {
  external_ref: string | null;
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  badge: string | null;
  application: string | null;
  surface_summary: string | null;
  features: string[] | null;
  system_summary: string | null;
  durability_estimate: string | null;
  spread_rate_info: string | null;
  packagings: string[] | null;
  step_by_step_guide: string[] | null;
  color_swatches: Array<{ name: string; hex: string }> | null;
  subtitle: string | null;
  problem_target: string | null;
  ideal_for: string | null;
  warranty: string | null;
  discount_percent: string | number | null;
  tools_included: string[] | null;
  categories: { name: string } | null;
  solution_products?: SolutionProductRow[] | null;
}

export interface SolutionProductRow {
  step_number: number;
  phase: SolutionKit['steps'][number]['phaseName'] | null;
  role_description: string | null;
  quantity_for_85m2: string | number | null;
  image_url: string | null;
  presentation_label: string | null;
  unit_price_cop: string | number | null;
  products: { external_ref: string | null; name: string } | null;
  product_variants: { price_cop: string | number } | null;
}

export function aSolutionCatalogItem(row: SolutionRow): SolutionCatalogItem {
  return {
    id: row.external_ref ?? row.id,
    name: row.name,
    category: (row.categories?.name ?? 'Mantenimiento') as SolutionCatalogItem['category'],
    description: row.description ?? '',
    application: row.application ?? '',
    surface: row.surface_summary ?? '',
    features: row.features ?? [],
    image: row.image_url ?? '',
    badge: row.badge ?? undefined,
    systemSummary: row.system_summary ?? '',
    durabilityEstimate: row.durability_estimate ?? undefined,
    colorSwatches: row.color_swatches ?? [],
    stepByStepGuide: row.step_by_step_guide ?? [],
    spreadRateInfo: row.spread_rate_info ?? undefined,
    packagings: row.packagings ?? [],
  };
}

export function aSolutionKit(row: SolutionRow): SolutionKit {
  const pasos = [...(row.solution_products ?? [])].sort((a, b) => a.step_number - b.step_number);

  return {
    id: row.external_ref ?? row.id,
    name: row.name,
    subtitle: row.subtitle ?? '',
    problemTarget: row.problem_target ?? '',
    idealFor: row.ideal_for ?? '',
    category: row.categories?.name ?? '',
    image: row.image_url ?? '',
    warranty: row.warranty ?? '',
    discountPercent: num(row.discount_percent),
    toolsIncluded: row.tools_included ?? [],
    steps: pasos.map((p) => ({
      stepNumber: p.step_number,
      phaseName: p.phase ?? 'Aplicación',
      productName: p.products?.name ?? '',
      productId: p.products?.external_ref ?? '',
      presentation: p.presentation_label ?? '',
      quantityFor85m2: num(p.quantity_for_85m2, 1),
      // ORDEN DE AUTORIDAD DEL PRECIO:
      // 1. La variante real del producto, cuando el paso la resuelve. Es el
      //    SKU que se vende y su precio es el único válido.
      // 2. El precio publicado del kit, cuando la etiqueta del paso no
      //    corresponde a ninguna variante (deuda de datos conocida).
      // Nunca se acepta un precio enviado por el navegador.
      unitPriceCOP: p.product_variants
        ? num(p.product_variants.price_cop)
        : num(p.unit_price_cop),
      roleDescription: p.role_description ?? '',
      image: p.image_url ?? '',
    })),
  };
}

// ---------- puntos de retiro ----------
export interface PickupLocationRow {
  id: string;
  external_ref: string | null;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  hours: string | null;
  has_color_studio: boolean;
  has_tech_advisor: boolean;
  has_express_pickup: boolean;
  stock_readiness_hours: number;
  image_url?: string | null;
}

export function aPintucoStore(row: PickupLocationRow): PintucoStore {
  return {
    id: row.external_ref ?? row.id,
    name: row.name,
    imageUrl: row.image_url ?? null,
    city: row.city,
    address: row.address,
    phone: row.phone ?? '',
    hours: row.hours ?? '',
    hasColorStudio: row.has_color_studio,
    hasTechAdvisor: row.has_tech_advisor,
    hasExpressPickup: row.has_express_pickup,
    stockReadinessHours: row.stock_readiness_hours,
  };
}
