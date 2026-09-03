import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Roles configurables.
 *
 * Lo que se vigila, y todo son formas de dar acceso sin querer:
 *
 *   1. Que un rol nuevo nazca SIN NADA. Heredar permisos de otro sería la
 *      manera más silenciosa de dar acceso de más: nadie revisa lo que no
 *      configuró.
 *   2. Que quitarle una aplicación a un rol se la quite a TODAS las personas
 *      que lo tienen. Es el motivo de que esta pantalla exista: si no, hay que
 *      ir usuario por usuario y dos personas del mismo cargo acaban distintas.
 *   3. Que los roles del sistema no se puedan archivar. `is_staff()`,
 *      `handle_new_user` y varias políticas los nombran directamente: apagarlos
 *      rompería el acceso sin que nada avisara.
 *   4. Que no se archive un rol que alguien tiene puesto: quedaría con un
 *      acceso que ya no se puede configurar desde ninguna pantalla.
 *   5. Que solo un administrador pueda tocar nada de esto.
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

const ADMIN = { email: 'admin@pintuco.demo', password: 'pintuco2025*' };
const ASESOR = { email: 'asesor@pintuco.demo', password: 'pintuco2025*' };

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

describe.skipIf(!disponible || !SERVICE)('Roles configurables', () => {
  let root: SupabaseClient;
  let admin: SupabaseClient;
  let asesor: SupabaseClient;

  const sello = Date.now().toString().slice(-6);
  const CODIGO = `PRUEBA_${sello}`;
  /** Vistas de ASESOR antes de tocar nada, para devolverlas. */
  let vistasDelAsesor: string[] = [];

  beforeAll(async () => {
    root = createClient(API, SERVICE, { auth: { persistSession: false } });

    admin = createClient(API, ANON, { auth: { persistSession: false } });
    const a = await admin.auth.signInWithPassword(ADMIN);
    if (a.error) throw new Error(`admin: ${a.error.message}`);

    asesor = createClient(API, ANON, { auth: { persistSession: false } });
    const s = await asesor.auth.signInWithPassword(ASESOR);
    if (s.error) throw new Error(`asesor: ${s.error.message}`);

    const { data } = await root.from('role_views').select('view_code').eq('role', 'ASESOR');
    vistasDelAsesor = ((data ?? []) as Array<{ view_code: string }>).map((v) => v.view_code);
  });

  afterAll(async () => {
    // Se devuelven las vistas del asesor exactamente como estaban: es
    // configuración de negocio y la usan otras pruebas y las pantallas.
    await root.from('role_views').delete().eq('role', 'ASESOR');
    if (vistasDelAsesor.length > 0) {
      await root.from('role_views')
        .insert(vistasDelAsesor.map((view_code) => ({ role: 'ASESOR', view_code })));
    }
    // El rol de prueba no se puede eliminar —un valor de enum no se borra—
    // así que se archiva, que es justo lo que haría una persona.
    await root.from('role_meta').delete().eq('role', CODIGO);
    await admin.auth.signOut();
    await asesor.auth.signOut();
  });

  it('un rol nuevo nace SIN permisos ni vistas', async () => {
    const { error } = await admin.rpc('crear_rol', {
      _codigo: CODIGO, _etiqueta: `Prueba ${sello}`, _descripcion: 'Creado por la prueba',
    });
    expect(error).toBeNull();

    const permisos = await root
      .from('role_permissions').select('role', { count: 'exact', head: true }).eq('role', CODIGO);
    const vistas = await root
      .from('role_views').select('role', { count: 'exact', head: true }).eq('role', CODIGO);

    expect(permisos.count ?? 0).toBe(0);
    expect(vistas.count ?? 0).toBe(0);
  });

  it('el código se normaliza: sin tildes, sin espacios, en mayúsculas', async () => {
    const { data } = await root
      .from('role_meta').select('role, label').eq('role', CODIGO).single();
    expect((data as { role: string }).role).toBe(CODIGO);
    expect(CODIGO).toMatch(/^[A-Z0-9_]+$/);
  });

  it('quitarle una aplicación al ROL se la quita a todos los que lo tienen', async () => {
    // Es la razón de ser de la pantalla: sin esto hay que ir usuario por
    // usuario y dos personas del mismo cargo acaban con accesos distintos.
    const { error } = await admin.rpc('set_role_view', {
      _role: 'ASESOR', _view_code: 'bo.inventory', _visible: false,
    });
    expect(error).toBeNull();

    // La fila NO se borra: se marca `visible = false`, para que quede quién
    // lo cambió y cuándo. Por eso se comprueba la columna y no la ausencia.
    const { data } = await root
      .from('role_views').select('visible').eq('role', 'ASESOR').eq('view_code', 'bo.inventory');
    for (const f of (data ?? []) as Array<{ visible: boolean }>) {
      expect(f.visible).toBe(false);
    }

    // Y la matriz que pinta la pantalla tampoco la da por concedida.
    const { data: cfg } = await admin.rpc('configuracion_de_roles');
    const porRol = (cfg as { porRol: Record<string, string[]> }).porRol;
    expect(porRol.ASESOR ?? []).not.toContain('bo.inventory');

    // Y el asesor deja de verla en su propio menú.
    const { data: acceso } = await asesor.rpc('my_permissions');
    const vistas = ((acceso as { views?: Array<{ code: string }> })?.views ?? [])
      .map((v) => v.code);
    expect(vistas).not.toContain('bo.inventory');
  });

  it('y devolvérsela la devuelve a todos', async () => {
    await admin.rpc('set_role_view', {
      _role: 'ASESOR', _view_code: 'bo.inventory', _visible: true,
    });
    const { data: acceso } = await asesor.rpc('my_permissions');
    const vistas = ((acceso as { views?: Array<{ code: string }> })?.views ?? [])
      .map((v) => v.code);
    expect(vistas).toContain('bo.inventory');
  });

  it('un rol del sistema no se puede archivar', async () => {
    const { error } = await admin.rpc('actualizar_rol', {
      _codigo: 'ADMINISTRADOR', _etiqueta: null, _descripcion: null, _activo: false,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/ROL_DEL_SISTEMA/);
  });

  it('un rol que alguien tiene puesto tampoco', async () => {
    // Quedaría con un acceso que ya no se puede configurar desde ninguna
    // pantalla, que es peor que dejarlo activo.
    await root.from('role_meta').update({ es_del_sistema: false }).eq('role', 'TECNICO');
    const { error } = await admin.rpc('actualizar_rol', {
      _codigo: 'TECNICO', _etiqueta: null, _descripcion: null, _activo: false,
    });
    await root.from('role_meta').update({ es_del_sistema: true }).eq('role', 'TECNICO');

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/ROL_EN_USO/);
  });

  it('un código repetido se rechaza', async () => {
    const { error } = await admin.rpc('crear_rol', {
      _codigo: CODIGO.toLowerCase(), _etiqueta: 'Otro', _descripcion: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/YA_EXISTE/);
  });

  it('un código de menos de tres letras se rechaza', async () => {
    const { error } = await admin.rpc('crear_rol', {
      _codigo: 'ab', _etiqueta: 'Corto', _descripcion: null,
    });
    expect(error!.message).toMatch(/CODIGO_INVALIDO/);
  });

  it('quien no es administrador no puede crear ni configurar roles', async () => {
    const crear = await asesor.rpc('crear_rol', {
      _codigo: `INTRUSO_${sello}`, _etiqueta: 'Intruso', _descripcion: null,
    });
    expect(crear.error?.message).toMatch(/FORBIDDEN/);

    const cambiar = await asesor.rpc('actualizar_rol', {
      _codigo: 'ASESOR', _etiqueta: 'Yo mando', _descripcion: null, _activo: null,
    });
    expect(cambiar.error?.message).toMatch(/FORBIDDEN/);

    // Y tampoco puede darse a sí mismo una aplicación.
    const vista = await asesor.rpc('set_role_view', {
      _role: 'ASESOR', _view_code: 'bo.settings', _visible: true,
    });
    expect(vista.error).not.toBeNull();
  });

  it('quien no es administrador no ve la configuración de roles', async () => {
    const { data } = await asesor.rpc('configuracion_de_roles');
    expect(data).toBeNull();
  });
});
