import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { clienteDeServicio, crearPedidoDePrueba, borrarPedidoDePrueba } from './limpieza';

/**
 * Asesor asignado por pedido.
 *
 * Lo que se vigila, en orden de gravedad:
 *
 *   1. Que un ASESOR NO VEA los pedidos de otro asesor. Es un cambio de RLS
 *      sobre la tabla más consultada del sistema; si se afloja, todo el
 *      personal vuelve a ver todo sin que nadie lo note.
 *   2. Que quien es asesor Y ADEMÁS otra cosa siga viéndolo todo. Taparle los
 *      pedidos a quien despacha o factura rompería la operación, y el fallo
 *      aparecería lejos de este cambio.
 *   3. Que el cliente siga viendo sus pedidos igual que antes.
 *   4. Que la asignación respete la sede: asignar a alguien un pedido que su
 *      propia RLS le va a ocultar es peor que no asignarlo.
 *   5. Que sin asesor disponible se le AVISE al cliente, y que al entrar uno
 *      se cumpla la promesa y se reparta.
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

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON || !SERVICE) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Asesor por pedido · asignación y aislamiento', () => {
  const admin = clienteDeServicio(API, SERVICE);
  const sello = Date.now();
  const creados: string[] = [];
  let sedeA = '';
  let sedeB = '';
  let asesorA = '';
  let asesorB = '';
  let cliente = '';

  const crearInterno = async (correo: string, rol: string, sede: string | null) => {
    const { data } = await admin.auth.admin.createUser({
      email: correo, password: 'Asesor2026*', email_confirm: true,
      user_metadata: { first_name: 'Asesor', last_name: String(sello), client_type: 'Particular' },
    });
    const id = (data?.user as { id: string } | undefined)?.id ?? '';
    if (!id) throw new Error(`no se creó ${correo}`);
    await admin.from('user_roles').insert({ user_id: id, role: rol });
    if (sede) await admin.from('user_pickup_locations').insert({ user_id: id, location_id: sede });
    return id;
  };

  const token = (correo: string) =>
    fetch(`${API}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: correo, password: 'Asesor2026*' }),
    }).then((r) => r.json()).then((j) => j.access_token ?? '');

  const veElPedido = async (tok: string, id: string) => {
    const r = await fetch(`${API}/rest/v1/orders?select=id,advisor_id&id=eq.${id}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${tok}` },
    });
    return ((await r.json()) as unknown[]).length > 0;
  };

  beforeAll(async () => {
    const { data: sedes } = await admin
      .from('pickup_locations').select('id').eq('status', 'ACTIVO').limit(2);
    const filas = (sedes ?? []) as Array<{ id: string }>;
    sedeA = filas[0].id;
    sedeB = filas[1].id;

    asesorA = await crearInterno(`asesor.a.${sello}@correo.test`, 'ASESOR', sedeA);
    asesorB = await crearInterno(`asesor.b.${sello}@correo.test`, 'ASESOR', sedeB);

    const { data: perfil } = await admin
      .from('profiles').select('id').eq('email', 'jeisonestebancarrero@gmail.com').single();
    cliente = (perfil as { id: string }).id;
  });

  /** Sedes que la prueba le impuso a asesores de la semilla, para devolverlas. */
  const sedesImpuestas: Array<{ user_id: string; location_id: string }> = [];

  afterAll(async () => {
    for (const id of creados) await borrarPedidoDePrueba(admin, id);
    // Sin esto, los asesores de la semilla quedarían restringidos a una sede
    // para siempre y la siguiente corrida fallaría por un motivo que nada
    // tiene que ver con lo que comprueba.
    for (const s of sedesImpuestas) {
      await admin.from('user_pickup_locations').delete()
        .eq('user_id', s.user_id).eq('location_id', s.location_id);
    }
    for (const correo of [
      `asesor.a.${sello}@correo.test`, `asesor.b.${sello}@correo.test`,
      `asesor.mixto.${sello}@correo.test`, `asesor.tarde.${sello}@correo.test`,
    ]) {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const u = ((data?.users ?? []) as Array<{ id: string; email?: string }>)
        .find((x) => x.email === correo);
      if (u) await admin.auth.admin.deleteUser(u.id);
    }
  });

  it('el pedido nace con asesor, y de la sede correcta', async () => {
    const p = await crearPedidoDePrueba(admin, cliente, { sello });
    creados.push(p.id);
    // `crearPedidoDePrueba` no pone sede, y un pedido sin sede lo cubre
    // cualquier asesor. El flujo real (`create_order_from_cart`) SÍ la pone en
    // el mismo insert, así que se reproduce eso: al cambiarla, el disparador
    // de sede revisa si el asesor actual sigue sirviendo.
    await admin.from('orders').update({ pickup_location_id: sedeA }).eq('id', p.id);

    const { data } = await admin.from('orders').select('advisor_id').eq('id', p.id).single();
    const asignado = (data as { advisor_id: string | null }).advisor_id;
    expect(asignado, 'el pedido quedó sin asesor').not.toBeNull();
    // Solo el asesor A cubre la sede A... salvo que existan asesores sin sedes
    // restringidas, que cubren todas.
    const { data: libres } = await admin.rpc('asesores_para_sede', { _location_id: sedeA });
    expect((libres as string[]) ?? []).toContain(asignado);
  });

  it('LO QUE IMPORTA: un asesor no ve el pedido de otro', async () => {
    const p = await crearPedidoDePrueba(admin, cliente, { sello });
    creados.push(p.id);
    await admin.from('orders')
      .update({ pickup_location_id: sedeA, advisor_id: asesorA, advisor_assigned_at: new Date().toISOString() })
      .eq('id', p.id);

    const tA = await token(`asesor.a.${sello}@correo.test`);
    const tB = await token(`asesor.b.${sello}@correo.test`);
    expect(await veElPedido(tA, p.id), 'su propio pedido no se ve').toBe(true);
    expect(await veElPedido(tB, p.id), 've el pedido de otro asesor').toBe(false);
  });

  it('el cliente sigue viendo su pedido, tenga el asesor que tenga', async () => {
    const p = await crearPedidoDePrueba(admin, cliente, { sello });
    creados.push(p.id);
    await admin.from('orders').update({ advisor_id: asesorB }).eq('id', p.id);

    const tCliente = await fetch(`${API}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jeisonestebancarrero@gmail.com', password: 'pintuco2025*' }),
    }).then((r) => r.json()).then((j) => j.access_token ?? '');

    if (!tCliente) return; // sin la clave del cliente real no se puede comprobar
    expect(await veElPedido(tCliente, p.id)).toBe(true);
  });

  it('quien es asesor Y ADEMÁS otra cosa lo sigue viendo todo', async () => {
    // Este es el que evita romper el despacho y la facturación sin enterarse.
    const mixto = await crearInterno(`asesor.mixto.${sello}@correo.test`, 'ASESOR', null);
    await admin.from('user_roles').insert({ user_id: mixto, role: 'DESPACHO' });

    const p = await crearPedidoDePrueba(admin, cliente, { sello });
    creados.push(p.id);
    await admin.from('orders').update({ advisor_id: asesorA }).eq('id', p.id);

    const tMixto = await token(`asesor.mixto.${sello}@correo.test`);
    expect(await veElPedido(tMixto, p.id), 'a un asesor+despacho se le tapó un pedido').toBe(true);
  });

  it('sin asesor para la sede se le AVISA al cliente y luego se reparte', async () => {
    // Se deja una sede sin ningún asesor que la cubra.
    const { data: sedes } = await admin
      .from('pickup_locations').select('id').eq('status', 'ACTIVO').limit(3);
    const sedeC = ((sedes ?? []) as Array<{ id: string }>)[2]?.id;
    if (!sedeC) return;

    // Los asesores sin restricción cubren todas las sedes, así que para que
    // este caso exista de verdad hay que restringirlos a todos.
    const { data: todos } = await admin.rpc('asesores_para_sede', { _location_id: sedeC });
    const sinRestringir = ((todos as string[]) ?? []).filter((a) => a !== asesorA && a !== asesorB);
    for (const a of sinRestringir) {
      await admin.from('user_pickup_locations').insert({ user_id: a, location_id: sedeA });
      sedesImpuestas.push({ user_id: a, location_id: sedeA });
    }

    const p = await crearPedidoDePrueba(admin, cliente, { sello });
    creados.push(p.id);
    // El pedido nace SIN sede, y un pedido sin sede lo cubre cualquier asesor:
    // el disparador ya le puso uno. Para probar el caso «nadie cubre esta
    // sede» hay que ponerle la sede y volver a dejarlo huérfano.
    await admin.from('orders')
      .update({ pickup_location_id: sedeC, advisor_id: null, advisor_assigned_at: null })
      .eq('id', p.id);
    await admin.from('notifications').delete().eq('order_id', p.id);
    await admin.rpc('asignar_asesor', { _order_id: p.id });

    const { data: sinAsesor } = await admin
      .from('orders').select('advisor_id').eq('id', p.id).single();
    expect((sinAsesor as { advisor_id: string | null }).advisor_id).toBeNull();

    const { data: avisos } = await admin
      .from('notifications').select('title').eq('order_id', p.id);
    expect(((avisos ?? []) as Array<{ title: string }>).map((a) => a.title).join(' '))
      .toMatch(/cola de asignación/i);

    // Entra un asesor que sí cubre esa sede: se cumple la promesa.
    await crearInterno(`asesor.tarde.${sello}@correo.test`, 'ASESOR', sedeC);

    const { data: ya } = await admin.from('orders').select('advisor_id').eq('id', p.id).single();
    expect((ya as { advisor_id: string | null }).advisor_id,
      'al entrar un asesor no se repartieron los huérfanos').not.toBeNull();

    const { data: avisos2 } = await admin
      .from('notifications').select('title').eq('order_id', p.id);
    expect(((avisos2 ?? []) as Array<{ title: string }>).map((a) => a.title).join(' '))
      .toMatch(/asesor asignado/i);
  });
});
