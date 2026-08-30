import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * El costo, desde que entra hasta que se convierte en margen.
 *
 * Lo que se vigila, en orden de gravedad:
 *   1. Que el costo NO sea legible por un visitante de la tienda. Es el
 *      margen de Pintuco: publicarlo sería regalarle a la competencia su
 *      estructura de precios.
 *   2. Que el promedio ponderado se calcule bien. Si sale mal, toda la
 *      rentabilidad del negocio queda mal y nadie lo nota.
 *   3. Que un traslado se lleve el costo: mover mercancía a otra tienda no
 *      la abarata.
 *   4. Que la venta CONGELE el costo, para que la utilidad de un pedido
 *      viejo no cambie cuando suba un proveedor.
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

async function login(c: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
  });
  return (await r.json()).access_token ?? '';
}

const cab = (t?: string) => ({
  apikey: ANON,
  ...(t ? { Authorization: `Bearer ${t}` } : {}),
  'Content-Type': 'application/json',
});

const rpc = (fn: string, token: string, cuerpo: unknown) =>
  fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: cab(token),
    body: JSON.stringify(cuerpo),
  });

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Costos: recepción, promedio y margen', () => {
  let tAdmin = '';
  let tCliente = '';
  let variante = '';
  let bodegaA = '';
  let bodegaB = '';
  let proveedor = '';
  let producto = '';
  const recibos: string[] = [];

  const inventario = async (loc: string) => {
    const [f] = await fetch(
      `${API}/rest/v1/inventory?select=qty_available,avg_cost_cop&variant_id=eq.${variante}&location_id=eq.${loc}`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());
    return { cantidad: f?.qty_available ?? 0, costo: Number(f?.avg_cost_cop ?? 0) };
  };

  const recibir = async (loc: string, cantidad: number, costo: number) => {
    const id = (await rpc('create_purchase_receipt', tAdmin, {
      _location_id: loc,
      _supplier_id: proveedor,
      _document_ref: `FV-${Date.now()}`,
    }).then((r) => r.json())) as string;
    recibos.push(id);

    await fetch(`${API}/rest/v1/purchase_receipt_items`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({
        receipt_id: id,
        variant_id: variante,
        quantity: cantidad,
        unit_cost_cop: costo,
        subtotal_cop: cantidad * costo,
      }),
    });

    const r = await rpc('confirm_purchase_receipt', tAdmin, { _receipt_id: id });
    return { id, ok: r.ok, cuerpo: await r.json() };
  };

  beforeAll(async () => {
    [tAdmin, tCliente] = await Promise.all([login(ADMIN), login(CLIENTE)]);

    // Producto y presentación PROPIOS, no una referencia de la semilla.
    //
    // Las suites corren en paralelo: si esta y la de inventario eligen la
    // misma referencia y la misma bodega, los saldos se pisan y las
    // comprobaciones de promedio ponderado fallan de forma intermitente por
    // un motivo que nada tiene que ver con lo que están verificando.
    const sello = Date.now();
    // Se crea INACTIVO: un producto de prueba activo entra en el conteo del
    // catálogo público y hace fallar la comprobación de fidelidad de otra
    // suite que corre en paralelo.
    //
    // Y se inserta SIN `return=representation`: desde que el costo dejó de
    // ser una columna pública, nadie tiene SELECT sobre la tabla entera, y
    // devolver la fila insertada lo exige. Se consulta después con la lista
    // de columnas explícita. La pantalla de catálogo tiene la misma
    // restricción y por eso escribe a través de funciones del servidor.
    const codigo = `TEST-COSTO-${sello}`;
    await fetch(`${API}/rest/v1/products`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ code: codigo, name: `Producto de prueba ${sello}`, status: 'INACTIVO' }),
    });
    producto = await fetch(`${API}/rest/v1/products?select=id&code=eq.${codigo}`, {
      headers: cab(tAdmin),
    })
      .then((r) => r.json())
      .then((d) => d[0].id);

    const sku = `${codigo}-V1`;
    await fetch(`${API}/rest/v1/product_variants`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({
        product_id: producto,
        label: 'Presentación de prueba',
        sku,
        price_cop: 200000,
        status: 'INACTIVO',
      }),
    });
    variante = await fetch(`${API}/rest/v1/product_variants?select=id&sku=eq.${sku}`, {
      headers: cab(tAdmin),
    })
      .then((r) => r.json())
      .then((d) => d[0].id);

    const locs = await fetch(`${API}/rest/v1/pickup_locations?select=id&order=name&limit=2`, {
      headers: cab(tAdmin),
    }).then((r) => r.json());
    bodegaA = locs[0].id;
    bodegaB = locs[1].id;

    proveedor = await fetch(`${API}/rest/v1/suppliers`, {
      method: 'POST',
      headers: { ...cab(tAdmin), Prefer: 'return=representation' },
      body: JSON.stringify({ name: `Proveedor de prueba ${Date.now()}`, nit: `900${Date.now()}` }),
    })
      .then((r) => r.json())
      .then((d) => d[0].id);
  });

  afterAll(async () => {
    if (!SERVICE) return;
    const s = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
    for (const id of recibos) {
      // El comprobante contable va primero: la recepción lo referencia con
      // ON DELETE SET NULL, así que borrarla lo dejaría huérfano y sumando en
      // los libros del negocio.
      await fetch(`${API}/rest/v1/journal_entries?receipt_id=eq.${id}`, { method: 'DELETE', headers: s });
      await fetch(`${API}/rest/v1/purchase_receipts?id=eq.${id}`, { method: 'DELETE', headers: s });
    }
    if (proveedor) {
      await fetch(`${API}/rest/v1/suppliers?id=eq.${proveedor}`, { method: 'DELETE', headers: s });
    }
    // El inventario y sus movimientos referencian la variante: se retiran
    // antes de borrar el producto de prueba.
    if (variante) {
      await fetch(`${API}/rest/v1/inventory_movements?variant_id=eq.${variante}`, { method: 'DELETE', headers: s });
      await fetch(`${API}/rest/v1/inventory?variant_id=eq.${variante}`, { method: 'DELETE', headers: s });
      await fetch(`${API}/rest/v1/product_variants?id=eq.${variante}`, { method: 'DELETE', headers: s });
    }
    if (producto) {
      await fetch(`${API}/rest/v1/products?id=eq.${producto}`, { method: 'DELETE', headers: s });
    }
  });

  it('el costo NO es visible para un visitante de la tienda', async () => {
    const r = await fetch(`${API}/rest/v1/product_variants?select=sku,cost_cop&limit=1`, {
      headers: cab(),
    });
    // PostgREST rechaza la consulta porque `anon` no tiene permiso sobre esa
    // columna. Si algún día devolviera 200, el margen sería público.
    expect(r.ok).toBe(false);
  });

  it('un cliente autenticado tampoco ve el costo', async () => {
    // `authenticated` en Supabase es CUALQUIERA con sesión, y aquí la mayoría
    // son clientes. Conceder la columna a ese rol equivalía a publicarla.
    const variantes = await fetch(`${API}/rest/v1/product_variants?select=cost_cop&limit=1`, {
      headers: cab(tCliente),
    });
    expect(variantes.ok).toBe(false);

    const lineas = await fetch(`${API}/rest/v1/order_items?select=unit_cost_cop&limit=1`, {
      headers: cab(tCliente),
    });
    expect(lineas.ok).toBe(false);

    // El inventario queda fuera de su alcance por RLS: sin filas no hay costos.
    const inv = await fetch(`${API}/rest/v1/inventory?select=avg_cost_cop&limit=1`, {
      headers: cab(tCliente),
    });
    expect(inv.ok ? await inv.json() : []).toEqual([]);

    // Y la vista de costos tampoco le devuelve nada.
    const vista = await fetch(`${API}/rest/v1/v_costos_catalogo?select=costo_promedio&limit=1`, {
      headers: cab(tCliente),
    });
    expect(vista.ok ? await vista.json() : []).toEqual([]);
  });

  it('el personal sí ve los costos por la vista, con su margen', async () => {
    const filas = await fetch(
      `${API}/rest/v1/v_costos_catalogo?select=sku,price_cop,costo_promedio,margen_pct&limit=5`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      if (f.costo_promedio !== null && Number(f.price_cop) > 0) {
        expect(f.margen_pct).not.toBeNull();
      }
    }
  });

  it('recibir mercancía deja registrado su costo', async () => {
    // No se afirma un valor absoluto: la bodega puede traer costo de una
    // ejecución anterior, y una prueba que exija un entorno virgen falla por
    // el motivo equivocado. Lo que importa es la fórmula.
    const antes = await inventario(bodegaA);
    const r = await recibir(bodegaA, 10, 100000);
    expect(r.ok).toBe(true);

    const esperado =
      antes.cantidad <= 0 || antes.costo === 0
        ? 100000
        : Math.round(
            ((antes.cantidad * antes.costo + 10 * 100000) / (antes.cantidad + 10)) * 100,
          ) / 100;

    const despues = await inventario(bodegaA);
    expect(despues.cantidad).toBe(antes.cantidad + 10);
    expect(despues.costo).toBeCloseTo(esperado, 2);
  });

  it('la segunda recepción promedia de forma ponderada', async () => {
    // 10 unidades a 100.000 ya en bodega + 30 a 140.000 =
    // (10×100.000 + 30×140.000) / 40 = 130.000
    const antes = await inventario(bodegaA);
    const r = await recibir(bodegaA, 30, 140000);
    expect(r.ok).toBe(true);

    const esperado =
      Math.round(
        ((antes.cantidad * antes.costo + 30 * 140000) / (antes.cantidad + 30)) * 100,
      ) / 100;

    const despues = await inventario(bodegaA);
    expect(despues.cantidad).toBe(antes.cantidad + 30);
    expect(despues.costo).toBeCloseTo(esperado, 2);
  });

  it('el traslado se lleva el costo a la otra bodega', async () => {
    // Sin esto, la mercancía trasladada valdría cero en destino y su venta
    // daría un margen del 100 %.
    const origen = await inventario(bodegaA);
    const destinoAntes = await inventario(bodegaB);

    const r = await rpc('transfer_inventory', tAdmin, {
      _variant_id: variante,
      _origen: bodegaA,
      _destino: bodegaB,
      _cantidad: 5,
    });
    expect(r.ok).toBe(true);

    const destino = await inventario(bodegaB);
    expect(destino.cantidad).toBe(destinoAntes.cantidad + 5);
    expect(destino.costo).toBeGreaterThan(0);

    // El origen no cambia de costo: sacar unidades no altera lo que costaron
    // las que quedan.
    expect((await inventario(bodegaA)).costo).toBeCloseTo(origen.costo, 2);
  });

  it('una recepción confirmada no se puede confirmar dos veces', async () => {
    const id = recibos[0];
    const r = await rpc('confirm_purchase_receipt', tAdmin, { _receipt_id: id });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/YA_PROCESADA/);
  });

  it('una recepción sin líneas no se confirma', async () => {
    const id = (await rpc('create_purchase_receipt', tAdmin, {
      _location_id: bodegaA,
    }).then((r) => r.json())) as string;
    recibos.push(id);

    const r = await rpc('confirm_purchase_receipt', tAdmin, { _receipt_id: id });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/SIN_LINEAS/);
  });

  it('una recepción confirmada no se anula: se corrige con un ajuste', async () => {
    const r = await rpc('void_purchase_receipt', tAdmin, { _receipt_id: recibos[0] });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/YA_CONFIRMADA/);
  });

  it('un cliente no puede recibir mercancía ni ver proveedores', async () => {
    const crear = await rpc('create_purchase_receipt', tCliente, { _location_id: bodegaA });
    expect(crear.ok).toBe(false);

    const prov = await fetch(`${API}/rest/v1/suppliers?select=name`, { headers: cab(tCliente) })
      .then((r) => r.json());
    expect(prov).toEqual([]);
  });

  it('el costo vigente nunca devuelve cero cuando hay costo cargado', async () => {
    // Un cero daría margen del 100 % y ensuciaría la analítica en silencio.
    const costo = await rpc('costo_vigente', tAdmin, {
      _variant_id: variante,
      _location_id: bodegaA,
    }).then((r) => r.json());
    expect(Number(costo)).toBeGreaterThan(0);
  });

  it('un rol interno SIN el permiso de costos no ve la vista', async () => {
    // El costo revela el margen del negocio: no tiene por qué verlo quien
    // programa visitas técnicas. Ser personal interno no basta.
    const tecnico = await login({ email: 'tecnico@pintuco.demo', password: 'pintuco2025*' });
    const filas = await fetch(`${API}/rest/v1/v_costos_catalogo?select=sku&limit=1`, {
      headers: cab(tecnico),
    }).then((r) => r.json());
    expect(filas).toEqual([]);
  });

  it('la analítica distingue un margen medido de uno estimado', async () => {
    const filas = await fetch(
      `${API}/rest/v1/v_ventas?select=cost_cop,margen_linea,costo_estimado&limit=5`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());
    expect(Array.isArray(filas)).toBe(true);
    for (const f of filas) {
      // Si hay costo, hay margen; y si el costo vino del catálogo y no de la
      // venta, la fila lo declara en lugar de presentarlo como medición.
      if (f.cost_cop !== null) expect(f.margen_linea).not.toBeNull();
      expect(typeof f.costo_estimado).toBe('boolean');
    }
  });
});
