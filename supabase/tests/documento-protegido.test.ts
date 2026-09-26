import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { limpiarCuentasDePrueba, clienteDeServicio } from './limpieza';

/**
 * El cliente no puede cambiar su documento: `authenticated` solo tiene UPDATE por
 * columna y el documento no está entre ellas. Se prueba porque ese grant es fácil de ampliar sin querer.
 * El documento entra por `complete_profile`, que solo lo rellena si está vacío.
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
const CLIENTE = { email: `doc.cliente.${sello}@correo.test`, password: 'pintuco2025*' };

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

async function cambiar(token: string, id: string, campos: Record<string, unknown>) {
  const r = await fetch(`${API}/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH', headers: { ...auth(token), Prefer: 'return=representation' },
    body: JSON.stringify(campos),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, mensaje: (j as { message?: string })?.message ?? '' };
}

async function documentoDe(id: string): Promise<string | null> {
  const r = await fetch(`${API}/rest/v1/profiles?select=document_number&id=eq.${id}`, { headers: admin() });
  return ((await r.json()) as { document_number: string | null }[])[0]?.document_number ?? null;
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Documento del cliente · lo corrige quien administra', () => {
  let token = '';
  let id = '';

  beforeAll(async () => {
    const r = await fetch(`${API}/auth/v1/signup`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...CLIENTE, data: { first_name: 'Rocío', client_type: 'Particular' } }),
    });
    token = (await r.json()).access_token ?? '';
    const p = await fetch(
      `${API}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(CLIENTE.email)}`,
      { headers: admin() },
    ).then((x) => x.json());
    id = p[0].id;
  });

  afterAll(async () => {
    if (SERVICE) await limpiarCuentasDePrueba(clienteDeServicio(API, SERVICE), sello);
  });

  it('el cliente NO puede escribir el documento por la API', async () => {
    const r = await cambiar(token, id, { document_number: '99999999' });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('permission denied');
    expect(await documentoDe(id)).toBe(null);
  });

  it('tampoco el tipo de documento', async () => {
    const r = await cambiar(token, id, { document_type: 'PASAPORTE' });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('permission denied');
  });

  it('completar el perfil SÍ lo rellena cuando está vacío', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/complete_profile`, {
      method: 'POST', headers: auth(token),
      body: JSON.stringify({ _document_type: 'CC', _document_number: '43.111.222' }),
    });
    expect(r.ok).toBe(true);
    // Se guarda normalizado, sin puntos, que es como se busca.
    expect(await documentoDe(id)).toBe('43111222');
  });

  it('pero no lo cambia una segunda vez', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/complete_profile`, {
      method: 'POST', headers: auth(token),
      body: JSON.stringify({ _document_type: 'CC', _document_number: '99999999' }),
    });
    expect(r.ok).toBe(true);
    expect(await documentoDe(id)).toBe('43111222');
  });

  it('rechaza un documento que ya usa otra cuenta', async () => {
    const otro = { email: `doc.otro.${sello}@correo.test`, password: 'pintuco2025*' };
    const reg = await fetch(`${API}/auth/v1/signup`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...otro, data: { first_name: 'Otro', client_type: 'Particular' } }),
    });
    const tokenOtro = (await reg.json()).access_token ?? '';

    const r = await fetch(`${API}/rest/v1/rpc/complete_profile`, {
      method: 'POST', headers: auth(tokenOtro),
      body: JSON.stringify({ _document_type: 'CC', _document_number: '43111222' }),
    });
    const j = await r.json().catch(() => ({}));
    expect(r.ok).toBe(false);
    expect((j as { message?: string }).message ?? '').toContain('DOCUMENTO_YA_REGISTRADO');
  });

  it('el teléfono sí lo puede cambiar: eso es un dato de contacto', async () => {
    const r = await cambiar(token, id, { phone: '+573009998877' });
    expect(r.ok).toBe(true);
  });

  it('quien administra clientes sí lo corrige', async () => {
    const r = await fetch(`${API}/rest/v1/profiles?id=eq.${id}`, {
      method: 'PATCH', headers: { ...admin(), Prefer: 'return=minimal' },
      body: JSON.stringify({ document_number: '43555666' }),
    });
    expect(r.ok).toBe(true);
    expect(await documentoDe(id)).toBe('43555666');
  });
});
