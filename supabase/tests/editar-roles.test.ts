import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { limpiarCuentasDePrueba, clienteDeServicio } from './limpieza';

/**
 * Editar roles: un usuario no puede ascenderse a admin, un admin otorga y retira, y
 * otorgar dos veces no duplica. El caso del último admin se omite: exigiría quitar el rol a los admins reales.
 * `service_role` no sirve aquí: `is_admin()` mira `auth.uid()`, que con esa llave es nulo.
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

const sello = Date.now();
const DONNADIE = { email: `donnadie.${sello}@correo.test`, password: 'pintuco2025*' };
const VICTIMA = { email: `victima.${sello}@correo.test`, password: 'pintuco2025*' };
const JEFE = { email: `jefe.${sello}@correo.test`, password: 'pintuco2025*' };

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON || !SERVICE) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

function admin() {
  return { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
}

function auth(token: string) {
  return { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function registrar(cred: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cred, data: { first_name: 'Prueba', client_type: 'Particular' } }),
  });
  const j = await r.json();
  return j.access_token ?? '';
}

async function otorgar(token: string, userId: string, rol: string) {
  const r = await fetch(`${API}/rest/v1/rpc/grant_role`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ _user_id: userId, _role: rol }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, mensaje: j?.message ?? '' };
}

async function revocar(token: string, userId: string, rol: string) {
  const r = await fetch(`${API}/rest/v1/rpc/revoke_role`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ _user_id: userId, _role: rol }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, mensaje: j?.message ?? '' };
}

async function idDe(correo: string): Promise<string> {
  const r = await fetch(
    `${API}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(correo)}`,
    { headers: admin() },
  );
  return ((await r.json()) as { id: string }[])[0]?.id ?? '';
}

async function vecesConElRol(userId: string, rol: string): Promise<number> {
  const r = await fetch(
    `${API}/rest/v1/user_roles?select=id&user_id=eq.${userId}&role=eq.${rol}`,
    { headers: admin() },
  );
  return ((await r.json()) as unknown[]).length;
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Editar roles · lo que el servidor no deja hacer', () => {
  let tokenDonNadie = '';
  let tokenJefe = '';
  let idVictima = '';

  beforeAll(async () => {
    tokenDonNadie = await registrar(DONNADIE);
    tokenJefe = await registrar(JEFE);
    await registrar(VICTIMA);
    idVictima = await idDe(VICTIMA.email);

    // El primer admin se siembra con la llave de servicio: `grant_role` exige ya serlo.
    await fetch(`${API}/rest/v1/user_roles`, {
      method: 'POST',
      headers: admin(),
      body: JSON.stringify({ user_id: await idDe(JEFE.email), role: 'ADMINISTRADOR' }),
    });
  });

  afterAll(async () => {
    if (!SERVICE) return;
    await limpiarCuentasDePrueba(clienteDeServicio(API, SERVICE), sello);
  });

  it('un cliente cualquiera no puede ascender a nadie a administrador', async () => {
    const r = await otorgar(tokenDonNadie, idVictima, 'ADMINISTRADOR');
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('FORBIDDEN');
  });

  it('tampoco puede ascenderse a sí mismo', async () => {
    const r = await otorgar(tokenDonNadie, await idDe(DONNADIE.email), 'ADMINISTRADOR');
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('FORBIDDEN');
  });

  it('un administrador sí puede otorgar', async () => {
    const r = await otorgar(tokenJefe, idVictima, 'ASESOR');
    expect(r.ok).toBe(true);
    expect(await vecesConElRol(idVictima, 'ASESOR')).toBe(1);
  });

  it('otorgar dos veces el mismo rol no lo duplica', async () => {
    // Simula un doble clic o un reintento.
    await otorgar(tokenJefe, idVictima, 'ASESOR');
    expect(await vecesConElRol(idVictima, 'ASESOR')).toBe(1);
  });

  it('y también retirarlo', async () => {
    const r = await revocar(tokenJefe, idVictima, 'ASESOR');
    expect(r.ok).toBe(true);
    expect(await vecesConElRol(idVictima, 'ASESOR')).toBe(0);
  });

  it('un cliente cualquiera no puede retirarle el rol a nadie', async () => {
    await otorgar(tokenJefe, idVictima, 'ASESOR');
    const r = await revocar(tokenDonNadie, idVictima, 'ASESOR');
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('FORBIDDEN');
    // El rol sigue ahí.
    expect(await vecesConElRol(idVictima, 'ASESOR')).toBe(1);
    await revocar(tokenJefe, idVictima, 'ASESOR');
  });

});
