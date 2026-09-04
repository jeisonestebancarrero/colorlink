import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * El motor de diagnóstico, ya en la base.
 *
 * Lo que se vigila, en orden de gravedad:
 *
 *   1. Que **no invente catálogo**. El motor viejo, en el navegador, tenía 8
 *      códigos escritos a mano (`PNT-20100`, `PNT-10520`…) y ninguno existía
 *      en `products`: el cliente terminaba con una lista de materiales que no
 *      podía comprar. Cada línea que salga de aquí tiene que resolver contra
 *      una fila real de `product_variants`.
 *   2. Que el precio y el rendimiento **salgan de la base**, no de una copia.
 *   3. Que cuando el catálogo no tenga con qué resolver un caso, el motor
 *      diga que no sabe y pida visita, en vez de rellenar el hueco.
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

const ADMIN = { email: 'admin@pintuco.demo', password: 'pintuco2025*' };

interface Linea {
  code: string;
  variantId: string;
  presentation: string;
  unitPriceRef: number;
  lineTotalCop: number;
  calculatedTotalUnits: number;
  role: string;
}
interface Diagnostico {
  solution_category: string;
  attention_level: string;
  requires_technical_visit: boolean;
  key_considerations: string[];
  missing_information: string[];
  recommended_products: Linea[];
  budget_summary: { subtotalCop: number };
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

describe.skipIf(!disponible)('Motor de diagnóstico · solo catálogo real', () => {
  let token = '';
  let codigosReales: string[] = [];

  const diagnosticar = async (payload: Record<string, unknown>): Promise<Diagnostico> => {
    const r = await fetch(`${API}/rest/v1/rpc/diagnosticar_proyecto`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _payload: payload }),
    });
    return r.json();
  };

  it('prepara sesión y catálogo', async () => {
    token = await fetch(`${API}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(ADMIN),
    }).then((r) => r.json()).then((j) => j.access_token ?? '');
    expect(token).not.toBe('');

    codigosReales = await fetch(`${API}/rest/v1/products?select=code&status=eq.ACTIVO`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    }).then((r) => r.json()).then((d: Array<{ code: string }>) => d.map((p) => p.code));
    expect(codigosReales.length).toBeGreaterThan(0);
  });

  it('LO QUE IMPORTA: todo producto recomendado existe en el catálogo', async () => {
    // Se barren todas las combinaciones que el motor sabe distinguir. Si
    // alguna devolviera un código inventado, aquí se cae.
    const casos = [
      { surface: 'Concreto', environment: 'Exterior', conditions: ['Humedad', 'Fisuras'] },
      { surface: 'Concreto', environment: 'Exterior', conditions: [] },
      { surface: 'Drywall', environment: 'Interior', conditions: [] },
      { surface: 'Drywall', environment: 'Interior', conditions: ['Hongos / Moho'] },
      { surface: 'Metal', environment: 'Exterior', conditions: ['Oxidación'] },
      { surface: 'Madera', environment: 'Exterior', conditions: [] },
      { surface: 'Concreto', environment: 'Industrial', conditions: [] },
      { surface: 'Concreto', environment: 'Exterior', conditions: ['Filtraciones'] },
    ];

    for (const caso of casos) {
      const d = await diagnosticar({ area_m2: '85', ...caso });
      expect(d.recommended_products.length, `sin materiales: ${JSON.stringify(caso)}`)
        .toBeGreaterThan(0);
      for (const l of d.recommended_products) {
        expect(codigosReales, `código inventado ${l.code} en ${JSON.stringify(caso)}`)
          .toContain(l.code);
        expect(l.variantId, `línea sin presentación real: ${l.code}`).toBeTruthy();
      }
    }
  });

  it('el precio de cada línea es el de la presentación en el catálogo', async () => {
    const d = await diagnosticar({
      area_m2: '85', surface: 'Concreto', environment: 'Exterior', conditions: [],
    });

    for (const l of d.recommended_products) {
      const [v] = await fetch(
        `${API}/rest/v1/product_variants?select=label,price_cop&id=eq.${l.variantId}`,
        { headers: { apikey: ANON, Authorization: `Bearer ${token}` } },
      ).then((r) => r.json());
      expect(Number(l.unitPriceRef)).toBe(Number(v.price_cop));
      expect(l.presentation).toBe(v.label);
      expect(Number(l.lineTotalCop)).toBe(Number(v.price_cop) * l.calculatedTotalUnits);
    }
  });

  it('el presupuesto es la suma de las líneas, sin sorpresas', async () => {
    const d = await diagnosticar({
      area_m2: '120', surface: 'Concreto', environment: 'Exterior', conditions: ['Fisuras'],
    });
    const suma = d.recommended_products.reduce((a, l) => a + Number(l.lineTotalCop), 0);
    expect(Number(d.budget_summary.subtotalCop)).toBeCloseTo(suma, 2);
  });

  it('la cantidad sale del rendimiento real de la ficha', async () => {
    // Koraza rinde 22 m²/galón. 85 m² a 2 manos = 7.73 gal = 29.25 L.
    // El cuñete son 18.9 L: 2 cuñetes ($1.259.800) contra 8 galones
    // ($1.143.200). Gana el galón, y esa es la gracia de elegir por costo.
    const d = await diagnosticar({
      area_m2: '85', surface: 'Concreto', environment: 'Exterior', conditions: [],
    });
    const koraza = d.recommended_products.find((l) => l.code === 'PNT-EXT-001');
    expect(koraza).toBeDefined();
    expect(koraza!.calculatedTotalUnits).toBe(8);
    expect(koraza!.presentation).toContain('1 Galón');
  });

  it('sin área no inventa una obra de 85 m²', async () => {
    // El motor viejo caía a 85 en silencio («Number(data.areaM2) || 85»), así
    // que un formulario incompleto salía con el presupuesto de una obra que
    // nadie había medido.
    const d = await diagnosticar({ surface: 'Concreto', environment: 'Exterior', conditions: [] });
    expect(d.recommended_products).toEqual([]);
    expect(d.requires_technical_visit).toBe(true);
    expect(d.missing_information.join(' ')).toMatch(/área/i);
    expect(Number(d.budget_summary.subtotalCop)).toBe(0);
  });

  it('la madera deja de recibir vinilo de interior', async () => {
    // El motor viejo no tenía rama de madera: caía en el «else» y recomendaba
    // Viniltex sobre madera a la intemperie.
    const d = await diagnosticar({
      area_m2: '40', surface: 'Madera', environment: 'Exterior', conditions: [],
    });
    expect(d.recommended_products.map((l) => l.code)).toContain('PNT-MAD-007');
    expect(d.recommended_products.map((l) => l.code)).not.toContain('PNT-INT-002');
  });

  it('la humedad siempre termina en visita técnica', async () => {
    const d = await diagnosticar({
      area_m2: '20', surface: 'Drywall', environment: 'Interior', conditions: ['Humedad'],
    });
    expect(d.requires_technical_visit).toBe(true);
  });
});
