import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clienteDeServicio, crearPedidoDePrueba, borrarPedidoDePrueba,
} from './limpieza';

/**
 * Qué guarda cada importe de la factura.
 *
 * La cabecera tenía una columna llamada `subtotal_cop` que NO era un subtotal:
 * guardaba la suma de las líneas **con el IVA dentro**, porque en Colombia el
 * precio de góndola ya lo incluye. Exportar esa cifra a la DIAN como base
 * imponible es declarar de más y pagar IVA sobre el IVA. Se renombró a
 * `items_total_cop` (20260904100003).
 *
 * Y la trampa era doble: en `invoice_items` la columna `subtotal_cop` significa
 * justo lo contrario —la base SIN IVA—. Mismo nombre, sentido opuesto, en el
 * mismo documento.
 *
 * Esta prueba fija las dos convenciones sobre una factura emitida de verdad.
 * Renombrar sin dejar esto escrito solo cambia de sitio la trampa: el próximo
 * que sume `items_total_cop` y `tax_cop` para sacar el total volvería a
 * equivocarse, y aquí se entera.
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

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON || !SERVICE) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const cab = (t?: string) => ({
  apikey: ANON,
  ...(t ? { Authorization: `Bearer ${t}` } : {}),
  'Content-Type': 'application/json',
});

const login = (c: { email: string; password: string }) =>
  fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
  })
    .then((r) => r.json())
    .then((j) => j.access_token ?? '');

const n = (v: string | number) => Number(v);

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Importes de la factura · qué guarda cada columna', () => {
  const admin = clienteDeServicio(API, SERVICE);
  let tAdmin = '';
  let pedido = '';
  let factura = '';
  let cabecera: Record<string, string | number> | null = null;
  let lineas: Array<Record<string, string | number>> = [];

  beforeAll(async () => {
    tAdmin = await login(ADMIN);

    const { data: perfil } = await admin
      .from('profiles').select('id').eq('email', ADMIN.email).single();

    const p = await crearPedidoDePrueba(admin, (perfil as { id: string }).id, {
      estado: 'PREPARANDO',
    });
    pedido = p.id;

    // Una línea con precio de góndola: $119.000 con IVA del 19% dentro.
    const { data: variante } = await admin
      .from('product_variants').select('id').limit(1).single();

    await admin.from('order_items').insert({
      order_id: pedido,
      variant_id: (variante as { id: string }).id,
      product_name: 'LÍNEA DE PRUEBA',
      presentation: 'Galón',
      unit_price_cop: 119000,
      quantity: 1,
      subtotal_cop: 119000,
    });

    const r = await fetch(`${API}/rest/v1/rpc/issue_pos_invoice`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _order_id: pedido }),
    });
    factura = await r.json();

    [cabecera] = await fetch(
      `${API}/rest/v1/invoices?select=items_total_cop,taxable_base_cop,tax_cop,discount_cop,shipping_cop,total_cop&id=eq.${factura}`,
      { headers: cab(tAdmin) },
    ).then((x) => x.json());

    lineas = await fetch(
      `${API}/rest/v1/invoice_items?select=subtotal_cop,tax_cop,total_cop&invoice_id=eq.${factura}`,
      { headers: cab(tAdmin) },
    ).then((x) => x.json());
  });

  afterAll(async () => {
    if (!pedido) return;
    // El asiento contable lo crea un disparador de `invoices` y su FK es ON
    // DELETE SET NULL: sin borrarlo a mano quedaría un comprobante huérfano
    // en la contabilidad real.
    const { data: asientos } = await admin
      .from('journal_entries').select('id').eq('invoice_id', factura);
    for (const a of (asientos ?? []) as Array<{ id: string }>) {
      await admin.from('journal_entries').delete().eq('id', a.id);
    }
    await borrarPedidoDePrueba(admin, pedido);
  });

  it('la factura se emitió', () => {
    expect(factura).toBeTruthy();
    expect(cabecera).not.toBeNull();
  });

  it('`items_total_cop` LLEVA el IVA dentro: es base + impuesto', () => {
    // Esta es la afirmación que el nombre viejo negaba.
    const base = n(cabecera!.taxable_base_cop);
    const iva = n(cabecera!.tax_cop);
    expect(n(cabecera!.items_total_cop)).toBeCloseTo(base + iva, 2);
    expect(n(cabecera!.items_total_cop)).toBe(119000);
    expect(base).toBeLessThan(n(cabecera!.items_total_cop));
  });

  it('la base imponible es `taxable_base_cop`, y es la que va a la DIAN', () => {
    // 119.000 / 1,19 = 100.000. Si alguien declarara `items_total_cop` como
    // base, estaría declarando 19.000 pesos de más en esta sola línea.
    expect(n(cabecera!.taxable_base_cop)).toBeCloseTo(100000, 2);
    expect(n(cabecera!.tax_cop)).toBeCloseTo(19000, 2);
  });

  it('el total es el de las líneas menos descuento más envío', () => {
    const esperado =
      n(cabecera!.items_total_cop) - n(cabecera!.discount_cop) + n(cabecera!.shipping_cop);
    expect(n(cabecera!.total_cop)).toBeCloseTo(esperado, 2);
  });

  it('en la LÍNEA la convención es la contraria: `subtotal_cop` es la base', () => {
    expect(lineas.length).toBeGreaterThan(0);
    for (const l of lineas) {
      expect(n(l.subtotal_cop) + n(l.tax_cop)).toBeCloseTo(n(l.total_cop), 2);
      expect(n(l.subtotal_cop)).toBeLessThan(n(l.total_cop));
    }
  });

  it('las líneas suman exactamente la cabecera', () => {
    const base = lineas.reduce((a, l) => a + n(l.subtotal_cop), 0);
    const conIva = lineas.reduce((a, l) => a + n(l.total_cop), 0);
    expect(base).toBeCloseTo(n(cabecera!.taxable_base_cop), 2);
    expect(conIva).toBeCloseTo(n(cabecera!.items_total_cop), 2);
  });

  it('el nombre viejo ya no existe: nadie lo puede exportar por costumbre', async () => {
    const r = await fetch(`${API}/rest/v1/invoices?select=subtotal_cop&limit=1`, {
      headers: cab(tAdmin),
    });
    expect(r.ok).toBe(false);
  });
});
