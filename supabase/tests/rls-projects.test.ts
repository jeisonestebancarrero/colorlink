import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Proyectos: aislamiento, atomicidad y Storage — FASE 5.
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

async function login(email: string, password: string): Promise<string> {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: anon(),
    body: JSON.stringify({ email, password }),
  });
  return (await r.json()).access_token ?? '';
}

const rpc = (t: string, fn: string, body: unknown) =>
  fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: auth(t), body: JSON.stringify(body) });

/** El caso de prueba oficial del MÓDULO 39. */
const PROYECTO_HORIZONTE = {
  name: 'Fachada Edificio Residencial Horizonte',
  description: 'Fachada con humedad y fisuras en concreto',
  city: 'Medellín',
  project_type: 'Edificio residencial',
  area_m2: '85',
  required_date: '20 días',
  surface: 'Concreto',
  environment: 'Exterior',
  conditions: ['Humedad', 'Fisuras'],
  diagnosis: {
    solution_category: 'Sistema Fachada Koraza Protección Extrema 5 Años',
    attention_level: 'Alta',
    requires_technical_visit: true,
    key_considerations: ['Verificar secado superficial antes de pintar.'],
    missing_information: [],
    ai_summary: 'Superficie de Concreto (Exterior) de 85 m² en Medellín.',
    technical_summary: 'Análisis de compatibilidad técnica para sustrato Concreto.',
    disclaimer: 'Estimación preliminar.',
    recommended_products: [{ id: 'p-1', name: 'Koraza 5 Años' }],
    budget_summary: { materialsSubtotal: 500000, currency: 'COP' },
  },
  timeline: [
    { step_number: 1, title: 'Necesidad registrada', status: 'completed', responsible: 'Cliente' },
    { step_number: 2, title: 'Diagnóstico preliminar', status: 'completed', responsible: 'Motor ColorLink' },
    { step_number: 3, title: 'Análisis técnico en curso', status: 'current', responsible: 'Pintuco' },
  ],
};

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Proyectos · aislamiento y atomicidad', () => {
  let tCarlos = '';
  let tAna = '';
  let tTecnico = '';
  let tAdmin = '';
  let idProyectoCarlos = '';
  const creados: Array<{ id: string; token: string }> = [];

  beforeAll(async () => {
    [tCarlos, tAna, tTecnico, tAdmin] = await Promise.all([
      login('carlos.mendoza@constructorahorizonte.com', 'pintuco2025*'),
      login('ana.torres@edificarplus.com', 'pintuco2025*'),
      login('tecnico@pintuco.demo', 'pintuco2025*'),
      login('admin@pintuco.demo', 'pintuco2025*'),
    ]);

    const r = await rpc(tCarlos, 'create_project', { _payload: PROYECTO_HORIZONTE });
    idProyectoCarlos = await r.json();
    creados.push({ id: idProyectoCarlos, token: tCarlos });
  });

  // Las pruebas crean proyectos REALES. Sin esta limpieza la base crecería
  // en cada ejecución y el listado del usuario demo se llenaría de ruido.
  // El borrado va como dueño de cada proyecto: si RLS lo impidiera, la
  // limpieza fallaría y lo sabríamos.
  afterAll(async () => {
    for (const { id, token } of creados) {
      await fetch(`${API}/rest/v1/projects?id=eq.${id}`, {
        method: 'DELETE',
        headers: auth(token),
      });
    }
  });

  it('crea el proyecto del caso de prueba y devuelve su id', () => {
    expect(idProyectoCarlos).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('el código lo genera el servidor, no el navegador', async () => {
    const [p] = await fetch(
      `${API}/rest/v1/projects?select=code,status,user_id&id=eq.${idProyectoCarlos}`,
      { headers: auth(tCarlos) }
    ).then((x) => x.json());
    expect(p.code).toMatch(/^PLK-\d{4}-\d{4}$/);
    // El cliente no puede elegir en qué estado nace su proyecto.
    expect(p.status).toBe('EN_ANALISIS');
  });

  it('la creación escribió en las CINCO tablas (transacción completa)', async () => {
    const q = (tabla: string) =>
      fetch(`${API}/rest/v1/${tabla}?select=id&project_id=eq.${idProyectoCarlos}`, {
        headers: auth(tCarlos),
      }).then((x) => x.json());

    expect((await q('project_surfaces')).length).toBe(1);
    expect((await q('project_pathologies')).length).toBe(2); // Humedad + Fisuras
    expect((await q('project_diagnoses')).length).toBe(1);
    expect((await q('project_timeline_steps')).length).toBe(3);
  });

  it('la superficie y las patologías quedaron enlazadas al catálogo', async () => {
    const [sup] = await fetch(
      `${API}/rest/v1/project_surfaces?select=area_m2,surfaces(name)&project_id=eq.${idProyectoCarlos}`,
      { headers: auth(tCarlos) }
    ).then((x) => x.json());
    expect(sup.surfaces.name).toBe('Concreto');
    expect(Number(sup.area_m2)).toBe(85);

    const pats = await fetch(
      `${API}/rest/v1/project_pathologies?select=pathologies(name)&project_id=eq.${idProyectoCarlos}`,
      { headers: auth(tCarlos) }
    ).then((x) => x.json());
    expect(pats.map((p: { pathologies: { name: string } }) => p.pathologies.name).sort())
      .toEqual(['Fisuras', 'Humedad']);
  });

  it('ATAQUE: una empresa distinta NO ve el proyecto', async () => {
    const deAna = await fetch(`${API}/rest/v1/projects?select=id,name`, {
      headers: auth(tAna),
    }).then((x) => x.json());
    expect(deAna.map((p: { id: string }) => p.id)).not.toContain(idProyectoCarlos);
  });

  it('ATAQUE: ni siquiera pidiéndolo por id directo', async () => {
    const r = await fetch(`${API}/rest/v1/projects?select=name&id=eq.${idProyectoCarlos}`, {
      headers: auth(tAna),
    });
    expect(await r.json()).toEqual([]);
  });

  it('ATAQUE: tampoco ve sus patologías ni su diagnóstico', async () => {
    for (const tabla of ['project_pathologies', 'project_diagnoses', 'project_timeline_steps']) {
      const r = await fetch(
        `${API}/rest/v1/${tabla}?select=id&project_id=eq.${idProyectoCarlos}`,
        { headers: auth(tAna) }
      );
      expect(await r.json(), tabla).toEqual([]);
    }
  });

  it('ATAQUE: no se puede crear un proyecto a nombre de otra persona', async () => {
    const [perfilAna] = await fetch(`${API}/rest/v1/profiles?select=id`, {
      headers: auth(tAna),
    }).then((x) => x.json());

    const r = await fetch(`${API}/rest/v1/projects`, {
      method: 'POST',
      headers: auth(tCarlos),
      body: JSON.stringify({ name: 'Proyecto suplantado', user_id: perfilAna.id }),
    });
    expect([401, 403]).toContain(r.status);
  });

  it('un TÉCNICO no ve el proyecto mientras no esté asignado', async () => {
    const r = await fetch(`${API}/rest/v1/projects?select=id&id=eq.${idProyectoCarlos}`, {
      headers: auth(tTecnico),
    });
    expect(await r.json()).toEqual([]);
  });

  it('el TÉCNICO lo ve en cuanto administración se lo asigna', async () => {
    const [perfilTecnico] = await fetch(
      `${API}/rest/v1/profiles?select=id&email=eq.tecnico@pintuco.demo`,
      { headers: auth(tAdmin) }
    ).then((x) => x.json());

    const asignacion = await fetch(`${API}/rest/v1/project_assignments`, {
      method: 'POST',
      headers: auth(tAdmin),
      body: JSON.stringify({
        project_id: idProyectoCarlos,
        user_id: perfilTecnico.id,
        assignment_role: 'TECNICO',
      }),
    });
    expect(asignacion.status).toBe(201);

    const visto = await fetch(`${API}/rest/v1/projects?select=id&id=eq.${idProyectoCarlos}`, {
      headers: auth(tTecnico),
    }).then((x) => x.json());
    expect(visto).toHaveLength(1);
  });

  it('ATAQUE: un técnico no puede auto-asignarse otro proyecto', async () => {
    const otro = await rpc(tAna, 'create_project', {
      _payload: { ...PROYECTO_HORIZONTE, name: 'Proyecto de Edificar Plus' },
    }).then((x) => x.json());
    creados.push({ id: otro, token: tAna });

    const [perfilTecnico] = await fetch(
      `${API}/rest/v1/profiles?select=id&email=eq.tecnico@pintuco.demo`,
      { headers: auth(tAdmin) }
    ).then((x) => x.json());

    const r = await fetch(`${API}/rest/v1/project_assignments`, {
      method: 'POST',
      headers: auth(tTecnico),
      body: JSON.stringify({ project_id: otro, user_id: perfilTecnico.id }),
    });
    expect([401, 403]).toContain(r.status);
  });

  it('un ASESOR sí ve los proyectos de su cartera', async () => {
    const tAsesor = await login('asesor@pintuco.demo', 'pintuco2025*');
    const r = await fetch(`${API}/rest/v1/projects?select=id&id=eq.${idProyectoCarlos}`, {
      headers: auth(tAsesor),
    });
    expect(await r.json()).toHaveLength(1);
  });

  it('el RPC rechaza un proyecto sin nombre', async () => {
    const r = await rpc(tCarlos, 'create_project', {
      _payload: { ...PROYECTO_HORIZONTE, name: '   ' },
    });
    expect(r.status).toBe(400);
    expect((await r.json()).message).toContain('VALIDATION');
  });

  it('el RPC rechaza un área no positiva', async () => {
    const r = await rpc(tCarlos, 'create_project', {
      _payload: { ...PROYECTO_HORIZONTE, area_m2: '-10' },
    });
    expect(r.status).toBe(400);
    expect((await r.json()).message).toContain('VALIDATION');
  });

  it('un anónimo no puede crear proyectos', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/create_project`, {
      method: 'POST',
      headers: anon(),
      body: JSON.stringify({ _payload: PROYECTO_HORIZONTE }),
    });
    expect([401, 403, 404]).toContain(r.status);
  });

  it('STORAGE: el bucket de archivos es privado', async () => {
    const [b] = await fetch(`${API}/rest/v1/buckets?select=id,public`, {
      headers: auth(tAdmin),
    })
      .then((x) => (x.ok ? x.json() : []))
      .catch(() => []);
    // Si la tabla no está expuesta vía REST se comprueba por el acceso
    // público directo, que debe fallar.
    if (!b) {
      const r = await fetch(`${API}/storage/v1/object/public/project-files/cualquiera.jpg`);
      expect(r.ok).toBe(false);
    } else {
      expect(b.public).toBe(false);
    }
  });

  it('STORAGE: no se puede subir a la carpeta de un proyecto ajeno', async () => {
    const cuerpo = new Blob(['contenido'], { type: 'image/png' });
    const form = new FormData();
    form.append('file', cuerpo, 'intruso.png');

    const r = await fetch(
      `${API}/storage/v1/object/project-files/${idProyectoCarlos}/intruso.png`,
      { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tAna}` }, body: form }
    );
    expect(r.ok).toBe(false);
    expect([400, 401, 403]).toContain(r.status);
  });
});
