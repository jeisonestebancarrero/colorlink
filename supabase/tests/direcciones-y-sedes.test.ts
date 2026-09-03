import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Direcciones del cliente, sedes de la empresa y quién recibe el pedido.
 *
 * Lo que se vigila, que es donde se despacha mercancía al lugar equivocado:
 *   1. Que la dirección de una persona no la vea otra.
 *   2. Que NADIE pueda mandar un pedido a una sede de otra empresa. Es el
 *      ataque obvio: el id de la sede viaja en la petición.
 *   3. Que al elegir sede, la dirección la ponga el SERVIDOR leyendo la sede,
 *      no lo que diga el navegador. Si el navegador pudiera enviar una
 *      dirección junto con el id de la sede, el despacho saldría hacia donde
 *      dijera la pestaña.
 *   4. Que un envío sin dirección, sin ciudad del listado oficial o sin quién
 *      recibe no se pueda crear.
 *   5. Que el diccionario DIVIPOLA se lea sin sesión (el visitante cotiza) y
 *      no lo pueda escribir nadie desde el cliente.
 *
 * La prueba deja la base como la encontró.
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

const HORIZONTE = { email: 'carlos.mendoza@constructorahorizonte.com', password: 'pintuco2025*' };
const EDIFICAR = { email: 'ana.torres@edificarplus.com', password: 'pintuco2025*' };

/** Códigos DIVIPOLA reales usados en las pruebas. */
const MEDELLIN = '05001';
const BOGOTA = '11001';

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

const nuevoCliente = () => createClient(API, ANON, { auth: { persistSession: false } });

