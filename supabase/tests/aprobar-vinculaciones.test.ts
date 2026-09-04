import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  limpiarCuentasDePrueba, clienteDeServicio, correoDePrueba,
} from './limpieza';

/**
 * Aprobar la vinculación de un empleado a su empresa.
 *
 * `registro-bifurcado` ya comprueba que la solicitud SE CREA y que solo el
 * dueño puede resolverla por RPC. Lo que faltaba —y por lo que la función
 * llevaba desde el 30 de agosto sin un solo uso— es que hubiera de dónde
 * sacar la información para decidir. Aquí se vigila eso:
 *
 *   1. Que quien tiene que aprobar VEA A QUIÉN aprueba. `profiles` no se deja
 *      leer por alguien de fuera de la empresa, y quien solicita todavía lo
 *      es: el dueño solo veía un uuid. Aprobar a ciegas no es aprobar.
 *   2. Que el listado no se le escape a nadie más: ni a un cliente ajeno, ni
 *      sin sesión.
 *   3. Que un OWNER dado de baja de la empresa (status INACTIVO) ya no pueda
 *      meter gente en ella.
 *   4. Que aprobar reactive a un miembro desactivado en lugar de dejar la
 *      solicitud APROBADA y a la persona fuera.
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
const CLAVE = 'Vinculacion2026*';
const DUENO   = { email: correoDePrueba('dueno', sello), password: CLAVE };
const COLEGA  = { email: correoDePrueba('colega', sello), password: CLAVE };
const SEGUNDO = { email: correoDePrueba('segundo', sello), password: CLAVE };
const AJENO   = { email: correoDePrueba('ajeno', sello), password: CLAVE };

const NIT = `901.${String(sello).slice(-6)}-3`;
const EMPRESA = `Constructora Vinculacion ${sello}`;

interface Solicitud {
  id: string;
  company_id: string;
  empresa: string;
  solicitante: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  estado: string;
  resuelta_por: string | null;
}

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
  return (await r.json()).access_token ?? '';
}

function auth(token: string) {
  return { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function solicitudes(token: string): Promise<Solicitud[]> {
  const r = await fetch(`${API}/rest/v1/rpc/solicitudes_de_vinculacion`, {
    method: 'POST',
    headers: auth(token),
    body: '{}',
  });
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

async function resolver(token: string, id: string, aprobar: boolean): Promise<Response> {
  return fetch(`${API}/rest/v1/rpc/resolve_join_request`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ _request_id: id, _aprobar: aprobar }),
  });
}

async function reabrir(token: string, id: string): Promise<Response> {
  return fetch(`${API}/rest/v1/rpc/reabrir_join_request`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ _request_id: id }),
  });
}

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Aprobar vinculaciones · pantalla del dueño de la cuenta', () => {
  let tDueno = '';
  let tColega = '';
  let tSegundo = '';
  let tAjeno = '';
  let idColega = '';
  let companyId = '';

  beforeAll(async () => {
    tDueno = await registrar(DUENO, {
      first_name: 'Rocío', last_name: 'Pardo',
      client_type: 'Constructor', company: EMPRESA, company_nit: NIT,
      phone: '+57 320 555 1111', city: 'Medellín',
    });

    tColega = await registrar(COLEGA, {
      first_name: 'Hernán', last_name: 'Osorio',
      client_type: 'Constructor', company: EMPRESA, company_nit: NIT,
      phone: '+57 320 555 2222', city: 'Medellín',
    });

    tSegundo = await registrar(SEGUNDO, {
      first_name: 'Paula', last_name: 'Cardona',
      client_type: 'Constructor', company: EMPRESA, company_nit: NIT,
      phone: '+57 320 555 3333', city: 'Medellín',
    });

    // Un cliente sin nada que ver con la empresa.
    tAjeno = await registrar(AJENO, {
      first_name: 'Tomás', last_name: 'Ríos', client_type: 'Particular',
      document_type: 'CC', document_number: `71${sello}`.slice(0, 10),
    });

    const [p] = await fetch(`${API}/rest/v1/profiles?select=id`, { headers: auth(tColega) })
      .then((r) => r.json());
    idColega = p?.id ?? '';

    const [c] = await fetch(`${API}/rest/v1/companies?select=id`, { headers: auth(tDueno) })
      .then((r) => r.json());
    companyId = c?.id ?? '';
  });

  afterAll(async () => {
    if (!SERVICE) {
      console.warn('[aprobar-vinculaciones] sin SUPABASE_SERVICE_ROLE_KEY: cuentas no eliminadas');
      return;
    }
    await limpiarCuentasDePrueba(clienteDeServicio(API, SERVICE), sello);
  });

  it('las cuatro cuentas quedaron creadas', () => {
    expect(tDueno).not.toBe('');
    expect(tColega).not.toBe('');
    expect(tSegundo).not.toBe('');
    expect(tAjeno).not.toBe('');
  });

  it('LA RAZÓN DE SER: leyendo la tabla, el dueño no sabe a quién aprueba', async () => {
    // Esto es lo que veía la pantalla antes de la función: la solicitud existe
    // pero el perfil de quien la pide es ilegible para el dueño, porque
    // todavía no son de la misma empresa. Si algún día `profiles` se abriera y
    // esta prueba fallara, sería una fuga, no una mejora.
    const filas = await fetch(
      `${API}/rest/v1/profiles?select=id,first_name,email&id=eq.${idColega}`,
      { headers: auth(tDueno) },
    ).then((r) => r.json());
    expect(filas).toEqual([]);
  });

  it('el dueño ve las solicitudes CON nombre, correo y teléfono', async () => {
    const lista = await solicitudes(tDueno);
    expect(lista.length).toBeGreaterThanOrEqual(2);

    const hernan = lista.find((s) => s.email === COLEGA.email);
    expect(hernan).toBeDefined();
    expect(hernan?.estado).toBe('PENDIENTE');
    expect(hernan?.nombre?.toUpperCase()).toContain('HERNÁN');
    expect(hernan?.telefono).toContain('2222');
    expect(hernan?.empresa.toUpperCase()).toContain('VINCULACION');
  });

  it('un cliente ajeno no ve ninguna solicitud', async () => {
    expect(await solicitudes(tAjeno)).toEqual([]);
  });

  it('sin sesión la función no se puede ni ejecutar', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/solicitudes_de_vinculacion`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(r.ok).toBe(false);
  });

  it('quien pide entrar no ve la solicitud de los demás', async () => {
    // La política `solicitud_propia_select` le deja ver la SUYA en la tabla,
    // pero la función es para quien decide: él no decide nada.
    expect(await solicitudes(tColega)).toEqual([]);
  });

  it('aprobar vincula, avisa y deja constancia de quién aprobó', async () => {
    const [pendiente] = (await solicitudes(tDueno)).filter((s) => s.email === COLEGA.email);
    const r = await resolver(tDueno, pendiente.id, true);
    expect(r.ok).toBe(true);

    const [p] = await fetch(`${API}/rest/v1/profiles?select=company_id`, { headers: auth(tColega) })
      .then((x) => x.json());
    expect(p.company_id).toBe(companyId);

    const resuelta = (await solicitudes(tDueno)).find((s) => s.email === COLEGA.email);
    expect(resuelta?.estado).toBe('APROBADA');
    expect(resuelta?.resuelta_por?.toUpperCase()).toContain('ROCÍO');

    const avisos = await fetch(
      `${API}/rest/v1/notifications?select=title&order=created_at.desc&limit=1`,
      { headers: auth(tColega) },
    ).then((x) => x.json());
    expect(avisos[0]?.title).toBe('Vinculación aprobada');
  });

  it('rechazar avisa y NO vincula', async () => {
    const [pendiente] = (await solicitudes(tDueno)).filter((s) => s.email === SEGUNDO.email);
    const r = await resolver(tDueno, pendiente.id, false);
    expect(r.ok).toBe(true);

    const [p] = await fetch(`${API}/rest/v1/profiles?select=company_id`, { headers: auth(tSegundo) })
      .then((x) => x.json());
    expect(p.company_id).toBeNull();

    const avisos = await fetch(
      `${API}/rest/v1/notifications?select=title&order=created_at.desc&limit=1`,
      { headers: auth(tSegundo) },
    ).then((x) => x.json());
    expect(avisos[0]?.title).toBe('Vinculación rechazada');
  });

  it('una solicitud ya resuelta no se puede resolver dos veces', async () => {
    const ya = (await solicitudes(tDueno)).find((s) => s.email === COLEGA.email);
    const r = await resolver(tDueno, ya!.id, true);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toContain('ALREADY_RESOLVED');
  });

  it('una rechazada se puede reabrir, y vuelve a quedar pendiente', async () => {
    // El agujero que dejaba la pantalla de aprobación: rechazar era
    // definitivo, porque la solicitud solo la crea el disparador de alta.
    const rechazada = (await solicitudes(tDueno)).find((s) => s.email === SEGUNDO.email);
    expect(rechazada?.estado).toBe('RECHAZADA');

    const r = await reabrir(tDueno, rechazada!.id);
    expect(r.ok).toBe(true);

    const otra_vez = (await solicitudes(tDueno)).find((s) => s.email === SEGUNDO.email);
    expect(otra_vez?.estado).toBe('PENDIENTE');
    // La fila es la MISMA: conserva su id y su fecha original, para que quien
    // vuelva a decidir vea que a esta persona ya la habían rechazado.
    expect(otra_vez?.id).toBe(rechazada!.id);
    expect(otra_vez?.resuelta_por).toBeNull();

    const avisos = await fetch(
      `${API}/rest/v1/notifications?select=title&order=created_at.desc&limit=1`,
      { headers: auth(tSegundo) },
    ).then((x) => x.json());
    expect(avisos[0]?.title).toContain('revisando de nuevo');
  });

  it('reabrir dos veces no se puede: ya está pendiente', async () => {
    const pendiente = (await solicitudes(tDueno)).find((s) => s.email === SEGUNDO.email);
    const r = await reabrir(tDueno, pendiente!.id);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toContain('NOT_REJECTED');
  });

  it('una APROBADA no se reabre: para eso está dar de baja al miembro', async () => {
    const aprobada = (await solicitudes(tDueno)).find((s) => s.email === COLEGA.email);
    expect(aprobada?.estado).toBe('APROBADA');
    const r = await reabrir(tDueno, aprobada!.id);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toContain('NOT_REJECTED');
  });

  it('un ajeno no puede reabrir nada', async () => {
    const alguna = (await solicitudes(tDueno))[0];
    const r = await reabrir(tAjeno, alguna.id);
    expect(r.ok).toBe(false);
  });

  it('y la reabierta se puede aprobar como cualquier otra', async () => {
    const pendiente = (await solicitudes(tDueno)).find((s) => s.email === SEGUNDO.email);
    const r = await resolver(tDueno, pendiente!.id, true);
    expect(r.ok).toBe(true);

    const [p] = await fetch(`${API}/rest/v1/profiles?select=company_id`, { headers: auth(tSegundo) })
      .then((x) => x.json());
    expect(p.company_id).toBe(companyId);
  });

  it.skipIf(!SERVICE)('un dueño DADO DE BAJA ya no puede vincular a nadie', async () => {
    const admin = clienteDeServicio(API, SERVICE);

    // Hace falta una solicitud viva: se aprovecha la del colega, que ya se
    // aprobó, creando una nueva a mano con la llave de servicio.
    const { data: creada } = await admin
      .from('company_join_requests')
      .insert({ company_id: companyId, user_id: idColega, requested_nit: NIT })
      .select('id')
      .single();

    const { data: perfil } = await admin
      .from('profiles').select('id').eq('email', DUENO.email).single();

    await admin.from('company_members')
      .update({ status: 'INACTIVO' })
      .eq('company_id', companyId)
      .eq('user_id', (perfil as { id: string }).id);

    const r = await resolver(tDueno, (creada as { id: string }).id, true);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toContain('FORBIDDEN');

    // Y tampoco le sirve para espiar: el listado se le apaga igual.
    expect(await solicitudes(tDueno)).toEqual([]);

    await admin.from('company_members')
      .update({ status: 'ACTIVO' })
      .eq('company_id', companyId)
      .eq('user_id', (perfil as { id: string }).id);
  });

  it.skipIf(!SERVICE)('aprobar REACTIVA a un miembro que estaba desactivado', async () => {
    const admin = clienteDeServicio(API, SERVICE);

    // El colega ya es miembro (se aprobó arriba). Se le da de baja y se deja
    // una solicitud viva, que es el caso que antes dejaba la solicitud
    // APROBADA y a la persona fuera.
    await admin.from('company_members')
      .update({ status: 'INACTIVO' })
      .eq('company_id', companyId).eq('user_id', idColega);

    const { data: pend } = await admin
      .from('company_join_requests')
      .select('id').eq('company_id', companyId).eq('user_id', idColega)
      .eq('status', 'PENDIENTE').single();

    const r = await resolver(tDueno, (pend as { id: string }).id, true);
    expect(r.ok).toBe(true);

    const { data: miembro } = await admin
      .from('company_members').select('status, company_role')
      .eq('company_id', companyId).eq('user_id', idColega).single();
    expect((miembro as { status: string }).status).toBe('ACTIVO');
  });
});
