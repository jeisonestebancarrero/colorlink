import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Limpieza de las cuentas que crea una prueba.
 *
 * POR QUÉ EXISTE: las dos pruebas que registran usuarios ya borraban al
 * terminar, pero lo hacían recorriendo una lista de ids que iban recogiendo
 * por el camino. Si el `beforeAll` o un `it` se caía a medias, la lista
 * quedaba incompleta y esas cuentas se quedaban en la base para siempre. Así
 * se acumularon 62 usuarios y 71 empresas de prueba, hasta el punto de que la
 * pantalla de Clientes mostraba 72 empresas con el mismo nombre y el negocio
 * real quedaba enterrado debajo.
 *
 * LA FORMA CORRECTA es borrar por PATRÓN, no por lista: todas las cuentas de
 * una corrida comparten el mismo sello de tiempo en el correo, así que una
 * sola pasada las atrapa todas sin importar en qué punto se rompió la prueba.
 *
 * Se limpia además por SUFIJO `.test` en general, para arrastrar lo que
 * hubieran dejado corridas anteriores interrumpidas. Ningún correo real
 * termina en `.test`: es un dominio reservado justamente para esto
 * (RFC 2606), así que el patrón no puede alcanzar a un cliente de verdad.
 */

/** Dominio reservado por la RFC 2606. Ningún correo real termina así. */
export const SUFIJO_DE_PRUEBA = '.test';

export function correoDePrueba(prefijo: string, sello: string | number): string {
  return `${prefijo}.${sello}@correo${SUFIJO_DE_PRUEBA}`;
}

/**
 * Borra las cuentas de prueba y las empresas que queden sin dueño.
 *
 * @param sello  Si se pasa, solo borra las de esa corrida. Sin él, todas las
 *               que terminen en `.test`, incluidas las de corridas anteriores.
 */
export async function limpiarCuentasDePrueba(
  admin: SupabaseClient,
  sello?: string | number,
): Promise<{ usuarios: number; empresas: number }> {
  let usuarios = 0;

  // `listUsers` pagina: sin recorrer las páginas, una base con muchas cuentas
  // deja fuera justo las que se acaban de crear.
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error || !data || data.users.length === 0) break;

    // `listUsers` viene sin tipar en esta versión del SDK; se acota a lo que
    // se usa en lugar de arrastrar `never`.
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

  // Las empresas que se queden sin ningún perfil, miembro, sede ni operación.
  // `profiles.company_id` es ON DELETE SET NULL, así que al irse el último
  // empleado la empresa queda colgando sin que nada la borre.
  const empresas = await borrarEmpresasHuerfanas(admin);
  return { usuarios, empresas };
}

/**
 * Empresas sin dueño ni operación.
 *
 * Se comprueban TODAS las referencias y no solo el perfil: una empresa con un
 * pedido histórico no es basura, aunque hoy no tenga usuarios.
 */
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
 * Crea un pedido de prueba para el cliente indicado.
 *
 * POR QUÉ EXISTE: las pruebas del chat y de la campana usaban un pedido que
 * venía sembrado con los datos de demostración. Al quitar la demo —el sistema
 * pasó a la versión real— esos pedidos desaparecieron y las pruebas se
 * quedaron sin sobre qué trabajar.
 *
 * Una prueba que depende de datos que alguien sembró alguna vez es una prueba
 * frágil: funciona hasta que se limpia la base, y entonces falla por un motivo
 * que no tiene que ver con lo que estaba comprobando. El dato que una prueba
 * necesita lo crea la prueba.
 *
 * Se inserta con la llave de servicio y no por `create_order_from_cart` a
 * propósito: aquí no se está probando el alta de pedidos, solo hace falta un
 * pedido sobre el que conversar. Pasar por el flujo completo ataría estas
 * pruebas a los cambios de aquél.
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
      // El disparador `orders_exigir_datos_de_entrega` los exige: un pedido sin
      // quien reciba es lo que hacía que la mercancía se quedara en la puerta.
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

/**
 * Borra un pedido de prueba y todo lo que cuelga de él.
 *
 * `invoices` RESTRINGE el borrado del pedido, así que va primero. El resto
 * —líneas, pagos, mensajes, avisos— cae en cascada.
 */
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
