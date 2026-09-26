import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Proyectos y visitas: un cliente no ve obras ajenas, el técnico solo las asignadas,
 * un cliente no puede asignarse como técnico y cerrar una visita exige informe.
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

const CARLOS = { email: 'carlos.mendoza@constructorahorizonte.com', password: 'pintuco2025*' };
const ANA = { email: 'ana.torres@edificarplus.com', password: 'pintuco2025*' };
const TECNICO = { email: 'tecnico@pintuco.demo', password: 'pintuco2025*' };
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

async function login(cred: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(cred),
  });
  return (await r.json()).access_token ?? '';
}

const cab = (t: string) => ({
  apikey: ANON,
  Authorization: `Bearer ${t}`,
  'Content-Type': 'application/json',
});

const rpc = (nombre: string, token: string, cuerpo: unknown) =>
  fetch(`${API}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: cab(token),
    body: JSON.stringify(cuerpo),
  });

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Proyectos y visitas técnicas', () => {
  let tCarlos = '';
  let tAna = '';
  let tTecnico = '';
  let tAdmin = '';
  let proyecto = '';
  let idTecnico = '';
  let idCarlos = '';

  beforeAll(async () => {
    [tCarlos, tAna, tTecnico, tAdmin] = await Promise.all([
      login(CARLOS), login(ANA), login(TECNICO), login(ADMIN),
    ]);

    // La suite crea su propio proyecto para no depender de datos sembrados.
    proyecto = (await fetch(`${API}/rest/v1/rpc/create_project`, {
      method: 'POST',
      headers: cab(tCarlos),
      body: JSON.stringify({
        _payload: {
          name: `Obra de prueba ${Date.now()}`,
          description: 'Proyecto creado por la suite de pruebas.',
          city: 'Medellín',
          address: 'Carrera 43A #18-95',
          project_type: 'Edificio residencial',
          area_m2: '85',
          surface: 'Fachada',
          environment: 'Exterior',
        },
      }),
    }).then((r) => r.json())) as string;

    const perfiles = await fetch(`${API}/rest/v1/profiles?select=id,email`, {
      headers: cab(tAdmin),
    }).then((r) => r.json());
    idTecnico = perfiles.find((p: { email: string }) => p.email === TECNICO.email)?.id ?? '';
    idCarlos = perfiles.find((p: { email: string }) => p.email === CARLOS.email)?.id ?? '';
  });

  afterAll(async () => {
    if (proyecto && idTecnico) {
      await rpc('unassign_from_project', tAdmin, {
        _project_id: proyecto,
        _user_id: idTecnico,
      });
    }
    // Se borra con la llave de servicio: deja notificaciones y visitas que el cliente no puede borrar.
    if (proyecto && SERVICE) {
      const s = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
      await fetch(`${API}/rest/v1/notifications?project_id=eq.${proyecto}`, { method: 'DELETE', headers: s });
      await fetch(`${API}/rest/v1/projects?id=eq.${proyecto}`, { method: 'DELETE', headers: s });
    }
  });

  it('el entorno tiene proyectos con los que trabajar', () => {
    expect(proyecto).not.toBe('');
    expect(idTecnico).not.toBe('');
  });

  it('un cliente NO ve la obra de otro cliente', async () => {
    const deAna = await fetch(`${API}/rest/v1/projects?select=id`, {
      headers: cab(tAna),
    }).then((r) => r.json());
    expect(deAna.map((p: { id: string }) => p.id)).not.toContain(proyecto);
  });

  it('el técnico no ve un proyecto que no le asignaron', async () => {
    const suyos = await fetch(`${API}/rest/v1/projects?select=id`, {
      headers: cab(tTecnico),
    }).then((r) => r.json());
    expect(suyos.map((p: { id: string }) => p.id)).not.toContain(proyecto);
  });

  it('no se puede asignar a un cliente como técnico de la obra', async () => {
    // Si pasara, asignar al cliente A a la obra de B le entregaría su dirección y diagnóstico.
    const r = await rpc('assign_to_project', tAdmin, {
      _project_id: proyecto,
      _user_id: idCarlos,
      _rol: 'TECNICO',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/NOT_STAFF/);
  });

  it('un cliente no puede asignarse personal a su propia obra', async () => {
    const r = await rpc('assign_to_project', tCarlos, {
      _project_id: proyecto,
      _user_id: idTecnico,
      _rol: 'TECNICO',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('asignado el técnico, ya ve la obra', async () => {
    const r = await rpc('assign_to_project', tAdmin, {
      _project_id: proyecto,
      _user_id: idTecnico,
      _rol: 'TECNICO',
    });
    expect(r.ok).toBe(true);

    const suyos = await fetch(`${API}/rest/v1/projects?select=id`, {
      headers: cab(tTecnico),
    }).then((r) => r.json());
    expect(suyos.map((p: { id: string }) => p.id)).toContain(proyecto);
  });

  it('al retirarlo, deja de verla', async () => {
    const r = await rpc('unassign_from_project', tAdmin, {
      _project_id: proyecto,
      _user_id: idTecnico,
    });
    expect(r.ok).toBe(true);

    const suyos = await fetch(`${API}/rest/v1/projects?select=id`, {
      headers: cab(tTecnico),
    }).then((r) => r.json());
    expect(suyos.map((p: { id: string }) => p.id)).not.toContain(proyecto);
  });

  it('programar una visita sin fecha se rechaza', async () => {
    const r = await rpc('schedule_technical_visit', tAdmin, {
      _project_id: proyecto,
      _fecha: null,
    });
    expect(r.ok).toBe(false);
  });

  it('programar la visita asigna al técnico y avisa al cliente', async () => {
    const r = await rpc('schedule_technical_visit', tAdmin, {
      _project_id: proyecto,
      _fecha: '2026-09-15',
      _hora: '9:00 a. m.',
      _technician_id: idTecnico,
    });
    expect(r.ok).toBe(true);

    // Quien va a la obra tiene que poder abrirla.
    const suyos = await fetch(`${API}/rest/v1/projects?select=id`, {
      headers: cab(tTecnico),
    }).then((r) => r.json());
    expect(suyos.map((p: { id: string }) => p.id)).toContain(proyecto);

    // El cliente recibe aviso. Se busca la notificación concreta, no el total: otras
    // suites en paralelo crean y borran notificaciones del mismo cliente.
    const avisos = await fetch(
      `${API}/rest/v1/notifications?select=title,message&user_id=eq.${idCarlos}&project_id=eq.${proyecto}`,
      { headers: cab(tCarlos) },
    ).then((r) => r.json());
    expect(
      avisos.some((n: { title: string }) => /visita/i.test(n.title)),
      'el cliente no recibió aviso de la visita programada',
    ).toBe(true);
  });

  it('cerrar una visita SIN informe se rechaza', async () => {
    const [visita] = await fetch(
      `${API}/rest/v1/technical_visits?select=id&project_id=eq.${proyecto}`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    const r = await rpc('update_technical_visit', tAdmin, {
      _visit_id: visita.id,
      _estado: 'REALIZADA',
      _resultado: '   ',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/RESULT_REQUIRED/);
  });

  it('con informe, la visita se cierra y el cliente lo recibe', async () => {
    const [visita] = await fetch(
      `${API}/rest/v1/technical_visits?select=id&project_id=eq.${proyecto}`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    const r = await rpc('update_technical_visit', tAdmin, {
      _visit_id: visita.id,
      _estado: 'REALIZADA',
      _resultado: 'Humedad ascendente confirmada en el zócalo. Se recomienda impermeabilizante.',
    });
    expect(r.ok).toBe(true);

    const [cerrada] = await fetch(
      `${API}/rest/v1/technical_visits?select=status,result&id=eq.${visita.id}`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());
    expect(cerrada.status).toBe('REALIZADA');
    expect(cerrada.result).toMatch(/Humedad ascendente/);

    const avisos = await fetch(
      `${API}/rest/v1/notifications?select=message&user_id=eq.${idCarlos}`,
      { headers: cab(tCarlos) },
    ).then((r) => r.json());
    expect(JSON.stringify(avisos)).toMatch(/Humedad ascendente/);
  });

  it('un cliente no puede cambiar el estado de su propio proyecto', async () => {
    // Solo el personal mueve el estado; el cliente podría darse por atendido.
    const r = await rpc('set_project_status', tCarlos, {
      _project_id: proyecto,
      _estado: 'COMPLETADO',
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/FORBIDDEN/);
  });

  it('el nombre de la persona se puede traer junto con su rol', async () => {
    // Depende de la FK hacia `profiles`; sin ella el selector de técnico queda vacío.
    const r = await fetch(
      `${API}/rest/v1/user_roles?select=user_id,role,profiles:user_id(first_name)&role=eq.TECNICO`,
      { headers: cab(tAdmin) },
    );
    expect(r.ok).toBe(true);
    const filas = await r.json();
    expect(filas.length).toBeGreaterThan(0);
    expect(filas[0].profiles?.first_name).toBeTruthy();
  });
});
