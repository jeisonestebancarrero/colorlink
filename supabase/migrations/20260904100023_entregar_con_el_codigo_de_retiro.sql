-- Entregar un pedido verificando el código de retiro.
--
-- El código existía desde el principio: se le muestra al cliente, viaja en el
-- correo y se imprime en la ficha del pedido. Pero NO SE COMPROBABA EN NINGÚN
-- SITIO. El pedido se daba por entregado pulsando un botón, así que el código
-- era decorativo: cualquiera podía llevarse la mercancía diciendo un número de
-- pedido, y quien atendía no tenía forma de confirmar que la persona frente al
-- mostrador fuera la que compró.
--
-- Aquí se invierte: se escribe el código que trae el cliente y el sistema
-- decide. Si coincide, el pedido pasa a ENTREGADO solo. Si no, no pasa nada.
--
-- Tres cosas que no se hacen a propósito:
--
--   1. NO se dice si el código existe pero es de otra sede. Un mensaje que
--      distinga «no existe» de «es de otro lado» convierte esto en un oráculo
--      para adivinar códigos ajenos. Se responde lo mismo en los dos casos.
--   2. NO exige ser administrador. Quien entrega mercancía es el del mostrador,
--      y obligar a un administrador para cada retiro es lo que hace que se
--      terminen compartiendo contraseñas.
--   3. NO acepta un pedido que no esté LISTO_PARA_RETIRO. Entregar algo que
--      todavía se está alistando es exactamente el error que este código
--      previene.
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
     -- La sede acota igual que en el resto del portal: quien atiende en
     -- Barranquilla no entrega un pedido de Medellín.
     and public.puede_ver_sede(o.pickup_location_id)
   limit 1;

  if v_pedido.id is null then
    raise exception 'CODIGO_NO_VALIDO: ese código no corresponde a ningún pedido pendiente de retiro en esta sede'
      using errcode = 'P0002';
  end if;

  if v_pedido.status = 'ENTREGADO' then
    raise exception 'YA_ENTREGADO: ese pedido ya fue retirado' using errcode = '23505';
  end if;

  if v_pedido.status <> 'LISTO_PARA_RETIRO' then
    raise exception 'NO_ESTA_LISTO: el pedido % todavía no está listo para retiro (está en %)',
      v_pedido.order_number, v_pedido.status
      using errcode = '22023';
  end if;

  update public.orders
     set status = 'ENTREGADO', updated_at = now()
   where id = v_pedido.id;

  -- Queda en la conversación del pedido, que es donde el cliente y el equipo
  -- miran la historia. El disparador de trazabilidad anota el cambio de
  -- estado; esto añade CÓMO se entregó.
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

revoke all on function public.entregar_por_codigo(text) from public, anon;
grant execute on function public.entregar_por_codigo(text) to authenticated;

notify pgrst, 'reload schema';
