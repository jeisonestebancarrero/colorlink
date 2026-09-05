import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { limpiarCuentasDePrueba, clienteDeServicio } from './limpieza';

/**
 * La llave del asistente se comprueba antes de guardarse.
 *
 * Esto no es una precaución teórica. En el servidor de producción se pegó en
 * esa casilla el SECRETO DE CLIENTE DE GOOGLE (`GOCSPX-…`). La función lo
 * guardó sin protestar y el único síntoma fue que el asistente respondía «no
 * está disponible en este momento», que no señala a ninguna parte. El motivo
 * real solo apareció leyendo lo que contestaba OpenAI.
 *
 * Y el daño no fue la confusión: ese secreto se mandó a OpenAI como credencial
 * en cada intento, y quedó en los registros de un tercero. Un secreto de otro
 * proveedor salió del sistema por haberse escrito en la casilla de al lado.
 *
 * Se comprueba además que el mensaje NOMBRE el prefijo de lo que se pegó: quien
 * se equivoca de casilla necesita saber cuál secreto puso para ir a buscar el
 * correcto, y no le sirve un «llave inválida».
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
const JEFE = { email: `asistente.jefe.${sello}@correo.test`, password: 'pintuco2025*' };

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

async function configurar(token: string, datos: Record<string, unknown>) {
  const r = await fetch(`${API}/rest/v1/rpc/configurar_asistente`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ _datos: datos }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, cuerpo: j, mensaje: j?.message ?? '' };
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Llave del asistente · no acepta el secreto de otro servicio', () => {
  let token = '';
  let original: Record<string, unknown> | null = null;

  beforeAll(async () => {
    const r = await fetch(`${API}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...JEFE, data: { first_name: 'Jefa', client_type: 'Particular' } }),
    });
    token = (await r.json()).access_token ?? '';

    const p = await fetch(
      `${API}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(JEFE.email)}`,
      { headers: admin() },
    );
    const id = ((await p.json()) as { id: string }[])[0]?.id;
    await fetch(`${API}/rest/v1/user_roles`, {
      method: 'POST', headers: admin(),
      body: JSON.stringify({ user_id: id, role: 'ADMINISTRADOR' }),
    });

    // Esta es la base de trabajo: la llave real se guarda y se devuelve.
    const c = await fetch(`${API}/rest/v1/app_settings?select=ai_enabled,ai_api_key,ai_model,ai_provider&limit=1`, { headers: admin() });
    original = ((await c.json()) as Record<string, unknown>[])[0] ?? null;
  });

  afterAll(async () => {
    if (original) {
      await fetch(`${API}/rest/v1/app_settings?id=eq.1`, {
        method: 'PATCH',
        headers: { ...admin(), Prefer: 'return=minimal' },
        body: JSON.stringify(original),
      });
    }
    if (SERVICE) await limpiarCuentasDePrueba(clienteDeServicio(API, SERVICE), sello);
  });

  it('rechaza el secreto de cliente de Google', async () => {
    const r = await configurar(token, {
      ai_enabled: true, ai_provider: 'openai', ai_api_key: 'GOCSPX-abc123def456ghi',
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('LLAVE_NO_ES_DE_OPENAI');
  });

  it('el mensaje dice qué prefijo se pegó, para saber cuál secreto era', async () => {
    const r = await configurar(token, {
      ai_enabled: true, ai_provider: 'openai', ai_api_key: 'GOCSPX-abc123def456ghi',
    });
    expect(r.mensaje).toContain('GOCSPX-');
    // Y nunca la llave entera.
    expect(r.mensaje).not.toContain('abc123def456ghi');
  });

  it('rechaza también una llave publicable de Supabase pegada por error', async () => {
    const r = await configurar(token, {
      ai_enabled: true, ai_provider: 'openai', ai_api_key: 'sb_publishable_algo',
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('LLAVE_NO_ES_DE_OPENAI');
  });

  it('acepta una llave con la forma de OpenAI', async () => {
    const r = await configurar(token, {
      ai_enabled: true, ai_provider: 'openai', ai_api_key: `sk-proj-prueba${sello}`,
    });
    expect(r.ok).toBe(true);
    expect((r.cuerpo as { tiene_llave: boolean }).tiene_llave).toBe(true);
  });

  it('la respuesta nunca devuelve la llave', async () => {
    const r = await configurar(token, {
      ai_enabled: true, ai_provider: 'openai', ai_api_key: `sk-proj-secreto${sello}`,
    });
    expect(JSON.stringify(r.cuerpo)).not.toContain('secreto');
  });

  it('guardar sin llave no borra la que hay', async () => {
    const r = await configurar(token, { ai_enabled: true, ai_provider: 'openai', ai_model: 'gpt-4o-mini' });
    expect(r.ok).toBe(true);
    expect((r.cuerpo as { tiene_llave: boolean }).tiene_llave).toBe(true);
  });
});
