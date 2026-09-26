import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Costos: no legibles por visitantes, promedio ponderado correcto, el traslado conserva
 * el costo y la venta lo congela para que el margen histórico no cambie.
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

    // Producto propio: compartir referencia y bodega con la suite de inventario en paralelo
    // pisaría los saldos del promedio ponderado.
    const sello = Date.now();
    // Inactivo para no alterar el conteo de fidelidad del catálogo. Sin `return=representation`:
    // nadie tiene SELECT sobre toda la tabla desde que el costo es columna restringida.
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
      // El comprobante va primero: la FK es ON DELETE SET NULL y quedaría huérfano en los libros.
      await fetch(`${API}/rest/v1/journal_entries?receipt_id=eq.${id}`, { method: 'DELETE', headers: s });
      await fetch(`${API}/rest/v1/purchase_receipts?id=eq.${id}`, { method: 'DELETE', headers: s });
    }
    if (proveedor) {
      await fetch(`${API}/rest/v1/suppliers?id=eq.${proveedor}`, { method: 'DELETE', headers: s });
    }
    // Inventario y movimientos referencian la variante: se retiran antes del producto.
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
    // `anon` no tiene permiso sobre la columna; un 200 significaría margen público.
    expect(r.ok).toBe(false);
  });

  it('un cliente autenticado tampoco ve el costo', async () => {
    // `authenticated` es cualquiera con sesión, en su mayoría clientes: no puede tener la columna.
    const variantes = await fetch(`${API}/rest/v1/product_variants?select=cost_cop&limit=1`, {
      headers: cab(tCliente),
    });
    expect(variantes.ok).toBe(false);

    const lineas = await fetch(`${API}/rest/v1/order_items?select=unit_cost_cop&limit=1`, {
      headers: cab(tCliente),
    });
    expect(lineas.ok).toBe(false);

    // RLS deja el inventario fuera de su alcance: sin filas no hay costos.
    const inv = await fetch(`${API}/rest/v1/inventory?select=avg_cost_cop&limit=1`, {
      headers: cab(tCliente),
    });
    expect(inv.ok ? await inv.json() : []).toEqual([]);

    // La vista de costos tampoco devuelve nada.
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
    // No se asume un entorno virgen: se verifica la fórmula sobre el costo previo.
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
    // Sin arrastrar el costo, la mercancía valdría cero en destino.
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

    // Sacar unidades no altera el costo de las que quedan.
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
    // Un costo cero daría margen del 100 % y ensuciaría la analítica.
    const costo = await rpc('costo_vigente', tAdmin, {
      _variant_id: variante,
      _location_id: bodegaA,
    }).then((r) => r.json());
    expect(Number(costo)).toBeGreaterThan(0);
  });

  it('un rol interno SIN el permiso de costos no ve la vista', async () => {
    // Ser personal interno no basta: el técnico no debe ver costos.
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
      // Con costo hay margen; si el costo es del catálogo y no de la venta, la fila lo marca como estimado.
      if (f.cost_cop !== null) expect(f.margen_linea).not.toBeNull();
      expect(typeof f.costo_estimado).toBe('boolean');
    }
  });
});
