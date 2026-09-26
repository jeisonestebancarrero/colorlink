import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../src/lib/supabase';
import { cartService } from '../../src/services/commerce';

/**
 * Volcado del carrito del visitante a su cuenta: las cantidades se suman, nunca
 * superan el tope de 999 y el precio lo pone el catálogo. La base queda como estaba.
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

const CLIENTE = { email: 'carlos.mendoza@constructorahorizonte.com', password: 'pintuco2025*' };

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

describe.skipIf(!disponible)('Carrito del visitante que inicia sesión', () => {
  // Se usa el singleton de producción a propósito: es el que usa `cartService`.
  const cli = supabase;
  let cartId = '';
  let variantes: string[] = [];
  /** Cantidades que el carrito ya tenía, para restituirlas al final. */
  let previas = new Map<string, number>();

  beforeAll(async () => {
    const { error } = await cli.auth.signInWithPassword(CLIENTE);
    if (error) throw new Error(`no se pudo autenticar el cliente de prueba: ${error.message}`);

    const { data: sesion } = await cli.auth.getSession();
    const userId = sesion.session?.user?.id as string;

    const { data: existente } = await cli
      .from('carts').select('id').eq('user_id', userId).eq('is_active', true).maybeSingle();
    if (existente) {
      cartId = (existente as { id: string }).id;
    } else {
      const { data: nuevo } = await cli
        .from('carts').insert({ user_id: userId }).select('id').single();
      cartId = (nuevo as { id: string }).id;
    }

    const { data: items } = await cli
      .from('cart_items').select('variant_id, quantity').eq('cart_id', cartId);
    previas = new Map(
      ((items ?? []) as Array<{ variant_id: string; quantity: number }>)
        .map((i) => [i.variant_id, i.quantity])
    );

    // Variantes reales; los UUID cambian con cada siembra.
    const { data: vs } = await cli.from('product_variants').select('id').limit(2);
    variantes = ((vs ?? []) as Array<{ id: string }>).map((v) => v.id);
    expect(variantes).toHaveLength(2);

    // Se parte de un carrito sin las variantes de la prueba.
    await cli.from('cart_items').delete().eq('cart_id', cartId).in('variant_id', variantes);
  });

  afterAll(async () => {
    if (!cartId) return;
    await cli.from('cart_items').delete().eq('cart_id', cartId).in('variant_id', variantes);
    // Restituye las cantidades previas que la prueba haya tocado.
    for (const [variantId, quantity] of previas) {
      if (!variantes.includes(variantId)) continue;
      await cli.from('cart_items').insert({ cart_id: cartId, variant_id: variantId, quantity });
    }
    await cli.auth.signOut();
  });

  /** Usa el volcado real de producción, no una réplica. */
  const volcar = (
    lineas: Array<{ variantId: string; colorId: string | null; quantity: number }>
  ) => cartService.absorberLineas(
    lineas.map((l) => ({ ...l, kitSolutionId: null }))
  );

  const cantidadDe = async (variantId: string): Promise<number | null> => {
    const { data } = await cli
      .from('cart_items').select('quantity')
      .eq('cart_id', cartId).eq('variant_id', variantId).maybeSingle();
    return (data as { quantity: number } | null)?.quantity ?? null;
  };

  it('lleva las líneas del visitante al carrito de su cuenta', async () => {
    await volcar([
      { variantId: variantes[0], colorId: null, quantity: 2 },
      { variantId: variantes[1], colorId: null, quantity: 5 },
    ]);

    expect(await cantidadDe(variantes[0])).toBe(2);
    expect(await cantidadDe(variantes[1])).toBe(5);
  });

  it('SUMA sobre lo que el carrito ya tenía, no lo reemplaza', async () => {
    await volcar([{ variantId: variantes[0], colorId: null, quantity: 3 }]);

    // 2 + 3 = 5; si reemplazara quedaría en 3.
    expect(await cantidadDe(variantes[0])).toBe(5);
  });

  it('recorta al tope que acepta la base en lugar de fallar el volcado', async () => {
    await volcar([{ variantId: variantes[0], colorId: null, quantity: 5000 }]);
    expect(await cantidadDe(variantes[0])).toBe(999);
  });

  it('el carrito no guarda ningún precio: el precio lo pone el catálogo', async () => {
    const { data } = await cli
      .from('cart_items')
      .select('*, product_variants ( price_cop )')
      .eq('cart_id', cartId).eq('variant_id', variantes[1]).single();

    const fila = data as Record<string, unknown> & {
      product_variants: { price_cop: string | number };
    };
    // Ninguna columna de la línea guarda un importe.
    expect(Object.keys(fila).some((k) => /price|cop|total|precio/i.test(k) && k !== 'product_variants'))
      .toBe(false);
    // El precio llega desde el catálogo.
    expect(Number(fila.product_variants.price_cop)).toBeGreaterThan(0);
  });

  it('un visitante anónimo no puede leer ni escribir carritos', async () => {
    const anon = createClient(API, ANON, { auth: { persistSession: false } });

    const lectura = await anon.from('cart_items').select('id').limit(1);
    expect(lectura.data ?? []).toHaveLength(0);

    const escritura = await anon
      .from('cart_items')
      .insert({ cart_id: cartId, variant_id: variantes[0], quantity: 1 });
    expect(escritura.error).not.toBeNull();
  });
});
