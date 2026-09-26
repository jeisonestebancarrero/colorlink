-- Propaga el costo al traslado entre bodegas y lo congela en la línea del pedido;
-- sin ambos, el margen sale mal en silencio.

-- El traslado lleva el costo: sin esto el destino recibe unidades a costo cero
-- y su margen sale del 100 %.
create or replace function public.transfer_inventory(
  _variant_id  uuid,
  _origen      uuid,
  _destino     uuid,
  _cantidad    integer,
  _notas       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disponible integer;
  v_costo_o    numeric(14,2);
  v_saldo_d    integer;
  v_costo_d    numeric(14,2);
  v_ref        text;
  v_salida     jsonb;
  v_entrada    jsonb;
begin
  if not (public.is_admin() or public.has_permission('inventory.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para mover inventario'
      using errcode = '42501';
  end if;

  if _cantidad is null or _cantidad <= 0 then
    raise exception 'BAD_QTY: la cantidad a trasladar debe ser mayor que cero'
      using errcode = '22023';
  end if;

  if _origen = _destino then
    raise exception 'SAME_LOCATION: el origen y el destino son el mismo punto de venta'
      using errcode = '22023';
  end if;

  select qty_available, avg_cost_cop into v_disponible, v_costo_o
    from public.inventory
   where variant_id = _variant_id and location_id = _origen
   for update;

  if v_disponible is null then
    raise exception 'NOT_FOUND: esa referencia no existe en el punto de origen'
      using errcode = 'P0002';
  end if;

  if v_disponible < _cantidad then
    raise exception 'INSUFFICIENT_STOCK: el origen solo tiene % unidades disponibles', v_disponible
      using errcode = '22023';
  end if;

  insert into public.inventory (variant_id, location_id, qty_available, qty_reserved)
  values (_variant_id, _destino, 0, 0)
  on conflict (variant_id, location_id) do nothing;

  select qty_available, avg_cost_cop into v_saldo_d, v_costo_d
    from public.inventory
   where variant_id = _variant_id and location_id = _destino
   for update;

  v_ref := 'TRASLADO-' || to_char(now(), 'YYYYMMDDHH24MISS');

  v_salida := public.register_inventory_movement(
    _variant_id, _origen, 'TRASLADO_SALIDA', _cantidad, v_ref, _notas);
  v_entrada := public.register_inventory_movement(
    _variant_id, _destino, 'TRASLADO_ENTRADA', _cantidad, v_ref, _notas);

    -- El destino promedia con el costo del origen; el origen no cambia de costo.
  if coalesce(v_costo_o, 0) > 0 then
    update public.inventory
       set avg_cost_cop = case
             when v_saldo_d <= 0 or coalesce(v_costo_d, 0) = 0 then v_costo_o
             else round(((v_saldo_d * v_costo_d) + (_cantidad * v_costo_o))::numeric
                        / (v_saldo_d + _cantidad), 2)
           end,
           updated_at = now()
     where variant_id = _variant_id and location_id = _destino;
  end if;

  return jsonb_build_object(
    'referencia', v_ref,
    'saldo_origen', (v_salida ->> 'balance')::integer,
    'saldo_destino', (v_entrada ->> 'balance')::integer
  );
end;
$$;

-- Costo vigente para congelar en la venta: bodega de despacho, si no promedio de
-- bodegas con costo, si no el estándar. Nunca cero, que daría margen del 100 %.
create or replace function public.costo_vigente(_variant_id uuid, _location_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select i.avg_cost_cop from public.inventory i
      where i.variant_id = _variant_id
        and i.location_id = _location_id
        and i.avg_cost_cop > 0),
    (select round(avg(i.avg_cost_cop), 2) from public.inventory i
      where i.variant_id = _variant_id and i.avg_cost_cop > 0),
    (select v.cost_cop from public.product_variants v where v.id = _variant_id)
  );
$$;

revoke all on function public.costo_vigente(uuid, uuid) from public, anon;
grant execute on function public.costo_vigente(uuid, uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.create_order_from_cart(_delivery_method text, _pickup_location_id uuid DEFAULT NULL::uuid, _shipping_address text DEFAULT NULL::text, _shipping_city text DEFAULT NULL::text, _project_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id  uuid := (select auth.uid());
  v_cart_id  uuid;
  v_order_id uuid;
  v_company_id uuid;
  v_subtotal numeric := 0;
  v_descuento numeric := 0;
  v_envio    numeric := 0;
  v_items    int := 0;
  v_metodo   public.delivery_method;
  r          record;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;

  v_metodo := case when _delivery_method = 'ENVIO' then 'ENVIO'::public.delivery_method
                   else 'RETIRO_TIENDA'::public.delivery_method end;

  if v_metodo = 'RETIRO_TIENDA' and _pickup_location_id is null then
    raise exception 'VALIDATION: debes elegir un punto de retiro' using errcode = '22023';
  end if;
  if v_metodo = 'ENVIO' and coalesce(trim(_shipping_address), '') = '' then
    raise exception 'VALIDATION: la dirección de envío es obligatoria' using errcode = '22023';
  end if;

  select c.id into v_cart_id
  from public.carts c
  where c.user_id = v_user_id and c.is_active
  limit 1;

  if v_cart_id is null then
    raise exception 'EMPTY_CART: no hay carrito activo' using errcode = '22023';
  end if;

  select count(*) into v_items from public.cart_items where cart_id = v_cart_id;
  if v_items = 0 then
    raise exception 'EMPTY_CART: el carrito está vacío' using errcode = '22023';
  end if;

  select p.company_id into v_company_id from public.profiles p where p.id = v_user_id;

    -- Importes en cero; se rellenan tras sumar las líneas.
  insert into public.orders (
    order_number, user_id, company_id, project_id, status, delivery_method,
    shipping_address, shipping_city, pickup_location_id, pickup_code, notes
  ) values (
    'ORD-PNT-' || lpad(nextval('public.order_number_seq')::text, 6, '0'),
    v_user_id, v_company_id, _project_id, 'PENDIENTE', v_metodo,
    _shipping_address, _shipping_city, _pickup_location_id,
    case when v_metodo = 'RETIRO_TIENDA'
         then upper(substr(md5(gen_random_uuid()::text), 1, 6)) end,
    _notes
  )
  returning id into v_order_id;

    -- El precio se toma de la variante en este instante y se congela.
  for r in
    select ci.quantity,
           v.id as variant_id, v.label, v.price_cop,
           p.name as product_name, p.code as product_code, p.image_url,
           col.name as color_name,
           v.status as variant_status, p.status as product_status
    from public.cart_items ci
    join public.product_variants v on v.id = ci.variant_id
    join public.products p on p.id = v.product_id
    left join public.colors col on col.id = ci.color_id
    where ci.cart_id = v_cart_id
  loop
    if r.variant_status <> 'ACTIVO' or r.product_status <> 'ACTIVO' then
      raise exception 'PRODUCT_UNAVAILABLE: "%" ya no está disponible', r.product_name
        using errcode = '22023';
    end if;

    insert into public.order_items (
      order_id, variant_id, product_name, product_code, presentation,
      color_name, unit_price_cop, quantity, subtotal_cop, image_url,
      unit_cost_cop
    ) values (
      v_order_id, r.variant_id, r.product_name, r.product_code, r.label,
      r.color_name, r.price_cop, r.quantity, r.price_cop * r.quantity, r.image_url,
        -- El costo se congela con el precio para que la utilidad no cambie después.
      public.costo_vigente(r.variant_id, _pickup_location_id)
    );

    v_subtotal := v_subtotal + (r.price_cop * r.quantity);
  end loop;

    -- Descuento por kit del 8 %, calculado en el servidor.
  if exists (
    select 1 from public.cart_items ci
    where ci.cart_id = v_cart_id and ci.kit_solution_id is not null
  ) then
    v_descuento := round(v_subtotal * 0.08, 2);
  end if;

    -- Envío gratis al retirar en tienda o por encima de 500.000 COP.
  if v_metodo = 'ENVIO' and (v_subtotal - v_descuento) < 500000 then
    v_envio := 25000;
  end if;

  update public.orders
     set subtotal_cop = v_subtotal,
         discount_cop = v_descuento,
         shipping_cop = v_envio,
         total_cop    = v_subtotal - v_descuento + v_envio
   where id = v_order_id;

  if v_metodo = 'ENVIO' then
    insert into public.shipments (order_id, address, city, status)
    values (v_order_id, _shipping_address, _shipping_city, 'PENDIENTE');
  end if;

    -- Pago pendiente hasta que la pasarela lo confirme.
  insert into public.payments (order_id, method, status, amount_cop)
  values (v_order_id, 'PSE', 'PENDIENTE', v_subtotal - v_descuento + v_envio);

    -- El carrito se cierra, no se borra, para conservar el rastro.
  update public.carts set is_active = false where id = v_cart_id;

  insert into public.notifications (user_id, order_id, type, title, message, action_required, action_label)
  select v_user_id, v_order_id, 'success', 'Pedido confirmado',
         'Tu pedido ' || o.order_number || ' fue creado por ' ||
         to_char(o.total_cop, 'FM999G999G999') || ' COP.',
         true, 'Ver pedido'
  from public.orders o where o.id = v_order_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (v_user_id, 'ORDER_CREATED', 'orders', v_order_id,
          jsonb_build_object('items', v_items, 'total', v_subtotal - v_descuento + v_envio));

  return v_order_id;
end;
$function$;
