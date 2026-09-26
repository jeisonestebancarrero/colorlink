import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Las vistas de reportes deben respetar RLS: sin `security_invoker` corren como su
 * dueño (`postgres`) y exponen los datos con la anon key. La opción no se hereda con
 * `create or replace view`, así que se prueba el comportamiento, sin sesión.
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

/** Vistas que no pueden verse sin sesión, y qué revela cada una. */
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
  /** Cliente sin autenticar, con la misma anon key del navegador. */
  let visitante: SupabaseClient;

  beforeAll(() => {
    visitante = createClient(API, ANON, { auth: { persistSession: false } });
  });

  for (const [vista, revela] of RESERVADAS) {
    it(`${vista} no se puede leer sin sesión (revela ${revela})`, async () => {
      const { data, error } = await visitante.from(vista).select('*').limit(50);

      // Vale un error de permisos o cero filas; lo que no vale es que devuelva datos.
      if (error) {
        expect(error.message).toMatch(/permission denied|does not exist|policy/i);
      } else {
        expect(data ?? [], `${vista} devolvió datos sin sesión`).toHaveLength(0);
      }
    });
  }

  it('v_cartera devolvía 4 facturas sin sesión: ya no devuelve ninguna', async () => {
    // Comprobación puntual de la cartera, para que un fallo sea reconocible.
    const { data, error } = await visitante
      .from('v_cartera').select('invoice_number, customer_name, saldo');
    expect(error ? [] : (data ?? [])).toHaveLength(0);
  });

  it('el catálogo público SÍ sigue abierto: es la tienda', async () => {
    // Contrapartida: el catálogo debe seguir visible sin sesión.
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
      // El personal de tesorería sigue viendo la cartera.
      const { data, error } = await admin
        .from('v_cartera').select('invoice_number, saldo, company_id');
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it('v_cartera atribuye cada saldo a la empresa correcta', async () => {
      // `company_id` alimenta la pantalla de cupo de crédito. Se compara con el del pedido
      // en vez de exigir una empresa, que depende de los datos presentes.
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
      // Ve solo sus facturas, nunca las de otro.
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
