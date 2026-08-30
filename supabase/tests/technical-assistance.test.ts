import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Asesoría técnica — corrección de regresión.
 *
 * Estas pruebas existen porque el botón "Solicitar acompañamiento técnico"
 * quedó sin efecto al migrar los proyectos a Supabase: cerraba el modal y
 * mostraba un toast de éxito sin guardar nada. Cubrirlo evita que un
 * pendiente vuelva a disfrazarse de funcionalidad.
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
const anon = () => ({ apikey: ANON, 'Content-Type': 'application/json' });
const auth = (t: string) => ({ ...anon(), Authorization: `Bearer ${t}` });

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: anon() });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const login = async (email: string, password: string) =>
  fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: anon(),
    body: JSON.stringify({ email, password }),
  })
    .then((r) => r.json())
    .then((j) => j.access_token ?? '');

const rpc = (t: string, fn: string, body: unknown) =>
  fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: auth(t), body: JSON.stringify(body) });

const PROYECTO = {
  name: 'Proyecto para asesoría técnica',
  city: 'Medellín',
  project_type: 'Edificio residencial',
  area_m2: '85',
  surface: 'Concreto',
  environment: 'Exterior',
  conditions: ['Humedad'],
  diagnosis: { solution_category: 'Sistema Koraza', attention_level: 'Alta' },
  timeline: [
    { step_number: 6, title: 'Acompañamiento técnico en obra', status: 'upcoming' },
  ],
};

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Asesoría técnica (MÓDULO 21/22)', () => {
  let tCarlos = '';
  let tAna = '';
  let tTecnico = '';
  let idProyecto = '';

  beforeAll(async () => {
    [tCarlos, tAna, tTecnico] = await Promise.all([
      login('carlos.mendoza@constructorahorizonte.com', 'pintuco2025*'),
      login('ana.torres@edificarplus.com', 'pintuco2025*'),
      login('tecnico@pintuco.demo', 'pintuco2025*'),
    ]);
    idProyecto = await rpc(tCarlos, 'create_project', { _payload: PROYECTO }).then((r) => r.json());
  });

  afterAll(async () => {
    await fetch(`${API}/rest/v1/projects?id=eq.${idProyecto}`, {
      method: 'DELETE',
      headers: auth(tCarlos),
    });
  });

  it('la solicitud SE PERSISTE de verdad', async () => {
    const r = await rpc(tCarlos, 'request_technical_assistance', {
      _project_id: idProyecto,
      _notes: 'Necesito acompañamiento en obra',
      _contact_phone: '+57 312 458 9201',
      _preferred_date: 'Próximos 3 a 5 días hábiles',
    });
    expect(r.status).toBe(200);

    const [asesoria] = await fetch(
      `${API}/rest/v1/technical_assistance?select=status,description,contact_phone,cost_cop&project_id=eq.${idProyecto}`,
      { headers: auth(tCarlos) }
    ).then((x) => x.json());

    expect(asesoria.status).toBe('SOLICITADO');
    expect(asesoria.description).toBe('Necesito acompañamiento en obra');
    expect(asesoria.contact_phone).toBe('+57 312 458 9201');
    // "Asesoría técnica en obra — $0 COP" (MÓDULO 21)
    expect(Number(asesoria.cost_cop)).toBe(0);
  });

  it('avanza el paso 6 de la cronología en la misma transacción', async () => {
    const [paso] = await fetch(
      `${API}/rest/v1/project_timeline_steps?select=status,description&project_id=eq.${idProyecto}&step_number=eq.6`,
      { headers: auth(tCarlos) }
    ).then((x) => x.json());
    expect(paso.status).toBe('current');
    expect(paso.description).toContain('solicitado por el cliente');
  });

  it('pulsar el botón dos veces NO genera dos visitas', async () => {
    await rpc(tCarlos, 'request_technical_assistance', {
      _project_id: idProyecto,
      _notes: 'Segundo intento',
    });
    const todas = await fetch(
      `${API}/rest/v1/technical_assistance?select=id,description&project_id=eq.${idProyecto}`,
      { headers: auth(tCarlos) }
    ).then((x) => x.json());
    expect(todas).toHaveLength(1);
    expect(todas[0].description).toBe('Segundo intento');
  });

  it('ATAQUE: no se puede pedir asesoría para un proyecto ajeno', async () => {
    const r = await rpc(tAna, 'request_technical_assistance', { _project_id: idProyecto });
    expect(r.status).toBe(403);
    expect((await r.json()).message).toContain('FORBIDDEN');
  });

  it('ATAQUE: un cliente no puede auto-programarse la visita', async () => {
    const r = await fetch(
      `${API}/rest/v1/technical_assistance?project_id=eq.${idProyecto}`,
      {
        method: 'PATCH',
        headers: { ...auth(tCarlos), Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'PROGRAMADO', specialist_name: 'Yo mismo' }),
      }
    );
    const cambiadas = r.status === 204 ? [] : await r.json();
    expect(cambiadas).toEqual([]);

    const [a] = await fetch(
      `${API}/rest/v1/technical_assistance?select=status&project_id=eq.${idProyecto}`,
      { headers: auth(tCarlos) }
    ).then((x) => x.json());
    expect(a.status).toBe('SOLICITADO');
  });

  it('el personal interno SÍ puede programar la visita', async () => {
    // El técnico necesita acceso al proyecto: se le asigna primero.
    const tAdmin = await login('admin@pintuco.demo', 'pintuco2025*');
    const [perfilTecnico] = await fetch(
      `${API}/rest/v1/profiles?select=id&email=eq.tecnico@pintuco.demo`,
      { headers: auth(tAdmin) }
    ).then((x) => x.json());

    await fetch(`${API}/rest/v1/project_assignments`, {
      method: 'POST',
      headers: auth(tAdmin),
      body: JSON.stringify({ project_id: idProyecto, user_id: perfilTecnico.id }),
    });

    const r = await fetch(`${API}/rest/v1/technical_assistance?project_id=eq.${idProyecto}`, {
      method: 'PATCH',
      headers: { ...auth(tTecnico), Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'PROGRAMADO',
        specialist_name: 'Jorge Villa',
        scheduled_date: '24 Feb 2026 - 10:00 AM',
      }),
    });
    expect(r.status).toBe(200);
    expect((await r.json())[0].status).toBe('PROGRAMADO');
  });
});
