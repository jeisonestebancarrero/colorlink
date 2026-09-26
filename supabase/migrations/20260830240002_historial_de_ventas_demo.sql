-- Pedidos de demostración para la analítica, con prefijo 'DEMO-' en order_number.
-- Se insertan ya ENTREGADO para no disparar inventario ni asientos.
do $$
declare
  v_cliente   uuid;
  v_empresa   uuid;
  v_puntos    uuid[];
  v_punto     uuid;
  v_variante  record;
  v_orden     uuid;
  v_fecha     timestamptz;
  v_mes       int;
  v_lineas    int;
  v_cantidad  int;
  v_subtotal  numeric;
  v_total     numeric;
  v_n         int := 0;
  v_estacional numeric;
begin
  if exists (select 1 from public.orders where order_number like 'DEMO-%') then
    raise notice 'El historial de demostración ya existe; no se duplica.';
    return;
  end if;

  select p.id into v_cliente
    from public.profiles p
    join auth.users u on u.id = p.id
   where u.email = 'carlos.mendoza@constructorahorizonte.com';

  if v_cliente is null then
    raise notice 'No hay cliente de demostración; se omite el historial.';
    return;
  end if;

  select company_id into v_empresa from public.profiles where id = v_cliente;
  select array_agg(id) into v_puntos from public.pickup_locations where status = 'ACTIVO';

    -- 24 meses para comparar años completos.
  for v_mes in reverse 23 .. 0 loop
      -- Estacionalidad: más venta en temporada seca.
    v_estacional := case extract(month from (current_date - (v_mes || ' months')::interval))
                       when 12 then 1.6 when 1 then 1.45 when 2 then 1.3
                       when 3 then 1.15 when 7 then 0.75 when 10 then 0.8
                       else 1.0 end;

    for v_n in 1 .. greatest(2, round(6 * v_estacional)::int) loop
      v_fecha := date_trunc('month', current_date - (v_mes || ' months')::interval)
                 + ((random() * 26)::int || ' days')::interval
                 + ((8 + (random() * 10)::int) || ' hours')::interval;

      continue when v_fecha > now();

      v_punto := v_puntos[1 + floor(random() * array_length(v_puntos, 1))::int];

      insert into public.orders (
        order_number, user_id, company_id, status, delivery_method,
        pickup_location_id, subtotal_cop, discount_cop, shipping_cop, total_cop,
        notes, created_at, updated_at
      ) values (
        'DEMO-' || to_char(v_fecha, 'YYMM') || '-' || lpad((random()*99999)::int::text, 5, '0'),
        v_cliente, v_empresa, 'ENTREGADO', 'RETIRO_TIENDA',
        v_punto, 0, 0, 0, 0,
        'Pedido de demostración para la analítica.', v_fecha, v_fecha
      )
      returning id into v_orden;

      v_subtotal := 0;
      v_lineas := 1 + floor(random() * 3)::int;

      for v_variante in
        select pv.id, pv.label, pv.price_cop, pv.cost_cop, p.name, p.code
          from public.product_variants pv
          join public.products p on p.id = pv.product_id
         where pv.status = 'ACTIVO' and pv.price_cop > 0
         order by random()
         limit v_lineas
      loop
        v_cantidad := 1 + floor(random() * 6)::int;

        insert into public.order_items (
          order_id, variant_id, product_name, product_code, presentation,
          unit_price_cop, quantity, subtotal_cop, unit_cost_cop
        ) values (
          v_orden, v_variante.id, v_variante.name, v_variante.code, v_variante.label,
          v_variante.price_cop, v_cantidad, v_variante.price_cop * v_cantidad,
            -- Variación pequeña del costo de reposición.
          round(v_variante.cost_cop * (0.94 + random() * 0.12)::numeric, 2)
        );

        v_subtotal := v_subtotal + v_variante.price_cop * v_cantidad;
      end loop;

      v_total := v_subtotal;

      update public.orders
         set subtotal_cop = v_subtotal, total_cop = v_total, updated_at = v_fecha
       where id = v_orden;
    end loop;
  end loop;

  raise notice 'Historial de demostración: % pedidos.',
    (select count(*) from public.orders where order_number like 'DEMO-%');
end;
$$;
