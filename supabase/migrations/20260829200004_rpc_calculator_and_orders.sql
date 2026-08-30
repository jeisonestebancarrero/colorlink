-- ============================================================
-- FASE 7 y 9 — Motor de cálculo y creación de pedidos
-- ============================================================
-- Las dos piezas de lógica que el MÓDULO 5 prohíbe dejar en el frontend.
-- ============================================================

-- ============================================================
-- MÓDULO 14 — MOTOR DE CÁLCULO DE PINTURA
-- ============================================================
-- Unifica los DOS motores contradictorios que detectó la auditoría (R3):
-- el de generatePreliminaryAnalysis (divisores fijos, sin desperdicio) y el
-- de PaintCalculatorPage (con factor de superficie, sin margen).
--
-- Fórmula: litros/galones = área x manos x factor_superficie x (1+desperdicio)
--                           / rendimiento
--
-- El rendimiento y el precio se leen SIEMPRE de la base. La entrada del
-- cliente se limita a área, manos, tipo de superficie y desperdicio.
create or replace function public.calculate_paint(
  _variant_id uuid,
  _area_m2 numeric,
  _coats int default 2,
  _surface_factor numeric default 1.0,
  _waste_percent numeric default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rendimiento numeric;
  v_precio      numeric;
  v_producto    text;
  v_presentacion text;
  v_volumen     numeric;
  v_galones_necesarios numeric;
  v_unidades    int;
  v_subtotal    numeric;
begin
  if _area_m2 is null or _area_m2 <= 0 then
    raise exception 'VALIDATION: el área debe ser mayor que cero' using errcode = '22023';
  end if;
  if _coats is null or _coats < 1 or _coats > 5 then
    raise exception 'VALIDATION: el número de manos debe estar entre 1 y 5' using errcode = '22023';
  end if;
  if _surface_factor is null or _surface_factor < 1 or _surface_factor > 2 then
    raise exception 'VALIDATION: el factor de superficie debe estar entre 1.0 y 2.0' using errcode = '22023';
  end if;
  if _waste_percent is null or _waste_percent < 0 or _waste_percent > 50 then
    raise exception 'VALIDATION: el desperdicio debe estar entre 0 y 50%%' using errcode = '22023';
  end if;

  select p.spread_rate_m2_per_gal, v.price_cop, p.name, v.label, v.volume_liters
    into v_rendimiento, v_precio, v_producto, v_presentacion, v_volumen
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = _variant_id
    and v.status = 'ACTIVO'
    and p.status = 'ACTIVO';

  if v_producto is null then
    raise exception 'PRODUCT_NOT_FOUND: la presentación indicada no existe o no está activa'
      using errcode = 'P0002';
  end if;

  -- Una herramienta no tiene rendimiento: calcular sobre ella sería dividir
  -- por cero. El frontend actual hace `spreadRateM2PerGal || 22`, que le
  -- asignaría en silencio el rendimiento de una pintura.
  if v_rendimiento is null or v_rendimiento <= 0 then
    raise exception 'NOT_CALCULABLE: este producto no tiene rendimiento por galón (herramienta o complemento)'
      using errcode = '22023';
  end if;

  v_galones_necesarios :=
    (_area_m2 * _coats * _surface_factor * (1 + _waste_percent / 100.0)) / v_rendimiento;

  -- Nunca se vende una fracción de envase: siempre se redondea hacia arriba.
  v_unidades := ceil(v_galones_necesarios / greatest(coalesce(v_volumen, 3.785) / 3.785, 0.01));
  v_unidades := greatest(v_unidades, 1);
  v_subtotal := v_unidades * v_precio;

  return jsonb_build_object(
    'variant_id',        _variant_id,
    'product_name',      v_producto,
    'presentation',      v_presentacion,
    'area_m2',           _area_m2,
    'coats',             _coats,
    'surface_factor',    _surface_factor,
    'waste_percent',     _waste_percent,
    'spread_rate_m2_per_gal', v_rendimiento,
    'gallons_required',  round(v_galones_necesarios, 2),
    'units_recommended', v_unidades,
    'unit_price_cop',    v_precio,
    'subtotal_cop',      v_subtotal,
    'currency',          'COP'
  );
end;
$$;

revoke execute on function public.calculate_paint(uuid, numeric, int, numeric, numeric) from public;
grant execute on function public.calculate_paint(uuid, numeric, int, numeric, numeric) to anon, authenticated;

-- ============================================================
-- MÓDULO 60 — CARRITO → PEDIDO, TRANSACCIONAL
-- ============================================================
create or replace function public.create_order_from_cart(
  _delivery_method text,
  _pickup_location_id uuid default null,
  _shipping_address text default null,
  _shipping_city text default null,
  _project_id uuid default null,
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Cabecera con importes en cero: se rellenan tras sumar las líneas.
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

  -- Líneas: el precio se toma de la variante EN ESTE INSTANTE y se congela.
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
      color_name, unit_price_cop, quantity, subtotal_cop, image_url
    ) values (
      v_order_id, r.variant_id, r.product_name, r.product_code, r.label,
      r.color_name, r.price_cop, r.quantity, r.price_cop * r.quantity, r.image_url
    );

    v_subtotal := v_subtotal + (r.price_cop * r.quantity);
  end loop;

  -- Descuento por kit: 8%, la misma regla que aplicaba el frontend, ahora
  -- calculada en el servidor sobre precios que el cliente no controla.
  if exists (
    select 1 from public.cart_items ci
    where ci.cart_id = v_cart_id and ci.kit_solution_id is not null
  ) then
    v_descuento := round(v_subtotal * 0.08, 2);
  end if;

  -- Envío: gratis al retirar en tienda o por encima de 500.000 COP.
  if v_metodo = 'ENVIO' and (v_subtotal - v_descuento) < 500000 then
    v_envio := 25000;
  end if;

  update public.orders
     set subtotal_cop = v_subtotal,
         discount_cop = v_descuento,
         shipping_cop = v_envio,
         total_cop    = v_subtotal - v_descuento + v_envio
   where id = v_order_id;

  -- Envío o retiro asociado.
  if v_metodo = 'ENVIO' then
    insert into public.shipments (order_id, address, city, status)
    values (v_order_id, _shipping_address, _shipping_city, 'PENDIENTE');
  end if;

  -- Pago pendiente (MÓDULO 17): la pasarela real se integrará después.
  insert into public.payments (order_id, method, status, amount_cop)
  values (v_order_id, 'PSE', 'PENDIENTE', v_subtotal - v_descuento + v_envio);

  -- El carrito se cierra, no se borra: queda el rastro de qué se convirtió.
  update public.carts set is_active = false where id = v_cart_id;

  -- Notificación y auditoría.
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
$$;

revoke execute on function public.create_order_from_cart(text, uuid, text, text, uuid, text) from public, anon;
grant execute on function public.create_order_from_cart(text, uuid, text, text, uuid, text) to authenticated;

-- ============================================================
-- MÓDULO 61 — TRANSICIONES DE ESTADO DE PEDIDO
-- ============================================================
create or replace function public.change_order_status(_order_id uuid, _nuevo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual public.order_status;
  v_nuevo  public.order_status;
  v_permitidos public.order_status[];
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración cambia el estado de un pedido'
      using errcode = '42501';
  end if;

  select status into v_actual from public.orders where id = _order_id;
  if v_actual is null then
    raise exception 'ORDER_NOT_FOUND: pedido no encontrado' using errcode = 'P0002';
  end if;

  v_nuevo := _nuevo::public.order_status;

  -- Máquina de estados. No se permite saltar pasos ni resucitar un pedido
  -- entregado o cancelado.
  v_permitidos := case v_actual
    when 'PENDIENTE'  then array['CONFIRMADO','CANCELADO']::public.order_status[]
    when 'CONFIRMADO' then array['PREPARANDO','CANCELADO']::public.order_status[]
    when 'PREPARANDO' then array['ENVIADO','LISTO_PARA_RETIRO','CANCELADO']::public.order_status[]
    when 'ENVIADO'    then array['ENTREGADO']::public.order_status[]
    when 'LISTO_PARA_RETIRO' then array['ENTREGADO']::public.order_status[]
    else array[]::public.order_status[]
  end;

  if not (v_nuevo = any(v_permitidos)) then
    raise exception 'INVALID_TRANSITION: no se puede pasar de % a %', v_actual, v_nuevo
      using errcode = '22023';
  end if;

  update public.orders set status = v_nuevo where id = _order_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'ORDER_STATUS_CHANGED', 'orders', _order_id,
          jsonb_build_object('from', v_actual, 'to', v_nuevo));
end;
$$;

revoke execute on function public.change_order_status(uuid, text) from public, anon;
grant execute on function public.change_order_status(uuid, text) to authenticated;
