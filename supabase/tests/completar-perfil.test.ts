import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { limpiarCuentasDePrueba, clienteDeServicio } from './limpieza';

/**
 * `complete_profile` es la SEGUNDA puerta de entrada al sistema: la de quien
 * llega por Google, que trae correo y nombre pero jamás teléfono ni ciudad.
 *
 * Durante un tiempo esa puerta guardó la ciudad como texto libre mientras el
 * registro normal exigía código DIVIPOLA, así que los clientes de Google
 * quedaban con `city = 'medellin'` y `municipality_code` en nulo. Sin ese
 * código no se puede resolver qué punto de venta cubre la dirección ni a qué
 * asesor va el pedido: el cliente entra, compra y cae en tierra de nadie.
 *
 * Lo que se vigila aquí:
 *   1. Que el municipio quede guardado y que `city` sea el NOMBRE OFICIAL.
 *   2. Que un `_city` escrito a mano no pueda contradecir al municipio.
 *   3. Que un código inventado se rechace en vez de guardarse en nulo, porque
 *      un nulo silencioso deja el perfil incompleto para siempre.
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
const CLIENTE = { email: `perfil.${sello}@correo.test`, password: 'pintuco2025*' };

// Códigos DIVIPOLA reales. Cali se llama oficialmente «Santiago de Cali», y por
// eso sirve de prueba: nadie lo escribiría así a mano.

// La base normaliza a mayúsculas al guardar (20260902100006), igual que con los
// nombres en el registro. Se compara contra el dato NORMALIZADO: comparar contra
// el literal del catálogo estaría comprobando la caja, no el hecho.
const MEDELLIN = '05001';
const CALI = '76001';
const NORM = (t: string) => t.toUpperCase();

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

async function registrar(
  cred: { email: string; password: string },
  metadata: Record<string, string>,
): Promise<string> {
  const r = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cred, data: metadata }),
  });
  const j = await r.json();
  return j.access_token ?? '';
}

function auth(token: string) {
  return { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function completarPerfil(
  token: string,
  cuerpo: Record<string, string | null>,
): Promise<{ ok: boolean; mensaje: string }> {
  const r = await fetch(`${API}/rest/v1/rpc/complete_profile`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, mensaje: j?.message ?? '' };
}

async function miPerfil(token: string): Promise<{ city: string; municipality_code: string }> {
  const r = await fetch(
    `${API}/rest/v1/profiles?select=city,municipality_code`,
    { headers: auth(token) },
  );
  const filas = await r.json();
  return filas[0];
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Completar perfil · la ciudad sale del catálogo', () => {
  let token = '';

  beforeAll(async () => {
    // Se registra SIN municipio, que es exactamente como llega quien entra con
    // Google: el proveedor no entrega ubicación.
    token = await registrar(CLIENTE, {
      first_name: 'Rocío',
      last_name: 'Peláez',
      client_type: 'Particular',
    });
  });

  afterAll(async () => {
    if (!SERVICE) return;
    await limpiarCuentasDePrueba(clienteDeServicio(API, SERVICE), sello);
  });

  it('arranca sin municipio, como llega una cuenta de Google', async () => {
    expect(token).not.toBe('');
    const perfil = await miPerfil(token);
    expect(perfil.municipality_code).toBeNull();
  });

  it('guarda el código del municipio y la ciudad con su nombre oficial', async () => {
    const r = await completarPerfil(token, {
      _phone: '+57 300 111 2233',
      _country_code: 'CO',
      _municipality_code: MEDELLIN,
    });
    expect(r.ok).toBe(true);

    const perfil = await miPerfil(token);
    expect(perfil.municipality_code).toBe(MEDELLIN);
    expect(perfil.city).toBe(NORM('Medellín'));
  });

  it('el municipio manda sobre la ciudad escrita a mano', async () => {
    // El caso que producía los datos sucios: dos fuentes para el mismo hecho.
    const r = await completarPerfil(token, {
      _city: 'cali',
      _municipality_code: CALI,
    });
    expect(r.ok).toBe(true);

    const perfil = await miPerfil(token);
    expect(perfil.municipality_code).toBe(CALI);
    expect(perfil.city).toBe(NORM('Santiago de Cali'));
  });

  it('rechaza un municipio que no existe en vez de dejarlo en nulo', async () => {
    const r = await completarPerfil(token, { _municipality_code: '99999' });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('MUNICIPIO_INVALIDO');

    // Y sobre todo: no pisó lo que ya estaba bien guardado.
    const perfil = await miPerfil(token);
    expect(perfil.municipality_code).toBe(CALI);
  });

  it('rechaza un país que no existe', async () => {
    const r = await completarPerfil(token, { _country_code: 'XX' });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('PAIS_INVALIDO');
  });
});
