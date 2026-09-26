import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Limpieza de cuentas de prueba por patrón de correo, no por lista de ids: una prueba
 * que falla a medias deja la lista incompleta. `.test` es un TLD reservado (RFC 2606).
 */

/** TLD reservado (RFC 2606): ningún correo real termina así. */
export const SUFIJO_DE_PRUEBA = '.test';

export function correoDePrueba(prefijo: string, sello: string | number): string {
  return `${prefijo}.${sello}@correo${SUFIJO_DE_PRUEBA}`;
}

/** Borra las cuentas de prueba (de la corrida `sello`, o todas las `.test`) y las empresas huérfanas. */
export async function limpiarCuentasDePrueba(
  admin: SupabaseClient,
  sello?: string | number,
): Promise<{ usuarios: number; empresas: number }> {
  let usuarios = 0;

  // `listUsers` pagina: sin recorrerlo, las cuentas recién creadas pueden quedar fuera.
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error || !data || data.users.length === 0) break;

    // `listUsers` viene sin tipar en esta versión del SDK.
    const lista = data.users as Array<{ id: string; email?: string | null }>;
    const objetivo = lista.filter((u) => {
      const correo = (u.email ?? '').toLowerCase();
      if (!correo.endsWith(SUFIJO_DE_PRUEBA)) return false;
      return sello === undefined || correo.includes(String(sello));
    });

    for (const u of objetivo) {
      const { error: e } = await admin.auth.admin.deleteUser(u.id);
      if (!e) usuarios += 1;
    }

    if (lista.length < 200) break;
  }

  // `profiles.company_id` es ON DELETE SET NULL: la empresa queda colgando al irse el último empleado.
  const empresas = await borrarEmpresasHuerfanas(admin);
  return { usuarios, empresas };
}

/** Empresas sin ninguna referencia: una con pedidos históricos no es basura aunque no tenga usuarios. */
export async function borrarEmpresasHuerfanas(admin: SupabaseClient): Promise<number> {
  const { data: todas } = await admin.from('companies').select('id');
  const ids = ((todas ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (ids.length === 0) return 0;

  const enUso = new Set<string>();
  const referencias: Array<[string, string]> = [
    ['profiles', 'company_id'],
    ['orders', 'company_id'],
    ['projects', 'company_id'],
    ['company_members', 'company_id'],
    ['company_branches', 'company_id'],
    ['company_join_requests', 'company_id'],
  ];

  for (const [tabla, columna] of referencias) {
    const { data } = await admin.from(tabla).select(columna).in(columna, ids);
    for (const f of (data ?? []) as unknown as Array<Record<string, string | null>>) {
      const v = f[columna];
      if (v) enUso.add(v);
    }
  }

  const huerfanas = ids.filter((id) => !enUso.has(id));
  if (huerfanas.length === 0) return 0;

  const { error } = await admin.from('companies').delete().in('id', huerfanas);
  return error ? 0 : huerfanas.length;
}

/** Cliente con permisos de servicio, para poder borrar. */
export function clienteDeServicio(api: string, service: string): SupabaseClient {
  return createClient(api, service, { auth: { persistSession: false } });
}

/**
 * Crea un pedido de prueba con la llave de servicio, sin pasar por `create_order_from_cart`,
 * para no atar estas pruebas al flujo de alta de pedidos.
 */
export async function crearPedidoDePrueba(
  admin: SupabaseClient,
  userId: string,
  opciones: { companyId?: string | null; estado?: string; sello?: string | number } = {},
): Promise<{ id: string; numero: string }> {
  const numero = `TEST-${opciones.sello ?? Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const { data, error } = await admin
    .from('orders')
    .insert({
      order_number: numero,
      user_id: userId,
      company_id: opciones.companyId ?? null,
      status: opciones.estado ?? 'PREPARANDO',
      delivery_method: 'RETIRO_TIENDA',
      subtotal_cop: 100000,
      total_cop: 100000,
      // Los exige el disparador `orders_exigir_datos_de_entrega`.
      recipient_name: 'PRUEBA AUTOMATIZADA',
      recipient_document_type: 'CC',
      recipient_document_number: '10000000',
      recipient_phone: '+573000000000',
    })
    .select('id, order_number')
    .single();

  if (error) throw new Error(`crearPedidoDePrueba: ${error.message}`);
  const o = data as { id: string; order_number: string };
  return { id: o.id, numero: o.order_number };
}

/** Borra un pedido de prueba: `invoices` restringe el borrado y va primero; el resto cae en cascada. */
export async function borrarPedidoDePrueba(
  admin: SupabaseClient,
  orderId: string,
): Promise<void> {
  await admin.from('invoice_items').delete().in(
    'invoice_id',
    ((await admin.from('invoices').select('id').eq('order_id', orderId)).data ?? [])
      .map((i: { id: string }) => i.id),
  );
  await admin.from('invoices').delete().eq('order_id', orderId);
  await admin.from('treasury_movements').delete().eq('order_id', orderId);
  await admin.from('inventory_movements').delete().eq('order_id', orderId);
  await admin.from('orders').delete().eq('id', orderId);
}
