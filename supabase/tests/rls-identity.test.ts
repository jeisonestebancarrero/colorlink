import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { borrarEmpresasHuerfanas, clienteDeServicio } from './limpieza';
/** La base guarda nombres en mayúsculas y documentos sin puntos: se compara contra el valor normalizado. */
const NORM = (t: string) => t.trim().replace(/\s+/g, ' ').toUpperCase();
/** Documento sin separadores, conservando el guion del dígito de verificación. */
const NORM_DOC = (t: string) =>
  t.toUpperCase().replace(/[^0-9A-ZÁÉÍÓÚÑ-]/g, '').replace(/^-+|-+$/g, '');


/**
 * Seguridad de identidad contra Supabase local, con anon key y JWT de usuario como
 * un navegador hostil. Requiere `npm run db:start`; sin instancia la suite se omite.
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

/** Cuentas creadas por las pruebas de registro, para borrarlas al final. */
const creadas: string[] = [];

const CARLOS = { email: 'carlos.mendoza@constructorahorizonte.com', password: 'pintuco2025*' };
const ANA = { email: 'ana.torres@edificarplus.com', password: 'pintuco2025*' };
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
  const j = await r.json();
  return j.access_token ?? '';
}

/** Guarda el id de una cuenta recién creada para borrarla al terminar. */
async function recordarParaBorrar(token: string): Promise<void> {
  if (!token) return;
  const [perfil] = await fetch(`${API}/rest/v1/profiles?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  if (perfil?.id) creadas.push(perfil.id);
}

function auth(token: string) {
  return { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('RLS · identidad y multi-tenant', () => {
  let tCarlos = '';
  let tAna = '';
  let tAdmin = '';
  let idCarlos = '';

  afterAll(async () => {
    if (!SERVICE) {
      console.warn('[rls-identity] sin SUPABASE_SERVICE_ROLE_KEY: cuentas de prueba no eliminadas');
      return;
    }
    for (const id of creadas) {
      await fetch(`${API}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
    // Las empresas no caen con el usuario. No se borran por nombre: una prueba se
    // registra con el de la empresa real de demostración. Se barren solo las huérfanas.
    await borrarEmpresasHuerfanas(clienteDeServicio(API, SERVICE));
  });

  beforeAll(async () => {
    [tCarlos, tAna, tAdmin] = await Promise.all([login(CARLOS), login(ANA), login(ADMIN)]);
    const r = await fetch(`${API}/rest/v1/profiles?select=id`, { headers: auth(tCarlos) });
    idCarlos = (await r.json())[0]?.id ?? '';
  });

  it('un usuario con credenciales válidas obtiene sesión', () => {
    expect(tCarlos).not.toBe('');
    expect(tAna).not.toBe('');
  });

  it('rechaza credenciales inválidas', async () => {
    const token = await login({ email: CARLOS.email, password: 'contraseña-incorrecta' });
    expect(token).toBe('');
  });

  it('cada empresa ve únicamente la suya (MÓDULO 62)', async () => {
    const [c, a] = await Promise.all([
      fetch(`${API}/rest/v1/companies?select=name`, { headers: auth(tCarlos) }).then((r) => r.json()),
      fetch(`${API}/rest/v1/companies?select=name`, { headers: auth(tAna) }).then((r) => r.json()),
    ]);
    expect(c.map((x: { name: string }) => x.name))
      .toEqual([NORM('Constructora Horizonte S.A.S.')]);
    expect(a.map((x: { name: string }) => x.name)).toEqual([NORM('Edificar Plus S.A.S.')]);
  });

  it('un cliente no ve perfiles de otras empresas', async () => {
    const r = await fetch(`${API}/rest/v1/profiles?select=email`, { headers: auth(tCarlos) });
    const emails = (await r.json()).map((x: { email: string }) => x.email);
    expect(emails).toEqual([CARLOS.email]);
    expect(emails).not.toContain(ANA.email);
  });

  it('el personal interno sí ve todos los perfiles', async () => {
    const r = await fetch(`${API}/rest/v1/profiles?select=email`, { headers: auth(tAdmin) });
    expect((await r.json()).length).toBeGreaterThanOrEqual(5);
  });

  it('ATAQUE: un cliente no puede ascenderse a ADMINISTRADOR', async () => {
    const r = await fetch(`${API}/rest/v1/user_roles`, {
      method: 'POST',
      headers: auth(tCarlos),
      body: JSON.stringify({ user_id: idCarlos, role: 'ADMINISTRADOR' }),
    });
    expect(r.status).toBe(403);
  });

  it('ATAQUE: un cliente no puede cambiarse de empresa', async () => {
    const r = await fetch(`${API}/rest/v1/profiles?id=eq.${idCarlos}`, {
      method: 'PATCH',
      headers: auth(tCarlos),
      body: JSON.stringify({ company_id: '00000000-0000-0000-0000-000000000001' }),
    });
    expect(r.status).toBe(403);
  });

  it('ATAQUE: grant_role() rechaza a quien no es administrador', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/grant_role`, {
      method: 'POST',
      headers: auth(tCarlos),
      body: JSON.stringify({ _user_id: idCarlos, _role: 'ADMINISTRADOR' }),
    });
    expect(r.status).toBe(403);
    expect((await r.json()).message).toContain('FORBIDDEN');
  });

  it('ATAQUE: un anónimo no lee ningún perfil', async () => {
    const r = await fetch(`${API}/rest/v1/profiles?select=email`, { headers: { apikey: ANON } });
    expect(r.status).toBe(401);
  });

  it('my_access() devuelve los roles correctos a cada usuario', async () => {
    const pedir = (t: string) =>
      fetch(`${API}/rest/v1/rpc/my_access`, { method: 'POST', headers: auth(t), body: '{}' }).then((r) => r.json());

    const [carlos, admin] = await Promise.all([pedir(tCarlos), pedir(tAdmin)]);
    expect(carlos.roles.sort()).toEqual(['CLIENTE', 'CLIENTE_B2B']);
    expect(carlos.is_admin).toBe(false);
    expect(admin.is_admin).toBe(true);
    expect(admin.is_staff).toBe(true);
  });

  it('el registro crea perfil, rol CLIENTE y empresa propia', async () => {
    const email = `prueba.${Date.now()}@colorlink.test`;
    const r = await fetch(`${API}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'pintuco2025*',
        data: {
          first_name: 'Prueba',
          last_name: 'Automatizada',
          client_type: 'Constructor',
          company: 'Constructora de Prueba S.A.S.',
          phone: '+57 300 000 0000',
          city: 'Medellín',
        },
      }),
    });
    expect(r.status).toBe(200);
    const token = (await r.json()).access_token;
    await recordarParaBorrar(token);

    const acceso = await fetch(`${API}/rest/v1/rpc/my_access`, {
      method: 'POST',
      headers: auth(token),
      body: '{}',
    }).then((x) => x.json());

    expect(acceso.roles).toContain('CLIENTE');
    expect(acceso.roles).toContain('CLIENTE_B2B');
    expect(acceso.is_admin).toBe(false);

    const empresas = await fetch(`${API}/rest/v1/companies?select=name`, { headers: auth(token) }).then((x) => x.json());
    expect(empresas).toEqual([{ name: NORM('Constructora de Prueba S.A.S.') }]);
  });

  it('SEGURIDAD: el registro NO vincula a una empresa preexistente', async () => {
    // Registrarse con el nombre exacto de una empresa ajena debe crear una empresa nueva, sin acceso a la otra.
    const email = `intruso.${Date.now()}@colorlink.test`;
    const r = await fetch(`${API}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'pintuco2025*',
        data: {
          first_name: 'Intento',
          last_name: 'Intrusion',
          client_type: 'Constructor',
          company: 'Constructora Horizonte S.A.S.',
          phone: '+57 300 111 1111',
          city: 'Medellín',
        },
      }),
    });
    const token = (await r.json()).access_token;
    await recordarParaBorrar(token);

    const empresas = await fetch(`${API}/rest/v1/companies?select=id,name`, { headers: auth(token) }).then((x) => x.json());
    expect(empresas).toHaveLength(1);

    // Misma razón social, fila distinta.
    const perfiles = await fetch(`${API}/rest/v1/profiles?select=email`, { headers: auth(token) }).then((x) => x.json());
    expect(perfiles.map((p: { email: string }) => p.email)).not.toContain(CARLOS.email);
  });
});
