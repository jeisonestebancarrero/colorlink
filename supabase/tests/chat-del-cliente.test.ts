import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { crearPedidoDePrueba, borrarPedidoDePrueba } from './limpieza';

/**
 * Chat del pedido desde el cliente: lee y responde al equipo, no ve notas internas
 * ni puede crearlas, y no accede al pedido de otro.
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

describe.skipIf(!disponible || !SERVICE)('Chat del pedido, lado del cliente', () => {
  let root: SupabaseClient;
  let admin: SupabaseClient;
  let cliente: SupabaseClient;
  let otro: SupabaseClient;

  let pedidoId = '';
  let idCliente = '';
  const sello = Date.now().toString().slice(-6);
  const creados: string[] = [];
  /** Inicio de la corrida, para borrar solo lo suyo. */
  const arranque = new Date().toISOString();
  /** Pedidos extra creados por las pruebas, para retirarlos. */
  const creadosExtra: string[] = [];

  beforeAll(async () => {
    root = createClient(API, SERVICE, { auth: { persistSession: false } });

    admin = createClient(API, ANON, { auth: { persistSession: false } });
    const a = await admin.auth.signInWithPassword(ADMIN);
    if (a.error) throw new Error(`admin: ${a.error.message}`);

    cliente = createClient(API, ANON, { auth: { persistSession: false } });
    const c = await cliente.auth.signInWithPassword(CLIENTE);
    if (c.error) throw new Error(`cliente: ${c.error.message}`);
    idCliente = c.data.user?.id as string;

    otro = createClient(API, ANON, { auth: { persistSession: false } });
    const o = await otro.auth.signInWithPassword(OTRO);
    if (o.error) throw new Error(`otro: ${o.error.message}`);

    // El pedido lo crea la prueba para no depender de datos sembrados.
    const { data: emp } = await root
      .from('profiles').select('company_id').eq('id', idCliente).single();
    const suPedido = await crearPedidoDePrueba(root, idCliente, {
      companyId: (emp as { company_id: string | null })?.company_id ?? null,
      sello: sello,
    });
    pedidoId = suPedido.id;
  });

  afterAll(async () => {
    // Se borra todo lo creado desde `arranque`: cerrar y reabrir generan eventos que
    // ninguna lista recoge y desajustaban la prueba de la campana.
    await root.from('conversation_messages')
      .delete().eq('order_id', pedidoId).gte('created_at', arranque);
    // La conversación vuelve a pendiente y el pedido de prueba se borra con lo suyo.
    await borrarPedidoDePrueba(root, pedidoId);
    for (const id of creadosExtra) await borrarPedidoDePrueba(root, id);
    await admin.auth.signOut();
    await cliente.auth.signOut();
    await otro.auth.signOut();
  });

  /** Anota el id del último mensaje para borrarlo al final. */
  const anotarUltimo = async () => {
    const { data } = await root
      .from('conversation_messages').select('id')
      .eq('order_id', pedidoId).order('created_at', { ascending: false }).limit(1).single();
    const id = (data as { id: string })?.id;
    if (id) creados.push(id);
    return id;
  };

  it('el cliente lee el mensaje que le escribe el equipo', async () => {
    const texto = `Tu pedido sale mañana ${sello}`;
    const { error } = await admin.rpc('post_message', {
      _order_id: pedidoId, _project_id: null, _body: texto, _internal: false,
    });
    expect(error).toBeNull();
    await anotarUltimo();

    const { data } = await cliente
      .from('conversation_messages').select('body').eq('order_id', pedidoId);
    expect((data ?? []).map((m: { body: string }) => m.body)).toContain(texto);
  });

  it('el cliente puede responder y el equipo lo ve', async () => {
    const texto = `¿Pueden dejarlo en portería? ${sello}`;
    const { error } = await cliente.rpc('post_message', {
      _order_id: pedidoId, _project_id: null, _body: texto, _internal: false,
    });
    expect(error).toBeNull();
    await anotarUltimo();

    const { data } = await admin
      .from('conversation_messages').select('body, author_id').eq('order_id', pedidoId);
    const mio = (data ?? []).find((m: { body: string }) => m.body === texto);
    expect(mio).toBeTruthy();
    expect((mio as { author_id: string }).author_id).toBe(idCliente);
  });

  it('el cliente NO ve las notas internas del equipo', async () => {
    const secreto = `NOTA INTERNA no mostrar ${sello}`;
    const { error } = await admin.rpc('post_message', {
      _order_id: pedidoId, _project_id: null, _body: secreto, _internal: true,
    });
    expect(error).toBeNull();
    await anotarUltimo();

    // El equipo la ve.
    const { data: paraElEquipo } = await admin
      .from('conversation_messages').select('body').eq('order_id', pedidoId);
    expect((paraElEquipo ?? []).map((m: { body: string }) => m.body)).toContain(secreto);

    // El cliente no la recibe: el filtro está en la base, no en la pantalla.
    const { data: paraElCliente } = await cliente
      .from('conversation_messages').select('body').eq('order_id', pedidoId);
    expect((paraElCliente ?? []).map((m: { body: string }) => m.body)).not.toContain(secreto);
  });

  it('si el cliente pide nota interna, se guarda como mensaje normal', async () => {
    // No se rechaza: se degrada a mensaje normal para no perder el texto.
    const texto = `Intento de nota interna ${sello}`;
    const { error } = await cliente.rpc('post_message', {
      _order_id: pedidoId, _project_id: null, _body: texto, _internal: true,
    });
    expect(error).toBeNull();
    const id = await anotarUltimo();

    const { data } = await root
      .from('conversation_messages').select('kind').eq('id', id).single();
    expect((data as { kind: string }).kind).toBe('MENSAJE');
  });

  it('un cliente no ve la conversación de un pedido ajeno', async () => {
    const { data } = await otro
      .from('conversation_messages').select('id').eq('order_id', pedidoId);
    expect(data ?? []).toHaveLength(0);
  });

  it('un cliente no puede escribir en un pedido ajeno', async () => {
    const { error } = await otro.rpc('post_message', {
      _order_id: pedidoId, _project_id: null, _body: 'no debería entrar', _internal: false,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/FORBIDDEN/);
  });

  it('dar por atendida NO deja mudo a un cliente con el pedido en curso', async () => {
    // Regla de negocio: mientras el pedido esté vivo el cliente siempre puede escribir.
    const { data, error } = await admin.rpc('cerrar_conversacion', { _order_id: pedidoId });
    expect(error).toBeNull();
    expect((data as { se_puede_seguir: boolean }).se_puede_seguir).toBe(true);

    const sigueEscribiendo = await cliente.rpc('post_message', {
      _order_id: pedidoId, _project_id: null, _body: `sigo por el pedido ${sello}`, _internal: false,
    });
    expect(sigueEscribiendo.error).toBeNull();
    await anotarUltimo();
  });

  it('escribir vuelve a marcar la conversación como pendiente', async () => {
    // Si el cliente escribe, la conversación deja de estar atendida para no esconder un hilo vivo.
    const est = await cliente.rpc('estado_conversacion', { _order_id: pedidoId });
    expect((est.data as { atendida: boolean }).atendida).toBe(false);
  });

  it('un ajeno no puede dar por atendida la conversación de otro', async () => {
    const { error } = await otro.rpc('cerrar_conversacion', { _order_id: pedidoId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/FORBIDDEN/);
  });

  it('cuando el PEDIDO termina, nadie puede escribir', async () => {
    // Solo un hecho del negocio (el pedido terminado) cierra la conversación.
    const terminado = await crearPedidoDePrueba(root, idCliente, {
      estado: 'ENTREGADO', sello: `fin-${sello}`,
    });
    creadosExtra.push(terminado.id);

    const est = await admin.rpc('estado_conversacion', { _order_id: terminado.id });
    expect((est.data as { se_puede_escribir: boolean }).se_puede_escribir).toBe(false);

    const r = await admin.rpc('post_message', {
      _order_id: terminado.id, _project_id: null, _body: 'no debería entrar', _internal: false,
    });
    expect(r.error?.message).toMatch(/PEDIDO_CERRADO/);
  });

  it('dar por atendida deja constancia y no borra nada', async () => {
    const antes = await root
      .from('conversation_messages').select('id', { count: 'exact', head: true })
      .eq('order_id', pedidoId);

    await admin.rpc('cerrar_conversacion', { _order_id: pedidoId });

    const despues = await root
      .from('conversation_messages').select('id, kind, body', { count: 'exact' })
      .eq('order_id', pedidoId).order('created_at', { ascending: false }).limit(1);

    // Un mensaje más (el evento): el historial se conserva.
    expect((despues.count ?? 0)).toBe((antes.count ?? 0) + 1);
    const ultimo = (despues.data ?? [])[0] as { kind: string; body: string };
    expect(ultimo.kind).toBe('EVENTO');
    expect(ultimo.body).toMatch(/atendida/i);
  });

  it('un mensaje vacío se rechaza', async () => {
    const { error } = await cliente.rpc('post_message', {
      _order_id: pedidoId, _project_id: null, _body: '   ', _internal: false,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/VALIDATION/);
  });
});
