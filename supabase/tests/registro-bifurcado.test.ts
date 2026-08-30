import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * El registro tiene dos caminos y cada uno debe producir exactamente lo suyo.
 *
 * Lo que se vigila aquí, en orden de gravedad:
 *   1. Que una persona natural NO quede con empresa creada. El formulario
 *      viejo exigía razón social a todo el mundo y llenaba la tabla
 *      `companies` de empresas inventadas por particulares.
 *   2. Que registrarse escribiendo el nombre de una empresa YA EXISTENTE no
 *      dé acceso a esa empresa. Sería la fuga de inquilinos más barata del
 *      sistema: basta con saber cómo se llama la constructora.
 *   3. Que el documento quede guardado, porque la factura POS lo necesita
 *      para identificar al comprador que no tiene NIT.
 *
 * Las cuentas creadas se limpian al final con la service_role key, que se lee
 * de .env.local (fuera de control de versiones) y nunca del bundle.
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
const PERSONA = { email: `persona.${sello}@correo.test`, password: 'pintuco2025*' };
const EMPRESA = { email: `empresa.${sello}@correo.test`, password: 'pintuco2025*' };
const IMPOSTOR = { email: `impostor.${sello}@correo.test`, password: 'pintuco2025*' };
const COLEGA = { email: `colega.${sello}@correo.test`, password: 'pintuco2025*' };

const NIT_EMPRESA = `901.${String(sello).slice(-6)}-1`;
const NIT_IMPOSTOR = `900.${String(sello).slice(-6)}-2`;

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

