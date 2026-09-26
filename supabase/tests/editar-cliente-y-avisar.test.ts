import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Editar un cliente desde el portal: el cambio y el aviso van juntos (sin aviso si
 * nada cambió), el aviso muestra el valor ya normalizado, el cliente lo ve con su
 * sesión, y no se puede editar sin permiso ni a un empleado.
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

describe.skipIf(!disponible || !SERVICE)('Editar un cliente y avisarle', () => {
  let admin: SupabaseClient;
  let asesor: SupabaseClient;
  let cliente: SupabaseClient;
  let root: SupabaseClient;

  let idCliente = '';
  let idEmpresa = '';
  /** Perfil original, para restaurarlo. */
  let perfilOriginal: Record<string, unknown> = {};
  let empresaOriginal: Record<string, unknown> = {};
  const avisosCreados: string[] = [];

  /** Sello para que cada corrida escriba valores distintos. */
  const sello = Date.now().toString().slice(-6);

  beforeAll(async () => {
    root = createClient(API, SERVICE, { auth: { persistSession: false } });

    admin = createClient(API, ANON, { auth: { persistSession: false } });
    const a = await admin.auth.signInWithPassword(ADMIN);
    if (a.error) throw new Error(`admin: ${a.error.message}`);

    asesor = createClient(API, ANON, { auth: { persistSession: false } });
    const s = await asesor.auth.signInWithPassword(ASESOR);
    if (s.error) throw new Error(`asesor: ${s.error.message}`);

    cliente = createClient(API, ANON, { auth: { persistSession: false } });
    const c = await cliente.auth.signInWithPassword(CLIENTE);
    if (c.error) throw new Error(`cliente: ${c.error.message}`);
    idCliente = c.data.user?.id as string;

    const { data: p } = await root
      .from('profiles')
      .select('first_name, last_name, phone, address, city, document_type, document_number, company_id')
      .eq('id', idCliente).single();
    perfilOriginal = p as Record<string, unknown>;
    idEmpresa = String(perfilOriginal.company_id);

    const { data: e } = await root
      .from('companies').select('name, legal_name, nit, phone, email, address, city')
      .eq('id', idEmpresa).single();
    empresaOriginal = e as Record<string, unknown>;
  });

  afterAll(async () => {
    // Se restaura: son datos de demostración que usan otras pruebas y las pantallas.
    const { company_id: _omitido, ...perfil } = perfilOriginal;
    await root.from('profiles').update(perfil).eq('id', idCliente);
    await root.from('companies').update(empresaOriginal).eq('id', idEmpresa);
    for (const id of avisosCreados) {
      await root.from('notifications').delete().eq('id', id);
    }
    await admin.auth.signOut();
    await asesor.auth.signOut();
    await cliente.auth.signOut();
  });

  /** El aviso más reciente del cliente, leído sin RLS. */
  const ultimoAviso = async () => {
    const { data } = await root
      .from('notifications')
      .select('id, title, message, created_at')
      .eq('user_id', idCliente)
      .order('created_at', { ascending: false })
      .limit(1).single();
    const n = data as { id: string; title: string; message: string };
    if (n?.id) avisosCreados.push(n.id);
    return n;
  };

  it('el administrador corrige el teléfono y el cliente recibe el aviso', async () => {
    const nuevo = `30012${sello.slice(-5)}`;
    const { data, error } = await admin.rpc('actualizar_cliente_persona', {
      _user_id: idCliente,
      _datos: { phone: nuevo },
    });
    expect(error).toBeNull();

    const r = data as { cambios: number; aviso: boolean; detalle: string[] };
    expect(r.cambios).toBe(1);
    expect(r.aviso).toBe(true);

    const aviso = await ultimoAviso();
    expect(aviso.title).toMatch(/actualizamos tus datos/i);
    expect(aviso.message).toMatch(/Teléfono/);
  });

  it('el aviso dice la fecha, la hora y QUIÉN lo hizo', async () => {
    const aviso = await ultimoAviso();
    // Fecha en formato colombiano y hora con AM/PM.
    expect(aviso.message).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(aviso.message).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
    // El nombre de quien editó, no «el sistema».
    expect(aviso.message.toUpperCase()).toMatch(/ADMIN/);
  });

  it('el aviso muestra el valor GUARDADO, no el que se envió', async () => {
    // Se envía sin indicativo y en minúsculas; el aviso debe reflejar lo que guardaron los disparadores.
    const { data } = await admin.rpc('actualizar_cliente_persona', {
      _user_id: idCliente,
      _datos: { address: `calle ${sello} # 20 - 30 sur` },
    });
    const r = data as { detalle: string[] };
    const linea = r.detalle.find((d) => d.startsWith('Dirección')) ?? '';

    const { data: p } = await root
      .from('profiles').select('address').eq('id', idCliente).single();
    const guardada = (p as { address: string }).address;

    expect(guardada).toBe(guardada.toUpperCase()); // el disparador la subió
    expect(linea).toContain(guardada);
    expect(linea).not.toContain('calle'); // no repite lo enviado en minúscula

    const aviso = await ultimoAviso();
    expect(aviso.message).toContain(guardada);
  });

  it('el cliente ve el dato nuevo DONDE ÉL ENTRA', async () => {
    // Se relee con la sesión del cliente, como hace la tienda.
    const { data } = await cliente
      .from('profiles').select('address, phone').eq('id', idCliente).single();
    const suyo = data as { address: string; phone: string };

    const { data: real } = await root
      .from('profiles').select('address, phone').eq('id', idCliente).single();
    expect(suyo).toEqual(real);
  });

  it('el cliente VE su propio aviso', async () => {
    const { data, error } = await cliente
      .from('notifications')
      .select('id, title, message')
      .order('created_at', { ascending: false })
      .limit(1).single();
    expect(error).toBeNull();
    expect((data as { title: string }).title).toMatch(/actualizamos tus datos/i);
  });

  it('guardar sin cambiar nada NO manda aviso', async () => {
    const { data: actual } = await root
      .from('profiles').select('phone').eq('id', idCliente).single();
    const mismo = (actual as { phone: string }).phone;

    const antes = await root
      .from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', idCliente);

    const { data } = await admin.rpc('actualizar_cliente_persona', {
      _user_id: idCliente, _datos: { phone: mismo },
    });
    expect((data as { cambios: number }).cambios).toBe(0);
    expect((data as { aviso: boolean }).aviso).toBe(false);

    const despues = await root
      .from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', idCliente);
    expect(despues.count).toBe(antes.count);
  });

  it('un asesor sin users.manage no puede editar', async () => {
    const { error } = await asesor.rpc('actualizar_cliente_persona', {
      _user_id: idCliente, _datos: { phone: '3009999999' },
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/FORBIDDEN/);
  });

  it('un cliente no puede editarse a través de esta función', async () => {
    const { error } = await cliente.rpc('actualizar_cliente_persona', {
      _user_id: idCliente, _datos: { phone: '3008888888' },
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/FORBIDDEN/);
  });

  it('no se puede editar a un empleado desde la pantalla de clientes', async () => {
    const { data: emp } = await root
      .from('profiles').select('id').eq('email', 'tecnico@pintuco.demo').single();
    const { error } = await admin.rpc('actualizar_cliente_persona', {
      _user_id: (emp as { id: string }).id, _datos: { phone: '3007777777' },
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/ES_PERSONAL/);
  });

  it('editar la empresa avisa a TODOS sus usuarios', async () => {
    const { data: gente } = await root
      .from('profiles').select('id').eq('company_id', idEmpresa);
    const cuantos = (gente ?? []).length;
    expect(cuantos).toBeGreaterThan(0);

    const { data, error } = await admin.rpc('actualizar_cliente_empresa', {
      _company_id: idEmpresa,
      _datos: { phone: `60142${sello.slice(-5)}` },
    });
    expect(error).toBeNull();
    const r = data as { cambios: number; aviso: boolean; avisados: number };
    expect(r.cambios).toBe(1);
    expect(r.avisados).toBe(cuantos);

    const aviso = await ultimoAviso();
    expect(aviso.message).toMatch(/los datos de tu empresa/i);
  });

  it('el NIT de la empresa se guarda sin puntos y el aviso lo refleja', async () => {
    const { data } = await admin.rpc('actualizar_cliente_empresa', {
      _company_id: idEmpresa,
      _datos: { nit: `901.${sello}-4` },
    });
    const r = data as { detalle: string[] };
    const linea = r.detalle.find((d) => d.startsWith('NIT')) ?? '';
    expect(linea).toContain(`901${sello}-4`);
    expect(linea).not.toContain('901.');
  });
});
