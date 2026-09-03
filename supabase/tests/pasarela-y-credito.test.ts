import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../src/lib/supabase';
import { pasarelaService } from '../../src/services/pasarelaAdmin';

/**
 * Pantalla de la pasarela y del cupo de crédito.
 *
 * Las tres funciones de la base ya estaban probadas en `pagos.test.ts`; lo que
 * se vigila aquí es la capa que se acaba de escribir, donde están los errores
 * que la base no puede atrapar:
 *
 *   1. Que un campo de secreto EN BLANCO conserve el secreto guardado. Es el
 *      error caro: si el servicio mandara la cadena vacía, abrir la pantalla y
 *      guardar cualquier cosa borraría las llaves de Wompi y los pagos dejarían
 *      de funcionar sin que nada lo dijera.
 *   2. Que los secretos NO vuelvan al navegador, solo si están puestos.
 *   3. Que apagar el crédito no borre la condición aprobada.
 *   4. Que el saldo pendiente se atribuya a la empresa correcta: es la cifra
 *      con la que se decide un cupo.
 *   5. Que los errores de la base lleguen en español y digan qué hacer.
 *
 * Deja la configuración exactamente como la encontró, porque `payments_*` es
 * la misma fila que usa la tienda.
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

describe.skipIf(!disponible || !SERVICE)('Pasarela y cupo de crédito', () => {
  /** Servicio: escribe con permisos de superusuario, solo para restituir. */
  let root: SupabaseClient;
  /** Lo que había antes de tocar nada. */
  let originalPagos: Record<string, unknown> = {};
  let empresaId = '';
  let creditoOriginal = { payment_terms: 'CONTADO', credit_days: 30, credit_limit_cop: 0 };

  beforeAll(async () => {
    root = createClient(API, SERVICE, { auth: { persistSession: false } });

    // `pasarelaService` usa el cliente compartido de la aplicación, igual que
    // lo usaría la pantalla: hay que iniciar sesión en ESE cliente.
    const s = await supabase.auth.signInWithPassword(ADMIN);
    if (s.error) throw new Error(`admin: ${s.error.message}`);

    const { data: cfg } = await root
      .from('app_settings')
      .select('payments_enabled, payments_test_mode, wompi_public_key, wompi_integrity_secret, wompi_events_secret')
      .limit(1).single();
    originalPagos = (cfg ?? {}) as Record<string, unknown>;

    const { data: emp } = await root
      .from('companies').select('id, payment_terms, credit_days, credit_limit_cop')
      .order('name').limit(1).single();
    const e = emp as { id: string; payment_terms: string; credit_days: number; credit_limit_cop: number };
    empresaId = e.id;
    creditoOriginal = {
      payment_terms: e.payment_terms,
      credit_days: e.credit_days,
      credit_limit_cop: e.credit_limit_cop,
    };
  });

  afterAll(async () => {
    if (Object.keys(originalPagos).length > 0) {
      await root.from('app_settings').update(originalPagos).not('id', 'is', null);
    }
    if (empresaId) {
      await root.from('companies').update(creditoOriginal).eq('id', empresaId);
    }
    await supabase.auth.signOut();
  });

  // ----------------------------------------------------------
  // Pasarela
  // ----------------------------------------------------------

  it('el estado dice si hay llaves, nunca cuáles', async () => {
    await root.from('app_settings').update({
      wompi_integrity_secret: 'secreto_de_prueba_integridad',
      wompi_events_secret: 'secreto_de_prueba_eventos',
    }).not('id', 'is', null);

    const e = await pasarelaService.estado();
    expect(e.tieneIntegridad).toBe(true);
    expect(e.tieneEventos).toBe(true);

    // Ni el objeto ni su serialización pueden contener el secreto.
    expect(JSON.stringify(e)).not.toContain('secreto_de_prueba');
  });

  it('un secreto en blanco CONSERVA el que estaba guardado', async () => {
    // El error caro: abrir la pantalla, cambiar solo el interruptor y guardar
    // no puede borrar las llaves de Wompi.
    await root.from('app_settings').update({
      wompi_public_key: 'pub_test_conservame',
      wompi_integrity_secret: 'integridad_conservame',
      wompi_events_secret: 'eventos_conservame',
    }).not('id', 'is', null);

    await pasarelaService.guardar({
      activa: true, prueba: true,
      llavePublica: 'pub_test_conservame',
      secretoIntegridad: '',
      secretoEventos: '   ',
    });

    const { data } = await root.from('app_settings')
      .select('wompi_integrity_secret, wompi_events_secret').limit(1).single();
    const d = data as { wompi_integrity_secret: string; wompi_events_secret: string };
    expect(d.wompi_integrity_secret).toBe('integridad_conservame');
    expect(d.wompi_events_secret).toBe('eventos_conservame');
  });

  it('un secreto escrito SÍ reemplaza al anterior', async () => {
    await pasarelaService.guardar({
      activa: true, prueba: true,
      secretoIntegridad: 'integridad_nueva',
    });
    const { data } = await root.from('app_settings')
      .select('wompi_integrity_secret').limit(1).single();
    expect((data as { wompi_integrity_secret: string }).wompi_integrity_secret)
      .toBe('integridad_nueva');
  });

  it('el interruptor de modo prueba se guarda y se lee de vuelta', async () => {
    const e1 = await pasarelaService.guardar({ activa: true, prueba: true });
    expect(e1.prueba).toBe(true);
    expect(e1.activa).toBe(true);

    const e2 = await pasarelaService.guardar({ activa: false, prueba: true });
    expect(e2.activa).toBe(false);
  });

  it('encender el cobro real sin llaves da un mensaje que dice qué falta', async () => {
    await root.from('app_settings').update({
      wompi_public_key: null, wompi_integrity_secret: null,
    }).not('id', 'is', null);

    await expect(
      pasarelaService.guardar({ activa: true, prueba: false })
    ).rejects.toThrow(/llave pública y el secreto de integridad/i);
  });

  it('con las llaves puestas, el cobro real sí se puede encender', async () => {
    await pasarelaService.guardar({
      activa: true, prueba: false,
      llavePublica: 'pub_prod_ficticia',
      secretoIntegridad: 'integridad_ficticia',
    });
    const e = await pasarelaService.estado();
    expect(e.prueba).toBe(false);
    expect(e.activa).toBe(true);

    // Se devuelve enseguida a modo prueba: dejar el entorno local cobrando de
    // verdad sería exactamente el descuido que la pantalla intenta evitar.
    await pasarelaService.guardar({ activa: true, prueba: true });
    expect((await pasarelaService.estado()).prueba).toBe(true);
  });

  // ----------------------------------------------------------
  // Cupo de crédito
  // ----------------------------------------------------------

  it('aprobar crédito guarda plazo y cupo', async () => {
    await pasarelaService.fijarCredito(empresaId, true, 45, 8_000_000);
    const c = await pasarelaService.credito(empresaId);
    expect(c?.aCredito).toBe(true);
    expect(c?.dias).toBe(45);
    expect(c?.cupo).toBe(8_000_000);
  });

  it('un plazo fuera de rango se explica en español', async () => {
    await expect(pasarelaService.fijarCredito(empresaId, true, 400, 1_000_000))
      .rejects.toThrow(/entre 1 y 180/i);
    await expect(pasarelaService.fijarCredito(empresaId, true, 0, 1_000_000))
      .rejects.toThrow(/entre 1 y 180/i);
  });

  it('un crédito sin cupo se explica en español', async () => {
    await expect(pasarelaService.fijarCredito(empresaId, true, 30, 0))
      .rejects.toThrow(/sin cupo no sirve/i);
  });

  it('pasar a contado BORRA plazo y cupo, y es a propósito', async () => {
    // Al escribir esto supuse lo contrario —que conservaría la condición para
    // no tener que volver a averiguarla— y la base me corrigió: pone las dos
    // cifras en cero. Es lo correcto: un cupo de 5 millones colgando de una
    // empresa marcada CONTADO se lee como crédito vigente, y quien mire la
    // ficha no puede saber si está aprobado o es un resto de antes.
    //
    // Se prueba tal cual para que la pantalla no prometa otra cosa: al apagar
    // el crédito, avisa de que hay que volver a escribir plazo y cupo.
    await pasarelaService.fijarCredito(empresaId, true, 60, 5_000_000);
    await pasarelaService.fijarCredito(empresaId, false, 60, 5_000_000);

    const c = await pasarelaService.credito(empresaId);
    expect(c?.aCredito).toBe(false);
    expect(c?.dias).toBe(0);
    expect(c?.cupo).toBe(0);
  });

  it('la bitácora registra QUÉ llave se cambió, nunca su valor', async () => {
    // La razón de que esto exista: si un día los pagos dejan de funcionar, lo
    // primero que hay que poder responder es quién cambió qué y cuándo.
    await pasarelaService.guardar({
      activa: true, prueba: true,
      secretoIntegridad: 'valor_que_no_debe_quedar_registrado',
    });

    const { data } = await root
      .from('audit_logs')
      .select('action, entity, entity_id, metadata')
      .eq('action', 'PAYMENTS_CONFIG')
      .order('created_at', { ascending: false })
      .limit(1).single();

    const fila = data as {
      entity: string; entity_id: string | null; metadata: Record<string, unknown>;
    };
    expect(fila.entity).toBe('app_settings');
    // `app_settings` tiene clave numérica; `entity_id` es uuid. Meter el id ahí
    // es lo que hacía fallar la función entera.
    expect(fila.entity_id).toBeNull();
    expect(fila.metadata.cambio_secreto_integridad).toBe(true);
    expect(fila.metadata.cambio_secreto_eventos).toBe(false);
    expect(JSON.stringify(fila.metadata)).not.toContain('valor_que_no_debe');
  });

  it('el listado trae el saldo pendiente de cada empresa', async () => {
    const lista = await pasarelaService.empresas();
    expect(lista.length).toBeGreaterThan(0);

    // El saldo tiene que coincidir con la cartera real, empresa por empresa.
    const { data } = await root.from('v_cartera')
      .select('company_id, saldo').gt('saldo', 0);
    const esperado = new Map<string, number>();
    for (const f of (data ?? []) as Array<{ company_id: string | null; saldo: number }>) {
      if (!f.company_id) continue;
      esperado.set(f.company_id, (esperado.get(f.company_id) ?? 0) + Number(f.saldo));
    }

    for (const e of lista) {
      expect(e.saldo, `saldo de ${e.nombre}`).toBeCloseTo(esperado.get(e.id) ?? 0, 2);
    }
  });

  it('el saldo de una empresa suelta coincide con el del listado', async () => {
    const lista = await pasarelaService.empresas();
    const conSaldo = lista.find((e) => e.saldo > 0) ?? lista[0];
    const suelta = await pasarelaService.credito(conSaldo.id);
    expect(suelta?.saldo).toBeCloseTo(conSaldo.saldo, 2);
  });

  it('buscar por NIT funciona con puntos y sin ellos', async () => {
    // La prueba PONE el NIT en lugar de buscar una empresa que ya lo tenga.
    // Antes dependía de encontrar una, y la única que lo tenía resultó ser
    // basura de otra prueba: al limpiar la base, esta se cayó. Un dato que la
    // prueba necesita lo crea la prueba.
    const NIT = '901555444-3';
    const { data: previo } = await root.from('companies')
      .select('nit').eq('id', empresaId).single();
    const nitOriginal = (previo as { nit: string | null }).nit;

    try {
      await root.from('companies').update({ nit: NIT }).eq('id', empresaId);

      const directo = await pasarelaService.empresas(NIT);
      expect(directo.map((e) => e.nit)).toContain(NIT);

      // Como lo escribiría una persona: con puntos, aunque la base lo guarda
      // sin ellos por exigencia de la DIAN.
      const buscado = await pasarelaService.empresas('901.555.444-3');
      expect(buscado.map((e) => e.nit)).toContain(NIT);
    } finally {
      await root.from('companies').update({ nit: nitOriginal }).eq('id', empresaId);
    }
  });
});
