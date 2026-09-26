import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Clientes persona natural: es una función porque la RLS de `user_roles` dejaría
 * vacía la lista a un asesor. Excluye personal interno y personas con empresa; vedada a clientes.
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

const ASESOR = { email: 'asesor@pintuco.demo', password: 'pintuco2025*' };
const CLIENTE = { email: 'ana.torres@edificarplus.com', password: 'pintuco2025*' };
const PERSONAL = [
  'admin@pintuco.demo', 'asesor@pintuco.demo',
  'tecnico@pintuco.demo', 'admin@colorlink.com',
];

interface Persona {
  id: string; nombre: string | null; correo: string | null;
  ciudad: string | null; segmento: string | null;
  documento: string | null; foto_url: string | null; pedidos: number;
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

const disponible = await hayInstancia();

describe.skipIf(!disponible || !SERVICE)('Clientes persona natural', () => {
  let asesor: SupabaseClient;
  let cliente: SupabaseClient;
  let root: SupabaseClient;
  let visitante: SupabaseClient;
  let personas: Persona[] = [];

  beforeAll(async () => {
    root = createClient(API, SERVICE, { auth: { persistSession: false } });
    visitante = createClient(API, ANON, { auth: { persistSession: false } });

    asesor = createClient(API, ANON, { auth: { persistSession: false } });
    const a = await asesor.auth.signInWithPassword(ASESOR);
    if (a.error) throw new Error(`asesor: ${a.error.message}`);

    cliente = createClient(API, ANON, { auth: { persistSession: false } });
    const c = await cliente.auth.signInWithPassword(CLIENTE);
    if (c.error) throw new Error(`cliente: ${c.error.message}`);

    const { data, error } = await asesor.rpc('clientes_personas_naturales');
    if (error) throw new Error(`lista: ${error.message}`);
    personas = (data ?? []) as Persona[];
  });

  afterAll(async () => {
    await asesor.auth.signOut();
    await cliente.auth.signOut();
  });

  it('un asesor, que no es administrador, recibe la lista', async () => {
    // Si da 0, alguien la reescribió como consulta directa contra `user_roles`.
    expect(personas.length).toBeGreaterThan(0);
  });

  it('no se cuela ni una cuenta del personal interno', () => {
    const colados = personas
      .map((p) => p.correo)
      .filter((c): c is string => !!c && PERSONAL.includes(c));
    expect(colados, `personal en la lista de clientes: ${colados.join(', ')}`)
      .toHaveLength(0);
  });

  it('todas son personas SIN empresa', async () => {
    // Un empleado se ve dentro de su empresa; listarlo suelto lo contaría dos veces.
    const ids = personas.map((p) => p.id);
    const { data } = await root
      .from('profiles').select('id, company_id').in('id', ids.slice(0, 200));
    for (const f of (data ?? []) as Array<{ id: string; company_id: string | null }>) {
      expect(f.company_id, `el perfil ${f.id} tiene empresa`).toBeNull();
    }
  });

  it('todas tienen rol de cliente', async () => {
    const ids = personas.map((p) => p.id);
    const { data } = await root
      .from('user_roles').select('user_id, role').in('user_id', ids.slice(0, 200));
    const porUsuario = new Map<string, string[]>();
    for (const r of (data ?? []) as Array<{ user_id: string; role: string }>) {
      porUsuario.set(r.user_id, [...(porUsuario.get(r.user_id) ?? []), r.role]);
    }
    for (const id of ids.slice(0, 200)) {
      const roles = porUsuario.get(id) ?? [];
      expect(roles.some((r) => r === 'CLIENTE' || r === 'CLIENTE_B2B'), `${id}: ${roles}`)
        .toBe(true);
    }
  });

  it('un cliente NO puede listar a los demás clientes', async () => {
    const { data, error } = await cliente.rpc('clientes_personas_naturales');
    // La función filtra con `is_staff()` en el `where`: devuelve vacío, no error.
    expect(error ? [] : (data ?? [])).toHaveLength(0);
  });

  it('sin sesión no devuelve nada', async () => {
    const { data, error } = await visitante.rpc('clientes_personas_naturales');
    expect(error ? [] : (data ?? [])).toHaveLength(0);
  });

  it('la búsqueda por nombre acota la lista', async () => {
    const alguien = personas.find((p) => (p.nombre ?? '').trim().length > 3);
    expect(alguien).toBeTruthy();
    const primerNombre = (alguien!.nombre as string).split(' ')[0];

    const { data } = await asesor.rpc('clientes_personas_naturales', {
      _busqueda: primerNombre.toLowerCase(),
    });
    const filas = (data ?? []) as Persona[];
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.length).toBeLessThanOrEqual(personas.length);
    for (const f of filas) {
      expect((f.nombre ?? '').toUpperCase()).toContain(primerNombre.toUpperCase());
    }
  });

  it('la búsqueda por documento funciona con puntos y sin ellos', async () => {
    const conDoc = personas.find((p) => (p.documento ?? '').length >= 6);
    if (!conDoc) return; // Hoy casi nadie tiene documento cargado.
    const doc = conDoc.documento as string;

    const { data: exacto } = await asesor.rpc('clientes_personas_naturales', { _busqueda: doc });
    expect((exacto ?? []).length).toBeGreaterThan(0);

    // Con puntos, como lo escribe una persona.
    const conPuntos = doc.replace(/(\d{3})(?=\d)/g, '$1.');
    const { data: puntos } = await asesor.rpc('clientes_personas_naturales', {
      _busqueda: conPuntos,
    });
    expect((puntos ?? []).map((p: Persona) => p.documento)).toContain(doc);
  });

  it('trae la foto y el número de pedidos, que es lo que pinta la tarjeta', () => {
    for (const p of personas) {
      expect(p).toHaveProperty('foto_url');
      expect(Number.isFinite(Number(p.pedidos))).toBe(true);
      expect(Number(p.pedidos)).toBeGreaterThanOrEqual(0);
    }
  });
});
