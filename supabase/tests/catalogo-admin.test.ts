import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Catálogo desde el portal interno.
 *
 * Lo que se vigila:
 *   1. Que un cliente no pueda crear ni modificar productos, presentaciones
 *      ni colores. Es la vitrina de Pintuco.
 *   2. Que no se cuelen datos que rompen la tienda: precios en cero, códigos
 *      duplicados, IVA inventado, hexadecimales inválidos.
 *   3. Que el RGB de un color se derive del hexadecimal y no se pida aparte,
 *      que es como la carta original terminó con dos colores contradiciéndose.
 *   4. Que lo publicado aquí sea exactamente lo que ve el cliente.
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
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const ADMIN = { email: 'admin@pintuco.demo', password: 'pintuco2025*' };
const CLIENTE = { email: 'carlos.mendoza@constructorahorizonte.com', password: 'pintuco2025*' };

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const login = (c: { email: string; password: string }) =>
  fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
  })
    .then((r) => r.json())
    .then((j) => j.access_token ?? '');

const cab = (t?: string) => ({
  apikey: ANON,
  ...(t ? { Authorization: `Bearer ${t}` } : {}),
  'Content-Type': 'application/json',
});

const rpc = (fn: string, token: string, datos: unknown) =>
  fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: cab(token),
    body: JSON.stringify({ _datos: datos }),
  });

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Catálogo · administración', () => {
  let tAdmin = '';
  let tCliente = '';
  let producto = '';
  let variante = '';
  let color = '';
  let categoria = '';
  const sello = Date.now();
  const codigo = `TEST-CAT-${sello}`;

  beforeAll(async () => {
    [tAdmin, tCliente] = await Promise.all([login(ADMIN), login(CLIENTE)]);
  });

  afterAll(async () => {
    if (!SERVICE) return;
    const s = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
    if (variante) {
      await fetch(`${API}/rest/v1/product_variants?id=eq.${variante}`, { method: 'DELETE', headers: s });
    }
    if (producto) {
      await fetch(`${API}/rest/v1/products?id=eq.${producto}`, { method: 'DELETE', headers: s });
    }
    if (color) {
      await fetch(`${API}/rest/v1/colors?id=eq.${color}`, { method: 'DELETE', headers: s });
    }
    if (categoria) {
      await fetch(`${API}/rest/v1/categories?id=eq.${categoria}`, { method: 'DELETE', headers: s });
    }
  });

  // ── Categorías ─────────────────────────────────────────────────────────
  it('un cliente no puede crear categorías', async () => {
    const r = await rpc('upsert_category', tCliente, { name: `Pirata ${sello}` });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('administración crea una categoría y queda colgada de la raíz', async () => {
    const r = await rpc('upsert_category', tAdmin, {
      name: `Categoría de prueba ${sello}`,
      description: 'Solo para la suite',
      sort_order: 99,
    });
    expect(r.ok).toBe(true);
    categoria = (await r.json()) as string;
    expect(categoria).toMatch(/^[0-9a-f-]{36}$/);

    const [fila] = await fetch(
      `${API}/rest/v1/categories?select=slug,kind,parent_id,status&id=eq.${categoria}`,
      { headers: cab() },
    ).then((r2) => r2.json());

    expect(fila.kind).toBe('PRODUCT');
    expect(fila.status).toBe('ACTIVO');
    // Sin padre la tienda no la lista nunca: sería una categoría que solo
    // existe en el portal interno.
    expect(fila.parent_id).not.toBeNull();
    expect(fila.slug).toMatch(/^categoria-de-prueba-\d+$/);
  });

  it('la categoría nueva aparece en el filtro de la tienda', async () => {
    // La misma consulta que hace StorePage: solo hijas, activas y de producto.
    const filtros = await fetch(
      `${API}/rest/v1/categories?select=name&kind=eq.PRODUCT&status=eq.ACTIVO&parent_id=not.is.null`,
      { headers: cab() },
    ).then((r) => r.json());

    expect((filtros as Array<{ name: string }>).map((c) => c.name)).toContain(
      `Categoría de prueba ${sello}`,
    );
  });

  it('rechaza una categoría con nombre repetido', async () => {
    const r = await rpc('upsert_category', tAdmin, { name: `Categoría de prueba ${sello}` });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/NOMBRE_DUPLICADO/);
  });

  it('rechaza un tipo de categoría inventado', async () => {
    const r = await rpc('upsert_category', tAdmin, { name: `X ${sello}`, kind: 'COLORES' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/TIPO_INVALIDO/);
  });

  it('un cliente no puede crear productos', async () => {
    const r = await rpc('upsert_product', tCliente, { code: 'PIRATA', name: 'Producto pirata' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('administración crea un producto oculto', async () => {
    const r = await rpc('upsert_product', tAdmin, {
      code: codigo,
      name: `Producto de prueba ${sello}`,
      tagline: 'Solo para la suite',
      tax_rate: 19,
      status: 'INACTIVO',
    });
    expect(r.ok).toBe(true);
    producto = (await r.json()) as string;
    expect(producto).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rechaza un código de producto duplicado', async () => {
    const r = await rpc('upsert_product', tAdmin, { code: codigo, name: 'Otro' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/CODIGO_DUPLICADO/);
  });

  it('rechaza un IVA que no existe en Colombia', async () => {
    // Un dedazo aquí sale mal en la factura de todos los pedidos.
    const r = await rpc('upsert_product', tAdmin, {
      code: `${codigo}-B`, name: 'Con IVA raro', tax_rate: 16,
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/IVA_INVALIDO/);
  });

  it('crea una presentación con su precio', async () => {
    const r = await rpc('upsert_variant', tAdmin, {
      product_id: producto,
      label: '1 Galón (3.785 L)',
      sku: `${codigo}-V1`,
      price_cop: 150000,
      status: 'INACTIVO',
    });
    expect(r.ok).toBe(true);
    variante = (await r.json()) as string;
  });

  it('no acepta un precio en cero', async () => {
    const r = await rpc('upsert_variant', tAdmin, {
      product_id: producto, label: 'Gratis', price_cop: 0,
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/PRECIO_INVALIDO/);
  });

  it('no acepta dos presentaciones con el mismo SKU', async () => {
    const r = await rpc('upsert_variant', tAdmin, {
      product_id: producto, label: 'Otra', sku: `${codigo}-V1`, price_cop: 1000,
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/SKU_DUPLICADO/);
  });

  it('el costo NO se toca al editar una presentación', async () => {
    // El costo entra por la recepción. Si se pudiera escribir aquí, se
    // reescribiría en silencio la rentabilidad histórica.
    await fetch(`${API}/rest/v1/rpc/set_standard_cost`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _variant_id: variante, _costo: 90000 }),
    });

    await rpc('upsert_variant', tAdmin, {
      id: variante,
      label: '1 Galón (3.785 L)',
      sku: `${codigo}-V1`,
      price_cop: 160000,
      cost_cop: 1,
    });

    const [fila] = await fetch(
      `${API}/rest/v1/v_costos_catalogo?select=costo_estandar,price_cop&variant_id=eq.${variante}`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());
    expect(Number(fila.price_cop)).toBe(160000);
    expect(Number(fila.costo_estandar)).toBe(90000);
  });

  it('un color deriva su RGB del hexadecimal', async () => {
    const r = await rpc('upsert_color', tAdmin, {
      code: `TST-${sello % 100000}`,
      name: 'Color de prueba',
      hex: '#1A2B3C',
      family: 'Azules & Frescos',
      status: 'INACTIVO',
    });
    expect(r.ok).toBe(true);
    color = (await r.json()) as string;

    const [c] = await fetch(`${API}/rest/v1/colors?select=hex,rgb&id=eq.${color}`, {
      headers: cab(tAdmin),
    }).then((x) => x.json());
    expect(c.hex).toBe('#1A2B3C');
    expect(c.rgb).toBe('26, 43, 60');
  });

  it('rechaza un hexadecimal inválido', async () => {
    const r = await rpc('upsert_color', tAdmin, {
      code: `BAD-${sello % 100000}`, name: 'Malo', hex: 'azulito',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/HEX_INVALIDO/);
  });

  it('un cliente no puede crear ni modificar colores', async () => {
    const r = await rpc('upsert_color', tCliente, {
      id: color, code: 'PIRATA', name: 'Secuestrado', hex: '#000000',
    });
    expect(r.ok).toBe(false);
  });

  it('lo oculto no llega a la tienda del cliente; lo publicado sí', async () => {
    // Esta es la promesa del módulo: publicar aquí es publicar allá.
    const oculto = await fetch(`${API}/rest/v1/products?select=id&id=eq.${producto}`, {
      headers: cab(),
    }).then((r) => r.json());
    expect(oculto).toEqual([]);

    await rpc('upsert_product', tAdmin, {
      id: producto, code: codigo, name: `Producto de prueba ${sello}`, status: 'ACTIVO',
    });

    const visible = await fetch(`${API}/rest/v1/products?select=name&id=eq.${producto}`, {
      headers: cab(),
    }).then((r) => r.json());
    expect(visible).toHaveLength(1);

    // Se vuelve a ocultar para no alterar el conteo del catálogo, que otra
    // suite comprueba en paralelo.
    await rpc('upsert_product', tAdmin, {
      id: producto, code: codigo, name: `Producto de prueba ${sello}`, status: 'INACTIVO',
    });
  });
});
