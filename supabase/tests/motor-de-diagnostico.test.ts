import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Motor de diagnóstico en la base: cada línea resuelve contra un `product_variants`
 * real, precio y rendimiento salen de la base, y sin catálogo aplicable pide visita.
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
    // Se barren todas las combinaciones que el motor distingue: ninguna puede devolver un código inventado.
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
    // Koraza rinde 22 m²/gal: 85 m² a 2 manos = 29.25 L. 8 galones ($1.143.200)
    // salen más baratos que 2 cuñetes ($1.259.800): se elige por costo.
    const d = await diagnosticar({
      area_m2: '85', surface: 'Concreto', environment: 'Exterior', conditions: [],
    });
    const koraza = d.recommended_products.find((l) => l.code === 'PNT-EXT-001');
    expect(koraza).toBeDefined();
    expect(koraza!.calculatedTotalUnits).toBe(8);
    expect(koraza!.presentation).toContain('1 Galón');
  });

  it('sin área no inventa una obra de 85 m²', async () => {
    // Sin área no se asume un valor por defecto: presupuestaría una obra no medida.
    const d = await diagnosticar({ surface: 'Concreto', environment: 'Exterior', conditions: [] });
    expect(d.recommended_products).toEqual([]);
    expect(d.requires_technical_visit).toBe(true);
    expect(d.missing_information.join(' ')).toMatch(/área/i);
    expect(Number(d.budget_summary.subtotalCop)).toBe(0);
  });

  it('la madera deja de recibir vinilo de interior', async () => {
    // La madera tiene rama propia; no debe caer en Viniltex.
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
