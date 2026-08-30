/**
 * Generador del seed de catálogo — FASE 3
 * ============================================================
 * Lee los datos mock existentes (src/data/*.ts) y emite el SQL del seed.
 *
 * POR QUÉ UN GENERADOR Y NO SQL ESCRITO A MANO:
 * El MÓDULO 5 prohíbe inventar información comercial. Transcribir a mano
 * 11 productos, 31 colores, 7 sistemas, 4 kits y 7 tiendas garantizaría
 * erratas silenciosas en precios y rendimientos. Generándolo, el seed es
 * una proyección verificable del dato original y se puede regenerar en
 * cualquier momento con:
 *
 *   npm run db:seed:catalog
 *
 * Ejecuta también comprobaciones de integridad y aborta si detecta datos
 * inconsistentes, en vez de cargar basura en la base.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PINTUCO_PRODUCTS,
  PINTUCO_SOLUTION_KITS,
  PINTUCO_STORES,
  PINTUCO_COLOR_PALETTES,
} from '../../src/data/storeMockData';
import { SOLUTIONS_CATALOG } from '../../src/data/mockData';
import type { ColorSwatch, StoreProduct } from '../../src/types';

// ---------- utilidades de escritura SQL ----------
const S = (v: string | null | undefined): string =>
  v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const N = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? 'null' : String(v);
const B = (v: boolean | undefined): string => (v ? 'true' : 'false');
const ARR = (v: readonly string[] | undefined): string =>
  !v || v.length === 0
    ? "'{}'"
    : `array[${v.map((x) => S(x)).join(', ')}]::text[]`;
const JSONB = (v: unknown): string => `${S(JSON.stringify(v ?? []))}::jsonb`;

/**
 * Rendimiento en m²/galón.
 *
 * Las herramientas (rodillo, brocha, cinta) traen `spreadRateM2PerGal: 0` en
 * el dato mock. Un cero NO es un rendimiento válido: es la ausencia del
 * concepto, porque una brocha no cubre metros cuadrados por galón. Se emite
 * NULL para que la restricción `spread_rate_m2_per_gal > 0` siga protegiendo
 * al motor de cálculo de una división por cero.
 */
const RENDIMIENTO = (v: number | undefined): string =>
  v === undefined || v === null || v <= 0 ? 'null' : String(v);

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ---------- comprobaciones de integridad ----------
const errores: string[] = [];
// Avisos: inconsistencias resueltas de forma documentada, no bloqueantes.
const avisos: string[] = [];

const HEX = /^#[0-9a-fA-F]{6}$/;

// Superficies obligatorias: la unión `SurfaceType` del frontend.
// Si faltara alguna, CreateProjectPage no podría guardar ese valor.
const SURFACE_TYPES = ['Concreto', 'Cemento', 'Metal', 'Madera', 'Fachada', 'Drywall', 'Otra'];
// Unión `ConditionType` del frontend.
const CONDITION_TYPES = [
  'Buen estado', 'Humedad', 'Fisuras', 'Desprendimiento', 'Oxidación',
  'Desgaste', 'Hongos / Moho', 'Alcalinidad', 'Filtraciones', 'Manchas', 'Otro',
];

// ---------- colores: unión de las dos fuentes ----------
interface ColorRow {
  code: string; name: string; hex: string; rgb: string | null;
  family: string; recommendedProduct: string | null; description: string | null;
  isPalette: boolean;
}
const colores = new Map<string, ColorRow>();

for (const c of PINTUCO_COLOR_PALETTES as ColorSwatch[]) {
  if (!HEX.test(c.hex)) errores.push(`Color ${c.code} con hex inválido: ${c.hex}`);
  colores.set(c.code, {
    code: c.code, name: c.name, hex: c.hex, rgb: c.rgb,
    family: c.family, recommendedProduct: c.recommendedProduct, description: c.description,
    isPalette: true,
  });
}

