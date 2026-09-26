/**
 * Genera seed_catalog.sql desde src/data/*.ts para no transcribir precios a mano (npm run db:seed:catalog).
 * Aborta si las comprobaciones de integridad fallan.
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

// Utilidades de escritura SQL.
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

/** Rendimiento 0 (herramientas) se emite como NULL: la restricción > 0 evita divisiones por cero. */
const RENDIMIENTO = (v: number | undefined): string =>
  v === undefined || v === null || v <= 0 ? 'null' : String(v);

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// Comprobaciones de integridad.
const errores: string[] = [];
// Avisos: inconsistencias resueltas de forma documentada, no bloqueantes.
const avisos: string[] = [];

const HEX = /^#[0-9a-fA-F]{6}$/;

// Debe coincidir con la unión SurfaceType del frontend.
const SURFACE_TYPES = ['Concreto', 'Cemento', 'Metal', 'Madera', 'Fachada', 'Drywall', 'Otra'];
// Unión `ConditionType` del frontend.
const CONDITION_TYPES = [
  'Buen estado', 'Humedad', 'Fisuras', 'Desprendimiento', 'Oxidación',
  'Desgaste', 'Hongos / Moho', 'Alcalinidad', 'Filtraciones', 'Manchas', 'Otro',
];

// Colores: unión de las dos fuentes.
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

// Colores embebidos en productos que faltan en la paleta, para que product_colors no quede huérfano.
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
      // Mismo código con dos hex: gana la paleta, que es la fuente canónica.
      avisos.push(
        `Color ${c.code} "${existente.name}": la paleta define ${existente.hex} y ` +
        `el producto ${p.id} define ${c.hex}. Se conserva ${existente.hex} (paleta).`
      );
    }
  }
}

// Superficies.
const superficies = new Map<string, boolean>(); // nombre -> es tipo del frontend
for (const s of SURFACE_TYPES) superficies.set(s, true);
for (const p of PINTUCO_PRODUCTS as StoreProduct[]) {
  for (const s of p.surface ?? []) if (!superficies.has(s)) superficies.set(s, false);
}

// Categorías.
const catProducto = [...new Set((PINTUCO_PRODUCTS as StoreProduct[]).map((p) => p.category))];
const catSolucion = [
  ...new Set([
    ...SOLUTIONS_CATALOG.map((s) => s.category as string),
    ...PINTUCO_SOLUTION_KITS.map((k) => k.category),
  ]),
];

// Integridad de kits.
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

// Construcción del SQL.
const out: string[] = [];
const w = (s = '') => out.push(s);

w('-- Generado por npm run db:seed:catalog desde src/data/*.ts; no editar a mano.');
w('-- Los valores comerciales son copia literal del origen.');
w();

// Marca.
w('-- Marca');
w(`insert into public.brands (name, slug) values ('Pintuco', 'pintuco') on conflict (name) do nothing;`);
w();

// Categorías (con un nodo raíz por taxonomía para ejercitar la jerarquía).
w('-- Categorías: un nodo raíz por taxonomía con las reales como hijas.');
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

// Superficies.
w('-- Superficies: is_frontend_type marca los valores de la unión SurfaceType.');
[...superficies.entries()].forEach(([nombre, esTipo], i) => {
  w(`insert into public.surfaces (name, slug, is_frontend_type, sort_order) values (${S(nombre)}, ${S(slug(nombre))}, ${B(esTipo)}, ${i}) on conflict (name) do nothing;`);
});
w();

// Patologías.
w('-- Patologías con severidad MEDIA provisional hasta que Pintuco defina la real.');
CONDITION_TYPES.forEach((nombre, i) => {
  w(`insert into public.pathologies (name, slug, is_frontend_type, sort_order) values (${S(nombre)}, ${S(slug(nombre))}, true, ${i}) on conflict (name) do nothing;`);
});
w();

// Colores.
w(`-- Colores (${colores.size})`);
for (const c of colores.values()) {
  w(`insert into public.colors (code, name, hex, rgb, family, recommended_product, description, is_palette) values (${S(c.code)}, ${S(c.name)}, ${S(c.hex)}, ${S(c.rgb)}, ${S(c.family)}, ${S(c.recommendedProduct)}, ${S(c.description)}, ${B(c.isPalette)}) on conflict (code) do nothing;`);
}
w();

// Puntos de retiro.
w(`-- Puntos de retiro (${PINTUCO_STORES.length})`);
for (const s of PINTUCO_STORES) {
  w(`insert into public.pickup_locations (external_ref, name, city, address, phone, hours, has_color_studio, has_tech_advisor, has_express_pickup, stock_readiness_hours) values (${S(s.id)}, ${S(s.name)}, ${S(s.city)}, ${S(s.address)}, ${S(s.phone)}, ${S(s.hours)}, ${B(s.hasColorStudio)}, ${B(s.hasTechAdvisor)}, ${B(s.hasExpressPickup)}, ${N(s.stockReadinessHours)}) on conflict (external_ref) do nothing;`);
}
w();

// Productos + variantes + colores + superficies.
w(`-- Productos (${PINTUCO_PRODUCTS.length}) con sus variantes`);
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

// Inventario derivado de stockStatus.
w('-- Inventario derivado de stockStatus por punto: InStock 40, LowStock 4, PreOrder 0.');
const QTY: Record<string, number> = { InStock: 40, LowStock: 4, PreOrder: 0 };
for (const p of PINTUCO_PRODUCTS as StoreProduct[]) {
  for (const pres of p.presentations) {
    w(`insert into public.inventory (variant_id, location_id, qty_available) select v.id, l.id, ${N(QTY[pres.stockStatus] ?? 0)} from public.product_variants v cross join public.pickup_locations l where v.external_ref=${S(pres.id)} and v.product_id=(select id from public.products where external_ref=${S(p.id)}) on conflict (variant_id, location_id) do nothing;`);
  }
}
w();

// Soluciones del catálogo.
w(`-- Soluciones del catálogo (${SOLUTIONS_CATALOG.length}), is_kit = false`);
for (const s of SOLUTIONS_CATALOG) {
  w(`insert into public.solutions (external_ref, name, category_id, is_kit, description, image_url, badge, application, surface_summary, features, system_summary, durability_estimate, spread_rate_info, packagings, step_by_step_guide, color_swatches) values (${S(s.id)}, ${S(s.name)}, (select id from public.categories where kind='SOLUTION' and name=${S(s.category)}), false, ${S(s.description)}, ${S(s.image)}, ${S(s.badge)}, ${S(s.application)}, ${S(s.surface)}, ${ARR(s.features)}, ${S(s.systemSummary)}, ${S(s.durabilityEstimate)}, ${S(s.spreadRateInfo)}, ${ARR(s.packagings)}, ${ARR(s.stepByStepGuide)}, ${JSONB(s.colorSwatches)}) on conflict (external_ref) do nothing;`);
}
w();

// Kits.
w(`-- Kits comprables (${PINTUCO_SOLUTION_KITS.length}), is_kit = true`);
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
