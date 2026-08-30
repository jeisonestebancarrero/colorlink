-- ============================================================
-- Cerrar el pago sin pagar devuelve el pedido al carrito
-- ============================================================
-- `create_order_from_cart` desactiva el carrito al crear el pedido. Si el
-- cliente cerraba la ventana de pago, se quedaba sin carrito Y con un pedido
-- que no iba a ninguna parte: los productos simplemente desaparecían de la
-- pantalla.
--
-- Lo que espera cualquiera es volver a tener su carrito como estaba. Y el
-- pedido sin pagar no puede quedarse ahí acumulándose: consume numeración y
-- ensucia la bandeja del punto de venta con pedidos que nadie hizo.
--
-- Así que abandonar el pago hace las dos cosas: cancela el pedido y reconstruye
-- el carrito con lo mismo que tenía. Solo funciona sobre un pedido propio,
-- PENDIENTE y sin cobro: uno ya pagado no se deshace desde la tienda.
create or replace function public.devolver_pedido_al_carrito(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.orders%rowtype;
  v_cart   uuid;
  v_lineas int := 0;
begin
  select * into v_pedido from public.orders where id = _order_id;
  if not found then
    raise exception 'NOT_FOUND: ese pedido no existe' using errcode = 'P0002';
  end if;

  if v_pedido.user_id <> (select auth.uid()) then
    raise exception 'FORBIDDEN: ese pedido no es tuyo' using errcode = '42501';
  end if;

  if v_pedido.status <> 'PENDIENTE' or public.pedido_cobrado(_order_id) then
    raise exception 'YA_EN_CURSO: ese pedido ya está pagado o en proceso'
      using errcode = '22023';
  end if;

  -- El carrito activo del cliente, o uno nuevo. Puede haber alcanzado a
  -- agregar algo más mientras tanto, así que se suma en vez de reemplazar.
  select id into v_cart
    from public.carts
   where user_id = v_pedido.user_id and is_active
   limit 1;

  if v_cart is null then
    insert into public.carts (user_id, is_active) values (v_pedido.user_id, true)
    returning id into v_cart;
  end if;

  insert into public.cart_items (cart_id, variant_id, color_id, quantity)
  select v_cart, oi.variant_id, c.id, oi.quantity
    from public.order_items oi
    left join public.colors c on c.name = oi.color_name
   where oi.order_id = _order_id
     and oi.variant_id is not null;

  get diagnostics v_lineas = row_count;

  update public.orders
     set status = 'CANCELADO',
         notes = coalesce(notes || ' | ', '') || 'Devuelto al carrito: el cliente no completó el pago.',
         updated_at = now()
   where id = _order_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'ORDER_ABANDONED', 'orders', _order_id,
          jsonb_build_object('lineas', v_lineas));

  return jsonb_build_object('carrito', v_cart, 'lineas', v_lineas);
end;
$$;

revoke all on function public.devolver_pedido_al_carrito(uuid) from public;
grant execute on function public.devolver_pedido_al_carrito(uuid) to authenticated;
