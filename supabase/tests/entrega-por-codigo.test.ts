import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { limpiarCuentasDePrueba, clienteDeServicio } from './limpieza';

/**
 * Entregar un retiro en tienda con el código del cliente.
 *
 * El código se le daba al cliente, viajaba en el correo y se imprimía en la
 * ficha… y no se comprobaba en ninguna parte: el pedido se daba por entregado
 * pulsando un botón. Era decorativo, y cualquiera podía llevarse la mercancía
 * diciendo un número de pedido.
 *
 * Lo que se vigila aquí, en orden de gravedad:
 *   1. Que un cliente cualquiera NO pueda entregarse su propio pedido. Sería
 *      marcar como recibido algo que nunca salió de la bodega.
 *   2. Que un código que no existe no entregue nada.
 *   3. Que NO se entregue un pedido que todavía se está alistando: es el error
 *      exacto que este código previene.
 *   4. Que no se pueda entregar dos veces.
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
const CLIENTE = { email: `retiro.cliente.${sello}@correo.test`, password: 'pintuco2025*' };
const MOSTRADOR = { email: `retiro.mostrador.${sello}@correo.test`, password: 'pintuco2025*' };
const CODIGO = `RET${String(sello).slice(-4)}`;

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
const auth = (t: string) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

async function registrar(c: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...c, data: { first_name: 'Prueba', client_type: 'Particular' } }),
  });
  return (await r.json()).access_token ?? '';
}

async function idDe(correo: string): Promise<string> {
  const r = await fetch(`${API}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(correo)}`, { headers: admin() });
  return ((await r.json()) as { id: string }[])[0]?.id ?? '';
}

async function entregar(token: string, codigo: string) {
  const r = await fetch(`${API}/rest/v1/rpc/entregar_por_codigo`, {
    method: 'POST', headers: auth(token), body: JSON.stringify({ _codigo: codigo }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, cuerpo: j, mensaje: j?.message ?? '' };
}

async function estadoDe(id: string): Promise<string> {
  const r = await fetch(`${API}/rest/v1/orders?select=status&id=eq.${id}`, { headers: admin() });
  return ((await r.json()) as { status: string }[])[0]?.status ?? '';
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Entrega por código · el código autoriza, no el botón', () => {
  let tokenCliente = '';
  let tokenMostrador = '';
  let pedidoId = '';

  beforeAll(async () => {
    tokenCliente = await registrar(CLIENTE);
    tokenMostrador = await registrar(MOSTRADOR);

    await fetch(`${API}/rest/v1/user_roles`, {
      method: 'POST', headers: admin(),
      body: JSON.stringify({ user_id: await idDe(MOSTRADOR.email), role: 'DESPACHO' }),
    });

    const r = await fetch(`${API}/rest/v1/orders`, {
      method: 'POST', headers: { ...admin(), Prefer: 'return=representation' },
      body: JSON.stringify({
        order_number: `RETIRO-${sello}`,
        user_id: await idDe(CLIENTE.email),
        status: 'PREPARANDO',
        delivery_method: 'RETIRO_TIENDA',
        pickup_code: CODIGO,
        subtotal_cop: 50000, total_cop: 50000,
        recipient_name: 'QUIEN RECIBE', recipient_document_type: 'CC',
        recipient_document_number: '10000001', recipient_phone: '+573000000001',
      }),
    });
    pedidoId = ((await r.json()) as { id: string }[])[0]?.id ?? '';
  });

  afterAll(async () => {
    if (pedidoId) {
      await fetch(`${API}/rest/v1/conversation_messages?order_id=eq.${pedidoId}`, { method: 'DELETE', headers: admin() });
      await fetch(`${API}/rest/v1/orders?id=eq.${pedidoId}`, { method: 'DELETE', headers: admin() });
    }
    if (SERVICE) await limpiarCuentasDePrueba(clienteDeServicio(API, SERVICE), sello);
  });

  it('un cliente no puede entregarse su propio pedido', async () => {
    const r = await entregar(tokenCliente, CODIGO);
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('FORBIDDEN');
  });

  it('avisa que NO ESTÁ PAGADO, que es lo que importa en el mostrador', async () => {
    // Antes decía «no está listo para retiro». Es verdad, pero quien atiende
    // entiende que falta alistarlo y entrega igual «porque ya está ahí». La
    // mercancía salía sin cobrar.
    const r = await entregar(tokenMostrador, CODIGO);
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('SIN_PAGO');
    expect(r.mensaje).toContain('No entregues la mercancía');
    expect(await estadoDe(pedidoId)).toBe('PREPARANDO');
  });

  it('un código que no existe no entrega nada', async () => {
    const r = await entregar(tokenMostrador, 'ZZZZ99');
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('CODIGO_NO_VALIDO');
  });

  it('exige el código completo', async () => {
    const r = await entregar(tokenMostrador, 'AB');
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('CODIGO_CORTO');
  });

  it('con el pedido listo, el código lo entrega', async () => {
    // Un pedido sin pagar NO avanza: lo impide `orders_exigir_cobro`, y hace
    // bien —no se entrega mercancía que nadie ha cobrado—. Se paga primero.
    await fetch(`${API}/rest/v1/payments`, {
      method: 'POST', headers: { ...admin(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        order_id: pedidoId, method: 'EFECTIVO', status: 'PAGADO',
        amount_cop: 50000, paid_at: new Date().toISOString(),
      }),
    });
    const av = await fetch(`${API}/rest/v1/orders?id=eq.${pedidoId}`, {
      method: 'PATCH', headers: { ...admin(), Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'LISTO_PARA_RETIRO' }),
    });
    expect(av.ok).toBe(true);
    // Con espacios y en minúscula: así lo escribe cualquiera en un mostrador.
    const r = await entregar(tokenMostrador, ` ${CODIGO.toLowerCase()} `);
    expect(r.ok).toBe(true);
    expect((r.cuerpo as { numero: string }).numero).toBe(`RETIRO-${sello}`);
    expect(await estadoDe(pedidoId)).toBe('ENTREGADO');
  });

  it('no se puede entregar dos veces', async () => {
    const r = await entregar(tokenMostrador, CODIGO);
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('YA_ENTREGADO');
  });

  it('la entrega queda escrita en la conversación del pedido', async () => {
    const r = await fetch(
      `${API}/rest/v1/conversation_messages?select=body,kind&order_id=eq.${pedidoId}`,
      { headers: admin() },
    );
    const msgs = (await r.json()) as { body: string; kind: string }[];
    expect(msgs.some((m) => /verificado con el código de retiro/i.test(m.body))).toBe(true);
  });
});
