import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../src/lib/supabase';
import { pasarelaService } from '../../src/services/pasarelaAdmin';

/**
 * Capa de servicio de pasarela y crédito: un secreto en blanco conserva el guardado,
 * los secretos no vuelven al navegador, el saldo se atribuye a la empresa correcta y
 * los errores llegan en español. Restaura `payments_*`, que comparte fila con la tienda.
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
  /** Cliente de servicio, solo para restaurar. */
  let root: SupabaseClient;
  /** Configuración original. */
  let originalPagos: Record<string, unknown> = {};
  let empresaId = '';
  let creditoOriginal = { payment_terms: 'CONTADO', credit_days: 30, credit_limit_cop: 0 };

  beforeAll(async () => {
    root = createClient(API, SERVICE, { auth: { persistSession: false } });

    // `pasarelaService` usa el cliente compartido de la app: la sesión debe iniciarse en ese.
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
    // Cambiar solo el interruptor y guardar no puede borrar las llaves de Wompi.
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

    // Se vuelve a modo prueba: el entorno local no debe quedar cobrando de verdad.
    await pasarelaService.guardar({ activa: true, prueba: true });
    expect((await pasarelaService.estado()).prueba).toBe(true);
  });

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
    // Apagar el crédito pone plazo y cupo en cero: un cupo colgando de una empresa CONTADO
    // parecería vigente. La pantalla avisa que hay que reescribirlos.
    await pasarelaService.fijarCredito(empresaId, true, 60, 5_000_000);
    await pasarelaService.fijarCredito(empresaId, false, 60, 5_000_000);

    const c = await pasarelaService.credito(empresaId);
    expect(c?.aCredito).toBe(false);
    expect(c?.dias).toBe(0);
    expect(c?.cupo).toBe(0);
  });

  it('la bitácora registra QUÉ llave se cambió, nunca su valor', async () => {
    // Auditoría: debe poder saberse quién cambió la pasarela y cuándo.
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
    // `app_settings` tiene clave numérica y `entity_id` es uuid: debe quedar nulo.
    expect(fila.entity_id).toBeNull();
    expect(fila.metadata.cambio_secreto_integridad).toBe(true);
    expect(fila.metadata.cambio_secreto_eventos).toBe(false);
    expect(JSON.stringify(fila.metadata)).not.toContain('valor_que_no_debe');
  });

  it('el listado trae el saldo pendiente de cada empresa', async () => {
    const lista = await pasarelaService.empresas();
    expect(lista.length).toBeGreaterThan(0);

    // El saldo debe coincidir con la cartera real, empresa por empresa.
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
    // La prueba asigna el NIT en vez de buscar una empresa que ya lo tenga.
    const NIT = '901555444-3';
    const { data: previo } = await root.from('companies')
      .select('nit').eq('id', empresaId).single();
    const nitOriginal = (previo as { nit: string | null }).nit;

    try {
      await root.from('companies').update({ nit: NIT }).eq('id', empresaId);

      const directo = await pasarelaService.empresas(NIT);
      expect(directo.map((e) => e.nit)).toContain(NIT);

      // Con puntos, como lo escribe una persona; la base lo guarda sin ellos.
      const buscado = await pasarelaService.empresas('901.555.444-3');
      expect(buscado.map((e) => e.nit)).toContain(NIT);
    } finally {
      await root.from('companies').update({ nit: nitOriginal }).eq('id', empresaId);
    }
  });
});
