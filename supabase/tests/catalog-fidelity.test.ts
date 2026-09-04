import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  PINTUCO_PRODUCTS,
  PINTUCO_SOLUTION_KITS,
  PINTUCO_STORES,
  PINTUCO_COLOR_PALETTES,
} from '../../src/data/storeMockData';
import { SOLUTIONS_CATALOG } from '../../src/data/mockData';
import {
  aColorSwatch,
  aPintucoStore,
  aSolutionCatalogItem,
  aSolutionKit,
  aStoreProduct,
} from '../../src/services/catalogMappers';

/**
 * FIDELIDAD DEL CATÁLOGO — FASE 4
 * ============================================================
 * La prueba central de esta fase: lo que devuelve Supabase debe ser
 * equivalente a lo que devolvían los datos mock. Si algo se perdió o se
 * deformó en el camino a la base de datos, aquí se ve.
 *
 * Consulta la API REST directamente y aplica los mismos traductores que usa
 * el servicio, de modo que se ejercita exactamente la cadena real.
 */

function leerEnvLocal(): Record<string, string> {
  const ruta = resolve(process.cwd(), '.env.local');
  if (!existsSync(ruta)) return {};
  const vars: Record<string, string> = {};
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return vars;
}

const env = leerEnvLocal();
const API = env.VITE_SUPABASE_URL ?? '';
const ANON = env.VITE_SUPABASE_ANON_KEY ?? '';
const cab = { apikey: ANON, 'Content-Type': 'application/json' };

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: cab });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const get = async (path: string) => {
  const r = await fetch(`${API}/rest/v1/${path}`, { headers: cab });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
};

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Fidelidad catálogo: Supabase vs datos mock', () => {
  let productos: ReturnType<typeof aStoreProduct>[] = [];

  beforeAll(async () => {
    const [filas, disp] = await Promise.all([
      get(
        'products?select=id,external_ref,code,name,tagline,description,environment,finish,coverage,spread_rate_m2_per_gal,drying_time,features,image_url,tech_sheet_url,rating,reviews_count,is_popular,badge,categories(name),product_variants(id,label,price_cop,volume_liters,sort_order),product_colors(sort_order,colors(code,name,hex,rgb,family,recommended_product,description)),product_surfaces(surfaces(name))&status=eq.ACTIVO'
      ),
      get('v_variant_availability?select=variant_id,stock_status'),
    ]);
    const mapa = new Map<string, 'InStock' | 'LowStock' | 'PreOrder'>();
    for (const d of disp) mapa.set(d.variant_id, d.stock_status);
    // Se descartan los productos que crean otras suites. Corren en paralelo
    // y alguna publica el suyo un instante para comprobar que lo publicado
    // aquí llega a la tienda; sin este filtro, esta comprobación fallaba de
    // vez en cuando por un producto que nada tiene que ver con la carta.
    productos = filas
      .filter((f: { code?: string }) => !String(f.code ?? '').startsWith('TEST-'))
      .map((f: never) => aStoreProduct(f, mapa));
  });

  it('está el mismo número de productos', () => {
    expect(productos).toHaveLength(PINTUCO_PRODUCTS.length);
  });

  it('cada producto conserva código, nombre, acabado y rendimiento', () => {
    for (const esperado of PINTUCO_PRODUCTS) {
      const real = productos.find((p) => p.id === esperado.id);
      expect(real, `falta ${esperado.id}`).toBeDefined();
      expect(real!.code).toBe(esperado.code);
      expect(real!.name).toBe(esperado.name);
      expect(real!.category).toBe(esperado.category);
      expect(real!.environment).toBe(esperado.environment);
      expect(real!.finish).toBe(esperado.finish);
      expect(real!.spreadRateM2PerGal).toBe(esperado.spreadRateM2PerGal);
      expect(real!.reviewsCount).toBe(esperado.reviewsCount);
      expect(real!.rating).toBe(esperado.rating);
    }
  });

  it('TODOS los precios coinciden con el dato original', () => {
    for (const esperado of PINTUCO_PRODUCTS) {
      const real = productos.find((p) => p.id === esperado.id)!;
      for (const pres of esperado.presentations) {
        const v = real.presentations.find((x) => x.label === pres.label);
        expect(v, `${esperado.id} sin presentación ${pres.label}`).toBeDefined();
        expect(v!.priceCOP, `precio de ${esperado.id} / ${pres.label}`).toBe(pres.priceCOP);
        expect(v!.volumeLiters).toBe(pres.volumeLiters);
      }
      expect(real.presentations).toHaveLength(esperado.presentations.length);
    }
  });

  it('se conservan las características y superficies de cada producto', () => {
    for (const esperado of PINTUCO_PRODUCTS) {
      const real = productos.find((p) => p.id === esperado.id)!;
      expect(real.features).toEqual(esperado.features);
      expect([...real.surface].sort()).toEqual([...esperado.surface].sort());
    }
  });

  it('la carta conserva intactos los 20 colores originales', async () => {
    const filas = await get(
      'colors?select=code,name,hex,rgb,family,recommended_product,description&status=eq.ACTIVO&is_palette=eq.true&order=code'
    );
    const colores: ReturnType<typeof aColorSwatch>[] = filas.map(aColorSwatch);

    // La carta creció a propósito. Lo que esta prueba vigila no es el número
    // sino que ninguno de los tonos originales se haya perdido ni cambiado al
    // ampliarla: eso sí sería una regresión.
    expect(colores.length).toBeGreaterThanOrEqual(PINTUCO_COLOR_PALETTES.length);

    for (const esperado of PINTUCO_COLOR_PALETTES) {
      const real = colores.find((c) => c.code === esperado.code);
      expect(real, `falta color ${esperado.code}`).toBeDefined();
      expect(real!.name).toBe(esperado.name);
      expect(real!.hex).toBe(esperado.hex);
      expect(real!.family).toBe(esperado.family);
      expect(real!.rgb).toBe(esperado.rgb);
      expect(real!.description).toBe(esperado.description);
    }
  });

  it('los kits conservan pasos, descuento y precios', async () => {
    const filas = await get(
      'solutions?select=id,external_ref,name,description,image_url,badge,application,surface_summary,features,system_summary,durability_estimate,spread_rate_info,packagings,step_by_step_guide,color_swatches,subtitle,problem_target,ideal_for,warranty,discount_percent,tools_included,categories(name),solution_products(step_number,phase,role_description,quantity_for_85m2,image_url,presentation_label,unit_price_cop,products(external_ref,name),product_variants(price_cop))&is_kit=eq.true&status=eq.ACTIVO'
    );
    const kits: ReturnType<typeof aSolutionKit>[] = filas.map(aSolutionKit);
    expect(kits).toHaveLength(PINTUCO_SOLUTION_KITS.length);

    for (const esperado of PINTUCO_SOLUTION_KITS) {
      const real = kits.find((k) => k.id === esperado.id);
      expect(real, `falta kit ${esperado.id}`).toBeDefined();
      expect(real!.discountPercent).toBe(esperado.discountPercent);
      expect(real!.warranty).toBe(esperado.warranty);
      expect(real!.toolsIncluded).toEqual(esperado.toolsIncluded);
      expect(real!.steps).toHaveLength(esperado.steps.length);

      for (const pasoEsperado of esperado.steps) {
        const paso = real!.steps.find((s) => s.stepNumber === pasoEsperado.stepNumber)!;
        expect(paso.productId).toBe(pasoEsperado.productId);
        expect(paso.phaseName).toBe(pasoEsperado.phaseName);
        expect(paso.presentation).toBe(pasoEsperado.presentation);
        expect(paso.quantityFor85m2).toBe(pasoEsperado.quantityFor85m2);
        // El precio se toma de la variante real: debe coincidir con el que
        // el kit traía copiado.
        expect(paso.unitPriceCOP, `precio paso ${pasoEsperado.stepNumber} de ${esperado.id}`)
          .toBe(pasoEsperado.unitPriceCOP);
      }
    }
  });

  it('los 7 sistemas del catálogo conservan su contenido', async () => {
    const filas = await get(
      'solutions?select=id,external_ref,name,description,image_url,badge,application,surface_summary,features,system_summary,durability_estimate,spread_rate_info,packagings,step_by_step_guide,color_swatches,subtitle,problem_target,ideal_for,warranty,discount_percent,tools_included,categories(name)&is_kit=eq.false&status=eq.ACTIVO'
    );
    const soluciones: ReturnType<typeof aSolutionCatalogItem>[] = filas.map(aSolutionCatalogItem);
    expect(soluciones).toHaveLength(SOLUTIONS_CATALOG.length);

    for (const esperado of SOLUTIONS_CATALOG) {
      const real = soluciones.find((s) => s.id === esperado.id);
      expect(real, `falta solución ${esperado.id}`).toBeDefined();
      expect(real!.name).toBe(esperado.name);
      expect(real!.category).toBe(esperado.category);
      expect(real!.application).toBe(esperado.application);
      expect(real!.surface).toBe(esperado.surface);
      expect(real!.features).toEqual(esperado.features);
      expect(real!.systemSummary).toBe(esperado.systemSummary);
      expect(real!.stepByStepGuide).toEqual(esperado.stepByStepGuide ?? []);
      expect(real!.colorSwatches).toEqual(esperado.colorSwatches ?? []);
      expect(real!.packagings).toEqual(esperado.packagings ?? []);
    }
  });

  it('los 7 puntos de retiro conservan sus datos', async () => {
    const filas = await get(
      'pickup_locations?select=id,external_ref,name,city,address,phone,hours,has_color_studio,has_tech_advisor,has_express_pickup,stock_readiness_hours&status=eq.ACTIVO'
    );
    const tiendas: ReturnType<typeof aPintucoStore>[] = filas.map(aPintucoStore);
    expect(tiendas).toHaveLength(PINTUCO_STORES.length);

    for (const esperado of PINTUCO_STORES) {
      const real = tiendas.find((t) => t.id === esperado.id);
      expect(real, `falta tienda ${esperado.id}`).toBeDefined();

      // `imageUrl` se compara aparte: es un dato de presentación añadido
      // después, que no forma parte de la ficha comercial que esta prueba
      // vigila. Lo que sí importa es que no traiga basura: o una URL, o nada.
      const { imageUrl, ...ficha } = real!;
      expect(ficha).toEqual(esperado);
      expect(imageUrl === null || typeof imageUrl === 'string').toBe(true);
    }
  });
});