// Colores que aparecen dentro de los productos y que pueden no estar en la
// paleta general. Se incorporan para que product_colors nunca quede huérfano.
for (const p of PINTUCO_PRODUCTS as StoreProduct[]) {
  for (const c of p.availableColors ?? []) {
    if (!HEX.test(c.hex)) { errores.push(`Color ${c.code} (en ${p.id}) hex inválido: ${c.hex}`); continue; }
    const existente = colores.get(c.code);
    if (!existente) {
      colores.set(c.code, {
        code: c.code, name: c.name, hex: c.hex, rgb: null,
        family: c.family, recommendedProduct: null,
        description: null,
        isPalette: false,
      });
    } else if (existente.hex.toLowerCase() !== c.hex.toLowerCase()) {
      // CONFLICTO DE DATOS EN EL ORIGEN.
      // Un mismo código de color aparece con dos hex distintos: en la paleta
      // general y embebido dentro de un producto. Se resuelve a favor de la
      // PALETA, que es el catálogo cromático canónico y además es coherente
      // consigo misma (su campo `rgb` corresponde a su `hex`). El valor
      // embebido en el producto es una copia denormalizada y desactualizada.
      // Al normalizar en la tabla `colors` el conflicto desaparece de raíz.
      avisos.push(
        `Color ${c.code} "${existente.name}": la paleta define ${existente.hex} y ` +
        `el producto ${p.id} define ${c.hex}. Se conserva ${existente.hex} (paleta).`
      );
    }
  }
}

// ---------- superficies ----------
const superficies = new Map<string, boolean>(); // nombre -> es tipo del frontend
for (const s of SURFACE_TYPES) superficies.set(s, true);
for (const p of PINTUCO_PRODUCTS as StoreProduct[]) {
  for (const s of p.surface ?? []) if (!superficies.has(s)) superficies.set(s, false);
}

// ---------- categorías ----------
const catProducto = [...new Set((PINTUCO_PRODUCTS as StoreProduct[]).map((p) => p.category))];
const catSolucion = [
  ...new Set([
    ...SOLUTIONS_CATALOG.map((s) => s.category as string),
    ...PINTUCO_SOLUTION_KITS.map((k) => k.category),
  ]),
];

// ---------- integridad de kits ----------
const idsProducto = new Set((PINTUCO_PRODUCTS as StoreProduct[]).map((p) => p.id));
for (const k of PINTUCO_SOLUTION_KITS) {
  for (const step of k.steps) {
    if (!idsProducto.has(step.productId)) {
      errores.push(`Kit ${k.id} paso ${step.stepNumber} apunta a producto inexistente: ${step.productId}`);
    }
  }
}

if (avisos.length > 0) {
  console.warn('\n⚠️  Inconsistencias en los datos de origen, resueltas:\n');
  for (const a of avisos) console.warn('   - ' + a);
  console.warn('');
}

if (errores.length > 0) {
  console.error('\n❌ El seed NO se generó. Inconsistencias en los datos de origen:\n');
  for (const e of errores) console.error('   - ' + e);
  process.exit(1);
}

// ---------- construcción del SQL ----------
const out: string[] = [];
const w = (s = '') => out.push(s);

w('-- ============================================================');
w('-- SEED DE CATÁLOGO — GENERADO AUTOMÁTICAMENTE. NO EDITAR A MANO.');
w('-- ============================================================');
w('-- Fuente: src/data/storeMockData.ts y src/data/mockData.ts');
w('-- Regenerar con: npm run db:seed:catalog');
w('--');
w('-- Todos los valores comerciales (precios, rendimientos, códigos) son');
w('-- copia literal del dato de origen. No se inventó ningún dato.');
w('-- ============================================================');
w();

// --- marca ---
w('-- MARCA');
w(`insert into public.brands (name, slug) values ('Pintuco', 'pintuco') on conflict (name) do nothing;`);
w();

// --- categorías (con un nodo raíz por taxonomía para ejercitar la jerarquía) ---
w('-- CATEGORÍAS (MÓDULO 4). Se crea un nodo raíz por taxonomía; las');
w('-- categorías reales del negocio cuelgan de él como hijas.');
w(`insert into public.categories (kind, name, slug, sort_order) values`);
w(`  ('PRODUCT', 'Catálogo Pintuco', 'catalogo-pintuco', 0),`);
w(`  ('SOLUTION', 'Sistemas Pintuco', 'sistemas-pintuco', 0)`);
w(`on conflict (kind, name) do nothing;`);
w();
catProducto.forEach((c, i) => {
  w(`insert into public.categories (kind, parent_id, name, slug, sort_order) values ('PRODUCT', (select id from public.categories where kind='PRODUCT' and name='Catálogo Pintuco'), ${S(c)}, ${S(slug(c))}, ${i + 1}) on conflict (kind, name) do nothing;`);
});
catSolucion.forEach((c, i) => {
  w(`insert into public.categories (kind, parent_id, name, slug, sort_order) values ('SOLUTION', (select id from public.categories where kind='SOLUTION' and name='Sistemas Pintuco'), ${S(c)}, ${S(slug(c))}, ${i + 1}) on conflict (kind, name) do nothing;`);
});
w();