/** Devuelve el cuerpo crudo del signup, para poder mirar el error. */
async function registrarCrudo(
  cred: { email: string; password: string },
  metadata: Record<string, string>,
): Promise<{ ok: boolean; codigo?: string; mensaje?: string }> {
  const r = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cred, data: metadata }),
  });
  const j = await r.json();
  return {
    ok: Boolean(j.access_token),
    codigo: j.error_code ?? j.code,
    mensaje: j.msg ?? j.message,
  };
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

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Registro bifurcado · persona natural y empresa', () => {
  let tPersona = '';
  let tEmpresa = '';
  let tImpostor = '';
  let tColega = '';
  let idColega = '';
  const creados: string[] = [];

  beforeAll(async () => {
    tPersona = await registrar(PERSONA, {
      first_name: 'Laura',
      last_name: 'Gómez Rivera',
      client_type: 'Particular',
      document_type: 'CC',
      document_number: `43${sello}`.slice(0, 10),
      phone: '+57 310 555 1234',
      city: 'Medellín',
    });

    tEmpresa = await registrar(EMPRESA, {
      first_name: 'Diego',
      last_name: 'Ramírez',
      client_type: 'Constructor',
      company: `Constructora Prueba ${sello}`,
      company_nit: NIT_EMPRESA,
      phone: '+57 311 555 9876',
      city: 'Bogotá',
    });

    // Se registra escribiendo el nombre de una empresa que YA existe en la
    // semilla, a ver si el sistema se la entrega.
    tImpostor = await registrar(IMPOSTOR, {
      first_name: 'Ivan',
      last_name: 'Suplantador',
      client_type: 'Constructor',
      company: 'Constructora Horizonte S.A.S.',
      company_nit: NIT_IMPOSTOR,
      phone: '+57 312 555 0000',
      city: 'Cali',
    });

    // Un segundo empleado de la MISMA empresa: mismo NIT, otra persona.
    tColega = await registrar(COLEGA, {
      first_name: 'Marcela',
      last_name: 'Peña',
      client_type: 'Constructor',
      company: `Constructora Prueba ${sello}`,
      company_nit: NIT_EMPRESA,
      phone: '+57 313 555 4444',
      city: 'Bogotá',
    });

    for (const t of [tPersona, tEmpresa, tImpostor, tColega]) {
      if (!t) continue;
      const r = await fetch(`${API}/rest/v1/profiles?select=id`, { headers: auth(t) });
      const id = (await r.json())[0]?.id;
      if (id) creados.push(id);
      if (t === tColega) idColega = id ?? '';
    }
  });

  afterAll(async () => {
    // Sin la service_role key no se puede limpiar; se avisa en lugar de
    // fallar, para no romper la suite de quien no la tenga configurada.
    if (!SERVICE) {
      console.warn('[registro-bifurcado] sin SUPABASE_SERVICE_ROLE_KEY: cuentas de prueba no eliminadas');
      return;
    }
    for (const id of creados) {
      await fetch(`${API}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
    for (const nit of [NIT_EMPRESA, NIT_IMPOSTOR]) {
      await fetch(`${API}/rest/v1/companies?nit=eq.${encodeURIComponent(nit)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
  });

  it('ambos caminos crean sesión', () => {
    expect(tPersona).not.toBe('');
    expect(tEmpresa).not.toBe('');
  });

  it('la persona natural NO queda con empresa asociada', async () => {
    const r = await fetch(`${API}/rest/v1/profiles?select=company_id,client_type`, {
      headers: auth(tPersona),
    });
    const [p] = await r.json();
    expect(p.company_id).toBeNull();
    expect(p.client_type).toBe('Particular');
  });

  it('la persona natural no ve ninguna empresa', async () => {
    const r = await fetch(`${API}/rest/v1/companies?select=id`, { headers: auth(tPersona) });
    expect(await r.json()).toEqual([]);
  });

  it('guarda el documento de la persona natural', async () => {
    const r = await fetch(`${API}/rest/v1/profiles?select=document_type,document_number`, {
      headers: auth(tPersona),
    });
    const [p] = await r.json();
    expect(p.document_type).toBe('CC');
    expect(p.document_number).toMatch(/^43/);
  });

  it('el registro de empresa crea la empresa con su NIT y deja OWNER al representante', async () => {
    const r = await fetch(`${API}/rest/v1/companies?select=name,nit`, { headers: auth(tEmpresa) });
    const empresas = await r.json();
    expect(empresas).toHaveLength(1);
    expect(empresas[0].name).toBe(`Constructora Prueba ${sello}`);
    expect(empresas[0].nit).toBe(NIT_EMPRESA);

    const m = await fetch(`${API}/rest/v1/company_members?select=company_role`, {
      headers: auth(tEmpresa),
    }).then((x) => x.json());
    expect(m.map((x: { company_role: string }) => x.company_role)).toContain('OWNER');
  });

  it('el registro de empresa NO guarda documento personal (su identificador es el NIT)', async () => {
    const r = await fetch(`${API}/rest/v1/profiles?select=document_number`, {
      headers: auth(tEmpresa),
    });
    const [p] = await r.json();
    expect(p.document_number).toBeNull();
  });

  it('escribir el nombre de una empresa existente NO da acceso a esa empresa', async () => {
    const empresas = await fetch(`${API}/rest/v1/companies?select=id,name,nit`, {
      headers: auth(tImpostor),
    }).then((r) => r.json());

    // Ve una empresa homónima, pero es SUYA y recién creada, no la original.
    expect(empresas).toHaveLength(1);
    expect(empresas[0].nit).toBe(NIT_IMPOSTOR);

    // La prueba de fuego: no puede ver los proyectos de la empresa original.
    const proyectos = await fetch(`${API}/rest/v1/projects?select=id`, {
      headers: auth(tImpostor),
    }).then((r) => r.json());
    expect(proyectos).toEqual([]);
  });

  it('registrar una empresa con un NIT ya existente NO revienta la cuenta', async () => {
    // Antes esto rompía el trigger de alta con un 500 opaco y el usuario
    // perdía el registro entero.
    expect(tColega).not.toBe('');
    const [p] = await fetch(`${API}/rest/v1/profiles?select=company_id,email`, {
      headers: auth(tColega),
    }).then((r) => r.json());
    expect(p.email).toBe(COLEGA.email);
    expect(p.company_id).toBeNull();
  });

  it('no duplica la empresa y deja una solicitud pendiente', async () => {
    const empresas = await fetch(
      `${API}/rest/v1/companies?select=id&nit=eq.${encodeURIComponent(NIT_EMPRESA)}`,
      { headers: auth(tEmpresa) },
    ).then((r) => r.json());
    expect(empresas).toHaveLength(1);

    const propia = await fetch(`${API}/rest/v1/company_join_requests?select=status`, {
      headers: auth(tColega),
    }).then((r) => r.json());
    expect(propia).toHaveLength(1);
    expect(propia[0].status).toBe('PENDIENTE');
  });

  it('mientras no lo aprueben, no ve nada de esa empresa', async () => {
    const empresas = await fetch(`${API}/rest/v1/companies?select=id`, {
      headers: auth(tColega),
    }).then((r) => r.json());
    expect(empresas).toEqual([]);
  });

  it('el dueño ve la solicitud y solo él puede aprobarla', async () => {
    const pendientes = await fetch(`${API}/rest/v1/company_join_requests?select=id,user_id`, {
      headers: auth(tEmpresa),
    }).then((r) => r.json());
    expect(pendientes).toHaveLength(1);
    const solicitud = pendientes[0].id;

    // Un tercero sin relación con la empresa no puede aprobar.
    const ajeno = await fetch(`${API}/rest/v1/rpc/resolve_join_request`, {
      method: 'POST',
      headers: auth(tPersona),
      body: JSON.stringify({ _request_id: solicitud, _aprobar: true }),
    });
    expect(ajeno.ok).toBe(false);

    // El dueño sí.
    const ok = await fetch(`${API}/rest/v1/rpc/resolve_join_request`, {
      method: 'POST',
      headers: auth(tEmpresa),
      body: JSON.stringify({ _request_id: solicitud, _aprobar: true }),
    });
    expect(ok.ok).toBe(true);

    const [p] = await fetch(`${API}/rest/v1/profiles?select=company_id&id=eq.${idColega}`, {
      headers: auth(tColega),
    }).then((r) => r.json());
    expect(p.company_id).not.toBeNull();
  });

  it('el mismo CORREO no puede registrarse dos veces', async () => {
    const r = await registrarCrudo(
      { email: PERSONA.email, password: 'otraclave123' },
      { first_name: 'Otra', client_type: 'Particular' },
    );
    expect(r.ok).toBe(false);
    // El mensaje es el que el servicio traduce a "Ya existe una cuenta con
    // este correo electrónico"; si GoTrue lo cambia, el usuario dejaría de
    // ver una explicación y esta prueba lo avisa.
    expect(`${r.codigo} ${r.mensaje}`.toLowerCase()).toMatch(/already/);
  });

  it('el mismo DOCUMENTO no puede registrarse con otro correo', async () => {
    const doc = `43${sello}`.slice(0, 10);

    // Así lo comprueba el formulario antes de crear nada.
    const consulta = await fetch(`${API}/rest/v1/rpc/documento_ya_registrado`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _tipo: 'CC', _numero: doc }),
    });
    expect(await consulta.json()).toBe(true);

    // Y aunque alguien se salte el formulario, el alta lo rechaza.
    const r = await registrarCrudo(
      { email: `impostor.doc.${sello}@correo.test`, password: 'pintuco2025*' },
      { first_name: 'Impostor', client_type: 'Particular', document_type: 'CC', document_number: doc },
    );
    expect(r.ok).toBe(false);
  });

  it('un documento libre sí se puede registrar', async () => {
    const consulta = await fetch(`${API}/rest/v1/rpc/documento_ya_registrado`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _tipo: 'CC', _numero: `00000${sello}` }),
    });
    expect(await consulta.json()).toBe(false);
  });

  it('la consulta de documento no revela a quién pertenece', async () => {
    // Responde sí/no y nada más: acertar una cédula no puede devolver el
    // nombre, el correo ni el teléfono de esa persona.
    const r = await fetch(`${API}/rest/v1/rpc/documento_ya_registrado`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _tipo: 'CC', _numero: `43${sello}`.slice(0, 10) }),
    });
    const cuerpo = await r.json();
    expect(typeof cuerpo).toBe('boolean');
  });

  it('un cliente nuevo no puede escalar su propio rol', async () => {
    const roles = await fetch(`${API}/rest/v1/user_roles?select=role`, {
      headers: auth(tPersona),
    }).then((r) => r.json());
    expect(roles.map((x: { role: string }) => x.role)).toEqual(['CLIENTE']);

    const intento = await fetch(`${API}/rest/v1/user_roles`, {
      method: 'POST',
      headers: auth(tPersona),
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    expect(intento.ok).toBe(false);
  });
});
