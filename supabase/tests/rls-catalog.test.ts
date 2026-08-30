import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Seguridad del catálogo — FASE 3.
 *
 * Comprueba las dos mitades de la decisión de diseño:
 *  1. El catálogo comercial ES público (la landing debe poder mostrarlo sin
 *     sesión) pero solo en su parte ACTIVA.
 *  2. Escribir en el catálogo está reservado a ADMINISTRADOR, y las
 *     existencias reales de inventario solo las ve el personal interno.
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

async function hayInstancia(): Promise<boolean> {
  if (!API || !ANON) return false;
  try {
    const r = await fetch(`${API}/rest/v1/`, { headers: { apikey: ANON } });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

async function login(email: string, password: string): Promise<string> {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await r.json()).access_token ?? '';
}

const anon = () => ({ apikey: ANON, 'Content-Type': 'application/json' });
const auth = (t: string) => ({ ...anon(), Authorization: `Bearer ${t}` });

const disponible = await hayInstancia();

describe.skipIf(!disponible)('RLS · catálogo', () => {
  let tCliente = '';
  let tAdmin = '';
  let tTecnico = '';

  beforeAll(async () => {
    [tCliente, tAdmin, tTecnico] = await Promise.all([
      login('carlos.mendoza@constructorahorizonte.com', 'pintuco2025*'),
      login('admin@pintuco.demo', 'pintuco2025*'),
      login('tecnico@pintuco.demo', 'pintuco2025*'),
    ]);
  });

  it('el catálogo es legible SIN sesión (la landing lo necesita)', async () => {
    const r = await fetch(`${API}/rest/v1/products?select=code,name`, { headers: anon() });
    expect(r.status).toBe(200);
    expect((await r.json()).length).toBe(11);
  });

  it('los precios se leen del servidor, no del cliente', async () => {
    const r = await fetch(
      `${API}/rest/v1/product_variants?select=label,price_cop&sku=eq.PNT-EXT-001-V2`,
      { headers: anon() }
    );
    const [v] = await r.json();
    expect(Number(v.price_cop)).toBe(629900);
  });

  it('colores, superficies, patologías y tiendas son públicos', async () => {
    const paths = ['colors', 'surfaces', 'pathologies', 'pickup_locations'];
    for (const p of paths) {
      const r = await fetch(`${API}/rest/v1/${p}?select=id`, { headers: anon() });
      expect(r.status, p).toBe(200);
      expect((await r.json()).length, p).toBeGreaterThan(0);
    }
  });

  it('un kit trae sus pasos con producto y variante resueltos', async () => {
    const r = await fetch(
      `${API}/rest/v1/solutions?select=name,is_kit,discount_percent,solution_products(step_number,phase,quantity_for_85m2,products(name),product_variants(label,price_cop))&external_ref=eq.kit-fachada-5anos`,
      { headers: anon() }
    );
    const [kit] = await r.json();
    expect(kit.is_kit).toBe(true);
    expect(Number(kit.discount_percent)).toBe(12);
    expect(kit.solution_products).toHaveLength(4);
    const paso1 = kit.solution_products.find((s: { step_number: number }) => s.step_number === 1);
    expect(paso1.products.name).toContain('Masilla');
    expect(paso1.phase).toBe('Preparación');
  });

  it('la disponibilidad es pública pero NO las existencias exactas', async () => {
    const vista = await fetch(`${API}/rest/v1/v_variant_availability?select=stock_status&limit=1`, {
      headers: anon(),
    });
    expect(vista.status).toBe(200);
    expect(['InStock', 'LowStock', 'PreOrder']).toContain((await vista.json())[0].stock_status);

    // La tabla cruda queda fuera del alcance de anónimos y de clientes.
    const crudaAnon = await fetch(`${API}/rest/v1/inventory?select=qty_available`, { headers: anon() });
    expect(crudaAnon.status).toBe(401);

    const crudaCliente = await fetch(`${API}/rest/v1/inventory?select=qty_available`, {
      headers: auth(tCliente),
    });
    expect(await crudaCliente.json()).toEqual([]);
  });

  it('el personal interno sí ve las existencias', async () => {
    const r = await fetch(`${API}/rest/v1/inventory?select=qty_available&limit=5`, {
      headers: auth(tTecnico),
    });
    expect((await r.json()).length).toBeGreaterThan(0);
  });

  it('ATAQUE: un cliente no puede alterar un precio', async () => {
    const r = await fetch(`${API}/rest/v1/product_variants?sku=eq.PNT-EXT-001-V2`, {
      method: 'PATCH',
      headers: { ...auth(tCliente), Prefer: 'return=representation' },
      body: JSON.stringify({ price_cop: 1 }),
    });

    // OJO CON EL CÓDIGO DE ESTADO: aquí conviven dos defensas y ninguna es
    // un 403 limpio.
    //   · RLS filtra las filas ANTES del UPDATE, así que la sentencia afecta
    //     a cero filas y PostgREST responde 204 (sin contenido).
    //   · Desde que el costo dejó de ser una columna pública, el cliente ya
    //     no tiene SELECT sobre la tabla entera, y `return=representation`
    //     —que necesita leer lo modificado— se corta antes con un 42501.
    // Lo que garantiza la protección no es el código sino que el precio no
    // cambie, y eso es lo que se comprueba abajo.
    expect([204, 403].includes(r.status) || r.status === 401).toBe(true);

    const [variante] = await fetch(
      `${API}/rest/v1/product_variants?select=price_cop&sku=eq.PNT-EXT-001-V2`,
      { headers: anon() },
    ).then((x) => x.json());
    expect(Number(variante.price_cop)).toBeGreaterThan(1);

    // El precio real sigue intacto.
    const [v] = await fetch(
      `${API}/rest/v1/product_variants?select=price_cop&sku=eq.PNT-EXT-001-V2`,
      { headers: anon() }
    ).then((x) => x.json());
    expect(Number(v.price_cop)).toBe(629900);
  });

  it('ATAQUE: un cliente no puede crear productos', async () => {
    const r = await fetch(`${API}/rest/v1/products`, {
      method: 'POST',
      headers: auth(tCliente),
      body: JSON.stringify({ code: 'HACK-001', name: 'Producto falso' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  it('ATAQUE: un anónimo no puede escribir en el catálogo', async () => {
    const r = await fetch(`${API}/rest/v1/colors`, {
      method: 'POST',
      headers: anon(),
      body: JSON.stringify({ code: 'HACK', name: 'x', hex: '#000000', family: 'Blancos & Neutros' }),
    });
    expect([401, 403]).toContain(r.status);
  });

  it('un ADMINISTRADOR sí puede mantener el catálogo', async () => {
    // Sobre un color propio, no sobre uno de la carta oficial: restaurar el
    // valor al terminar no basta cuando otro archivo de prueba lee la carta
    // en paralelo y cae dentro de la ventana en que está modificada.
    const codigo = `TEST-ADM-${Date.now()}`;

    const creado = await fetch(`${API}/rest/v1/colors`, {
      method: 'POST',
      headers: { ...auth(tAdmin), Prefer: 'return=representation' },
      body: JSON.stringify({
        code: codigo,
        name: 'Color de prueba admin',
        hex: '#654321',
        family: 'Blancos & Neutros',
        status: 'ACTIVO',
        is_palette: false,
      }),
    });
    expect(creado.status).toBe(201);

    const r = await fetch(`${API}/rest/v1/colors?code=eq.${codigo}`, {
      method: 'PATCH',
      headers: { ...auth(tAdmin), Prefer: 'return=representation' },
      body: JSON.stringify({ description: 'Descripción actualizada por administración' }),
    });
    expect(r.status).toBe(200);
    const [c] = await r.json();
    expect(c.description).toContain('administración');

    await fetch(`${API}/rest/v1/colors?code=eq.${codigo}`, {
      method: 'DELETE',
      headers: auth(tAdmin),
    });
  });

  it('el catálogo inactivo no se filtra al público', async () => {
    // Se usa un color PROPIO y desechable, no uno de la carta oficial.
    //
    // Antes esta prueba desactivaba PNT-100 y lo restauraba al terminar. Como
    // los archivos de prueba corren en paralelo, la comprobación de fidelidad
    // del catálogo caía justo en esa ventana y contaba 19 colores de 20: un
    // fallo intermitente que no tenía nada que ver con lo que esa otra prueba
    // estaba verificando.
    const codigo = `TEST-${Date.now()}`;

    const creado = await fetch(`${API}/rest/v1/colors`, {
      method: 'POST',
      headers: { ...auth(tAdmin), Prefer: 'return=representation' },
      body: JSON.stringify({
        code: codigo,
        name: 'Color de prueba',
        hex: '#123456',
        family: 'Blancos & Neutros',
        status: 'INACTIVO',
        is_palette: false,
      }),
    });
    expect(creado.status).toBe(201);

    // Inactivo: el público no lo ve.
    const oculto = await fetch(`${API}/rest/v1/colors?select=code&code=eq.${codigo}`, {
      headers: anon(),
    });
    expect(await oculto.json()).toEqual([]);

    // Activo: sí lo ve. Sin esta mitad, la prueba pasaría igual aunque la
    // política escondiera el catálogo entero.
    await fetch(`${API}/rest/v1/colors?code=eq.${codigo}`, {
      method: 'PATCH',
      headers: auth(tAdmin),
      body: JSON.stringify({ status: 'ACTIVO' }),
    });
    const visible = await fetch(`${API}/rest/v1/colors?select=code&code=eq.${codigo}`, {
      headers: anon(),
    });
    expect(await visible.json()).toHaveLength(1);

    await fetch(`${API}/rest/v1/colors?code=eq.${codigo}`, {
      method: 'DELETE',
      headers: auth(tAdmin),
    });
  });

  it('integridad: ningún paso de kit apunta a un producto inexistente', async () => {
    const r = await fetch(
      `${API}/rest/v1/solution_products?select=step_number,products(code)`,
      { headers: anon() }
    );
    const pasos = await r.json();
    expect(pasos.length).toBeGreaterThan(0);
    for (const p of pasos) expect(p.products).not.toBeNull();
  });

  it('las herramientas no tienen rendimiento (evita división por cero)', async () => {
    const r = await fetch(
      `${API}/rest/v1/products?select=name,spread_rate_m2_per_gal&external_ref=eq.prod-brocha-master`,
      { headers: anon() }
    );
    const [p] = await r.json();
    expect(p.spread_rate_m2_per_gal).toBeNull();
  });
});
