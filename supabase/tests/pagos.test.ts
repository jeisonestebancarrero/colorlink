import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Pasarela de pagos.
 *
 * Lo que se vigila, que es donde de verdad se pierde plata:
 *   1. Que nadie pueda dar por pagado un pedido sin pasar por la pasarela.
 *      `confirmar_pago` es del webhook y de nadie más.
 *   2. Que un pedido sin cobro no se pueda alistar. Alistar es sacar
 *      mercancía de la bodega.
 *   3. Que el crédito no se lo pueda conceder el propio cliente, ni exceder
 *      el cupo aprobado.
 *   4. Que la firma de integridad se calcule en el servidor: si se firmara en
 *      el navegador, cualquiera pagaría mil pesos por un pedido de un millón.
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

const rpc = (fn: string, token: string, cuerpo: unknown = {}) =>
  fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: cab(token),
    body: JSON.stringify(cuerpo),
  });

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Pagos', () => {
  let tAdmin = '';
  let tCliente = '';
  let usuario = '';
  let pedido = '';
  const creados: string[] = [];

  /** Crea un pedido nuevo del cliente, listo para cobrar. */
  async function nuevoPedido(): Promise<string> {
    // Solo puede haber un carrito activo por persona, así que se reutiliza el
    // que exista en vez de intentar crear otro.
    const existente = await fetch(
      `${API}/rest/v1/carts?select=id&is_active=eq.true&limit=1`,
      { headers: cab(tCliente) },
    ).then((r) => r.json());

    let cartId = (existente as Array<{ id: string }>)[0]?.id;
    if (!cartId) {
      const creado = await fetch(`${API}/rest/v1/carts`, {
        method: 'POST',
        headers: { ...cab(tCliente), Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: usuario, is_active: true }),
      }).then((r) => r.json());
      cartId = (creado as Array<{ id: string }>)[0].id;
    }

    const variante = await fetch(
      `${API}/rest/v1/product_variants?select=id&status=eq.ACTIVO&price_cop=gt.0&limit=1`,
      { headers: cab() },
    ).then((r) => r.json());

    await fetch(`${API}/rest/v1/cart_items`, {
      method: 'POST',
      headers: cab(tCliente),
      body: JSON.stringify({
        cart_id: cartId,
        variant_id: (variante as Array<{ id: string }>)[0].id,
        quantity: 1,
      }),
    });

    const punto = await fetch(
      `${API}/rest/v1/pickup_locations?select=id&status=eq.ACTIVO&limit=1`,
      { headers: cab() },
    ).then((r) => r.json());

    const id = await rpc('create_order_from_cart', tCliente, {
      _delivery_method: 'RETIRO_TIENDA',
      _pickup_location_id: (punto as Array<{ id: string }>)[0].id,
      // Quién recibe es obligatorio desde 20260902100002: sin nombre, documento
      // y teléfono, el punto de retiro no sabe a quién le entrega.
      _recipient_name: 'Carlos Mendoza',
      _recipient_document_type: 'CC',
      _recipient_document_number: '71234567',
      _recipient_phone: '3001234567',
    }).then((r) => r.json());

    creados.push(id as string);
    return id as string;
  }

  beforeAll(async () => {
    [tAdmin, tCliente] = await Promise.all([login(ADMIN), login(CLIENTE)]);
    usuario = await fetch(`${API}/auth/v1/user`, { headers: cab(tCliente) })
      .then((r) => r.json())
      .then((u) => u.id as string);
    pedido = await nuevoPedido();
  });

  afterAll(async () => {
    if (!SERVICE) return;
    const s = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
    for (const id of creados) {
      await fetch(`${API}/rest/v1/orders?id=eq.${id}`, { method: 'DELETE', headers: s });
    }
    await fetch(`${API}/rest/v1/carts?user_id=eq.${usuario}&is_active=eq.true`, {
      method: 'PATCH', headers: s, body: JSON.stringify({ is_active: false }),
    });
  });

  // ── Lo que no se puede saltar ──────────────────────────────────────────
  it('un cliente no puede confirmar su propio pago', async () => {
    const r = await rpc('confirmar_pago', tCliente, {
      _referencia: 'LO-QUE-SEA',
      _estado: 'APPROVED',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('ni siquiera un administrador puede confirmar un pago a mano', async () => {
    const r = await rpc('confirmar_pago', tAdmin, {
      _referencia: 'LO-QUE-SEA',
      _estado: 'APPROVED',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('el pedido nace pendiente y sin cobro', async () => {
    const [o] = await fetch(`${API}/rest/v1/orders?select=status&id=eq.${pedido}`, {
      headers: cab(tCliente),
    }).then((r) => r.json());
    expect(o.status).toBe('PENDIENTE');

    const cobrado = await rpc('pedido_cobrado', tAdmin, { _order_id: pedido })
      .then((r) => r.json());
    expect(cobrado).toBe(false);
  });

  it('no se puede alistar un pedido sin cobro', async () => {
    const r = await rpc('change_order_status', tAdmin, {
      _order_id: pedido,
      _nuevo: 'CONFIRMADO',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/SIN_COBRO/);
  });

  // ── Iniciar el cobro ───────────────────────────────────────────────────
  it('iniciar el pago devuelve referencia y monto en centavos', async () => {
    const r = await rpc('iniciar_pago', tCliente, { _order_id: pedido, _metodo: 'PSE' });
    expect(r.ok).toBe(true);
    const d = await r.json();

    expect(d.referencia).toMatch(/^ORD-PNT-\d+-[0-9a-f]{8}$/);
    expect(d.moneda).toBe('COP');

    const [o] = await fetch(`${API}/rest/v1/orders?select=total_cop&id=eq.${pedido}`, {
      headers: cab(tCliente),
    }).then((x) => x.json());

    // El monto lo calcula el servidor a partir del pedido: es lo que impide
    // que alguien firme un cobro por un valor distinto al que debe.
    expect(Number(d.centavos)).toBe(Math.round(Number(o.total_cop)) * 100);
  });

  it('un cliente no puede iniciar el pago de un pedido ajeno', async () => {
    const otro = await fetch(`${API}/rest/v1/orders?select=id&user_id=neq.${usuario}&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${SERVICE}` },
    }).then((r) => r.json());
    if (!otro?.[0]) return;

    const r = await rpc('iniciar_pago', tCliente, { _order_id: otro[0].id, _metodo: 'PSE' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN|NOT_FOUND/);
  });

  // ── Pago aprobado ──────────────────────────────────────────────────────
  it('el pago aprobado confirma el pedido solo', async () => {
    const r = await rpc('simular_pago', tCliente, { _order_id: pedido, _aprobar: true });
    expect(r.ok).toBe(true);
    expect((await r.json()).resultado).toBe('PAGADO');

    const [o] = await fetch(`${API}/rest/v1/orders?select=status&id=eq.${pedido}`, {
      headers: cab(tCliente),
    }).then((x) => x.json());
    expect(o.status).toBe('CONFIRMADO');
  });

  it('un pedido pagado no se puede volver a cobrar', async () => {
    const r = await rpc('iniciar_pago', tCliente, { _order_id: pedido, _metodo: 'PSE' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/YA_PAGADO/);
  });

  // ── Abandonar el pago ──────────────────────────────────────────────────
  it('cerrar sin pagar cancela el pedido y devuelve los productos al carrito', async () => {
    const abandonado = await nuevoPedido();

    const r = await rpc('devolver_pedido_al_carrito', tCliente, { _order_id: abandonado });
    expect(r.ok).toBe(true);
    expect((await r.json()).lineas).toBeGreaterThan(0);

    const [o] = await fetch(`${API}/rest/v1/orders?select=status&id=eq.${abandonado}`, {
      headers: cab(tCliente),
    }).then((x) => x.json());
    expect(o.status).toBe('CANCELADO');

    // Los productos vuelven al carrito: es donde el cliente los espera.
    const carrito = await fetch(
      `${API}/rest/v1/carts?select=id,cart_items(id)&is_active=eq.true&limit=1`,
      { headers: cab(tCliente) },
    ).then((x) => x.json());
    expect((carrito[0]?.cart_items ?? []).length).toBeGreaterThan(0);
  });

  it('un pedido ya pagado no se puede devolver al carrito', async () => {
    const r = await rpc('devolver_pedido_al_carrito', tCliente, { _order_id: pedido });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/YA_EN_CURSO/);
  });

  // ── Crédito ────────────────────────────────────────────────────────────
  it('un cliente de contado no puede pedir a crédito', async () => {
    const nuevo = await nuevoPedido();
    const r = await rpc('iniciar_pago', tCliente, { _order_id: nuevo, _metodo: 'CREDITO' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/SIN_CREDITO/);
  });

  it('un cliente no puede aprobarse crédito a sí mismo', async () => {
    const empresa = await fetch(`${API}/rest/v1/companies?select=id&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${SERVICE}` },
    }).then((r) => r.json());

    const r = await rpc('fijar_credito_empresa', tCliente, {
      _company_id: empresa[0].id,
      _a_credito: true,
      _dias: 30,
      _cupo: 99999999,
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('un crédito sin cupo se rechaza', async () => {
    const empresa = await fetch(`${API}/rest/v1/companies?select=id&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${SERVICE}` },
    }).then((r) => r.json());

    const r = await rpc('fijar_credito_empresa', tAdmin, {
      _company_id: empresa[0].id,
      _a_credito: true,
      _dias: 30,
      _cupo: 0,
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/CUPO_INVALIDO/);
  });

  // ── Configuración ──────────────────────────────────────────────────────
  it('el cobro real no se puede encender sin llaves', async () => {
    const r = await rpc('configurar_pasarela', tAdmin, {
      _datos: { payments_enabled: true, payments_test_mode: false },
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FALTAN_LLAVES/);
  });

  it('los secretos de la pasarela no se pueden leer desde el navegador', async () => {
    const r = await fetch(
      `${API}/rest/v1/app_settings?select=wompi_integrity_secret&limit=1`,
      { headers: cab(tAdmin) },
    );
    expect(r.ok).toBe(false);
  });

  it('el estado de la pasarela dice si hay llaves, pero no cuáles', async () => {
    const d = await rpc('estado_pasarela', tAdmin).then((r) => r.json());
    expect(d).toHaveProperty('activa');
    expect(d).toHaveProperty('tiene_integridad');
    expect(JSON.stringify(d)).not.toMatch(/integrity_secret|events_secret/);
  });
});
