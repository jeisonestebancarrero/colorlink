import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Inventario por punto de venta.
 *
 * Lo que se vigila:
 *   1. Que un traslado mueva las DOS bodegas o ninguna. Como dos movimientos
 *      sueltos, si el segundo fallaba la mercancía salía de un punto y no
 *      entraba en ninguno: desaparecía del sistema.
 *   2. Que no se pueda trasladar más de lo que hay.
 *   3. Que el resumen por punto no se lo pueda leer un cliente. Saber cuánto
 *      stock tiene Pintuco en cada tienda es información comercial.
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

async function login(cred: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(cred),
  });
  return (await r.json()).access_token ?? '';
}

const cab = (t: string) => ({
  apikey: ANON,
  Authorization: `Bearer ${t}`,
  'Content-Type': 'application/json',
});

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Inventario por punto de venta', () => {
  let tAdmin = '';
  let tCliente = '';
  let variante = '';
  let origen = '';
  let destino = '';

  const saldo = async (locationId: string): Promise<number> => {
    const [f] = await fetch(
      `${API}/rest/v1/inventory?select=qty_available&variant_id=eq.${variante}&location_id=eq.${locationId}`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());
    return f?.qty_available ?? 0;
  };

  beforeAll(async () => {
    [tAdmin, tCliente] = await Promise.all([login(ADMIN), login(CLIENTE)]);

    const filas = await fetch(
      `${API}/rest/v1/inventory?select=variant_id,location_id,qty_available&order=qty_available.desc&limit=40`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    // Una referencia que exista en dos puntos distintos.
    for (const f of filas) {
      const otra = filas.find(
        (g: { variant_id: string; location_id: string }) =>
          g.variant_id === f.variant_id && g.location_id !== f.location_id,
      );
      if (otra) {
        variante = f.variant_id;
        origen = f.location_id;
        destino = otra.location_id;
        break;
      }
    }
  });

  it('el entorno tiene una referencia en dos puntos de venta', () => {
    expect(variante).not.toBe('');
    expect(origen).not.toBe(destino);
  });

  it('el traslado descuenta en el origen y suma en el destino', async () => {
    const antesO = await saldo(origen);
    const antesD = await saldo(destino);

    const r = await fetch(`${API}/rest/v1/rpc/transfer_inventory`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({
        _variant_id: variante,
        _origen: origen,
        _destino: destino,
        _cantidad: 3,
        _notas: 'prueba automatizada',
      }),
    });
    expect(r.ok).toBe(true);

    expect(await saldo(origen)).toBe(antesO - 3);
    expect(await saldo(destino)).toBe(antesD + 3);

    // Se devuelve para dejar el inventario como estaba.
    await fetch(`${API}/rest/v1/rpc/transfer_inventory`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({
        _variant_id: variante,
        _origen: destino,
        _destino: origen,
        _cantidad: 3,
        _notas: 'devolución de la prueba',
      }),
    });
    expect(await saldo(origen)).toBe(antesO);
    expect(await saldo(destino)).toBe(antesD);
  });

  it('las dos patas quedan con la misma referencia de traslado', async () => {
    const movs = await fetch(
      `${API}/rest/v1/inventory_movements?select=kind,reference,quantity&variant_id=eq.${variante}&order=created_at.desc&limit=4`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    const salida = movs.find((m: { kind: string }) => m.kind === 'TRASLADO_SALIDA');
    const entrada = movs.find((m: { kind: string }) => m.kind === 'TRASLADO_ENTRADA');
    expect(salida?.reference).toBeTruthy();
    expect(entrada?.reference).toBe(salida?.reference);
  });

  it('no se puede trasladar más de lo que hay', async () => {
    const hay = await saldo(origen);
    const r = await fetch(`${API}/rest/v1/rpc/transfer_inventory`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({
        _variant_id: variante,
        _origen: origen,
        _destino: destino,
        _cantidad: hay + 1000,
      }),
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/INSUFFICIENT_STOCK/);
    expect(await saldo(origen)).toBe(hay);
  });

  it('no se puede trasladar de un punto a sí mismo', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/transfer_inventory`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({
        _variant_id: variante,
        _origen: origen,
        _destino: origen,
        _cantidad: 1,
      }),
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/SAME_LOCATION/);
  });

  it('un cliente no puede trasladar inventario', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/transfer_inventory`, {
      method: 'POST',
      headers: cab(tCliente),
      body: JSON.stringify({
        _variant_id: variante,
        _origen: origen,
        _destino: destino,
        _cantidad: 1,
      }),
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('el punto de reorden se guarda y solo lo mueve el personal', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/set_reorder_point`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _variant_id: variante, _location_id: origen, _min_qty: 12 }),
    });
    expect(r.ok).toBe(true);

    const [f] = await fetch(
      `${API}/rest/v1/inventory?select=min_qty&variant_id=eq.${variante}&location_id=eq.${origen}`,
      { headers: cab(tAdmin) },
    ).then((x) => x.json());
    expect(f.min_qty).toBe(12);

    const ajeno = await fetch(`${API}/rest/v1/rpc/set_reorder_point`, {
      method: 'POST',
      headers: cab(tCliente),
      body: JSON.stringify({ _variant_id: variante, _location_id: origen, _min_qty: 0 }),
    });
    expect(ajeno.ok).toBe(false);

    // Se deja como estaba.
    await fetch(`${API}/rest/v1/rpc/set_reorder_point`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _variant_id: variante, _location_id: origen, _min_qty: 0 }),
    });
  });

  it('el resumen por punto no lo puede leer un cliente', async () => {
    // Cuánto stock tiene cada tienda es información comercial de Pintuco.
    const r = await fetch(`${API}/rest/v1/v_inventario_por_punto?select=punto`, {
      headers: cab(tCliente),
    });
    const filas = await r.json();
    expect(Array.isArray(filas) ? filas : []).toEqual([]);
  });

  it('el personal sí ve el resumen, con totales coherentes', async () => {
    const filas = await fetch(
      `${API}/rest/v1/v_inventario_por_punto?select=*&order=punto`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect(f.neto).toBe(f.disponible - f.reservado);
      expect(f.referencias).toBeGreaterThanOrEqual(0);
    }
  });
});
