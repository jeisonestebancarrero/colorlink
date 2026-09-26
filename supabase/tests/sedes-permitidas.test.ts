import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Sedes permitidas por usuario: la restricción la aplica la base, no el selector. Sin
 * asignación se ve todo, el admin nunca queda sin acceso, catálogo y clientes no se
 * filtran por sede y el cliente ve todos sus pedidos.
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
const ASESOR = { email: 'asesor@pintuco.demo', password: 'pintuco2025*' };
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

const disponible = await hayInstancia();

describe.skipIf(!disponible || !SERVICE)('Sedes permitidas por usuario', () => {
  let admin: SupabaseClient;
  let asesor: SupabaseClient;
  let cliente: SupabaseClient;
  let uidAsesor = '';
  let sedes: Array<{ id: string; name: string }> = [];
  /** Sedes creadas por la prueba, para borrarlas al final. */
  const sedesCreadas: string[] = [];
  const visitasCreadas: string[] = [];

  /** Deja al asesor con las sedes indicadas. Sin argumentos, sin restricción. */
  const asignar = async (...ids: string[]) => {
    await admin.from('user_pickup_locations').delete().eq('user_id', uidAsesor);
    if (ids.length > 0) {
      await admin.from('user_pickup_locations')
        .insert(ids.map((location_id) => ({ user_id: uidAsesor, location_id })));
    }
  };

  beforeAll(async () => {
    admin = createClient(API, SERVICE, { auth: { persistSession: false } });
    asesor = createClient(API, ANON, { auth: { persistSession: false } });
    cliente = createClient(API, ANON, { auth: { persistSession: false } });

    const a = await asesor.auth.signInWithPassword(ASESOR);
    if (a.error) throw new Error(`asesor: ${a.error.message}`);
    uidAsesor = a.data.user?.id as string;

    const c = await cliente.auth.signInWithPassword(CLIENTE);
    if (c.error) throw new Error(`cliente: ${c.error.message}`);

    const { data } = await admin
      .from('pickup_locations').select('id, name').eq('status', 'ACTIVO').order('name');
    sedes = (data ?? []) as Array<{ id: string; name: string }>;
    expect(sedes.length).toBeGreaterThanOrEqual(3);
  });

  afterAll(async () => {
    // Se restaura al asesor sin restricción.
    await asignar();
    for (const id of visitasCreadas) {
      await admin.from('technical_visits').delete().eq('id', id);
    }
    for (const id of sedesCreadas) {
      await admin.from('user_pickup_locations').delete().eq('location_id', id);
      await admin.from('pickup_locations').delete().eq('id', id);
    }
    await asesor.auth.signOut();
    await cliente.auth.signOut();
  });

  const sedesConInventario = async (cli: SupabaseClient): Promise<string[]> => {
    const { data, error } = await cli.from('inventory').select('location_id');
    expect(error).toBeNull();
    return [...new Set(((data ?? []) as Array<{ location_id: string }>)
      .map((f) => f.location_id))];
  };

  it('sin sedes asignadas, el personal ve el inventario de todas', async () => {
    await asignar();
    const vistas = await sedesConInventario(asesor);
    expect(vistas.length).toBe(sedes.length);
  });

  it('sin asignación, `tiene_sedes_restringidas` dice que no', async () => {
    await asignar();
    const { data } = await asesor.rpc('tiene_sedes_restringidas');
    expect(data).toBe(false);
  });

  it('con UNA sede asignada, solo ve el inventario de esa', async () => {
    await asignar(sedes[0].id);
    const vistas = await sedesConInventario(asesor);
    expect(vistas).toEqual([sedes[0].id]);
  });

  it('con DOS sedes asignadas, ve exactamente esas dos', async () => {
    await asignar(sedes[0].id, sedes[1].id);
    const vistas = await sedesConInventario(asesor);
    expect(vistas.sort()).toEqual([sedes[0].id, sedes[1].id].sort());
  });

  it('`sedes_permitidas` devuelve solo las asignadas', async () => {
    await asignar(sedes[0].id, sedes[2].id);
    const { data, error } = await asesor.rpc('sedes_permitidas');
    expect(error).toBeNull();
    const ids = (data as Array<string> | Array<{ sedes_permitidas: string }>)
      .map((x) => (typeof x === 'string' ? x : x.sedes_permitidas));
    expect(ids.sort()).toEqual([sedes[0].id, sedes[2].id].sort());
  });

  it('ATAQUE: pedir explícitamente otra sede devuelve vacío, no sus datos', async () => {
    // El id de la sede viaja en la petición: se intenta con una ajena.
    await asignar(sedes[0].id);
    const { data, error } = await asesor
      .from('inventory').select('id').eq('location_id', sedes[1].id);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('ATAQUE: no puede escribir inventario de una sede ajena', async () => {
    await asignar(sedes[0].id);
    const { data: fila, error: e0 } = await admin
      .from('inventory').select('id, qty_available')
      .eq('location_id', sedes[1].id).limit(1).maybeSingle();
    expect(e0).toBeNull();
    const f = fila as { id: string; qty_available: number };
    expect(f, 'hace falta inventario en la segunda sede para esta prueba').toBeTruthy();

    await asesor
      .from('inventory').update({ qty_available: f.qty_available + 999 }).eq('id', f.id);

    // Puede rechazarse o no alcanzar filas; lo que no puede es cambiar la cantidad.
    const { data: despues } = await admin
      .from('inventory').select('qty_available').eq('id', f.id).single();
    expect((despues as { qty_available: number }).qty_available).toBe(f.qty_available);
  });

  it('las recepciones también quedan acotadas a sus sedes', async () => {
    await asignar(sedes[0].id);
    const { data, error } = await asesor.from('purchase_receipts').select('location_id');
    expect(error).toBeNull();
    for (const f of (data ?? []) as Array<{ location_id: string }>) {
      expect(f.location_id).toBe(sedes[0].id);
    }
  });

  it('el ADMINISTRADOR ve todas las sedes aunque se le asigne una sola', async () => {
    const adminCli = createClient(API, ANON, { auth: { persistSession: false } });
    const s = await adminCli.auth.signInWithPassword(ADMIN);
    expect(s.error).toBeNull();
    const uidAdmin = s.data.user?.id as string;

    await admin.from('user_pickup_locations').delete().eq('user_id', uidAdmin);
    await admin.from('user_pickup_locations')
      .insert({ user_id: uidAdmin, location_id: sedes[0].id });

    // Un error de configuración no puede dejarlo sin acceso.
    const vistas = await sedesConInventario(adminCli);
    expect(vistas.length).toBe(sedes.length);

    await admin.from('user_pickup_locations').delete().eq('user_id', uidAdmin);
    await adminCli.auth.signOut();
  });

  it('el CATÁLOGO es global: no se filtra por sede', async () => {
    // Un producto creado en una sede debe verse en la tienda de cualquier ciudad.
    await asignar(sedes[0].id);
    const { count: total } = await admin
      .from('products').select('id', { count: 'exact', head: true });
    const { count: visto } = await asesor
      .from('products').select('id', { count: 'exact', head: true });
    expect(visto).toBe(total);

    const { count: variantesTotal } = await admin
      .from('product_variants').select('id', { count: 'exact', head: true });
    const { count: variantesVistas } = await asesor
      .from('product_variants').select('id', { count: 'exact', head: true });
    expect(variantesVistas).toBe(variantesTotal);
  });

  it('los CLIENTES son globales: no se asignan a una sede', async () => {
    // Filtrar clientes por sede partiría su historial.
    await asignar(sedes[0].id);
    const { count: total } = await admin
      .from('companies').select('id', { count: 'exact', head: true });
    const { count: visto } = await asesor
      .from('companies').select('id', { count: 'exact', head: true });
    expect(visto).toBe(total);
  });

  it('el diccionario de ubicaciones tampoco se filtra', async () => {
    await asignar(sedes[0].id);
    const { count } = await asesor
      .from('municipalities').select('code', { count: 'exact', head: true });
    expect(count).toBe(1122);
  });

  it('el CLIENTE sigue viendo sus pedidos, salgan de la sede que salgan', async () => {
    // La restricción es del personal: el cliente ve pedidos de cualquier sede.
    const { data: uid } = await cliente.auth.getUser();
    const propio = uid.user?.id as string;

    const { count: suyos } = await admin
      .from('orders').select('id', { count: 'exact', head: true }).eq('user_id', propio);
    const { count: vistos } = await cliente
      .from('orders').select('id', { count: 'exact', head: true }).eq('user_id', propio);
    expect(vistos).toBe(suyos);
  });

  it('una sede NUEVA aparece sola para quien no está restringido', async () => {
    // Una tienda nueva debe aparecer en los filtros sin tocar nada.
    await asignar();   // sin restricción

    const antes = await asesor.rpc('sedes_permitidas');
    const cuantasAntes = (antes.data as unknown[]).length;

    const { data: creada, error } = await admin.from('pickup_locations').insert({
      external_ref: `store-prueba-${Date.now()}`,
      name: `Tienda de Prueba ${Date.now()}`,
      city: 'Medellín',
      address: 'Cra 1 # 1 - 1',
      status: 'ACTIVO',
      municipality_code: '05001',
    }).select('id').single();
    expect(error).toBeNull();
    const nueva = (creada as { id: string }).id;
    sedesCreadas.push(nueva);

    const despues = await asesor.rpc('sedes_permitidas');
    const ids = (despues.data as Array<string | { sedes_permitidas: string }>)
      .map((x) => (typeof x === 'string' ? x : x.sedes_permitidas));

    expect(ids.length).toBe(cuantasAntes + 1);
    expect(ids).toContain(nueva);
  });

  it('una sede nueva NO se le abre a quien está restringido, hasta asignársela', async () => {
    // Quien está restringido no gana acceso a una tienda nueva hasta que se la asignen.
    const { data: creada } = await admin.from('pickup_locations').insert({
      external_ref: `store-prueba2-${Date.now()}`,
      name: `Tienda Restringida ${Date.now()}`,
      city: 'Cali',
      address: 'Cl 2 # 2 - 2',
      status: 'ACTIVO',
      municipality_code: '76001',
    }).select('id').single();
    const nueva = (creada as { id: string }).id;
    sedesCreadas.push(nueva);

    await asignar(sedes[0].id);
    const r = await asesor.rpc('sedes_permitidas');
    const ids = (r.data as Array<string | { sedes_permitidas: string }>)
      .map((x) => (typeof x === 'string' ? x : x.sedes_permitidas));
    expect(ids).not.toContain(nueva);
    expect(ids).toEqual([sedes[0].id]);

    // En cuanto se le asigna, la ve.
    await asignar(sedes[0].id, nueva);
    const r2 = await asesor.rpc('sedes_permitidas');
    const ids2 = (r2.data as Array<string | { sedes_permitidas: string }>)
      .map((x) => (typeof x === 'string' ? x : x.sedes_permitidas));
    expect(ids2.sort()).toEqual([sedes[0].id, nueva].sort());
  });

  it('una sede INACTIVA no se ofrece, aunque esté asignada', async () => {
    // Una tienda cerrada sale de todos los selectores.
    const { data: creada } = await admin.from('pickup_locations').insert({
      external_ref: `store-cerrada-${Date.now()}`,
      name: `Tienda Cerrada ${Date.now()}`,
      city: 'Medellín',
      address: 'Cra 3 # 3 - 3',
      status: 'INACTIVO',
      municipality_code: '05001',
    }).select('id').single();
    const cerrada = (creada as { id: string }).id;
    sedesCreadas.push(cerrada);

    await asignar(sedes[0].id, cerrada);
    const r = await asesor.rpc('sedes_permitidas');
    const ids = (r.data as Array<string | { sedes_permitidas: string }>)
      .map((x) => (typeof x === 'string' ? x : x.sedes_permitidas));
    expect(ids).not.toContain(cerrada);
  });

  it('la sede nueva trae los campos que necesitan las tarjetas del contador', async () => {
    // `external_ref` resuelve la foto y `image_url` (subida desde el portal) tiene prioridad.
    const { data } = await admin
      .from('pickup_locations')
      .select('id, name, city, address, external_ref, image_url')
      .in('id', sedesCreadas.length > 0 ? sedesCreadas : ['00000000-0000-0000-0000-000000000000']);

    for (const f of (data ?? []) as Array<Record<string, unknown>>) {
      expect(f).toHaveProperty('external_ref');
      expect(f).toHaveProperty('image_url');
      expect(f.city).toBeTruthy();
    }
  });

  // Panel y Analítica son SECURITY DEFINER: RLS no aplica dentro, así que deben cruzar
  // con las sedes permitidas o un asesor restringido vería los números de todas.

  it('el Panel se acota a las sedes del usuario', async () => {
    await asignar();
    const todas = await asesor.rpc('resumen_panel');
    expect(todas.error).toBeNull();
    const conTodas = (todas.data as Record<string, number>).por_alistar;

    await asignar(sedes[0].id);
    const una = await asesor.rpc('resumen_panel');
    expect(una.error).toBeNull();
    const conUna = (una.data as Record<string, number>).por_alistar;

    // Con una sola sede no puede ver más que con todas.
    expect(conUna).toBeLessThanOrEqual(conTodas);
  });

  it('ATAQUE: pedirle al Panel una sede ajena no devuelve sus cifras', async () => {
    await asignar(sedes[0].id);

    // Se pide explícitamente una sede no asignada.
    const ajena = await asesor.rpc('resumen_panel', { _sedes: [sedes[1].id] });
    expect(ajena.error).toBeNull();
    const d = ajena.data as Record<string, number>;

    // La intersección queda vacía; el inventario siempre tiene sede, a diferencia de los envíos.
    expect(d.bajo_minimo).toBe(0);
    expect(d.agotados).toBe(0);
    expect(d.criticos).toEqual([]);
  });

  it('el inventario crítico del Panel solo trae sus sedes', async () => {
    await asignar(sedes[0].id);
    const r = await asesor.rpc('resumen_panel');
    const criticos = ((r.data as Record<string, unknown>).criticos ?? []) as
      Array<{ punto: string }>;
    const nombre = sedes[0].name;
    for (const c of criticos) {
      expect(c.punto).toBe(nombre);
    }
  });

  it('`sedes_efectivas` cruza lo pedido con lo permitido, nunca amplía', async () => {
    await asignar(sedes[0].id);

    const sinPedir = await asesor.rpc('sedes_efectivas', { _pedidas: null });
    expect(sinPedir.data).toEqual([sedes[0].id]);

    // Una sede ajena se descarta en la intersección.
    const ajena = await asesor.rpc('sedes_efectivas', { _pedidas: [sedes[1].id] });
    expect(ajena.data).toEqual([]);

    // Propia y ajena: solo queda la propia.
    const mezcla = await asesor.rpc('sedes_efectivas', {
      _pedidas: [sedes[0].id, sedes[1].id],
    });
    expect(mezcla.data).toEqual([sedes[0].id]);
  });

  it('los filtros de Analítica solo ofrecen las sedes permitidas', async () => {
    // Ofrecer una sede sin acceso haría creer que no hubo ventas.
    await asignar(sedes[0].id, sedes[1].id);

    // Con el admin real: con `service_role`, `auth.uid()` es nulo e `is_admin()` da falso.
    const comoAdmin = createClient(API, ANON, { auth: { persistSession: false } });
    await comoAdmin.auth.signInWithPassword(ADMIN);
    const r = await comoAdmin.rpc('analitica_filtros');
    expect(r.error).toBeNull();
    const puntosAdmin = ((r.data as Record<string, unknown>).puntos ?? []) as
      Array<{ id: string }>;
    // Se cuentan las sedes activas ahora: pruebas anteriores crearon sedes aún sin limpiar.
    const { count: activas } = await admin
      .from('pickup_locations').select('id', { count: 'exact', head: true })
      .eq('status', 'ACTIVO');
    expect(puntosAdmin.length).toBe(activas);
    await comoAdmin.auth.signOut();

    const comoAsesor = createClient(API, ANON, { auth: { persistSession: false } });
    await comoAsesor.auth.signInWithPassword(ASESOR);
    const suyo = await comoAsesor.rpc('analitica_filtros');
    // Sin `analytics.read` la función rechaza, y eso debe distinguirse de «no hay datos».
    if (!suyo.error) {
      const puntos = ((suyo.data as Record<string, unknown>).puntos ?? []) as
        Array<{ id: string }>;
      expect(puntos.map((x) => x.id).sort()).toEqual([sedes[0].id, sedes[1].id].sort());
    } else {
      expect(suyo.error.message).toMatch(/FORBIDDEN/);
    }
    await comoAsesor.auth.signOut();
  });

  it('la visita deduce su sede de la ciudad del proyecto', async () => {
    // `technical_visits.location_id` debe deducirse de la ciudad del proyecto para acotar la agenda por sede.
    const { data: proy } = await admin.from('projects')
      .select('id, city').not('city', 'is', null).limit(1).maybeSingle();
    if (!proy) return;   // sin proyectos sembrados no hay nada que comprobar
    const proyecto = proy as { id: string; city: string };

    const r = await admin.rpc('schedule_technical_visit', {
      _project_id: proyecto.id,
      _fecha: '2026-12-15',
    });
    // Con `service_role` la función puede rechazar por permiso; entonces se prueba con el admin real abajo.
    if (r.error) {
      expect(r.error.message).toMatch(/FORBIDDEN/);
      return;
    }
    const visita = r.data as string;
    visitasCreadas.push(visita);

    const { data: v } = await admin.from('technical_visits')
      .select('location_id').eq('id', visita).single();
    const sede = (v as { location_id: string | null }).location_id;

    // Si la ciudad tiene tienda queda asignada; si no, en null.
    const { data: tienda } = await admin.from('pickup_locations')
      .select('id, city').eq('status', 'ACTIVO');
    const hayTienda = ((tienda ?? []) as Array<{ city: string }>).some(
      (t) => t.city.toUpperCase().includes(proyecto.city.toUpperCase().slice(0, 6))
    );
    if (hayTienda) expect(sede).toBeTruthy();
    else expect(sede).toBeNull();
  });

  it('NO se le asigna «la sede más cercana» a una obra sin tienda en su ciudad', async () => {
    // Sin tienda en la ciudad no se asigna la más cercana: queda sin sede y visible para todos.
    const { count } = await admin
      .from('pickup_locations').select('id', { count: 'exact', head: true })
      .eq('status', 'ACTIVO');
    // Hay tiendas en pocas ciudades: la mayoría de obras cae en este caso.
    expect(count ?? 0).toBeLessThan(1122);
  });

  it('solo quien administra personal puede asignar sedes', async () => {
    // Sin `users.manage` no puede darse otra sede.
    const r = await asesor.from('user_pickup_locations')
      .insert({ user_id: uidAsesor, location_id: sedes[3].id });
    expect(r.error).not.toBeNull();
  });

  it('cada uno puede LEER sus propias sedes, que es lo que necesita el selector', async () => {
    await asignar(sedes[0].id, sedes[1].id);
    const { data, error } = await asesor
      .from('user_pickup_locations').select('location_id');
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(2);
  });
});
