import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { limpiarCuentasDePrueba } from './limpieza';

/**
 * Normalización de nombres, direcciones, documentos y teléfonos.
 *
 * Lo que se vigila:
 *   1. Que el mismo dato se guarde siempre igual, escríbalo quien lo escriba:
 *      nombres y direcciones en mayúsculas, documento sin puntos, teléfono con
 *      indicativo.
 *   2. **Que normalizar no rompa las búsquedas.** Es el defecto que ya ocurrió:
 *      al guardar el NIT sin puntos, el alta seguía buscando la empresa con el
 *      NIT tal como se escribió, no la encontraba, y quien se registraba con
 *      el NIT de una empresa existente perdía el registro entero en vez de
 *      quedar con una solicitud de vinculación. Cualquier comparación contra
 *      una columna normalizada tiene que normalizar los dos lados.
 *
 * La prueba deja la base como la encontró.
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

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const disponible = await hayInstancia();

describe.skipIf(!disponible || !SERVICE)('Normalización de datos', () => {
  let admin: SupabaseClient;
  const usuariosCreados: string[] = [];
  const empresasCreadas: string[] = [];

  /** Ejecuta una función SQL de normalización y devuelve su resultado. */
  const norm = async (fn: string, args: Record<string, unknown>): Promise<string | null> => {
    const { data, error } = await admin.rpc(fn, args);
    expect(error).toBeNull();
    return data as string | null;
  };

  const signup = async (
    email: string, metadata: Record<string, string>
  ): Promise<{ ok: boolean; mensaje?: string }> => {
    const r = await fetch(`${API}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'pintuco2025*', data: metadata }),
    });
    const j = await r.json();
    return { ok: Boolean(j.access_token), mensaje: j.msg ?? j.message };
  };

  beforeAll(() => {
    admin = createClient(API, SERVICE, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    // Primero lo que se recogió por el camino, que es lo más específico.
    for (const id of empresasCreadas) {
      await admin.from('company_branches').delete().eq('company_id', id);
      await admin.from('company_join_requests').delete().eq('company_id', id);
      await admin.from('company_members').delete().eq('company_id', id);
      await admin.from('companies').delete().eq('id', id);
    }
    for (const id of usuariosCreados) {
      await admin.from('customer_addresses').delete().eq('user_id', id);
      await admin.from('notifications').delete().eq('user_id', id);
      await admin.from('user_roles').delete().eq('user_id', id);
      await admin.from('profiles').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }

    // Y después una pasada por PATRÓN, que es la que de verdad garantiza que
    // no quede nada: varias cuentas se crean DENTRO de un `it`, así que si
    // ese `it` falla antes de registrar el id, la lista de arriba no las
    // incluye y se quedaban en la base para siempre.
    await limpiarCuentasDePrueba(admin, sello);
  });

  // ----------------------------------------------------------
  // Las funciones
  // ----------------------------------------------------------
  it('el documento queda sin puntos, como lo pide la DIAN', async () => {
    expect(await norm('normalizar_documento', { _numero: '71.234.567' })).toBe('71234567');
    expect(await norm('normalizar_documento', { _numero: '1.020.304.050' })).toBe('1020304050');
    expect(await norm('normalizar_documento', { _numero: '  71 234 567 ' })).toBe('71234567');
  });

  it('el NIT conserva el guion del dígito de verificación', async () => {
    // El guion sí significa algo: separa el NIT del DV. Quitarlo cambiaría el
    // número.
    expect(await norm('normalizar_documento', { _numero: '900.123.456-7' })).toBe('900123456-7');
  });

  it('nombres y direcciones quedan en mayúsculas, sin espacios de sobra', async () => {
    expect(await norm('normalizar_texto_mayusculas', { _texto: '  carlos   mendoza  ' }))
      .toBe('CARLOS MENDOZA');
    expect(await norm('normalizar_texto_mayusculas', { _texto: 'Cra 43A # 18 sur - 135' }))
      .toBe('CRA 43A # 18 SUR - 135');
    // Los acentos se conservan: MEDELLÍN no es MEDELLIN.
    expect(await norm('normalizar_texto_mayusculas', { _texto: 'medellín' })).toBe('MEDELLÍN');
    expect(await norm('normalizar_texto_mayusculas', { _texto: '   ' })).toBeNull();
  });

  it('el teléfono queda con indicativo, sin duplicarlo', async () => {
    const tel = (n: string) => norm('normalizar_telefono', { _numero: n });
    expect(await tel('300 123 4567')).toBe('+573001234567');
    expect(await tel('3001234567')).toBe('+573001234567');
    // Ya traía el 57 pero sin el '+': no se le pone otro.
    expect(await tel('57 300 123 4567')).toBe('+573001234567');
    expect(await tel('+57 300 1234567')).toBe('+573001234567');
    // Cero de marcación nacional.
    expect(await tel('03001234567')).toBe('+573001234567');
    // Fijo de Medellín.
    expect(await tel('(604) 384 8484')).toBe('+576043848484');
    expect(await tel('')).toBeNull();
  });

  it('un número de otro país NO recibe el +57', async () => {
    // Quien escribe '+' está diciendo el país. Imponerle Colombia dejaría el
    // número inservible.
    expect(await norm('normalizar_telefono', { _numero: '+1 305 555 1212' }))
      .toBe('+13055551212');
    expect(await norm('normalizar_telefono', { _numero: '+34 600 123 456' }))
      .toBe('+34600123456');
  });

  // ----------------------------------------------------------
  // Que normalizar no rompa las búsquedas
  // ----------------------------------------------------------
  it('el aviso de documento repetido funciona aunque se escriba con puntos', async () => {
    const documento = String(sello).slice(-9);
    const email = `norm.doc.${sello}@correo.test`;

    const alta = await signup(email, {
      first_name: 'Diego', last_name: 'Pruebas', client_type: 'Particular',
      document_type: 'CC', document_number: documento, phone: '3001112222',
    });
    expect(alta.ok).toBe(true);

    const { data: perfil } = await admin
      .from('profiles').select('id, document_number, first_name, phone')
      .eq('email', email).single();
    const p = perfil as { id: string; document_number: string; first_name: string; phone: string };
    usuariosCreados.push(p.id);

    // Guardado normalizado.
    expect(p.document_number).toBe(documento);
    expect(p.first_name).toBe('DIEGO');
    expect(p.phone).toBe('+573001112222');

    // Y se encuentra escribiéndolo CON puntos, que es como lo escribe la gente.
    const conPuntos = documento.replace(/(\d{3})(?=\d)/g, '$1.');
    const { data: tomado } = await admin.rpc('documento_ya_registrado', {
      _tipo: 'CC', _numero: conPuntos,
    });
    expect(tomado).toBe(true);
  });

  it('REGRESIÓN: registrarse con el NIT de una empresa existente deja solicitud, no revienta', async () => {
    const nitCrudo = `901.${String(sello).slice(-6)}-3`;
    const emailDueno = `norm.dueno.${sello}@correo.test`;
    const emailColega = `norm.colega.${sello}@correo.test`;

    const alta1 = await signup(emailDueno, {
      first_name: 'Dueño', last_name: 'Empresa', client_type: 'Constructor',
      company: `Constructora Normalizada ${sello}`, company_nit: nitCrudo,
      phone: '3002223333',
    });
    expect(alta1.ok).toBe(true);

    const { data: p1 } = await admin
      .from('profiles').select('id, company_id').eq('email', emailDueno).single();
    const dueno = p1 as { id: string; company_id: string };
    usuariosCreados.push(dueno.id);
    empresasCreadas.push(dueno.company_id);

    // El NIT quedó sin puntos.
    const { data: emp } = await admin
      .from('companies').select('nit, name').eq('id', dueno.company_id).single();
    const empresa = emp as { nit: string; name: string };
    expect(empresa.nit).toBe(`901${String(sello).slice(-6)}-3`);
    expect(empresa.name).toBe(`CONSTRUCTORA NORMALIZADA ${sello}`);

    // Ahora un colega se registra con el MISMO NIT, escrito CON puntos.
    // Antes del arreglo esto reventaba el alta: la búsqueda comparaba el texto
    // crudo contra la columna normalizada, no encontraba la empresa, intentaba
    // crear otra y chocaba con el índice único del NIT.
    const alta2 = await signup(emailColega, {
      first_name: 'Colega', last_name: 'Nuevo', client_type: 'Constructor',
      company: `Constructora Normalizada ${sello}`, company_nit: nitCrudo,
      phone: '3004445555',
    });
    expect(alta2.ok, `el alta del colega falló: ${alta2.mensaje}`).toBe(true);

    const { data: p2 } = await admin
      .from('profiles').select('id, company_id').eq('email', emailColega).single();
    const colega = p2 as { id: string; company_id: string | null };
    usuariosCreados.push(colega.id);

    // No se le dio acceso a la empresa: queda pendiente de aprobación.
    expect(colega.company_id).toBeNull();

    const { data: solicitudes } = await admin
      .from('company_join_requests').select('company_id, user_id')
      .eq('user_id', colega.id);
    expect(solicitudes ?? []).toHaveLength(1);
    expect((solicitudes as Array<{ company_id: string }>)[0].company_id)
      .toBe(dueno.company_id);

    // Y sigue habiendo UNA sola empresa con ese NIT.
    const { count } = await admin
      .from('companies').select('id', { count: 'exact', head: true })
      .eq('nit', empresa.nit);
    expect(count).toBe(1);
  });

  it('el registro con dirección crea la dirección principal, normalizada', async () => {
    const email = `norm.dir.${sello}@correo.test`;
    const alta = await signup(email, {
      first_name: 'Ana', last_name: 'Dirección', client_type: 'Particular',
      document_type: 'CC', document_number: `${String(sello).slice(-8)}1`,
      phone: '3005556666',
      country_code: 'CO', municipality_code: '05001',
      address: 'cra 43a # 18   sur - 135, apto 501',
    });
    expect(alta.ok, alta.mensaje).toBe(true);

    const { data: perfil } = await admin
      .from('profiles').select('id, city, municipality_code, address')
      .eq('email', email).single();
    const p = perfil as {
      id: string; city: string; municipality_code: string; address: string;
    };
    usuariosCreados.push(p.id);

    // La ciudad se deriva del municipio oficial, no del texto que llegue.
    expect(p.municipality_code).toBe('05001');
    expect(p.city).toBe('MEDELLÍN');
    expect(p.address).toBe('CRA 43A # 18 SUR - 135, APTO 501');

    // Y quedó su dirección principal, lista para que el carrito la proponga.
    const { data: dirs } = await admin
      .from('customer_addresses')
      .select('address_line, municipality_code, is_default')
      .eq('user_id', p.id);
    const direcciones = (dirs ?? []) as Array<{
      address_line: string; municipality_code: string; is_default: boolean;
    }>;
    expect(direcciones).toHaveLength(1);
    expect(direcciones[0].address_line).toBe('CRA 43A # 18 SUR - 135, APTO 501');
    expect(direcciones[0].municipality_code).toBe('05001');
    expect(direcciones[0].is_default).toBe(true);
  });

  it('una empresa que se registra con dirección queda con su sede principal', async () => {
    const email = `norm.sede.${sello}@correo.test`;
    const alta = await signup(email, {
      first_name: 'Jorge', last_name: 'Sedes', client_type: 'Constructor',
      company: `Sedes Automáticas ${sello}`, company_nit: `902.${String(sello).slice(-6)}-4`,
      phone: '3007778888',
      country_code: 'CO', municipality_code: '11001',
      address: 'av cl 127 # 15 - 40',
    });
    expect(alta.ok, alta.mensaje).toBe(true);

    const { data: perfil } = await admin
      .from('profiles').select('id, company_id').eq('email', email).single();
    const p = perfil as { id: string; company_id: string };
    usuariosCreados.push(p.id);
    empresasCreadas.push(p.company_id);

    const { data: sedes } = await admin
      .from('company_branches')
      .select('name, address_line, municipality_code, contact_name, contact_phone, is_default')
      .eq('company_id', p.company_id);
    const s = (sedes ?? []) as Array<Record<string, unknown>>;
    expect(s).toHaveLength(1);
    expect(s[0].name).toBe('SEDE PRINCIPAL');
    expect(s[0].address_line).toBe('AV CL 127 # 15 - 40');
    expect(s[0].municipality_code).toBe('11001');
    expect(s[0].contact_name).toBe('JORGE SEDES');
    expect(s[0].contact_phone).toBe('+573007778888');
    expect(s[0].is_default).toBe(true);
  });

  it('el barrio no se duplica por mayúsculas ni por espacios', async () => {
    // Es lo que hace que el segundo cliente de un municipio ELIJA el barrio en
    // lugar de volver a escribirlo con otra caja.
    const { data: cli } = await admin.auth.admin.createUser({
      email: `norm.barrio.${sello}@correo.test`,
      password: 'pintuco2025*',
      email_confirm: true,
      user_metadata: { first_name: 'Barrio', last_name: 'Prueba' },
    });
    const uid = cli.user?.id as string;
    usuariosCreados.push(uid);

    const sesion = createClient(API, ANON, { auth: { persistSession: false } });
    await sesion.auth.signInWithPassword({
      email: `norm.barrio.${sello}@correo.test`, password: 'pintuco2025*',
    });

    const nombre = `Barrio Prueba ${sello}`;
    const uno = await sesion.rpc('registrar_barrio', {
      _municipality_code: '05001', _nombre: nombre,
    });
    expect(uno.error).toBeNull();

    // Las tres variantes tienen que devolver el MISMO id.
    for (const variante of [nombre.toUpperCase(), nombre.toLowerCase(), `  ${nombre}  `]) {
      const otro = await sesion.rpc('registrar_barrio', {
        _municipality_code: '05001', _nombre: variante,
      });
      expect(otro.error).toBeNull();
      expect(otro.data).toBe(uno.data);
    }

    const { count } = await admin
      .from('neighborhoods').select('id', { count: 'exact', head: true })
      .eq('municipality_code', '05001').ilike('name', nombre);
    expect(count).toBe(1);

    await admin.from('neighborhoods').delete().eq('id', uno.data as string);
    await sesion.auth.signOut();
  });
});
