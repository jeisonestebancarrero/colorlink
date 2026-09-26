import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { limpiarCuentasDePrueba, correoDePrueba } from './limpieza';

/**
 * Contraseña provisional: la cuenta marcada debe cambiarla, la marca se retira
 * solo al cambiarla, nadie la quita a otro y las cuentas normales no nacen marcadas.
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

describe.skipIf(!disponible || !SERVICE)('Contraseña provisional', () => {
  let root: SupabaseClient;
  let admin: SupabaseClient;

  const sello = Date.now().toString().slice(-8);
  const correo = correoDePrueba('provisional', sello);
  const PROVISIONAL = 'Provisional-2026';
  const DEFINITIVA = 'MiClaveNueva-2026';
  let idNuevo = '';

  beforeAll(async () => {
    root = createClient(API, SERVICE, { auth: { persistSession: false } });

    admin = createClient(API, ANON, { auth: { persistSession: false } });
    const a = await admin.auth.signInWithPassword(ADMIN);
    if (a.error) throw new Error(`admin: ${a.error.message}`);

    const { data, error } = await root.auth.admin.createUser({
      email: correo,
      password: PROVISIONAL,
      email_confirm: true,
      user_metadata: { first_name: 'Cuenta', last_name: 'Provisional', client_type: 'Particular' },
    });
    if (error || !data.user) throw new Error(`alta: ${error?.message}`);
    idNuevo = data.user.id;

    // Replica lo que hace `admin-create-user` al crear la cuenta.
    await root.from('profiles').update({ must_change_password: true }).eq('id', idNuevo);
  });

  afterAll(async () => {
    await limpiarCuentasDePrueba(root, sello);
    await admin.auth.signOut();
  });

  it('la cuenta nueva queda marcada como provisional', async () => {
    const { data } = await root
      .from('profiles').select('must_change_password').eq('id', idNuevo).single();
    expect((data as { must_change_password: boolean }).must_change_password).toBe(true);
  });

  it('quien entra con la provisional ve que debe cambiarla', async () => {
    const suyo = createClient(API, ANON, { auth: { persistSession: false } });
    const r = await suyo.auth.signInWithPassword({ email: correo, password: PROVISIONAL });
    expect(r.error).toBeNull();

    const { data } = await suyo
      .from('profiles').select('must_change_password').eq('id', idNuevo).single();
    expect((data as { must_change_password: boolean }).must_change_password).toBe(true);
    await suyo.auth.signOut();
  });

  it('al cambiarla se retira la marca y la nueva sirve', async () => {
    const suyo = createClient(API, ANON, { auth: { persistSession: false } });
    await suyo.auth.signInWithPassword({ email: correo, password: PROVISIONAL });

    const cambio = await suyo.auth.updateUser({ password: DEFINITIVA });
    expect(cambio.error).toBeNull();

    const { error } = await suyo.rpc('confirmar_cambio_de_clave');
    expect(error).toBeNull();

    const { data } = await root
      .from('profiles').select('must_change_password').eq('id', idNuevo).single();
    expect((data as { must_change_password: boolean }).must_change_password).toBe(false);
    await suyo.auth.signOut();

    // La contraseña nueva es la que entra ahora.
    const otro = createClient(API, ANON, { auth: { persistSession: false } });
    const r = await otro.auth.signInWithPassword({ email: correo, password: DEFINITIVA });
    expect(r.error).toBeNull();
    await otro.auth.signOut();
  });

  it('nadie puede quitarle la marca a otro', async () => {
    // `confirmar_cambio_de_clave` actúa sobre `auth.uid()`: el admin que la llama
    // se quita la marca a sí mismo, no al otro.
    await root.from('profiles').update({ must_change_password: true }).eq('id', idNuevo);

    const { error } = await admin.rpc('confirmar_cambio_de_clave');
    expect(error).toBeNull();

    const { data } = await root
      .from('profiles').select('must_change_password').eq('id', idNuevo).single();
    expect((data as { must_change_password: boolean }).must_change_password).toBe(true);
  });

  it('las cuentas que ya existían NO quedan marcadas', async () => {
    // Marcar a todos por defecto bloquearía al equipo en el despliegue.
    const { data } = await root
      .from('profiles').select('email, must_change_password')
      .in('email', [
        'admin@pintuco.demo', 'asesor@pintuco.demo', 'tecnico@pintuco.demo',
        'carlos.mendoza@constructorahorizonte.com',
      ]);
    for (const p of (data ?? []) as Array<{ email: string; must_change_password: boolean }>) {
      expect(p.must_change_password, `${p.email} quedó marcado`).toBe(false);
    }
  });

  it('un cliente sin permiso no puede exigirle el cambio a otro', async () => {
    const suyo = createClient(API, ANON, { auth: { persistSession: false } });
    await suyo.auth.signInWithPassword({ email: correo, password: DEFINITIVA });

    const { data: victima } = await root
      .from('profiles').select('id').eq('email', 'carlos.mendoza@constructorahorizonte.com').single();

    const { error } = await suyo.rpc('exigir_cambio_de_clave', {
      _user_id: (victima as { id: string }).id,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/FORBIDDEN/);
    await suyo.auth.signOut();
  });
});
