import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { limpiarCuentasDePrueba, clienteDeServicio } from './limpieza';

/**
 * El pago en línea entra solo a tesorería.
 *
 * El cliente pagaba desde el carrito, el pedido quedaba cobrado y el pago
 * registrado… y en tesorería no aparecía nada: alguien tenía que entrar a
 * «asociar pago» a mano. Eso hace que el dinero que sí entró no figure hasta
 * que alguien se acuerde, y que la caja del día nunca cuadre.
 *
 * Lo que se vigila aquí:
 *   1. Que confirmar un pago cree su movimiento de INGRESO.
 *   2. Que NO se duplique si la pasarela reenvía el evento. Un ingreso
 *      duplicado en la caja es de los errores más caros de rastrear.
 *   3. Que una venta a CRÉDITO no infle la caja: esa plata todavía no entró.
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

const sello = Date.now();
const CLIENTE = { email: `tesoreria.${sello}@correo.test`, password: 'pintuco2025*' };

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON || !SERVICE) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const admin = () => ({ apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' });

async function movimientosDe(pagoId: string): Promise<{ direction: string; amount_cop: string }[]> {
  const r = await fetch(
    `${API}/rest/v1/treasury_movements?select=direction,amount_cop&payment_id=eq.${pagoId}`,
    { headers: admin() },
  );
  return (await r.json()) as { direction: string; amount_cop: string }[];
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Pago en línea · llega solo a tesorería', () => {
  let pedidoId = '';
  let pagoId = '';
  let pagoCredito = '';

  beforeAll(async () => {
    await fetch(`${API}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...CLIENTE, data: { first_name: 'Prueba', client_type: 'Particular' } }),
    });
    const perfil = await fetch(
      `${API}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(CLIENTE.email)}`,
      { headers: admin() },
    ).then((r) => r.json());

    const o = await fetch(`${API}/rest/v1/orders`, {
      method: 'POST', headers: { ...admin(), Prefer: 'return=representation' },
      body: JSON.stringify({
        order_number: `TES-${sello}`, user_id: perfil[0].id, status: 'PENDIENTE',
        delivery_method: 'RETIRO_TIENDA', subtotal_cop: 90000, total_cop: 90000,
        recipient_name: 'QUIEN RECIBE', recipient_document_type: 'CC',
        recipient_document_number: '10000002', recipient_phone: '+573000000002',
      }),
    }).then((r) => r.json());
    pedidoId = o[0].id;

    // Un pago en línea NACE pendiente, como lo crea el carrito.
    const p = await fetch(`${API}/rest/v1/payments`, {
      method: 'POST', headers: { ...admin(), Prefer: 'return=representation' },
      body: JSON.stringify({
        order_id: pedidoId, method: 'PSE', status: 'PENDIENTE',
        amount_cop: 90000, reference: `REF-${sello}`,
      }),
    }).then((r) => r.json());
    pagoId = p[0].id;
  });

  afterAll(async () => {
    for (const id of [pagoId, pagoCredito].filter(Boolean)) {
      await fetch(`${API}/rest/v1/treasury_movements?payment_id=eq.${id}`, { method: 'DELETE', headers: admin() });
    }
    if (pedidoId) {
      await fetch(`${API}/rest/v1/payments?order_id=eq.${pedidoId}`, { method: 'DELETE', headers: admin() });
      await fetch(`${API}/rest/v1/conversation_messages?order_id=eq.${pedidoId}`, { method: 'DELETE', headers: admin() });
      await fetch(`${API}/rest/v1/orders?id=eq.${pedidoId}`, { method: 'DELETE', headers: admin() });
    }
    if (SERVICE) await limpiarCuentasDePrueba(clienteDeServicio(API, SERVICE), sello);
  });

  it('mientras está pendiente no hay nada en tesorería', async () => {
    expect(await movimientosDe(pagoId)).toHaveLength(0);
  });

  it('al confirmarse crea su movimiento de ingreso', async () => {
    await fetch(`${API}/rest/v1/payments?id=eq.${pagoId}`, {
      method: 'PATCH', headers: { ...admin(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'PAGADO', paid_at: new Date().toISOString() }),
    });
    const movs = await movimientosDe(pagoId);
    expect(movs).toHaveLength(1);
    expect(movs[0].direction).toBe('INGRESO');
    expect(Number(movs[0].amount_cop)).toBe(90000);
  });

  it('si la pasarela reenvía el evento, no lo duplica', async () => {
    await fetch(`${API}/rest/v1/payments?id=eq.${pagoId}`, {
      method: 'PATCH', headers: { ...admin(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'PAGADO', paid_at: new Date().toISOString() }),
    });
    expect(await movimientosDe(pagoId)).toHaveLength(1);
  });

  it('una venta a crédito no infla la caja', async () => {
    const p = await fetch(`${API}/rest/v1/payments`, {
      method: 'POST', headers: { ...admin(), Prefer: 'return=representation' },
      body: JSON.stringify({
        order_id: pedidoId, method: 'CREDITO_EMPRESARIAL', status: 'PENDIENTE',
        amount_cop: 50000, is_credit: true,
      }),
    }).then((r) => r.json());
    pagoCredito = p[0].id;

    await fetch(`${API}/rest/v1/payments?id=eq.${pagoCredito}`, {
      method: 'PATCH', headers: { ...admin(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'PAGADO', paid_at: new Date().toISOString() }),
    });
    expect(await movimientosDe(pagoCredito)).toHaveLength(0);
  });
});
