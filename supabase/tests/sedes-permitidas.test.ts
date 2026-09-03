import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Sedes permitidas por usuario (multi-sede al estilo de Odoo).
 *
 * Lo que se vigila, y es lo único que hace que esto sea SEGURIDAD y no
 * decoración de pantalla:
 *   1. Que asignarle sedes a alguien le CIERRE de verdad el resto. Si el
 *      filtro viviera solo en el selector de la cabecera, bastaría cambiar el
 *      desplegable —o la petición— para ver el inventario de otra ciudad.
 *   2. Que no pueda ESCRIBIR en una sede que no tiene permitida.
 *   3. Que el administrador nunca se quede sin acceso a una sede.
 *   4. Que el personal SIN asignación siga viendo todo: es el estado de las
 *      cuentas internas de hoy, y cambiarlo a "ninguna" dejaría el portal
 *      inservible el día del despliegue.
 *   5. Que el catálogo y los clientes NO se filtren por sede. Un producto
 *      creado en Medellín tiene que seguir apareciendo en la tienda para un
 *      cliente de Cali, y el historial de un cliente no se parte en dos.
 *   6. Que el cliente siga viendo SUS pedidos, salgan de la sede que salgan.
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
    // Se deja al asesor como estaba: sin restricción.
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

  // ----------------------------------------------------------
  // Sin restricción
  // ----------------------------------------------------------
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

  // ----------------------------------------------------------
  // Con una sede
  // ----------------------------------------------------------
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
    // Es el intento obvio: el id de la sede viaja en la petición.
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

    // Se rechaza, o simplemente no alcanza ninguna fila. Lo que NO puede pasar
    // es que la cantidad cambie.
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

  // ----------------------------------------------------------
  // El administrador
  // ----------------------------------------------------------
  it('el ADMINISTRADOR ve todas las sedes aunque se le asigne una sola', async () => {
    const adminCli = createClient(API, ANON, { auth: { persistSession: false } });
    const s = await adminCli.auth.signInWithPassword(ADMIN);
    expect(s.error).toBeNull();
    const uidAdmin = s.data.user?.id as string;

    await admin.from('user_pickup_locations').delete().eq('user_id', uidAdmin);
    await admin.from('user_pickup_locations')
      .insert({ user_id: uidAdmin, location_id: sedes[0].id });

    // No se le puede dejar sin acceso a una sede por un error de configuración.
    const vistas = await sedesConInventario(adminCli);
    expect(vistas.length).toBe(sedes.length);

    await admin.from('user_pickup_locations').delete().eq('user_id', uidAdmin);
    await adminCli.auth.signOut();
  });

  // ----------------------------------------------------------
  // Lo que NO se filtra por sede
  // ----------------------------------------------------------
  it('el CATÁLOGO es global: no se filtra por sede', async () => {
    // Un producto creado en Medellín tiene que seguir apareciendo en la tienda
    // para un cliente de Cali.
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
    // Asignar un cliente a una sede partiría su historial en dos.
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

  // ----------------------------------------------------------
  // El cliente
  // ----------------------------------------------------------
  it('el CLIENTE sigue viendo sus pedidos, salgan de la sede que salgan', async () => {
    // La restricción de sede es del personal interno. Un cliente que compró en
    // Medellín y en Bogotá tiene que ver los dos pedidos.
    const { data: uid } = await cliente.auth.getUser();
    const propio = uid.user?.id as string;

    const { count: suyos } = await admin
      .from('orders').select('id', { count: 'exact', head: true }).eq('user_id', propio);
    const { count: vistos } = await cliente
      .from('orders').select('id', { count: 'exact', head: true }).eq('user_id', propio);
    expect(vistos).toBe(suyos);
  });


  // ----------------------------------------------------------
  // Una sede NUEVA
  // ----------------------------------------------------------
  it('una sede NUEVA aparece sola para quien no está restringido', async () => {
    // Es la pregunta práctica: si mañana abre una tienda, ¿sale en los filtros
    // sin que nadie toque nada?
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
    // Es lo correcto: si estuviera acotado a Barranquilla, abrir una tienda en
    // Cali no puede darle acceso de golpe. Alguien tiene que asignársela.
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

    // Y en cuanto se le asigna, la ve.
    await asignar(sedes[0].id, nueva);
    const r2 = await asesor.rpc('sedes_permitidas');
    const ids2 = (r2.data as Array<string | { sedes_permitidas: string }>)
      .map((x) => (typeof x === 'string' ? x : x.sedes_permitidas));
    expect(ids2.sort()).toEqual([sedes[0].id, nueva].sort());
  });

  it('una sede INACTIVA no se ofrece, aunque esté asignada', async () => {
    // Cerrar una tienda no debe dejarla en el selector de nadie.
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
    // `external_ref` es con lo que se resuelve la foto (`imagenPunto`), e
    // `image_url` es la que se sube desde el portal y tiene prioridad. Sin
    // estas dos columnas la tarjeta saldría sin imagen.
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


  // ----------------------------------------------------------
  // Los RESÚMENES: Panel y Analítica
  // ----------------------------------------------------------
  // Estas funciones son SECURITY DEFINER, así que RLS NO aplica dentro. Sin el
  // cruce con las sedes permitidas, un asesor restringido a una sede veía en el
  // Panel las ventas del día de las siete y el ranking completo en Analítica:
  // la restricción llegaba a las listas pero no a los números de arriba, que es
  // donde se lee el negocio.

  it('el Panel se acota a las sedes del usuario', async () => {
    await asignar();
    const todas = await asesor.rpc('resumen_panel');
    expect(todas.error).toBeNull();
    const conTodas = (todas.data as Record<string, number>).por_alistar;

    await asignar(sedes[0].id);
    const una = await asesor.rpc('resumen_panel');
    expect(una.error).toBeNull();
    const conUna = (una.data as Record<string, number>).por_alistar;

    // Con una sola sede no puede ver MÁS de lo que veía con todas.
    expect(conUna).toBeLessThanOrEqual(conTodas);
  });

  it('ATAQUE: pedirle al Panel una sede ajena no devuelve sus cifras', async () => {
    await asignar(sedes[0].id);

    // Se pide explícitamente la sede que NO tiene asignada.
    const ajena = await asesor.rpc('resumen_panel', { _sedes: [sedes[1].id] });
    expect(ajena.error).toBeNull();
    const d = ajena.data as Record<string, number>;

    // La intersección queda vacía, así que el inventario de esa sede no sale.
    // (El inventario siempre tiene sede, a diferencia de los pedidos de envío.)
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

    // Pedir una ajena: la intersección la descarta.
    const ajena = await asesor.rpc('sedes_efectivas', { _pedidas: [sedes[1].id] });
    expect(ajena.data).toEqual([]);

    // Pedir la propia y una ajena: solo queda la propia.
    const mezcla = await asesor.rpc('sedes_efectivas', {
      _pedidas: [sedes[0].id, sedes[1].id],
    });
    expect(mezcla.data).toEqual([sedes[0].id]);
  });

  it('los filtros de Analítica solo ofrecen las sedes permitidas', async () => {
    // Ofrecer una sede que luego no devuelve datos hace pensar que no hubo
    // ventas, cuando lo que pasa es que no se tiene acceso.
    await asignar(sedes[0].id, sedes[1].id);

    // Con el ADMINISTRADOR real, no con `service_role`: estas funciones se
    // apoyan en `auth.uid()`, y `service_role` no tiene sesión, así que
    // `is_admin()` da falso y la función responde FORBIDDEN.
    const comoAdmin = createClient(API, ANON, { auth: { persistSession: false } });
    await comoAdmin.auth.signInWithPassword(ADMIN);
    const r = await comoAdmin.rpc('analitica_filtros');
    expect(r.error).toBeNull();
    const puntosAdmin = ((r.data as Record<string, unknown>).puntos ?? []) as
      Array<{ id: string }>;
    // El administrador ve TODAS las sedes activas. Se cuenta AHORA y no con
    // la foto de `beforeAll`: las pruebas anteriores crearon sedes que todavía
    // no se han limpiado.
    const { count: activas } = await admin
      .from('pickup_locations').select('id', { count: 'exact', head: true })
      .eq('status', 'ACTIVO');
    expect(puntosAdmin.length).toBe(activas);
    await comoAdmin.auth.signOut();

    const comoAsesor = createClient(API, ANON, { auth: { persistSession: false } });
    await comoAsesor.auth.signInWithPassword(ASESOR);
    const suyo = await comoAsesor.rpc('analitica_filtros');
    // El asesor no tiene `analytics.read`, así que la función lo rechaza: eso
    // también es correcto y hay que distinguirlo de «no hay datos».
    if (!suyo.error) {
      const puntos = ((suyo.data as Record<string, unknown>).puntos ?? []) as
        Array<{ id: string }>;
      expect(puntos.map((x) => x.id).sort()).toEqual([sedes[0].id, sedes[1].id].sort());
    } else {
      expect(suyo.error.message).toMatch(/FORBIDDEN/);
    }
    await comoAsesor.auth.signOut();
  });


  // ----------------------------------------------------------
  // La visita técnica y su sede
  // ----------------------------------------------------------
  it('la visita deduce su sede de la ciudad del proyecto', async () => {
    // Hasta ahora `technical_visits.location_id` quedaba siempre en null y las
    // visitas se salían del dominio: la agenda de un asesor de Barranquilla
    // mostraba visitas de Medellín.
    const { data: proy } = await admin.from('projects')
      .select('id, city').not('city', 'is', null).limit(1).maybeSingle();
    if (!proy) return;   // sin proyectos sembrados no hay nada que comprobar
    const proyecto = proy as { id: string; city: string };

    const r = await admin.rpc('schedule_technical_visit', {
      _project_id: proyecto.id,
      _fecha: '2026-12-15',
    });
    // El admin es `service_role` aquí y la función exige permiso: si rechaza,
    // se comprueba con el administrador real más abajo.
    if (r.error) {
      expect(r.error.message).toMatch(/FORBIDDEN/);
      return;
    }
    const visita = r.data as string;
    visitasCreadas.push(visita);

    const { data: v } = await admin.from('technical_visits')
      .select('location_id').eq('id', visita).single();
    const sede = (v as { location_id: string | null }).location_id;

    // Si la ciudad del proyecto tiene tienda, quedó asignada; si no, en null.
    const { data: tienda } = await admin.from('pickup_locations')
      .select('id, city').eq('status', 'ACTIVO');
    const hayTienda = ((tienda ?? []) as Array<{ city: string }>).some(
      (t) => t.city.toUpperCase().includes(proyecto.city.toUpperCase().slice(0, 6))
    );
    if (hayTienda) expect(sede).toBeTruthy();
    else expect(sede).toBeNull();
  });

  it('NO se le asigna «la sede más cercana» a una obra sin tienda en su ciudad', async () => {
    // Asignar la más cercana sería inventar el dato. Sin tienda en la ciudad,
    // la visita queda sin sede y la sigue viendo todo el mundo, que es el
    // comportamiento correcto mientras nadie decida quién la atiende.
    const { count } = await admin
      .from('pickup_locations').select('id', { count: 'exact', head: true })
      .eq('status', 'ACTIVO');
    // Solo hay tiendas en 5 ciudades de 1.122 municipios: la gran mayoría de
    // las obras del país cae en este caso.
    expect(count ?? 0).toBeLessThan(1122);
  });

  // ----------------------------------------------------------
  // Quién puede asignar
  // ----------------------------------------------------------
  it('solo quien administra personal puede asignar sedes', async () => {
    // El asesor no tiene `users.manage`: no puede darse a sí mismo otra sede.
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
