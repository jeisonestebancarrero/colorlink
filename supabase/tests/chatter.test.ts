import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Chatter y trazabilidad.
 *
 * Estas pruebas existen porque `post_message` estuvo roto sin que nada lo
 * delatara: la trazabilidad automática escribe directo en la tabla y sí
 * funcionaba, así que el hilo mostraba eventos y parecía sano, mientras
 * ningún humano podía escribir un mensaje.
 */

function env(): Record<string, string> {
  const ruta = resolve(process.cwd(), '.env.local');
  if (!existsSync(ruta)) return {};
  const v: Record<string, string> = {};
  for (const l of readFileSync(ruta, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) v[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return v;
}

const E = env();
const API = E.VITE_SUPABASE_URL ?? '';
const ANON = E.VITE_SUPABASE_ANON_KEY ?? '';
const anon = () => ({ apikey: ANON, 'Content-Type': 'application/json' });
const auth = (t: string) => ({ ...anon(), Authorization: `Bearer ${t}` });

async function hay(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: anon() });
    return r.ok || r.status === 404;
  } catch { return false; }
}

const login = (email: string, password: string) =>
  fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: anon(), body: JSON.stringify({ email, password }),
  }).then((r) => r.json()).then((j) => j.access_token ?? '');

const rpc = (t: string, fn: string, body: unknown) =>
  fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: auth(t), body: JSON.stringify(body) });

const disponible = await hay();

describe.skipIf(!disponible)('Chatter · mensajes, notas internas y trazabilidad', () => {
  let tCliente = '';
  let tStaff = '';
  let tAjeno = '';
  let orderId = '';

  beforeAll(async () => {
    [tCliente, tStaff, tAjeno] = await Promise.all([
      login('carlos.mendoza@constructorahorizonte.com', 'pintuco2025*'),
      // La cuenta de personal para pruebas es admin@pintuco.demo, no
      // admin@colorlink.com: esa es la que usa una persona de verdad, y
      // cuando alguien le activa la verificación en dos pasos, todas las
      // sesiones que no la superan pierden permisos y esta suite empieza a
      // fallar con 403 sin relación aparente con el chatter.
      login('admin@pintuco.demo', 'pintuco2025*'),
      login('ana.torres@edificarplus.com', 'pintuco2025*'),
    ]);

    const [perfil] = await fetch(`${API}/rest/v1/profiles?select=id`, { headers: auth(tCliente) })
      .then((r) => r.json());
    const carritos = await fetch(`${API}/rest/v1/carts?select=id&is_active=eq.true`, { headers: auth(tCliente) })
      .then((r) => r.json());
    const cartId = carritos[0]?.id ?? await fetch(`${API}/rest/v1/carts`, {
      method: 'POST', headers: { ...auth(tCliente), Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: perfil.id }),
    }).then((r) => r.json()).then((d) => d[0].id);

    const [v] = await fetch(`${API}/rest/v1/product_variants?select=id&sku=eq.PNT-EXT-001-V1`, { headers: anon() })
      .then((r) => r.json());
    await fetch(`${API}/rest/v1/cart_items`, {
      method: 'POST', headers: auth(tCliente),
      body: JSON.stringify({ cart_id: cartId, variant_id: v.id, quantity: 1 }),
    });
    const [loc] = await fetch(`${API}/rest/v1/pickup_locations?select=id&limit=1`, { headers: anon() })
      .then((r) => r.json());
    orderId = await rpc(tCliente, 'create_order_from_cart', {
      _delivery_method: 'RETIRO_TIENDA', _pickup_location_id: loc.id,
    }).then((r) => r.json());
  });

  afterAll(async () => {
    if (orderId) {
      await fetch(`${API}/rest/v1/orders?id=eq.${orderId}`, { method: 'DELETE', headers: auth(tStaff) });
    }
  });

  it('el cliente puede escribir en el hilo de su pedido', async () => {
    const r = await rpc(tCliente, 'post_message', {
      _order_id: orderId, _project_id: null, _body: '¿Cuándo puedo pasar a recoger?', _internal: false,
    });
    expect(r.status).toBe(200);
  });

  it('el personal puede responder', async () => {
    const r = await rpc(tStaff, 'post_message', {
      _order_id: orderId, _project_id: null, _body: 'Desde mañana a las 9 a. m.', _internal: false,
    });
    expect(r.status).toBe(200);
  });

  it('el personal puede dejar una nota interna', async () => {
    const r = await rpc(tStaff, 'post_message', {
      _order_id: orderId, _project_id: null, _body: 'Confirmar stock antes de avisar.', _internal: true,
    });
    expect(r.status).toBe(200);
  });

  it('el cliente NO ve la nota interna', async () => {
    const suyos = await fetch(
      `${API}/rest/v1/conversation_messages?select=kind,body&order_id=eq.${orderId}`,
      { headers: auth(tCliente) }
    ).then((r) => r.json());

    const tipos = suyos.map((m: { kind: string }) => m.kind);
    expect(tipos).not.toContain('NOTA_INTERNA');
    expect(suyos.some((m: { body: string }) => m.body.includes('Confirmar stock'))).toBe(false);
  });

  it('el personal SÍ ve la nota interna', async () => {
    const todos = await fetch(
      `${API}/rest/v1/conversation_messages?select=kind&order_id=eq.${orderId}`,
      { headers: auth(tStaff) }
    ).then((r) => r.json());
    expect(todos.map((m: { kind: string }) => m.kind)).toContain('NOTA_INTERNA');
  });

  it('un cliente que marca "interna" NO consigue ocultar su mensaje', async () => {
    // La función degrada la nota a mensaje normal en lugar de rechazarla.
    await rpc(tCliente, 'post_message', {
      _order_id: orderId, _project_id: null, _body: 'Intento de nota interna', _internal: true,
    });
    const [m] = await fetch(
      `${API}/rest/v1/conversation_messages?select=kind&order_id=eq.${orderId}&body=eq.Intento de nota interna`,
      { headers: auth(tStaff) }
    ).then((r) => r.json());
    expect(m.kind).toBe('MENSAJE');
  });

  it('ATAQUE: alguien ajeno no puede escribir en el hilo', async () => {
    const r = await rpc(tAjeno, 'post_message', {
      _order_id: orderId, _project_id: null, _body: 'Hola', _internal: false,
    });
    expect(r.status).toBe(403);
  });

  it('la trazabilidad se escribe sola al cambiar el estado', async () => {
    // Desde que existe la pasarela, un pedido sin cobro no puede avanzar: el
    // disparador `orders_exigir_cobro` lo impide. Se cobra primero, que es
    // además el orden real de los hechos.
    await rpc(tStaff, 'iniciar_pago', { _order_id: orderId, _metodo: 'PSE' });
    await rpc(tStaff, 'simular_pago', { _order_id: orderId, _aprobar: true });

    await rpc(tStaff, 'change_order_status', { _order_id: orderId, _nuevo: 'PREPARANDO' });
    const eventos = await fetch(
      `${API}/rest/v1/conversation_messages?select=body&order_id=eq.${orderId}&kind=eq.EVENTO`,
      { headers: auth(tStaff) }
    ).then((r) => r.json());
    expect(eventos.some((e: { body: string }) => e.body.includes('PREPARANDO'))).toBe(true);
  });

  it('rechaza un mensaje vacío', async () => {
    const r = await rpc(tStaff, 'post_message', {
      _order_id: orderId, _project_id: null, _body: '   ', _internal: false,
    });
    expect(r.status).toBe(400);
  });
});