// --- superficies ---
w('-- SUPERFICIES (MÓDULO 6). is_frontend_type marca los literales que');
w('-- existen en la unión SurfaceType de src/types/index.ts.');
[...superficies.entries()].forEach(([nombre, esTipo], i) => {
  w(`insert into public.surfaces (name, slug, is_frontend_type, sort_order) values (${S(nombre)}, ${S(slug(nombre))}, ${B(esTipo)}, ${i}) on conflict (name) do nothing;`);
});
w();

// --- patologías ---
w('-- PATOLOGÍAS (MÓDULO 7). Severidad por defecto MEDIA: la clasificación');
w('-- técnica real la definirá el equipo de Pintuco, no se inventa aquí.');
w('-- Las recomendaciones se poblarán en la FASE 6, al trasladar el motor');
w('-- de diagnóstico que hoy vive en src/services/storage.ts.');
CONDITION_TYPES.forEach((nombre, i) => {
  w(`insert into public.pathologies (name, slug, is_frontend_type, sort_order) values (${S(nombre)}, ${S(slug(nombre))}, true, ${i}) on conflict (name) do nothing;`);
});
w();

// --- colores ---
w(`-- COLORES (${colores.size})`);
for (const c of colores.values()) {
  w(`insert into public.colors (code, name, hex, rgb, family, recommended_product, description, is_palette) values (${S(c.code)}, ${S(c.name)}, ${S(c.hex)}, ${S(c.rgb)}, ${S(c.family)}, ${S(c.recommendedProduct)}, ${S(c.description)}, ${B(c.isPalette)}) on conflict (code) do nothing;`);
}
w();

// --- puntos de retiro ---
w(`-- PUNTOS DE RETIRO (${PINTUCO_STORES.length}) — MÓDULO 19`);
for (const s of PINTUCO_STORES) {
  w(`insert into public.pickup_locations (external_ref, name, city, address, phone, hours, has_color_studio, has_tech_advisor, has_express_pickup, stock_readiness_hours) values (${S(s.id)}, ${S(s.name)}, ${S(s.city)}, ${S(s.address)}, ${S(s.phone)}, ${S(s.hours)}, ${B(s.hasColorStudio)}, ${B(s.hasTechAdvisor)}, ${B(s.hasExpressPickup)}, ${N(s.stockReadinessHours)}) on conflict (external_ref) do nothing;`);
}
w();

// --- productos + variantes + colores + superficies ---
w(`-- PRODUCTOS (${PINTUCO_PRODUCTS.length}) con sus variantes`);
for (const p of PINTUCO_PRODUCTS as StoreProduct[]) {
  w(`insert into public.products (external_ref, code, name, tagline, description, brand_id, category_id, environment, finish, coverage, spread_rate_m2_per_gal, drying_time, features, image_url, tech_sheet_url, rating, reviews_count, is_popular, badge) values (${S(p.id)}, ${S(p.code)}, ${S(p.name)}, ${S(p.tagline)}, ${S(p.description)}, (select id from public.brands where name='Pintuco'), (select id from public.categories where kind='PRODUCT' and name=${S(p.category)}), ${S(p.environment)}, ${S(p.finish)}, ${S(p.coverage)}, ${RENDIMIENTO(p.spreadRateM2PerGal)}, ${S(p.dryingTime)}, ${ARR(p.features)}, ${S(p.image)}, ${S(p.techSheetUrl)}, ${N(p.rating)}, ${N(p.reviewsCount)}, ${B(p.isPopular)}, ${S(p.badge)}) on conflict (external_ref) do nothing;`);

  p.presentations.forEach((pres, i) => {
    w(`insert into public.product_variants (product_id, external_ref, label, sku, price_cop, volume_liters, sort_order) values ((select id from public.products where external_ref=${S(p.id)}), ${S(pres.id)}, ${S(pres.label)}, ${S(`${p.code}-V${i + 1}`)}, ${N(pres.priceCOP)}, ${N(pres.volumeLiters)}, ${i}) on conflict (product_id, label) do nothing;`);
  });

  (p.availableColors ?? []).forEach((c, i) => {
    w(`insert into public.product_colors (product_id, color_id, sort_order) values ((select id from public.products where external_ref=${S(p.id)}), (select id from public.colors where code=${S(c.code)}), ${i}) on conflict do nothing;`);
  });

  (p.surface ?? []).forEach((s) => {
    w(`insert into public.product_surfaces (product_id, surface_id) values ((select id from public.products where external_ref=${S(p.id)}), (select id from public.surfaces where name=${S(s)})) on conflict do nothing;`);
  });
  w();
}