describe.skipIf(!disponible)('Direcciones, sedes y quién recibe', () => {
  let horizonte: SupabaseClient;
  let edificar: SupabaseClient;
  let anon: SupabaseClient;

  let sedeHorizonte = '';
  let sedeEdificar = '';
  const direccionesCreadas: string[] = [];
  const sedesCreadas: string[] = [];
  const pedidosCreados: string[] = [];

  const QUIEN_RECIBE = {
    _recipient_name: 'Carlos Mendoza',
    _recipient_document_type: 'CC',
    _recipient_document_number: '71234567',
    _recipient_phone: '3001234567',
  };

  beforeAll(async () => {
    horizonte = nuevoCliente();
    edificar = nuevoCliente();
    anon = nuevoCliente();

    for (const [cli, cred] of [[horizonte, HORIZONTE], [edificar, EDIFICAR]] as const) {
      const { error } = await cli.auth.signInWithPassword(cred);
      if (error) throw new Error(`no se pudo autenticar ${cred.email}: ${error.message}`);
    }

    const sedes = await horizonte.from('company_branches').select('id').limit(1);
    sedeHorizonte = ((sedes.data ?? []) as Array<{ id: string }>)[0]?.id ?? '';
    expect(sedeHorizonte).not.toBe('');

    // Una sede de la OTRA empresa, para probar el cruce.
    const { data: propia } = await edificar
      .from('profiles').select('company_id').eq('email', EDIFICAR.email).maybeSingle();
    const companyEdificar = (propia as { company_id: string } | null)?.company_id as string;

    const creada = await edificar.from('company_branches').insert({
      company_id: companyEdificar,
      name: `Sede de prueba ${Date.now()}`,
      address_line: 'Cl 100 # 10 - 10, Oficina 201',
      municipality_code: BOGOTA,
    }).select('id').single();
    sedeEdificar = (creada.data as { id: string }).id;
    sedesCreadas.push(sedeEdificar);
  });

  afterAll(async () => {
    // El pedido de prueba se borra con service_role: un cliente no puede (ni
    // debe) borrar pedidos, y dejarlo ahí ensuciaría la bandeja del punto de
    // venta y los conteos de analítica.
    if (pedidosCreados.length > 0 && SERVICE) {
      const admin = createClient(API, SERVICE, { auth: { persistSession: false } });
      for (const id of pedidosCreados) {
        await admin.from('notifications').delete().eq('order_id', id);
        await admin.from('shipments').delete().eq('order_id', id);
        await admin.from('payments').delete().eq('order_id', id);
        await admin.from('order_items').delete().eq('order_id', id);
        await admin.from('audit_logs').delete().eq('entity_id', id);
        await admin.from('orders').delete().eq('id', id);
      }
    }
    for (const id of direccionesCreadas) {
      await horizonte.from('customer_addresses').delete().eq('id', id);
    }
    for (const id of sedesCreadas) {
      await edificar.from('company_branches').delete().eq('id', id);
    }
    await horizonte.auth.signOut();
    await edificar.auth.signOut();
  });

  // ----------------------------------------------------------
  // Diccionario oficial
  // ----------------------------------------------------------
  it('el diccionario DIVIPOLA está completo: 33 departamentos y 1.122 municipios', async () => {
    const d = await anon.from('departments').select('code', { count: 'exact', head: true });
    const m = await anon.from('municipalities').select('code', { count: 'exact', head: true });
    expect(d.count).toBe(33);
    expect(m.count).toBe(1122);
  });

  it('un visitante sin sesión puede elegir ciudad, pero no tocar el diccionario', async () => {
    const lectura = await anon
      .from('municipalities').select('code, name').eq('code', MEDELLIN).maybeSingle();
    expect((lectura.data as { name: string } | null)?.name).toBe('Medellín');

    const escritura = await anon
      .from('municipalities')
      .insert({ code: '99999', department_code: '05', name: 'Inventado', name_dane: 'INVENTADO', kind: 'Municipio' });
    expect(escritura.error).not.toBeNull();
  });

  it('guarda el nombre oficial del DANE junto al que se muestra', async () => {
    const { data } = await anon
      .from('municipalities').select('name, name_dane').eq('code', BOGOTA).single();
    const fila = data as { name: string; name_dane: string };
    expect(fila.name).toBe('Bogotá, D.C.');
    expect(fila.name_dane).toBe('BOGOTÁ, D.C.');
  });

  // ----------------------------------------------------------
  // Direcciones del cliente
  // ----------------------------------------------------------
  it('el cliente guarda su dirección y la ciudad queda atada al municipio oficial', async () => {
    const { data, error } = await horizonte.from('customer_addresses').insert({
      user_id: (await horizonte.auth.getUser()).data.user?.id,
      label: 'Obra El Poblado',
      address_line: 'Cra 43A # 18 Sur - 135',
      municipality_code: MEDELLIN,
    }).select('id, municipality_code').single();

    expect(error).toBeNull();
    const fila = data as { id: string; municipality_code: string };
    direccionesCreadas.push(fila.id);
    expect(fila.municipality_code).toBe(MEDELLIN);
  });

  it('rechaza una ciudad que no está en el listado oficial', async () => {
    const r = await horizonte.from('customer_addresses').insert({
      user_id: (await horizonte.auth.getUser()).data.user?.id,
      label: 'Inventada',
      address_line: 'Calle falsa 123',
      municipality_code: '99999',
    });
    expect(r.error).not.toBeNull();
  });

  it('la dirección de un cliente no la ve otro cliente', async () => {
    const id = direccionesCreadas[0];
    expect(id).toBeTruthy();

    const ajena = await edificar.from('customer_addresses').select('id').eq('id', id);
    expect(ajena.data ?? []).toHaveLength(0);

    const anonima = await anon.from('customer_addresses').select('id').eq('id', id);
    expect(anonima.data ?? []).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // Sedes
  // ----------------------------------------------------------
  it('la empresa ve sus sedes con dirección, municipio y departamento', async () => {
    const { data, error } = await horizonte
      .from('company_branches')
      .select('name, address_line, contact_name, municipalities ( name, departments ( name ) )')
      .order('is_default', { ascending: false });

    expect(error).toBeNull();
    const sedes = (data ?? []) as unknown as Array<{
      name: string; address_line: string;
      municipalities: { name: string; departments: { name: string } } | null;
    }>;
    expect(sedes.length).toBeGreaterThan(1);
    expect(sedes[0].municipalities?.name).toBeTruthy();
    expect(sedes[0].municipalities?.departments.name).toBeTruthy();
  });

  it('una empresa NO ve las sedes de otra', async () => {
    const ajena = await horizonte.from('company_branches').select('id').eq('id', sedeEdificar);
    expect(ajena.data ?? []).toHaveLength(0);

    const anonima = await anon.from('company_branches').select('id').limit(1);
    expect(anonima.data ?? []).toHaveLength(0);
  });

  it('nadie puede crear una sede en una empresa que no es la suya', async () => {
    const { data: ajena } = await edificar
      .from('profiles').select('company_id').eq('email', EDIFICAR.email).maybeSingle();
    const companyAjena = (ajena as { company_id: string }).company_id;

    const r = await horizonte.from('company_branches').insert({
      company_id: companyAjena,
      name: 'Sede intrusa',
      address_line: 'Cra 1 # 1 - 1, intrusa',
      municipality_code: BOGOTA,
    });
    expect(r.error).not.toBeNull();
  });

  // ----------------------------------------------------------
  // El pedido
  // ----------------------------------------------------------
  const pedir = (cli: SupabaseClient, extra: Record<string, unknown>) =>
    cli.rpc('create_order_from_cart', {
      _delivery_method: 'ENVIO',
      ...QUIEN_RECIBE,
      ...extra,
    });

  it('no acepta un envío sin dirección', async () => {
    const r = await pedir(horizonte, { _shipping_municipality_code: MEDELLIN });
    expect(r.error?.message ?? '').toMatch(/dirección de envío es obligatoria/i);
  });

  it('no acepta un envío sin ciudad', async () => {
    const r = await pedir(horizonte, { _shipping_address: 'Cra 43A # 18 Sur - 135' });
    expect(r.error?.message ?? '').toMatch(/ciudad de envío/i);
  });

  it('no acepta una ciudad fuera del listado oficial', async () => {
    const r = await pedir(horizonte, {
      _shipping_address: 'Cra 43A # 18 Sur - 135',
      _shipping_municipality_code: '99999',
    });
    expect(r.error?.message ?? '').toMatch(/listado oficial/i);
  });

  it('no acepta un pedido sin quién recibe', async () => {
    for (const falta of [
      { _recipient_name: '' },
      { _recipient_document_number: '' },
      { _recipient_phone: '' },
    ]) {
      const r = await horizonte.rpc('create_order_from_cart', {
        _delivery_method: 'ENVIO',
        _shipping_address: 'Cra 43A # 18 Sur - 135',
        _shipping_municipality_code: MEDELLIN,
        ...QUIEN_RECIBE,
        ...falta,
      });
      expect(r.error?.message ?? '').toMatch(/quien recibe|de quien recibe/i);
    }
  });

  it('rechaza un tipo de documento inventado', async () => {
    const r = await pedir(horizonte, {
      _shipping_address: 'Cra 43A # 18 Sur - 135',
      _shipping_municipality_code: MEDELLIN,
      _recipient_document_type: 'LICENCIA_DE_CONDUCIR',
    });
    expect(r.error?.message ?? '').toMatch(/tipo de documento no es válido/i);
  });

  it('RECHAZA un pedido dirigido a la sede de otra empresa', async () => {
    const r = await pedir(horizonte, { _company_branch_id: sedeEdificar });
    expect(r.error?.message ?? '').toMatch(/no es de tu empresa/i);
  });

  it('rechaza una dirección guardada que no es del comprador', async () => {
    const idAjeno = direccionesCreadas[0];
    const r = await pedir(edificar, {
      _customer_address_id: idAjeno,
      _recipient_name: 'Ana Torres',
      _recipient_document_number: '52111222',
      _recipient_phone: '3012223344',
    });
    expect(r.error?.message ?? '').toMatch(/no es tuya/i);
  });

  it('al elegir sede, la dirección la pone el SERVIDOR y no el navegador', async () => {
    const sede = await horizonte
      .from('company_branches')
      .select('address_line, municipality_code')
      .eq('id', sedeHorizonte).single();
    const real = sede.data as { address_line: string; municipality_code: string };

    // Hace falta un carrito con algo dentro para que el pedido llegue a crearse.
    const uid = (await horizonte.auth.getUser()).data.user?.id as string;
    // Solo puede haber un carrito activo por persona: se reutiliza el que haya.
    const { data: existente } = await horizonte
      .from('carts').select('id').eq('user_id', uid).eq('is_active', true).maybeSingle();
    let cartId = (existente as { id: string } | null)?.id ?? '';
    if (!cartId) {
      const { data: cart } = await horizonte
        .from('carts').insert({ user_id: uid }).select('id').single();
      cartId = (cart as { id: string }).id;
    }
    const { data: variante } = await horizonte
      .from('product_variants').select('id').limit(1).single();
    await horizonte.from('cart_items').insert({
      cart_id: cartId, variant_id: (variante as { id: string }).id, quantity: 1,
    });

    // Se manda el id de la sede propia Y una dirección falsa a propósito.
    const r = await pedir(horizonte, {
      _company_branch_id: sedeHorizonte,
      _shipping_address: 'DIRECCIÓN FALSA QUE MANDÓ EL NAVEGADOR',
      _shipping_municipality_code: BOGOTA,
    });
    expect(r.error).toBeNull();
    const orderId = r.data as string;
    pedidosCreados.push(orderId);

    const { data: pedido } = await horizonte
      .from('orders')
      .select('shipping_address, shipping_municipality_code, company_branch_id, recipient_name, recipient_document_number, recipient_phone')
      .eq('id', orderId).single();
    const o = pedido as Record<string, string>;

    // La dirección falsa NO llegó al pedido: ganó la de la sede.
    expect(o.shipping_address).toBe(real.address_line);
    expect(o.shipping_municipality_code).toBe(real.municipality_code);
    expect(o.shipping_address).not.toMatch(/FALSA/);
    expect(o.company_branch_id).toBe(sedeHorizonte);
    // Y quién recibe quedó guardado.
    // Guardado normalizado: nombre en mayúsculas, documento sin puntos y
    // teléfono con indicativo (20260902100006).
    expect(o.recipient_name).toBe('CARLOS MENDOZA');
    expect(o.recipient_document_number).toBe('71234567');
    expect(o.recipient_phone).toBe('+573001234567');
  });
});
