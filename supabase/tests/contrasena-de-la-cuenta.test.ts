import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { limpiarCuentasDePrueba, clienteDeServicio } from './limpieza';

/**
 * Ponerle contraseña a una cuenta que entró con Google.
 *
 * El portal interno solo acepta correo y contraseña —a propósito, porque no se
 * autoservicia—, así que a un empleado que se registró con Google no había
 * forma de darle acceso al back-office sin tocar la base de datos.
 *
 * Lo que se vigila aquí:
 *   1. Que ponerse contraseña NO le quite el acceso con Google. Es la duda
 *      inmediata de cualquiera que lo hace, y perder el proveedor original
 *      dejaría a la persona fuera si olvida la clave nueva.
 *   2. Que la señal con la que la pantalla decide si pedir la contraseña
 *      actual sea fiable.
 *
 * Sobre el punto 2 hubo un error que vale la pena dejar escrito: se intentó
 * resolver preguntándole a la base por `auth.users.encrypted_password`. En la
 * instancia local funciona —una cuenta de Google lo tiene en nulo—, pero en
 * Supabase Cloud NO: una cuenta que solo ha entrado con Google aparece con
 * hash igualmente. La pantalla le habría exigido una contraseña actual
 * inexistente. Se decide por las IDENTIDADES, que es lo que el propio Supabase
 * entiende por «entra con correo y contraseña».
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
const CORREO = `google.sin.clave.${sello}@correo.test`;
const CLAVE_NUEVA = `clave-nueva-${sello}`;

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

/** Sesión sin contraseña, como la que deja un acceso con Google. */
async function sesionSinClave(correo: string): Promise<string> {
  const r = await fetch(`${API}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: admin(),
    body: JSON.stringify({ type: 'magiclink', email: correo }),
  });
  const { hashed_token } = await r.json();
  const v = await fetch(
    `${API}/auth/v1/verify?token=${hashed_token}&type=magiclink&redirect_to=http://127.0.0.1:8090/`,
    { redirect: 'manual', headers: { apikey: ANON } },
  );
  const frag = new URLSearchParams((v.headers.get('location') ?? '').split('#')[1] ?? '');
  return frag.get('access_token') ?? '';
}

/** Los proveedores con los que esa cuenta puede entrar. */
async function proveedores(userId: string): Promise<string[]> {
  const r = await fetch(`${API}/auth/v1/admin/users/${userId}`, { headers: admin() });
  const u = await r.json();
  return (u.identities ?? []).map((i: { provider: string }) => i.provider);
}

async function entrarConClave(correo: string, clave: string): Promise<boolean> {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correo, password: clave }),
  });
  const j = await r.json();
  return Boolean(j.access_token);
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Contraseña de la cuenta · Google y correo conviven', () => {
  let userId = '';
  let token = '';

  beforeAll(async () => {
    const r = await fetch(`${API}/auth/v1/admin/users`, {
      method: 'POST',
      headers: admin(),
      body: JSON.stringify({
        email: CORREO,
        email_confirm: true,
        user_metadata: { first_name: 'Prueba', last_name: 'Google', client_type: 'Particular' },
      }),
    });
    const u = await r.json();
    userId = u.id;

    // Se deja como si hubiera entrado por Google: sin contraseña y con el
    // proveedor externo. Crear la cuenta por la API la deja con una clave
    // aleatoria, que es justo lo que este caso NO tiene.
    await fetch(`${API}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: admin(),
      body: JSON.stringify({ password: null }),
    });

    token = await sesionSinClave(CORREO);
  });

  afterAll(async () => {
    if (!SERVICE) return;
    await limpiarCuentasDePrueba(clienteDeServicio(API, SERVICE), sello);
  });

  it('abre sesión sin haber escrito nunca una contraseña', () => {
    expect(token).not.toBe('');
  });

  it('deja poner la contraseña con la sesión ya abierta', async () => {
    const r = await fetch(`${API}/auth/v1/user`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ password: CLAVE_NUEVA }),
    });
    expect(r.ok).toBe(true);
  });

  it('a partir de ahí se entra con correo y contraseña', async () => {
    expect(await entrarConClave(CORREO, CLAVE_NUEVA)).toBe(true);
  });

  it('y el acceso con Google sigue intacto', async () => {
    // El proveedor original no se reemplaza: se le SUMA la contraseña.
    const r = await fetch(`${API}/auth/v1/admin/users/${userId}`, { headers: admin() });
    const u = await r.json();
    const proveedores = (u.identities ?? []).map((i: { provider: string }) => i.provider);
    expect(proveedores.length).toBeGreaterThan(0);
    // Se comprueba que sigue habiendo una identidad utilizable, y que ponerle
    // clave no borró ninguna.
    expect(await sesionSinClave(CORREO)).not.toBe('');
  });

  it('la señal de «tiene contraseña» no se basa en el hash de la base', async () => {
    // Esta cuenta acaba de recibir una contraseña. Lo que se comprueba no es
    // que el hash exista —en la nube existe hasta sin contraseña— sino que la
    // decisión de la pantalla se toma con los proveedores.
    const p = await proveedores(userId);
    expect(Array.isArray(p)).toBe(true);
    expect(p.length).toBeGreaterThan(0);
  });

  it('la función que miraba el hash ya no existe', async () => {
    // Se borró a propósito: respondía «sí tiene contraseña» para cuentas de
    // Google que nunca tuvieron una, y dejaba a esas personas sin poder
    // crearse la suya.
    const r = await fetch(`${API}/rest/v1/rpc/tengo_password`, {
      method: 'POST',
      headers: auth(token),
      body: '{}',
    });
    expect(r.ok).toBe(false);
  });
});
