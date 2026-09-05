import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { limpiarCuentasDePrueba, clienteDeServicio } from './limpieza';

/**
 * El entorno de correo: el cableado entre la base y el buzón.
 *
 * Sin `functions_url` y `service_key`, `enviar_correo` descarta los mensajes
 * antes de tocar el SMTP y los deja en `email_log` como OMITIDO. Eso es lo que
 * pasaba en producción: el correo de bienvenida existía, se registraba, y
 * nunca salía.
 *
 * Lo que se vigila:
 *   1. Que la llave NO se devuelva jamás. Una pantalla que muestra el secreto
 *      que acaba de guardar lo filtra a cualquiera que abra las herramientas
 *      del navegador.
 *   2. Que mandar la llave vacía CONSERVE la que hay. Si la borrara, guardar
 *      cualquier otro campo apagaría el correo entero sin avisar.
 *   3. Que la barra final se limpie: `enviar_correo` concatena '/send-email',
 *      y '//send-email' responde 404 en unos servidores y no en otros.
 *   4. Que solo un administrador pueda tocarlo ni verlo.
 *
 * La configuración real se guarda y se restaura, porque esta base es la de
 * trabajo: una prueba no puede dejar el correo local apagado.
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
const JEFE = { email: `entorno.jefe.${sello}@correo.test`, password: 'pintuco2025*' };
const CURIOSO = { email: `entorno.curioso.${sello}@correo.test`, password: 'pintuco2025*' };

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON || !SERVICE) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const admin = () => ({ apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' });
const auth = (t: string) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

async function registrar(cred: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cred, data: { first_name: 'Prueba', client_type: 'Particular' } }),
  });
  return (await r.json()).access_token ?? '';
}

async function estado(token: string) {
  const r = await fetch(`${API}/rest/v1/rpc/estado_entorno_correo`, {
    method: 'POST', headers: auth(token), body: '{}',
  });
  return { ok: r.ok, cuerpo: await r.json().catch(() => ({})) };
}

async function guardar(token: string, cuerpo: Record<string, unknown>) {
  const r = await fetch(`${API}/rest/v1/rpc/configurar_entorno_correo`, {
    method: 'POST', headers: auth(token), body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, cuerpo: j, mensaje: j?.message ?? '' };
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Entorno de correo · el cableado entre la base y el buzón', () => {
  let tokenJefe = '';
  let tokenCurioso = '';
  let original: Record<string, unknown> | null = null;

  beforeAll(async () => {
    tokenJefe = await registrar(JEFE);
    tokenCurioso = await registrar(CURIOSO);

    const idDe = async (correo: string) => {
      const r = await fetch(
        `${API}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(correo)}`,
        { headers: admin() },
      );
      return ((await r.json()) as { id: string }[])[0]?.id ?? '';
    };
    await fetch(`${API}/rest/v1/user_roles`, {
      method: 'POST', headers: admin(),
      body: JSON.stringify({ user_id: await idDe(JEFE.email), role: 'ADMINISTRADOR' }),
    });

    // Se guarda la configuración REAL, con llave incluida, para devolverla al
    // final. Esta es la base de trabajo, no una desechable.
    const r = await fetch(`${API}/rest/v1/internal_config?select=*&id=eq.1`, { headers: admin() });
    original = ((await r.json()) as Record<string, unknown>[])[0] ?? null;
  });

  afterAll(async () => {
    if (original) {
      await fetch(`${API}/rest/v1/internal_config?id=eq.1`, {
        method: 'PATCH',
        headers: { ...admin(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          functions_url: original.functions_url,
          service_key: original.service_key,
          site_url: original.site_url,
          emails_enabled: original.emails_enabled,
          email_allowlist: original.email_allowlist,
        }),
      });
    }
    if (SERVICE) await limpiarCuentasDePrueba(clienteDeServicio(API, SERVICE), sello);
  });

  it('un cliente cualquiera no puede ni mirarlo', async () => {
    const r = await estado(tokenCurioso);
    expect(r.ok).toBe(false);
  });

  it('un cliente cualquiera no puede cambiarlo', async () => {
    const r = await guardar(tokenCurioso, { _functions_url: 'https://malo.example' });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('FORBIDDEN');
  });

  it('guarda la URL y quita la barra final', async () => {
    const r = await guardar(tokenJefe, {
      _functions_url: 'https://ejemplo.supabase.co/functions/v1///',
      _service_key: 'llave-de-prueba',
      _site_url: 'https://tienda.ejemplo.com/',
    });
    expect(r.ok).toBe(true);
    // Sin esto se formaría '//send-email' al concatenar.
    expect((r.cuerpo as { functions_url: string }).functions_url)
      .toBe('https://ejemplo.supabase.co/functions/v1');
    expect((r.cuerpo as { site_url: string }).site_url).toBe('https://tienda.ejemplo.com');
  });

  it('la llave nunca se devuelve, solo si la hay', async () => {
    const r = await estado(tokenJefe);
    expect(r.ok).toBe(true);
    expect((r.cuerpo as { tiene_llave: boolean }).tiene_llave).toBe(true);
    expect(JSON.stringify(r.cuerpo)).not.toContain('llave-de-prueba');
  });

  it('mandar la llave vacía conserva la que hay', async () => {
    const r = await guardar(tokenJefe, { _site_url: 'https://otra.ejemplo.com', _service_key: '' });
    expect(r.ok).toBe(true);
    expect((r.cuerpo as { tiene_llave: boolean }).tiene_llave).toBe(true);

    const enBase = await fetch(`${API}/rest/v1/internal_config?select=service_key&id=eq.1`, { headers: admin() });
    expect(((await enBase.json()) as { service_key: string }[])[0].service_key).toBe('llave-de-prueba');
  });

  it('rechaza una URL que no es una URL', async () => {
    const r = await guardar(tokenJefe, { _functions_url: 'ejemplo.supabase.co' });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('URL_INVALIDA');
  });

  it('la lista blanca se limpia y se puede vaciar', async () => {
    let r = await guardar(tokenJefe, {
      _allowlist: ['  UNO@Ejemplo.com ', '', 'dos@ejemplo.com', 'uno@ejemplo.com'],
      _cambiar_allowlist: true,
    });
    expect(r.ok).toBe(true);
    expect((r.cuerpo as { allowlist: string[] }).allowlist.sort())
      .toEqual(['dos@ejemplo.com', 'uno@ejemplo.com']);

    // Vaciarla es lo que se hace al pasar a producción: sin filtro.
    r = await guardar(tokenJefe, { _allowlist: [], _cambiar_allowlist: true });
    expect((r.cuerpo as { allowlist: string[] }).allowlist).toEqual([]);
  });

  it('no tocar la lista la deja como estaba', async () => {
    await guardar(tokenJefe, { _allowlist: ['uno@ejemplo.com'], _cambiar_allowlist: true });
    const r = await guardar(tokenJefe, { _site_url: 'https://tercera.ejemplo.com' });
    expect((r.cuerpo as { allowlist: string[] }).allowlist).toEqual(['uno@ejemplo.com']);
  });
});
