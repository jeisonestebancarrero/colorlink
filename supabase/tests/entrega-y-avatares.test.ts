import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Fecha de entrega, avatares y barrios: la fecha la calcula el servidor por código de
 * municipio, se guarda en el pedido y no cae en fin de semana; nadie sobrescribe el avatar
 * de otro; Bogotá, Cali y Barranquilla tienen barrios.
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

const CLIENTE = { email: 'carlos.mendoza@constructorahorizonte.com', password: 'pintuco2025*' };
const OTRO = { email: 'ana.torres@edificarplus.com', password: 'pintuco2025*' };

/** Municipios con punto de venta Pintuco y otros de contraste. */
const MEDELLIN = '05001';
const BOGOTA = '11001';
const CALI = '76001';
const BARRANQUILLA = '08001';
const BUCARAMANGA = '68001';
const ITAGUI = '05360';   // Antioquia, sin tienda propia
const MITU = '97001';     // Vaupés, lejos de todo

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const disponible = await hayInstancia();

describe.skipIf(!disponible || !SERVICE)('Entrega estimada, avatares y barrios', () => {
  let admin: SupabaseClient;
  let cliente: SupabaseClient;
  let otro: SupabaseClient;
  let uidCliente = '';
  const pedidosCreados: string[] = [];

  beforeAll(async () => {
    admin = createClient(API, SERVICE, { auth: { persistSession: false } });
    cliente = createClient(API, ANON, { auth: { persistSession: false } });
    otro = createClient(API, ANON, { auth: { persistSession: false } });

    const a = await cliente.auth.signInWithPassword(CLIENTE);
    if (a.error) throw new Error(`no se pudo autenticar: ${a.error.message}`);
    uidCliente = a.data.user?.id as string;

    const b = await otro.auth.signInWithPassword(OTRO);
    if (b.error) throw new Error(`no se pudo autenticar el otro: ${b.error.message}`);
  });

  afterAll(async () => {
    for (const id of pedidosCreados) {
      await admin.from('notifications').delete().eq('order_id', id);
      await admin.from('shipments').delete().eq('order_id', id);
      await admin.from('payments').delete().eq('order_id', id);
      await admin.from('order_items').delete().eq('order_id', id);
      await admin.from('audit_logs').delete().eq('entity_id', id);
      await admin.from('orders').delete().eq('id', id);
    }
    await cliente.auth.signOut();
    await otro.auth.signOut();
  });

  const dias = async (code: string): Promise<number> => {
    const { data, error } = await admin.rpc('dias_de_entrega', { _municipality_code: code });
    expect(error).toBeNull();
    return data as number;
  };

  it('las cinco ciudades con tienda Pintuco entregan en 2 días', async () => {
    for (const code of [MEDELLIN, BOGOTA, CALI, BARRANQUILLA, BUCARAMANGA]) {
      expect(await dias(code), `municipio ${code}`).toBe(2);
    }
  });

  it('REGRESIÓN: Bogotá y Cali no caen al tramo lejano por el nombre', async () => {
    // Los nombres difieren entre puntos de venta y DANE ('Bogotá D.C.' vs 'Bogotá, D.C.'):
    // por eso los tramos usan el código.
    expect(await dias(BOGOTA)).toBe(2);
    expect(await dias(CALI)).toBe(2);
  });

  it('el resto del departamento de una tienda entrega en 3 días', async () => {
    expect(await dias(ITAGUI)).toBe(3);
  });

  it('un municipio sin cobertura cercana entrega en 5 días', async () => {
    expect(await dias(MITU)).toBe(5);
  });

  it('sin municipio se asume el tramo más largo, nunca el más corto', async () => {
    // Sin municipio no se promete un plazo.
    const { data } = await admin.rpc('dias_de_entrega', { _municipality_code: null });
    expect(data).toBe(5);
  });

  it('la fecha estimada nunca cae en sábado ni domingo', async () => {
    for (let d = 0; d < 14; d++) {
      const desde = new Date(2026, 8, 1 + d);
      const iso = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-${String(desde.getDate()).padStart(2, '0')}`;
      for (const n of [2, 3, 5]) {
        const { data } = await admin.rpc('sumar_dias_habiles', { _desde: iso, _dias: n });
        const [a, m, dd] = (data as string).split('-').map(Number);
        const dow = new Date(a, m - 1, dd, 12).getDay();
        expect(dow, `${iso} + ${n} hábiles = ${data}`).not.toBe(0);
        expect(dow, `${iso} + ${n} hábiles = ${data}`).not.toBe(6);
      }
    }
  });

  it('cuenta días HÁBILES, no días corridos', async () => {
    // 2026-09-04 es viernes. Dos días hábiles caen el martes 8, no el domingo 6.
    const { data } = await admin.rpc('sumar_dias_habiles', { _desde: '2026-09-04', _dias: 2 });
    expect(data).toBe('2026-09-08');
  });

  it('el pedido de envío guarda su fecha estimada y el envío la hereda', async () => {
    const { data: existente } = await cliente
      .from('carts').select('id').eq('user_id', uidCliente).eq('is_active', true).maybeSingle();
    let cartId = (existente as { id: string } | null)?.id ?? '';
    if (!cartId) {
      const { data } = await cliente
        .from('carts').insert({ user_id: uidCliente }).select('id').single();
      cartId = (data as { id: string }).id;
    }
    const { data: v } = await cliente.from('product_variants').select('id').limit(1).single();
    await cliente.from('cart_items').insert({
      cart_id: cartId, variant_id: (v as { id: string }).id, quantity: 1,
    });

    const r = await cliente.rpc('create_order_from_cart', {
      _delivery_method: 'ENVIO',
      _shipping_address: 'Cra 43A # 18 Sur - 135',
      _shipping_municipality_code: MEDELLIN,
      _recipient_name: 'Carlos Mendoza',
      _recipient_document_type: 'CC',
      _recipient_document_number: '71234567',
      _recipient_phone: '3001234567',
    });
    expect(r.error).toBeNull();
    const orderId = r.data as string;
    pedidosCreados.push(orderId);

    const { data: pedido } = await cliente
      .from('orders').select('estimated_delivery_date, shipping_municipality_code')
      .eq('id', orderId).single();
    const o = pedido as { estimated_delivery_date: string; shipping_municipality_code: string };

    expect(o.shipping_municipality_code).toBe(MEDELLIN);
    // Medellín tiene tienda: 2 días hábiles desde hoy.
    const { data: esperada } = await admin.rpc('sumar_dias_habiles', {
      _desde: new Date().toISOString().slice(0, 10), _dias: 2,
    });
    expect(o.estimated_delivery_date).toBe(esperada);

    const { data: envio } = await admin
      .from('shipments').select('estimated_delivery_date').eq('order_id', orderId).single();
    expect((envio as { estimated_delivery_date: string }).estimated_delivery_date)
      .toBe(esperada);
  });

  it('el retiro en tienda NO recibe fecha de envío: usa la que elige el cliente', async () => {
    const { data: existente } = await cliente
      .from('carts').select('id').eq('user_id', uidCliente).eq('is_active', true).maybeSingle();
    let cartId = (existente as { id: string } | null)?.id ?? '';
    if (!cartId) {
      const { data } = await cliente
        .from('carts').insert({ user_id: uidCliente }).select('id').single();
      cartId = (data as { id: string }).id;
    }
    const { data: v } = await cliente.from('product_variants').select('id').limit(1).single();
    await cliente.from('cart_items').insert({
      cart_id: cartId, variant_id: (v as { id: string }).id, quantity: 1,
    });
    const { data: punto } = await cliente
      .from('pickup_locations').select('id').eq('status', 'ACTIVO').limit(1).single();

    const r = await cliente.rpc('create_order_from_cart', {
      _delivery_method: 'RETIRO_TIENDA',
      _pickup_location_id: (punto as { id: string }).id,
      _recipient_name: 'Carlos Mendoza',
      _recipient_document_type: 'CC',
      _recipient_document_number: '71234567',
      _recipient_phone: '3001234567',
    });
    expect(r.error).toBeNull();
    pedidosCreados.push(r.data as string);

    const { data: pedido } = await cliente
      .from('orders').select('estimated_delivery_date').eq('id', r.data as string).single();
    expect((pedido as { estimated_delivery_date: string | null }).estimated_delivery_date)
      .toBeNull();
  });

  it('todos los puntos de venta activos tienen su municipio DIVIPOLA', async () => {
    // Uno sin código caería en el tramo de 5 días.
    const { data } = await admin
      .from('pickup_locations').select('name, city, municipality_code')
      .eq('status', 'ACTIVO');
    const puntos = (data ?? []) as Array<{
      name: string; city: string; municipality_code: string | null;
    }>;
    expect(puntos.length).toBeGreaterThan(0);
    const sinCodigo = puntos.filter((p) => !p.municipality_code);
    expect(sinCodigo.map((p) => `${p.name} (${p.city})`)).toEqual([]);
  });

  const imagen = () =>
    new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });

  it('el cliente puede subir su foto a su propia carpeta', async () => {
    const ruta = `${uidCliente}/perfil-${Date.now()}.jpg`;
    const { error } = await cliente.storage
      .from('avatares').upload(ruta, imagen(), { contentType: 'image/jpeg' });
    expect(error).toBeNull();
    await admin.storage.from('avatares').remove([ruta]);
  });

  it('ATAQUE: nadie puede escribir en la carpeta de otro', async () => {
    // Bucket compartido: sin la comprobación de carpeta, cualquiera cambia la foto de otro.
    const ruta = `${uidCliente}/perfil-intruso-${Date.now()}.jpg`;
    const { error } = await otro.storage
      .from('avatares').upload(ruta, imagen(), { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
  });

  it('un visitante sin sesión no puede subir nada', async () => {
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anon.storage
      .from('avatares').upload(`${uidCliente}/anon.jpg`, imagen(), { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
  });

  it('el bucket de avatares limita el peso a 2 MB y solo acepta imágenes', async () => {
    // Límite de tamaño y tipos permitidos. `storage` no está expuesto por PostgREST: se lee
    // por la API de Storage y se prueba subiendo algo que no cumple.
    const { data: bucket, error } = await admin.storage.getBucket('avatares');
    expect(error).toBeNull();
    expect(bucket?.public).toBe(true);
  });

  it('rechaza un archivo que no es imagen', async () => {
    const pdf = new Blob(['%PDF-1.4 no soy una foto'], { type: 'application/pdf' });
    const { error } = await cliente.storage
      .from('avatares')
      .upload(`${uidCliente}/no-es-foto-${Date.now()}.pdf`, pdf, {
        contentType: 'application/pdf',
      });
    expect(error).not.toBeNull();
  });

  it('rechaza una imagen que pesa más de 2 MB', async () => {
    const grande = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'image/jpeg' });
    const { error } = await cliente.storage
      .from('avatares')
      .upload(`${uidCliente}/pesada-${Date.now()}.jpg`, grande, {
        contentType: 'image/jpeg',
      });
    expect(error).not.toBeNull();
  });

  it('Bogotá, Cali y Barranquilla tienen sus barrios en el diccionario', async () => {
    for (const [code, minimo] of [[BOGOTA, 900], [CALI, 300], [BARRANQUILLA, 150]] as const) {
      const { count } = await admin
        .from('neighborhoods').select('id', { count: 'exact', head: true })
        .eq('municipality_code', code).eq('kind', 'BARRIO');
      expect(count ?? 0, `municipio ${code}`).toBeGreaterThanOrEqual(minimo);
    }
  });

  it('los barrios de las ciudades vienen marcados como de la alcaldía', async () => {
    const { data } = await admin
      .from('neighborhoods').select('source')
      .eq('municipality_code', BOGOTA).eq('kind', 'BARRIO').limit(5);
    for (const f of (data ?? []) as Array<{ source: string }>) {
      expect(f.source).toBe('ALCALDIA');
    }
  });

  it('un municipio sin lista de barrios sigue teniendo sus centros poblados', async () => {
    // Medellín no tiene barrios publicados, pero sí sus centros poblados del DANE.
    const { count } = await admin
      .from('neighborhoods').select('id', { count: 'exact', head: true })
      .eq('municipality_code', MEDELLIN);
    expect(count ?? 0).toBeGreaterThan(0);
  });
});
