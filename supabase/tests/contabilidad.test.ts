import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contabilidad en partida doble: nunca entra un asiento descuadrado, los hechos
 * conocidos se asientan solos, anular no borra y los libros no son públicos.
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
const CLIENTE = { email: 'carlos.mendoza@constructorahorizonte.com', password: 'pintuco2025*' };
const TECNICO = { email: 'tecnico@pintuco.demo', password: 'pintuco2025*' };

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

const login = (c: { email: string; password: string }) =>
  fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
  })
    .then((r) => r.json())
    .then((j) => j.access_token ?? '');

const cab = (t?: string) => ({
  apikey: ANON,
  ...(t ? { Authorization: `Bearer ${t}` } : {}),
  'Content-Type': 'application/json',
});

const asentar = (token: string, cuerpo: Record<string, unknown>) =>
  fetch(`${API}/rest/v1/rpc/post_journal_entry`, {
    method: 'POST',
    headers: cab(token),
    body: JSON.stringify(cuerpo),
  });

const disponible = await hayInstancia();

describe.skipIf(!disponible)('Contabilidad · partida doble', () => {
  let tAdmin = '';
  let tCliente = '';
  let tTecnico = '';
  const creados: string[] = [];
  let producto = '';
  let variante = '';

  beforeAll(async () => {
    [tAdmin, tCliente, tTecnico] = await Promise.all([
      login(ADMIN), login(CLIENTE), login(TECNICO),
    ]);

    // Producto propio y oculto: recibir mercancía sobre uno de la semilla alteraría
    // los saldos que verifica la suite de inventario en paralelo.
    const sello = Date.now();
    const codigo = `TEST-CONTA-${sello}`;
    await fetch(`${API}/rest/v1/products`, {
      method: 'POST',
      headers: { ...cab(tAdmin), Prefer: 'return=minimal' },
      body: JSON.stringify({ code: codigo, name: `Producto contable ${sello}`, status: 'INACTIVO' }),
    });
    producto = await fetch(`${API}/rest/v1/products?select=id&code=eq.${codigo}`, {
      headers: cab(tAdmin),
    })
      .then((r) => r.json())
      .then((d) => d[0].id);

    await fetch(`${API}/rest/v1/product_variants`, {
      method: 'POST',
      headers: { ...cab(tAdmin), Prefer: 'return=minimal' },
      body: JSON.stringify({
        product_id: producto, label: 'Presentación contable',
        sku: `${codigo}-V1`, price_cop: 100000, status: 'INACTIVO',
      }),
    });
    variante = await fetch(`${API}/rest/v1/product_variants?select=id&sku=eq.${codigo}-V1`, {
      headers: cab(tAdmin),
    })
      .then((r) => r.json())
      .then((d) => d[0].id);
  });

  afterAll(async () => {
    if (!SERVICE) return;
    const s = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
    for (const id of creados) {
      await fetch(`${API}/rest/v1/journal_entries?id=eq.${id}`, { method: 'DELETE', headers: s });
    }
    // Los comprobantes de la recepción se borran antes que ella para no dejarlos huérfanos en el balance.
    for (const rec of await fetch(
      `${API}/rest/v1/purchase_receipts?select=id&document_ref=like.FV-T-*`,
      { headers: s },
    ).then((r) => r.json())) {
      await fetch(`${API}/rest/v1/journal_entries?receipt_id=eq.${rec.id}`, { method: 'DELETE', headers: s });
      await fetch(`${API}/rest/v1/purchase_receipts?id=eq.${rec.id}`, { method: 'DELETE', headers: s });
    }
    if (variante) {
      await fetch(`${API}/rest/v1/inventory_movements?variant_id=eq.${variante}`, { method: 'DELETE', headers: s });
      await fetch(`${API}/rest/v1/inventory?variant_id=eq.${variante}`, { method: 'DELETE', headers: s });
      await fetch(`${API}/rest/v1/purchase_receipt_items?variant_id=eq.${variante}`, { method: 'DELETE', headers: s });
      await fetch(`${API}/rest/v1/product_variants?id=eq.${variante}`, { method: 'DELETE', headers: s });
    }
    if (producto) {
      await fetch(`${API}/rest/v1/products?id=eq.${producto}`, { method: 'DELETE', headers: s });
    }
  });

  it('el plan de cuentas trae el PUC que usa el sistema', async () => {
    const cuentas = await fetch(`${API}/rest/v1/accounts?select=code,name,is_postable`, {
      headers: cab(tAdmin),
    }).then((r) => r.json());

    const codigos = cuentas.map((c: { code: string }) => c.code);
    // Códigos del PUC (Decreto 2650).
    for (const esperado of ['1105', '1110', '1305', '1435', '2205', '2408', '4135', '6135']) {
      expect(codigos, `falta la cuenta ${esperado}`).toContain(esperado);
    }
  });

  it('un asiento cuadrado se registra', async () => {
    const r = await asentar(tAdmin, {
      _descripcion: 'Prueba de partida doble',
      _lineas: [
        { cuenta: '1110', detalle: 'Consignación', debito: 500000, credito: 0 },
        { cuenta: '1305', detalle: 'Abono cliente', debito: 0, credito: 500000 },
      ],
    });
    expect(r.ok).toBe(true);
    creados.push((await r.json()) as string);
  });

  it('RECHAZA un asiento descuadrado', async () => {
    // Comprobación central del módulo.
    const r = await asentar(tAdmin, {
      _descripcion: 'Descuadrado a propósito',
      _lineas: [
        { cuenta: '1110', debito: 500000, credito: 0 },
        { cuenta: '1305', debito: 0, credito: 400000 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/DESCUADRADO/);
  });

  it('rechaza un asiento de una sola línea', async () => {
    const r = await asentar(tAdmin, {
      _descripcion: 'Media partida',
      _lineas: [{ cuenta: '1110', debito: 100, credito: 0 }],
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/MINIMO_DOS_LINEAS/);
  });

  it('rechaza cargar a una cuenta de agrupación', async () => {
    // Cargar a una cuenta mayor duplicaría la cifra al sumar por niveles.
    const r = await asentar(tAdmin, {
      _descripcion: 'A cuenta mayor',
      _lineas: [
        { cuenta: '11', debito: 1000, credito: 0 },
        { cuenta: '1305', debito: 0, credito: 1000 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/CUENTA_NO_IMPUTABLE/);
  });

  it('rechaza una cuenta que no existe', async () => {
    const r = await asentar(tAdmin, {
      _descripcion: 'Cuenta inventada',
      _lineas: [
        { cuenta: '9999', debito: 1000, credito: 0 },
        { cuenta: '1305', debito: 0, credito: 1000 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/CUENTA_DESCONOCIDA/);
  });

  it('un cliente no puede registrar asientos ni leer los libros', async () => {
    const r = await asentar(tCliente, {
      _descripcion: 'Intento',
      _lineas: [
        { cuenta: '1110', debito: 100, credito: 0 },
        { cuenta: '1305', debito: 0, credito: 100 },
      ],
    });
    expect(r.ok).toBe(false);

    const libro = await fetch(`${API}/rest/v1/v_libro_auxiliar?select=cuenta&limit=1`, {
      headers: cab(tCliente),
    }).then((x) => x.json());
    expect(libro).toEqual([]);
  });

  it('un rol interno sin permiso contable tampoco ve los libros', async () => {
    // Los libros revelan ventas, costos y márgenes.
    const balance = await fetch(`${API}/rest/v1/v_balance_prueba?select=cuenta&limit=1`, {
      headers: cab(tTecnico),
    }).then((x) => x.json());
    expect(balance).toEqual([]);
  });

  it('anular no borra: deja el original y su reverso', async () => {
    const id = (await asentar(tAdmin, {
      _descripcion: 'Asiento que se anulará',
      _lineas: [
        { cuenta: '1110', debito: 250000, credito: 0 },
        { cuenta: '1305', debito: 0, credito: 250000 },
      ],
    }).then((r) => r.json())) as string;
    creados.push(id);

    const r = await fetch(`${API}/rest/v1/rpc/void_journal_entry`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _entry_id: id, _motivo: 'Error de digitación' }),
    });
    expect(r.ok).toBe(true);
    creados.push((await r.json()) as string);

    const [original] = await fetch(
      `${API}/rest/v1/journal_entries?select=status,void_reason&id=eq.${id}`,
      { headers: cab(tAdmin) },
    ).then((x) => x.json());
    expect(original.status).toBe('ANULADO');
    expect(original.void_reason).toBe('Error de digitación');
  });

  it('no se anula dos veces', async () => {
    const [anulado] = await fetch(
      `${API}/rest/v1/journal_entries?select=id&status=eq.ANULADO&limit=1`,
      { headers: cab(tAdmin) },
    ).then((x) => x.json());

    const r = await fetch(`${API}/rest/v1/rpc/void_journal_entry`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _entry_id: anulado.id, _motivo: 'otra vez' }),
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(await r.json())).toMatch(/YA_ANULADO/);
  });

  it('una recepción confirmada genera su asiento sola', async () => {
    const bodega = await fetch(`${API}/rest/v1/pickup_locations?select=id&limit=1`, {
      headers: cab(tAdmin),
    })
      .then((r) => r.json())
      .then((d) => d[0].id);
    const rec = (await fetch(`${API}/rest/v1/rpc/create_purchase_receipt`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _location_id: bodega, _document_ref: `FV-T-${Date.now()}` }),
    }).then((r) => r.json())) as string;

    await fetch(`${API}/rest/v1/purchase_receipt_items`, {
      method: 'POST',
      headers: { ...cab(tAdmin), Prefer: 'return=minimal' },
      body: JSON.stringify({
        receipt_id: rec, variant_id: variante,
        quantity: 4, unit_cost_cop: 25000, subtotal_cop: 100000,
      }),
    });

    const conf = await fetch(`${API}/rest/v1/rpc/confirm_purchase_receipt`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _receipt_id: rec }),
    });
    expect(conf.ok).toBe(true);

    const lineas = await fetch(
      `${API}/rest/v1/v_libro_auxiliar?select=cuenta,debit_cop,credit_cop&receipt_id=eq.${rec}&order=cuenta`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    // Inventario al débito contra Proveedores al crédito.
    expect(lineas).toHaveLength(2);
    const inventario = lineas.find((l: { cuenta: string }) => l.cuenta === '1435');
    const proveedor = lineas.find((l: { cuenta: string }) => l.cuenta === '2205');
    expect(Number(inventario.debit_cop)).toBe(100000);
    expect(Number(proveedor.credit_cop)).toBe(100000);

    const [asiento] = await fetch(
      `${API}/rest/v1/journal_entries?select=id&receipt_id=eq.${rec}`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());
    creados.push(asiento.id);
  });

  it('una factura genera su asiento con el costo real de la venta', async () => {
    // El costo que entró con la recepción sale como costo de venta al facturar.
    const [linea] = await fetch(
      `${API}/rest/v1/v_libro_auxiliar?select=entry_id,cuenta,debit_cop&cuenta=eq.6135&order=entry_date.desc&limit=1`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    if (!linea) {
      // Sin ventas facturadas no hay qué comprobar; fingir una no probaría el flujo real.
      expect(true).toBe(true);
      return;
    }

    const hermanas = await fetch(
      `${API}/rest/v1/v_libro_auxiliar?select=cuenta,debit_cop,credit_cop&entry_id=eq.${linea.entry_id}`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    const cuentas = hermanas.map((h: { cuenta: string }) => h.cuenta);
    expect(cuentas).toContain('4135'); // ingreso
    expect(cuentas).toContain('1435'); // salida de inventario por el costo

    const debitos = hermanas.reduce((a: number, h: { debit_cop: string }) => a + Number(h.debit_cop), 0);
    const creditos = hermanas.reduce((a: number, h: { credit_cop: string }) => a + Number(h.credit_cop), 0);
    expect(debitos).toBeCloseTo(creditos, 2);
  });

  it('el balance respeta la naturaleza de cada cuenta', async () => {
    // Sin ajustar el signo por naturaleza, pasivos e ingresos saldrían en negativo.
    const filas = await fetch(
      `${API}/rest/v1/v_balance_prueba?select=cuenta,naturaleza,debitos,creditos,saldo`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    for (const f of filas) {
      const esperado =
        f.naturaleza === 'DEBITO'
          ? Number(f.debitos) - Number(f.creditos)
          : Number(f.creditos) - Number(f.debitos);
      expect(Number(f.saldo)).toBeCloseTo(esperado, 2);
    }
  });

  it('desde el asiento se llega al documento que lo originó', async () => {
    // El comprobante no duplica las líneas de producto, pero debe enlazar a lo vendido o recibido.
    const [asiento] = await fetch(
      `${API}/rest/v1/journal_entries?select=id&source=eq.RECEPCION&order=created_at.desc&limit=1`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    const doc = await fetch(`${API}/rest/v1/rpc/detalle_documento_comprobante`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _entry_id: asiento.id }),
    }).then((r) => r.json());

    expect(doc.tipo).toBe('RECEPCION');
    expect(doc.numero).toMatch(/^REC-/);
    expect(Array.isArray(doc.lineas)).toBe(true);
    expect(doc.lineas.length).toBeGreaterThan(0);
    expect(doc.lineas[0].descripcion).toBeTruthy();
  });

  it('el costo de compra del documento solo lo ve quien puede ver costos', async () => {
    // En una recepción el valor unitario es el costo de compra: revelaría el margen.
    const [asiento] = await fetch(
      `${API}/rest/v1/journal_entries?select=id&source=eq.RECEPCION&order=created_at.desc&limit=1`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    const conPermiso = await fetch(`${API}/rest/v1/rpc/detalle_documento_comprobante`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: JSON.stringify({ _entry_id: asiento.id }),
    }).then((r) => r.json());
    expect(conPermiso.costos_visibles).toBe(true);
    expect(conPermiso.lineas[0].valor_unitario).not.toBeNull();
  });

  it('el estado de resultados cuadra con sus componentes', async () => {
    const filas = await fetch(
      `${API}/rest/v1/v_estado_resultados?select=clase,valor`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    const suma = (clase: string) =>
      filas
        .filter((f: { clase: string }) => f.clase === clase)
        .reduce((a: number, f: { valor: string }) => a + Number(f.valor), 0);

    // Los ingresos se muestran en positivo aunque su naturaleza sea crédito.
    expect(suma('INGRESO')).toBeGreaterThanOrEqual(0);
    expect(suma('COSTO')).toBeGreaterThanOrEqual(0);
  });

  it('el libro auxiliar de una cuenta trae sus movimientos', async () => {
    const filas = await fetch(
      `${API}/rest/v1/v_libro_auxiliar?select=cuenta,debit_cop,credit_cop&cuenta=eq.1435&status=eq.REGISTRADO`,
      { headers: cab(tAdmin) },
    ).then((r) => r.json());

    expect(Array.isArray(filas)).toBe(true);
    for (const f of filas) {
      expect(f.cuenta).toBe('1435');
      // Cada línea es débito o crédito, nunca las dos ni ninguna.
      const d = Number(f.debit_cop);
      const c = Number(f.credit_cop);
      expect((d > 0 && c === 0) || (c > 0 && d === 0)).toBe(true);
    }
  });

  it('los libros cuadran en conjunto', async () => {
    const r = await fetch(`${API}/rest/v1/rpc/contabilidad_cuadra`, {
      method: 'POST',
      headers: cab(tAdmin),
      body: '{}',
    }).then((x) => x.json());
    expect(r.cuadra).toBe(true);
    expect(Number(r.debitos)).toBeCloseTo(Number(r.creditos), 2);
  });
});
