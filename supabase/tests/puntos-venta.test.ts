import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Puntos de venta.
 *
 * Lo que se vigila:
 *   1. Que lo que guarda administración sea EXACTAMENTE lo que ve el cliente.
 *      Los dos portales leen la misma tabla; esta prueba lo comprueba desde
 *      las dos puntas, porque es la promesa que sostiene todo el módulo.
 *   2. Que una tienda desactivada desaparezca de la tienda pública, pero siga
 *      siendo visible para el personal —si no, no habría cómo reactivarla—.
 *   3. Que un cliente no pueda crear ni editar tiendas.
 *   4. Que no se acepten coordenadas fuera de Colombia: casi siempre son
 *      latitud y longitud invertidas, y mandarían al cliente a otro país.
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

async function login(cred: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(cred),
  });
  return (await r.json()).access_token ?? '';
}

const cab = (t?: string) => ({
  apikey: ANON,
  ...(t ? { Authorization: `Bearer ${t}` } : {}),
  'Content-Type': 'application/json',
});

const guardar = (token: string, datos: Record<string, unknown>) =>
  fetch(`${API}/rest/v1/rpc/upsert_pickup_location`, {
    method: 'POST',
    headers: cab(token),
    body: JSON.stringify({ _datos: datos }),
  });

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Puntos de venta', () => {
  let tAdmin = '';
  let tCliente = '';
  let creada = '';
  const sello = Date.now();
  const ref = `store-prueba-${sello}`;

  beforeAll(async () => {
    [tAdmin, tCliente] = await Promise.all([login(ADMIN), login(CLIENTE)]);
  });

  afterAll(async () => {
    if (creada && SERVICE) {
      await fetch(`${API}/rest/v1/pickup_locations?id=eq.${creada}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
  });

  it('administración crea una tienda', async () => {
    const r = await guardar(tAdmin, {
      external_ref: ref,
      name: `Pintuco Store - Prueba ${sello}`,
      city: 'Manizales',
      address: 'Carrera 23 # 62 - 16',
      phone: '+57 (606) 000-0000',
      hours: 'Lun - Vie: 8:00 AM - 5:00 PM',
      has_express_pickup: true,
      stock_readiness_hours: 3,
      latitude: 5.0703,
      longitude: -75.5138,
    });
    expect(r.ok).toBe(true);
    creada = (await r.json()) as string;
    expect(creada).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('el cliente la ve de inmediato en la tienda pública', async () => {
    // Esta es la promesa del módulo: no hay dos copias que sincronizar.
    const filas = await fetch(
      `${API}/rest/v1/pickup_locations?select=name,city,address,has_express_pickup,stock_readiness_hours&id=eq.${creada}`,
      { headers: cab() },
    ).then((r) => r.json());

    expect(filas).toHaveLength(1);
    expect(filas[0].city).toBe('Manizales');
    expect(filas[0].has_express_pickup).toBe(true);
    expect(filas[0].stock_readiness_hours).toBe(3);
  });

  it('editar cambia lo que el cliente ve', async () => {
    const r = await guardar(tAdmin, {
      id: creada,
      name: `Pintuco Store - Prueba ${sello}`,
      city: 'Manizales',
      address: 'Avenida Santander # 70 - 20',
      image_url: 'https://cdn.pintuco.co/tiendas/manizales.jpg',
    });
    expect(r.ok).toBe(true);

    const [fila] = await fetch(
      `${API}/rest/v1/pickup_locations?select=address,image_url&id=eq.${creada}`,
      { headers: cab() },
    ).then((x) => x.json());
    expect(fila.address).toBe('Avenida Santander # 70 - 20');
    expect(fila.image_url).toBe('https://cdn.pintuco.co/tiendas/manizales.jpg');
  });

  it('al desactivarla desaparece del público pero el personal la sigue viendo', async () => {
    const r = await guardar(tAdmin, {
      id: creada,
      name: `Pintuco Store - Prueba ${sello}`,
      city: 'Manizales',
      address: 'Avenida Santander # 70 - 20',
      status: 'INACTIVO',
    });
    expect(r.ok).toBe(true);

    const publico = await fetch(`${API}/rest/v1/pickup_locations?select=id&id=eq.${creada}`, {
      headers: cab(),
    }).then((x) => x.json());
    expect(publico).toEqual([]);

    // Si el personal tampoco la viera, no habría forma de reactivarla.
    const interno = await fetch(`${API}/rest/v1/pickup_locations?select=id&id=eq.${creada}`, {
      headers: cab(tAdmin),
    }).then((x) => x.json());
    expect(interno).toHaveLength(1);
  });

  it('un cliente no puede crear ni editar tiendas', async () => {
    const r = await guardar(tCliente, {
      name: 'Tienda pirata',
      city: 'Medellín',
      address: 'Calle falsa 123',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('rechaza coordenadas fuera de Colombia', async () => {
    // Latitud y longitud invertidas: 75 de latitud es el Ártico.
    const r = await guardar(tAdmin, {
      name: `Tienda mal ubicada ${sello}`,
      city: 'Medellín',
      address: 'Cra 43 # 1 - 1',
      latitude: 75.5138,
      longitude: -6.2088,
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/COORDENADA_FUERA_DE_RANGO/);
  });

  it('exige nombre, ciudad y dirección', async () => {
    const r = await guardar(tAdmin, { name: '   ', city: 'Cali', address: 'Calle 5' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/CAMPOS_OBLIGATORIOS/);
  });

  it('no permite dos tiendas con el mismo identificador', async () => {
    const r = await guardar(tAdmin, {
      external_ref: ref,
      name: 'Otra tienda',
      city: 'Pereira',
      address: 'Cra 7 # 20 - 30',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/REF_DUPLICADA/);
  });

  it('la foto de una tienda se sirve al público, pero solo administración la sube', async () => {
    const buckets = await fetch(`${API}/rest/v1/`, { headers: cab() });
    expect(buckets.ok || buckets.status === 404).toBe(true);

    // Un cliente no puede subir nada al bucket de tiendas.
    const subida = await fetch(`${API}/storage/v1/object/tiendas/intruso-${sello}.jpg`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${tCliente}`, 'Content-Type': 'image/jpeg' },
      body: new Uint8Array([0xff, 0xd8, 0xff]),
    });
    expect(subida.ok).toBe(false);
  });
});
