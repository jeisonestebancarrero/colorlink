-- Al validar el código se avisa explícitamente si el pedido no está pagado, para que
-- en el mostrador no se entregue sin cobrar. El pedido no cambia.
create or replace function public.entregar_por_codigo(_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text := upper(regexp_replace(coalesce(_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_pedido public.orders%rowtype;
begin
  if not (public.is_admin()
          or public.has_permission('orders.status')
          or public.has_permission('shipments.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para entregar pedidos'
      using errcode = '42501';
  end if;

  if length(v_codigo) < 4 then
    raise exception 'CODIGO_CORTO: escribe el código completo que trae el cliente'
      using errcode = '22023';
  end if;

  select * into v_pedido
    from public.orders o
   where upper(regexp_replace(coalesce(o.pickup_code, ''), '[^A-Za-z0-9]', '', 'g')) = v_codigo
     and o.delivery_method = 'RETIRO_TIENDA'
     and public.puede_ver_sede(o.pickup_location_id)
   limit 1;

  if v_pedido.id is null then
    raise exception 'CODIGO_NO_VALIDO: ese código no corresponde a ningún pedido pendiente de retiro en esta sede'
      using errcode = 'P0002';
  end if;

  if v_pedido.status = 'ENTREGADO' then
    raise exception 'YA_ENTREGADO: ese pedido ya fue retirado' using errcode = '23505';
  end if;

  if v_pedido.status = 'CANCELADO' then
    raise exception 'CANCELADO: ese pedido está cancelado. No entregues la mercancía'
      using errcode = '22023';
  end if;

  -- El cobro se revisa antes que el estado y con mensaje propio.
  if not public.pedido_cobrado(v_pedido.id) then
    raise exception
      'SIN_PAGO: el pedido % NO está pagado. No entregues la mercancía. Cuando entre el pago, vuelve a pasar el mismo código.',
      v_pedido.order_number
      using errcode = '22023';
  end if;

  if v_pedido.status <> 'LISTO_PARA_RETIRO' then
    raise exception 'NO_ESTA_LISTO: el pedido % todavía no está listo para retiro (está en %)',
      v_pedido.order_number, v_pedido.status
      using errcode = '22023';
  end if;

  update public.orders
     set status = 'ENTREGADO', updated_at = now()
   where id = v_pedido.id;

  insert into public.conversation_messages (order_id, author_id, kind, body)
  values (v_pedido.id, (select auth.uid()), 'EVENTO',
          'Pedido entregado en tienda, verificado con el código de retiro.');

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'ORDER_PICKUP', 'orders', v_pedido.id,
          jsonb_build_object('order_number', v_pedido.order_number));

  return jsonb_build_object(
    'ok', true,
    'order_id', v_pedido.id,
    'numero', v_pedido.order_number,
    'recibe', v_pedido.recipient_name,
    'documento', v_pedido.recipient_document_number,
    'total', v_pedido.total_cop
  );
end;
$$;

notify pgrst, 'reload schema';