// --- inventario derivado de stockStatus ---
w('-- INVENTARIO (MÓDULO 20)');
w('-- Las cantidades se DERIVAN del `stockStatus` que ya traía cada');
w('-- presentación en el mock, para no inventar existencias:');
w('--   InStock -> 40 u.   LowStock -> 4 u.   PreOrder -> 0 u.');
w('-- por cada punto de retiro.');
const QTY: Record<string, number> = { InStock: 40, LowStock: 4, PreOrder: 0 };
for (const p of PINTUCO_PRODUCTS as StoreProduct[]) {
  for (const pres of p.presentations) {
    w(`insert into public.inventory (variant_id, location_id, qty_available) select v.id, l.id, ${N(QTY[pres.stockStatus] ?? 0)} from public.product_variants v cross join public.pickup_locations l where v.external_ref=${S(pres.id)} and v.product_id=(select id from public.products where external_ref=${S(p.id)}) on conflict (variant_id, location_id) do nothing;`);
  }
}
w();

// --- soluciones del catálogo ---
w(`-- SOLUCIONES DEL CATÁLOGO (${SOLUTIONS_CATALOG.length}) — is_kit = false`);
for (const s of SOLUTIONS_CATALOG) {
  w(`insert into public.solutions (external_ref, name, category_id, is_kit, description, image_url, badge, application, surface_summary, features, system_summary, durability_estimate, spread_rate_info, packagings, step_by_step_guide, color_swatches) values (${S(s.id)}, ${S(s.name)}, (select id from public.categories where kind='SOLUTION' and name=${S(s.category)}), false, ${S(s.description)}, ${S(s.image)}, ${S(s.badge)}, ${S(s.application)}, ${S(s.surface)}, ${ARR(s.features)}, ${S(s.systemSummary)}, ${S(s.durabilityEstimate)}, ${S(s.spreadRateInfo)}, ${ARR(s.packagings)}, ${ARR(s.stepByStepGuide)}, ${JSONB(s.colorSwatches)}) on conflict (external_ref) do nothing;`);
}
w();

// --- kits ---
w(`-- KITS COMPRABLES (${PINTUCO_SOLUTION_KITS.length}) — is_kit = true`);
for (const k of PINTUCO_SOLUTION_KITS) {
  w(`insert into public.solutions (external_ref, name, category_id, is_kit, description, image_url, subtitle, problem_target, ideal_for, warranty, discount_percent, tools_included) values (${S(k.id)}, ${S(k.name)}, (select id from public.categories where kind='SOLUTION' and name=${S(k.category)}), true, ${S(k.problemTarget)}, ${S(k.image)}, ${S(k.subtitle)}, ${S(k.problemTarget)}, ${S(k.idealFor)}, ${S(k.warranty)}, ${N(k.discountPercent)}, ${ARR(k.toolsIncluded)}) on conflict (external_ref) do nothing;`);

  for (const step of k.steps) {
    w(`insert into public.solution_products (solution_id, product_id, variant_id, presentation_label, unit_price_cop, step_number, phase, role_description, quantity_for_85m2, image_url, sort_order) values ((select id from public.solutions where external_ref=${S(k.id)}), (select id from public.products where external_ref=${S(step.productId)}), (select v.id from public.product_variants v join public.products pr on pr.id=v.product_id where pr.external_ref=${S(step.productId)} and v.label=${S(step.presentation)}), ${S(step.presentation)}, ${N(step.unitPriceCOP)}, ${N(step.stepNumber)}, ${S(step.phaseName)}, ${S(step.roleDescription)}, ${N(step.quantityFor85m2)}, ${S(step.image)}, ${N(step.stepNumber)}) on conflict (solution_id, step_number) do nothing;`);
  }
  w();
}

const aquí = dirname(fileURLToPath(import.meta.url));
const destino = resolve(aquí, '..', 'seed_catalog.sql');
writeFileSync(destino, out.join('\n') + '\n', 'utf8');

console.log('✅ Seed de catálogo generado');
console.log(`   ${PINTUCO_PRODUCTS.length} productos`);
console.log(`   ${(PINTUCO_PRODUCTS as StoreProduct[]).reduce((n, p) => n + p.presentations.length, 0)} variantes`);
console.log(`   ${colores.size} colores`);
console.log(`   ${superficies.size} superficies`);
console.log(`   ${CONDITION_TYPES.length} patologías`);
console.log(`   ${SOLUTIONS_CATALOG.length} soluciones + ${PINTUCO_SOLUTION_KITS.length} kits`);
console.log(`   ${PINTUCO_STORES.length} puntos de retiro`);
console.log(`   → ${destino}`);
