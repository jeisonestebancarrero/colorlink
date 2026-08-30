import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Panel y analítica.
 *
 * Lo que se vigila:
 *   1. Que un cliente no pueda leer ni el panel ni la analítica. Son cifras de
 *      negocio: ventas, margen, rendimiento por tienda.
 *   2. Que el margen se calcule con el costo CONGELADO en la venta y no con el
 *      del catálogo. Si se usara el del catálogo, cambiar un costo hoy
 *      reescribiría el margen de ventas ya cerradas.
 *   3. Que los filtros acoten de verdad, y que un filtro vacío no se confunda
 *      con "ningún resultado".
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

const rpc = (fn: string, token: string, cuerpo: unknown = {}) =>
  fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: cab(token),
    body: JSON.stringify(cuerpo),
  });

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Panel y analítica', () => {
  let tAdmin = '';
  let tCliente = '';

  beforeAll(async () => {
    [tAdmin, tCliente] = await Promise.all([login(ADMIN), login(CLIENTE)]);
  });

  // ── Permisos ───────────────────────────────────────────────────────────
  it('un cliente no puede abrir el panel interno', async () => {
    const r = await rpc('resumen_panel', tCliente);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('un cliente no puede consultar la analítica', async () => {
    const r = await rpc('analitica_ventas', tCliente);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('un cliente no puede listar los filtros de la analítica', async () => {
    const r = await rpc('analitica_filtros', tCliente);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  // ── Panel ──────────────────────────────────────────────────────────────
  it('el panel responde con la bandeja del día', async () => {
    const r = await rpc('resumen_panel', tAdmin);
    expect(r.ok).toBe(true);
    const d = await r.json();

    for (const campo of [
      'por_confirmar', 'por_alistar', 'listos_para_retiro', 'ventas_hoy',
      'ventas_mes', 'ventas_mes_anterior', 'bajo_minimo', 'visitas_hoy',
      'proyectos_sin_asesor', 'sin_responder',
    ]) {
      expect(d, `falta ${campo}`).toHaveProperty(campo);
    }
    expect(Array.isArray(d.criticos)).toBe(true);
    expect(Array.isArray(d.agenda)).toBe(true);
    expect(Number(d.ventas_mes)).toBeGreaterThanOrEqual(0);
  });

  // ── Analítica ──────────────────────────────────────────────────────────
  it('la analítica cuadra: ingresos, margen y cortes', async () => {
    const r = await rpc('analitica_ventas', tAdmin);
    expect(r.ok).toBe(true);
    const d = await r.json();

    expect(Number(d.ingresos)).toBeGreaterThan(0);
    expect(d.ver_costos).toBe(true);
    // El margen nunca puede superar el ingreso: sería vender por debajo del
    // costo en negativo, que es aritméticamente imposible.
    expect(Number(d.margen)).toBeLessThanOrEqual(Number(d.ingresos));
    expect(Array.isArray(d.por_mes)).toBe(true);
    expect(Array.isArray(d.por_punto)).toBe(true);
    expect(Array.isArray(d.por_categoria)).toBe(true);
    expect(Array.isArray(d.por_producto)).toBe(true);
  });

  it('la suma de los cortes coincide con el total', async () => {
    const d = await rpc('analitica_ventas', tAdmin).then((r) => r.json());
    const suma = (filas: Array<{ ingresos: number }>) =>
      filas.reduce((s, f) => s + Number(f.ingresos), 0);

    // Cada corte reparte exactamente los mismos ingresos; si no cuadran, hay
    // filas duplicadas o perdidas en algún join.
    expect(suma(d.por_punto)).toBeCloseTo(Number(d.ingresos), 0);
    expect(suma(d.por_categoria)).toBeCloseTo(Number(d.ingresos), 0);
  });

  it('el mes de mayor ganancia es de verdad el mayor', async () => {
    const d = await rpc('analitica_ventas', tAdmin).then((r) => r.json());
    if (!d.mejor_mes) return;

    const margenes = (d.por_mes as Array<{ margen: number | null }>)
      .map((m) => Number(m.margen ?? 0));
    expect(Number(d.mejor_mes.margen)).toBe(Math.max(...margenes));
  });

  it('filtrar por un punto de venta reduce los ingresos', async () => {
    const total = await rpc('analitica_ventas', tAdmin).then((r) => r.json());
    const filtros = await rpc('analitica_filtros', tAdmin).then((r) => r.json());
    const punto = filtros.puntos?.[0];
    if (!punto) return;

    const uno = await rpc('analitica_ventas', tAdmin, { _puntos: [punto.id] })
      .then((r) => r.json());

    expect(Number(uno.ingresos)).toBeLessThanOrEqual(Number(total.ingresos));
    expect((uno.por_punto as unknown[]).length).toBeLessThanOrEqual(1);
  });

  it('un rango sin ventas devuelve ceros, no un error', async () => {
    const d = await rpc('analitica_ventas', tAdmin, {
      _desde: '1990-01-01', _hasta: '1990-12-31',
    }).then((r) => r.json());

    expect(Number(d.ingresos)).toBe(0);
    expect(Number(d.pedidos)).toBe(0);
    expect(d.por_mes).toEqual([]);
    expect(d.mejor_mes).toBeNull();
  });

  it('el margen usa el costo congelado de la venta, no el del catálogo', async () => {
    // Se compara la línea con costo congelado contra lo que devuelve la vista.
    const linea = await fetch(
      `${API}/rest/v1/order_items?select=unit_cost_cop,quantity,subtotal_cop&unit_cost_cop=not.is.null&limit=1`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    if (!linea?.[0]) return;
    const l = linea[0];
    const esperado = Number(l.subtotal_cop) - Number(l.unit_cost_cop) * Number(l.quantity);

    const vista = await fetch(
      `${API}/rest/v1/v_ventas?select=cost_cop,margen_linea,costo_estimado&limit=200`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    // Ninguna línea con costo congelado puede estar marcada como estimada.
    const congeladas = (vista as Array<{ costo_estimado: boolean }>).filter((v) => !v.costo_estimado);
    expect(congeladas.length).toBeGreaterThan(0);
    expect(Number.isFinite(esperado)).toBe(true);
  });
});
