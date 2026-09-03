import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { crearPedidoDePrueba, borrarPedidoDePrueba } from './limpieza';

/**
 * Campana de mensajes sin leer.
 *
 * LA REGLA que se vigila: el aviso se quita al ABRIR la conversación, y solo
 * entonces. Ni al recibir el mensaje, ni al desplegar la campana. Si bastara
 * con desplegarla, un mensaje visto de reojo desaparecería sin que nadie lo
 * hubiera atendido, que es exactamente lo que hace inútil un contador.
 *
 * Lo demás que se comprueba, y que son las formas de que el número mienta:
 *   · Escribir no te avisa a ti mismo.
 *   · Los EVENTOS de trazabilidad no cuentan: los escribe la base y no
 *     esperan respuesta.
 *   · El cliente no cuenta —ni ve— las notas internas del equipo.
 *   · Nadie ve los mensajes sin leer de otro.
 *   · Marcar leído no puede alcanzar a la conversación de otro.
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
const OTRO = { email: 'ana.torres@edificarplus.com', password: 'pintuco2025*' };

interface Fila {
  order_id: string; order_number: string; sin_leer: number;
  ultimo: string; ultima_fecha: string;
}

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

describe.skipIf(!disponible || !SERVICE)('Campana de mensajes', () => {
  let root: SupabaseClient;
  let admin: SupabaseClient;
  let cliente: SupabaseClient;
  let otro: SupabaseClient;

  let pedidoId = '';
  let numeroPedido = '';
  const sello = Date.now().toString().slice(-6);
  const creados: string[] = [];

  /** Los mensajes del pedido, tal cual estaban antes de tocar nada. */
  const estadoPrevio = new Map<string, string | null>();

  beforeAll(async () => {
    root = createClient(API, SERVICE, { auth: { persistSession: false } });

    admin = createClient(API, ANON, { auth: { persistSession: false } });
    const a = await admin.auth.signInWithPassword(ADMIN);
    if (a.error) throw new Error(`admin: ${a.error.message}`);

    cliente = createClient(API, ANON, { auth: { persistSession: false } });
    const c = await cliente.auth.signInWithPassword(CLIENTE);
    if (c.error) throw new Error(`cliente: ${c.error.message}`);

    otro = createClient(API, ANON, { auth: { persistSession: false } });
    const o = await otro.auth.signInWithPassword(OTRO);
    if (o.error) throw new Error(`otro: ${o.error.message}`);

    // Lo crea la prueba: depender de un pedido sembrado la dejaba rota en
    // cuanto se limpiaba la base.
    const suyo = await crearPedidoDePrueba(root, c.data.user?.id as string, { sello });
    pedidoId = suyo.id;
    numeroPedido = suyo.numero;

    const { data: previos } = await root
      .from('conversation_messages').select('id, read_at').eq('order_id', pedidoId);
    for (const m of (previos ?? []) as Array<{ id: string; read_at: string | null }>) {
      estadoPrevio.set(m.id, m.read_at);
    }
  });

  afterAll(async () => {
    // El pedido es de la prueba, así que se va entero con sus mensajes. Ya no
    // hace falta restituir `read_at` de nada ajeno: no se toca nada ajeno.
    await borrarPedidoDePrueba(root, pedidoId);
    await admin.auth.signOut();
    await cliente.auth.signOut();
    await otro.auth.signOut();
  });

  /** Escribe como el equipo y anota el id para poder limpiarlo. */
  const equipoEscribe = async (texto: string, interno = false) => {
    const { error } = await admin.rpc('post_message', {
      _order_id: pedidoId, _project_id: null, _body: texto, _internal: interno,
    });
    expect(error).toBeNull();
    const { data } = await root
      .from('conversation_messages').select('id')
      .eq('order_id', pedidoId).order('created_at', { ascending: false }).limit(1).single();
    const id = (data as { id: string }).id;
    creados.push(id);
    return id;
  };

  const sinLeerDe = async (quien: SupabaseClient): Promise<Fila[]> => {
    const { data, error } = await quien.rpc('mensajes_sin_leer');
    expect(error).toBeNull();
    return (data ?? []) as Fila[];
  };

  const delPedido = (filas: Fila[]) => filas.find((f) => f.order_id === pedidoId);

  it('parte de cero: lo anterior se dio por entregado', async () => {
    // La migración 20260902100029 saldó el histórico. Si esto falla, la
    // campana nacería con decenas de avisos que nadie va a atender.
    const filas = await sinLeerDe(cliente);
    expect(delPedido(filas)).toBeUndefined();
  });

  it('cuando el equipo escribe, al cliente le sube el contador', async () => {
    await equipoEscribe(`Tu pedido va en camino ${sello}`);
    const fila = delPedido(await sinLeerDe(cliente));
    expect(fila).toBeTruthy();
    expect(fila!.sin_leer).toBe(1);
    expect(fila!.ultimo).toContain(sello);
    // El número es el del pedido que creó la prueba, no uno sembrado.
    expect(fila!.order_number).toBe(numeroPedido);
  });

  it('CONSULTAR la campana no baja el contador', async () => {
    // Es la mitad que importa de la regla: mirar no es leer.
    const antes = delPedido(await sinLeerDe(cliente));
    const despues = delPedido(await sinLeerDe(cliente));
    expect(despues?.sin_leer).toBe(antes?.sin_leer);
    expect(despues?.sin_leer).toBe(1);
  });

  it('dos mensajes más suman, no reemplazan', async () => {
    await equipoEscribe(`Segundo ${sello}`);
    await equipoEscribe(`Tercero ${sello}`);
    expect(delPedido(await sinLeerDe(cliente))?.sin_leer).toBe(3);
  });

  it('ABRIR la conversación es lo que lo baja a cero', async () => {
    const { data, error } = await cliente.rpc('marcar_conversacion_leida', {
      _order_id: pedidoId,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(3);

    expect(delPedido(await sinLeerDe(cliente))).toBeUndefined();
  });

  it('escribir no te avisa a ti mismo', async () => {
    const { error } = await cliente.rpc('post_message', {
      _order_id: pedidoId, _project_id: null, _body: `Pregunta mía ${sello}`, _internal: false,
    });
    expect(error).toBeNull();
    const { data } = await root
      .from('conversation_messages').select('id')
      .eq('order_id', pedidoId).order('created_at', { ascending: false }).limit(1).single();
    creados.push((data as { id: string }).id);

    expect(delPedido(await sinLeerDe(cliente))).toBeUndefined();
    // Pero al equipo sí le llega.
    expect(delPedido(await sinLeerDe(admin))?.sin_leer).toBe(1);
  });

  it('el cliente no cuenta las notas internas del equipo', async () => {
    await equipoEscribe(`Nota interna ${sello}`, true);
    // Para el cliente no existe.
    expect(delPedido(await sinLeerDe(cliente))).toBeUndefined();
    // Para el equipo, sí.
    expect(delPedido(await sinLeerDe(admin))?.sin_leer).toBeGreaterThanOrEqual(1);
  });

  it('un evento de trazabilidad no genera aviso', async () => {
    // Los escribe la base al cambiar de estado y no esperan respuesta: si
    // contaran, cada pedido acumularía avisos por sí solo.
    const { data } = await root.from('conversation_messages').insert({
      order_id: pedidoId, kind: 'EVENTO', body: `Estado actualizado ${sello}`,
    }).select('id').single();
    creados.push((data as { id: string }).id);

    expect(delPedido(await sinLeerDe(cliente))).toBeUndefined();
  });

  it('nadie ve los mensajes sin leer de otro', async () => {
    await equipoEscribe(`Solo para carlos ${sello}`);
    const filas = await sinLeerDe(otro);
    expect(filas.find((f) => f.order_id === pedidoId)).toBeUndefined();
  });

  it('no se puede marcar leída la conversación de otro', async () => {
    const { error } = await otro.rpc('marcar_conversacion_leida', { _order_id: pedidoId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/FORBIDDEN/);

    // Y el aviso del dueño sigue en pie.
    expect(delPedido(await sinLeerDe(cliente))?.sin_leer).toBe(1);
  });

  it('un compañero abriendo el hilo NO marca leídos los mensajes del equipo', async () => {
    // El fallo que esto cierra: `read_at` lo marcaba quien abriera el hilo, sin
    // mirar de qué lado estaba. Si un asesor abría la conversación, los
    // mensajes escritos por OTRO compañero quedaban con dos chulitos y el
    // portal decía «leído por el cliente» cuando el cliente no lo había visto.
    // Un acuse que miente es peor que no tener acuse.
    const texto = `Mensaje del equipo sin leer ${sello}`;
    const id = await equipoEscribe(texto);

    // Otro miembro del personal abre la conversación.
    const asesor = createClient(API, ANON, { auth: { persistSession: false } });
    const a = await asesor.auth.signInWithPassword({
      email: 'asesor@pintuco.demo', password: 'pintuco2025*',
    });
    expect(a.error).toBeNull();
    const { error } = await asesor.rpc('marcar_conversacion_leida', { _order_id: pedidoId });
    expect(error).toBeNull();
    await asesor.auth.signOut();

    // El mensaje del equipo sigue SIN leer: el cliente no lo ha abierto.
    const { data } = await root
      .from('conversation_messages').select('read_at').eq('id', id).single();
    expect((data as { read_at: string | null }).read_at).toBeNull();
  });

  it('cuando el CLIENTE abre, el mensaje del equipo sí queda leído', async () => {
    // La otra mitad: el acuse tiene que llegar a dos chulitos cuando de verdad
    // corresponde, o no serviría de nada.
    const { data: antes } = await root
      .from('conversation_messages').select('id, read_at')
      .eq('order_id', pedidoId).is('read_at', null);
    expect((antes ?? []).length).toBeGreaterThan(0);

    await cliente.rpc('marcar_conversacion_leida', { _order_id: pedidoId });

    const { data } = await root
      .from('conversation_messages').select('id, read_at, kind')
      .eq('order_id', pedidoId).is('read_at', null);
    // Lo único que puede quedar sin marcar son las notas internas —que al
    // cliente no le llegan— y los EVENTO de trazabilidad, que no son mensajes
    // de nadie y por eso se excluyen a propósito de la cuenta.
    for (const m of (data ?? []) as Array<{ kind: string }>) {
      expect(['NOTA_INTERNA', 'EVENTO'], `quedó sin leer un ${m.kind}`)
        .toContain(m.kind);
    }
  });

  it('sin sesión no devuelve nada', async () => {
    const visitante = createClient(API, ANON, { auth: { persistSession: false } });
    const { data, error } = await visitante.rpc('mensajes_sin_leer');
    expect(error ? [] : (data ?? [])).toHaveLength(0);
  });
});
