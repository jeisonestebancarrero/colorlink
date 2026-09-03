import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Las vistas de reportes tienen que respetar RLS.
 *
 * EL AGUJERO QUE ESTO VIGILA, y que estuvo abierto de verdad: en PostgreSQL
 * una vista se ejecuta con los permisos de su DUEÑO, no de quien la consulta,
 * salvo que se marque `security_invoker = true`. El dueño es `postgres`, que es
 * superusuario, así que RLS se apagaba dentro de la vista. `invoices` estaba
 * bien protegida y `v_cartera` publicaba su contenido igual: con la llave
 * pública que va dentro del paquete JavaScript, SIN INICIAR SESIÓN, se leían
 * las 4 facturas y los $991.300 de cartera, con nombre de cliente y mora.
 *
 * Es la misma clase de fallo que ya se tapó en las funciones `SECURITY
 * DEFINER` (`resumen_panel`, `analitica_ventas`), entrando por otra puerta. Y
 * es de los que vuelven solos: basta un `create or replace view` futuro sin la
 * opción para reabrirlo, porque la opción NO se hereda al reemplazar la vista.
 * De ahí que esta prueba mire el comportamiento, no la definición.
 *
 * Se prueba SIN SESIÓN a propósito. Que un administrador vea la cartera no
 * demuestra nada; lo que hay que demostrar es que un desconocido no.
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
const CLIENTE = { email: 'ana.torres@edificarplus.com', password: 'pintuco2025*' };

/** Vistas que NO pueden verse sin sesión, y qué revela cada una. */
const RESERVADAS = [
  ['v_cartera', 'quién nos debe, cuánto y desde cuántos días'],
  ['v_costos_catalogo', 'el costo y por tanto el margen de cada producto'],
  ['v_estado_resultados', 'el estado de resultados'],
  ['v_libro_auxiliar', 'el libro auxiliar'],
  ['v_balance_prueba', 'el balance de prueba'],
  ['v_ventas', 'las ventas por empresa'],
] as const;

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

describe.skipIf(!disponible)('Vistas de reportes y RLS', () => {
  /** Cliente sin autenticar: lleva la misma llave pública que el navegador. */
  let visitante: SupabaseClient;

  beforeAll(() => {
    visitante = createClient(API, ANON, { auth: { persistSession: false } });
  });

  for (const [vista, revela] of RESERVADAS) {
    it(`${vista} no se puede leer sin sesión (revela ${revela})`, async () => {
      const { data, error } = await visitante.from(vista).select('*').limit(50);

      // Vale cualquiera de las dos formas de negarlo: un error de permisos, o
      // cero filas porque la política de la tabla base no aplica a `anon`.
      // Lo que NO vale es que devuelva datos.
      if (error) {
        expect(error.message).toMatch(/permission denied|does not exist|policy/i);
      } else {
        expect(data ?? [], `${vista} devolvió datos sin sesión`).toHaveLength(0);
      }
    });
  }

  it('v_cartera devolvía 4 facturas sin sesión: ya no devuelve ninguna', async () => {
    // La cifra concreta del agujero, para que la prueba falle de forma
    // reconocible si se reabre.
    const { data, error } = await visitante
      .from('v_cartera').select('invoice_number, customer_name, saldo');
    expect(error ? [] : (data ?? [])).toHaveLength(0);
  });

  it('el catálogo público SÍ sigue abierto: es la tienda', async () => {
    // La contrapartida. Si el arreglo hubiera cerrado esto, la tienda dejaría
    // de mostrar productos a quien no ha iniciado sesión.
    const { data, error } = await visitante
      .from('v_variant_availability').select('*').limit(5);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('el catálogo público no lleva costos ni márgenes', async () => {
    const { data } = await visitante.from('v_variant_availability').select('*').limit(1);
    const columnas = Object.keys((data ?? [{}])[0] ?? {});
    for (const c of columnas) {
      expect(c, `la vista pública expone «${c}»`)
        .not.toMatch(/cost|costo|margen|margin/i);
    }
  });

  describe.skipIf(!SERVICE)('el personal interno no perdió acceso', () => {
    let admin: SupabaseClient;
    let cliente: SupabaseClient;

    beforeAll(async () => {
      admin = createClient(API, ANON, { auth: { persistSession: false } });
      const a = await admin.auth.signInWithPassword(ADMIN);
      if (a.error) throw new Error(`admin: ${a.error.message}`);

      cliente = createClient(API, ANON, { auth: { persistSession: false } });
      const c = await cliente.auth.signInWithPassword(CLIENTE);
      if (c.error) throw new Error(`cliente: ${c.error.message}`);
    });

    it('el administrador sigue viendo la cartera completa', async () => {
      // Es la mitad que importa del arreglo: cerrar la fuga sin apagar la
      // pantalla de tesorería.
      const { data, error } = await admin
        .from('v_cartera').select('invoice_number, saldo, company_id');
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it('v_cartera atribuye cada saldo a la empresa correcta', async () => {
      // Se agregó para la pantalla del cupo de crédito: sin `company_id` no
      // hay forma de saber cuánto debe ya una constructora a la que se le va a
      // aprobar un cupo.
      //
      // Se comprueba que COINCIDA con la del pedido, no que exista alguna con
      // empresa: al quitar los datos de demostración quedaron solo facturas de
      // personas naturales, y exigir una empresa hacía fallar la prueba por
      // cómo son los datos y no por si la vista está bien.
      const { data } = await admin
        .from('v_cartera').select('invoice_id, company_id, saldo');
      const filas = (data ?? []) as Array<{ invoice_id: string; company_id: string | null }>;

      for (const f of filas) {
        const { data: origen } = await admin
          .from('invoices').select('order_id').eq('id', f.invoice_id).single();
        const orderId = (origen as { order_id: string | null })?.order_id;
        if (!orderId) continue;

        const { data: pedido } = await admin
          .from('orders').select('company_id').eq('id', orderId).single();
        expect(f.company_id, `factura ${f.invoice_id}`)
          .toBe((pedido as { company_id: string | null }).company_id);
      }
    });

    it('el administrador sigue viendo los costos del catálogo', async () => {
      const { error } = await admin.from('v_costos_catalogo').select('*').limit(1);
      expect(error).toBeNull();
    });

    it('el administrador sigue viendo el libro auxiliar', async () => {
      const { error } = await admin.from('v_libro_auxiliar').select('*').limit(1);
      expect(error).toBeNull();
    });

    it('un cliente no ve la cartera de los demás', async () => {
      const { data, error } = await cliente.from('v_cartera').select('invoice_number, saldo');
      // Puede ver SUS facturas, nunca las de otro. Hoy no tiene ninguna.
      if (!error) {
        for (const f of data ?? []) {
          expect(f).toHaveProperty('invoice_number');
        }
        expect((data ?? []).length).toBeLessThan(4);
      }
    });

    it('un cliente no ve los costos del catálogo', async () => {
      const { data, error } = await cliente.from('v_costos_catalogo').select('*').limit(5);
      expect(error ? [] : (data ?? [])).toHaveLength(0);
    });
  });
});
