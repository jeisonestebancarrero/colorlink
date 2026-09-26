-- Inventario, recepciones y pedidos por color: 10 galones Terracota no son 10 galones Blanco.
-- color_id nulo = producto sin carta de color (herramientas) o existencias previas sin clasificar.

alter table public.inventory             add column color_id uuid references public.colors(id);
alter table public.inventory_movements   add column color_id uuid references public.colors(id);
alter table public.purchase_receipt_items add column color_id uuid references public.colors(id);
alter table public.order_items           add column color_id uuid references public.colors(id);

alter table public.inventory drop constraint inventory_unico_por_variante_y_punto;
alter table public.inventory
  add constraint inventory_unico_por_variante_punto_y_color
  unique nulls not distinct (variant_id, location_id, color_id);
create index inventory_color_id_idx on public.inventory (color_id);

-- Pedidos anteriores: el color se guardaba solo como texto.
update public.order_items oi
   set color_id = c.id
  from public.colors c, public.product_variants v
 where oi.color_id is null and oi.color_name is not null
   and v.id = oi.variant_id
   and c.name = oi.color_name
   and exists (select 1 from public.product_colors pc
                where pc.product_id = v.product_id and pc.color_id = c.id);

create or replace function public.producto_tiene_colores(_variant_id uuid)
returns boolean
language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.product_variants v
      join public.product_colors pc on pc.product_id = v.product_id
     where v.id = _variant_id);
$$;

-- Un producto con carta exige uno de sus colores; uno sin carta no admite color.
create or replace function public.exigir_color_valido(_variant_id uuid, _color_id uuid)
returns void
language plpgsql stable security definer set search_path to ''
as $$
declare
  v_producto text;
begin
  select p.name into v_producto
    from public.product_variants v join public.products p on p.id = v.product_id
   where v.id = _variant_id;

  if public.producto_tiene_colores(_variant_id) then
    if _color_id is null then
      raise exception 'COLOR_REQUERIDO: elige el color de «%»', v_producto using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.product_variants v
        join public.product_colors pc on pc.product_id = v.product_id
       where v.id = _variant_id and pc.color_id = _color_id) then
      raise exception 'COLOR_NO_OFRECIDO: «%» no se ofrece en ese color', v_producto using errcode = '22023';
    end if;
  elsif _color_id is not null then
    raise exception 'SIN_CARTA: «%» no se vende por color', v_producto using errcode = '22023';
  end if;
end;
$$;

create or replace function public.recepcion_exige_color()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  perform public.exigir_color_valido(new.variant_id, new.color_id);
  return new;
end;
$$;

create trigger purchase_receipt_items_exigir_color
  before insert or update of variant_id, color_id on public.purchase_receipt_items
  for each row execute function public.recepcion_exige_color();

-- Firmas nuevas con color: se borran las viejas para no dejar sobrecargas.
drop function public.register_inventory_movement(uuid, uuid, text, integer, text, text);
drop function public.transfer_inventory(uuid, uuid, uuid, integer, text);
drop function public.set_reorder_point(uuid, uuid, integer);
drop function public.bodega_de_despacho(uuid, uuid);

create or replace function public.register_inventory_movement(
  _variant_id uuid, _location_id uuid, _kind text, _quantity integer,
  _reference text default null, _notes text default null, _color_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_kind      public.movement_kind;
  v_actual    int;
  v_reservado int;
  v_nuevo     int;
  v_delta     int;
  v_id        uuid;
begin
  if not (public.is_admin() or public.has_permission('inventory.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para mover inventario' using errcode = '42501';
  end if;
  if _quantity is null or _quantity <= 0 then
    raise exception 'VALIDATION: la cantidad debe ser mayor que cero' using errcode = '22023';
  end if;

  v_kind := _kind::public.movement_kind;

  select qty_available, qty_reserved into v_actual, v_reservado
  from public.inventory
  where variant_id = _variant_id and location_id = _location_id
    and color_id is not distinct from _color_id
  for update;

  if v_actual is null then
    -- Sin color solo se mueve lo que ya existía sin clasificar; no se crean filas nuevas así.
    perform public.exigir_color_valido(_variant_id, _color_id);
    insert into public.inventory (variant_id, location_id, color_id, qty_available, qty_reserved)
    values (_variant_id, _location_id, _color_id, 0, 0);
    v_actual := 0; v_reservado := 0;
  end if;

  v_delta := case v_kind
    when 'ENTRADA'           then  _quantity
    when 'TRASLADO_ENTRADA'  then  _quantity
    when 'SALIDA'            then -_quantity
    when 'TRASLADO_SALIDA'   then -_quantity
    when 'AJUSTE'            then  _quantity - v_actual  -- el ajuste FIJA el saldo
    else 0
  end;

  v_nuevo := v_actual + v_delta;

  if v_nuevo < 0 then
    raise exception 'INSUFFICIENT_STOCK: no hay existencias suficientes (disponible: %)', v_actual
      using errcode = '22023';
  end if;
  if v_kind = 'RESERVA' then
    if v_reservado + _quantity > v_actual then
      raise exception 'INSUFFICIENT_STOCK: no se puede reservar más de lo disponible'
        using errcode = '22023';
    end if;
    v_reservado := v_reservado + _quantity;
  elsif v_kind = 'LIBERACION' then
    v_reservado := greatest(0, v_reservado - _quantity);
  end if;

  update public.inventory
     set qty_available = v_nuevo, qty_reserved = v_reservado
   where variant_id = _variant_id and location_id = _location_id
     and color_id is not distinct from _color_id;

  insert into public.inventory_movements (
    variant_id, location_id, color_id, kind, quantity, balance_after, reference, notes, created_by
  ) values (
    _variant_id, _location_id, _color_id, v_kind,
    case when v_kind = 'AJUSTE' then abs(v_delta) else _quantity end,
    v_nuevo, _reference, _notes, (select auth.uid())
  )
  returning id into v_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'INVENTORY_MOVEMENT', 'inventory_movements', v_id,
          jsonb_build_object('kind', _kind, 'qty', _quantity, 'balance', v_nuevo, 'color_id', _color_id));

  return jsonb_build_object('id', v_id, 'balance', v_nuevo, 'reserved', v_reservado);
end;
$function$;

create or replace function public.transfer_inventory(
  _variant_id uuid, _origen uuid, _destino uuid, _cantidad integer,
  _notas text default null, _color_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
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
    raise exception 'FORBIDDEN: no tienes permiso para mover inventario' using errcode = '42501';
  end if;
  if _cantidad is null or _cantidad <= 0 then
    raise exception 'BAD_QTY: la cantidad a trasladar debe ser mayor que cero' using errcode = '22023';
  end if;
  if _origen = _destino then
    raise exception 'SAME_LOCATION: el origen y el destino son el mismo punto de venta' using errcode = '22023';
  end if;

  select qty_available, avg_cost_cop into v_disponible, v_costo_o
    from public.inventory
   where variant_id = _variant_id and location_id = _origen
     and color_id is not distinct from _color_id
   for update;

  if v_disponible is null then
    raise exception 'NOT_FOUND: esa referencia no existe en el punto de origen' using errcode = 'P0002';
  end if;
  if v_disponible < _cantidad then
    raise exception 'INSUFFICIENT_STOCK: el origen solo tiene % unidades disponibles', v_disponible
      using errcode = '22023';
  end if;

  insert into public.inventory (variant_id, location_id, color_id, qty_available, qty_reserved)
  values (_variant_id, _destino, _color_id, 0, 0)
  on conflict (variant_id, location_id, color_id) do nothing;

  select qty_available, avg_cost_cop into v_saldo_d, v_costo_d
    from public.inventory
   where variant_id = _variant_id and location_id = _destino
     and color_id is not distinct from _color_id
   for update;

  v_ref := 'TRASLADO-' || to_char(now(), 'YYYYMMDDHH24MISS');

  v_salida := public.register_inventory_movement(
    _variant_id, _origen, 'TRASLADO_SALIDA', _cantidad, v_ref, _notas, _color_id);
  v_entrada := public.register_inventory_movement(
    _variant_id, _destino, 'TRASLADO_ENTRADA', _cantidad, v_ref, _notas, _color_id);

  -- El destino promedia lo que tenía con lo que llega, al costo del origen.
  if coalesce(v_costo_o, 0) > 0 then
    update public.inventory
       set avg_cost_cop = case
             when v_saldo_d <= 0 or coalesce(v_costo_d, 0) = 0 then v_costo_o
             else round(((v_saldo_d * v_costo_d) + (_cantidad * v_costo_o))::numeric
                        / (v_saldo_d + _cantidad), 2)
           end,
           updated_at = now()
     where variant_id = _variant_id and location_id = _destino
       and color_id is not distinct from _color_id;
  end if;

  return jsonb_build_object(
    'referencia', v_ref,
    'saldo_origen', (v_salida ->> 'balance')::integer,
    'saldo_destino', (v_entrada ->> 'balance')::integer
  );
end;
$function$;

create or replace function public.set_reorder_point(
  _variant_id uuid, _location_id uuid, _min_qty integer, _color_id uuid default null)
returns void
language plpgsql security definer set search_path to ''
as $function$
begin
  if not (public.is_admin() or public.has_permission('inventory.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para modificar el inventario' using errcode = '42501';
  end if;
  if _min_qty is null or _min_qty < 0 then
    raise exception 'BAD_QTY: el punto de reorden no puede ser negativo' using errcode = '22023';
  end if;

  update public.inventory
     set min_qty = _min_qty, updated_at = now()
   where variant_id = _variant_id and location_id = _location_id
     and color_id is not distinct from _color_id;

  if not found then
    raise exception 'NOT_FOUND: esa referencia no existe en ese punto de venta' using errcode = 'P0002';
  end if;
end;
$function$;

-- Sin punto de retiro, despacha la bodega con más existencias de ese color.
create or replace function public.bodega_de_despacho(_order_id uuid, _variant_id uuid, _color_id uuid default null)
returns uuid
language sql stable security definer set search_path to ''
as $function$
  select coalesce(
    (select o.pickup_location_id from public.orders o
      where o.id = _order_id and o.pickup_location_id is not null),
    (select i.location_id from public.inventory i
      where i.variant_id = _variant_id and i.color_id is not distinct from _color_id
      order by (i.qty_available - i.qty_reserved) desc
      limit 1),
    (select l.id from public.pickup_locations l where l.status = 'ACTIVO' limit 1)
  );
$function$;

-- Con varias filas por color, el costo del punto es el promedio de las que tienen costo.
create or replace function public.costo_vigente(_variant_id uuid, _location_id uuid)
returns numeric
language sql stable security definer set search_path to ''
as $function$
  select coalesce(
    (select round(avg(i.avg_cost_cop), 2) from public.inventory i
      where i.variant_id = _variant_id and i.location_id = _location_id and i.avg_cost_cop > 0),
    (select round(avg(i.avg_cost_cop), 2) from public.inventory i
      where i.variant_id = _variant_id and i.avg_cost_cop > 0),
    (select v.cost_cop from public.product_variants v where v.id = _variant_id)
  );
$function$;

create or replace function public.confirm_purchase_receipt(_receipt_id uuid)
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_rec      public.purchase_receipts%rowtype;
  r          record;
  v_saldo    integer;
  v_promedio numeric(14,2);
  v_total    numeric(14,2) := 0;
  v_lineas   integer := 0;
begin
  if not (public.is_admin() or public.has_permission('inventory.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para recibir mercancía' using errcode = '42501';
  end if;

  select * into v_rec from public.purchase_receipts where id = _receipt_id for update;
  if v_rec.id is null then
    raise exception 'NOT_FOUND: esa recepción no existe' using errcode = 'P0002';
  end if;
  if v_rec.status <> 'BORRADOR' then
    raise exception 'YA_PROCESADA: esta recepción ya fue % y no se puede volver a confirmar', lower(v_rec.status::text)
      using errcode = '23505';
  end if;
  if not exists (select 1 from public.purchase_receipt_items where receipt_id = _receipt_id) then
    raise exception 'SIN_LINEAS: agrega al menos un producto antes de confirmar' using errcode = '22023';
  end if;

  for r in
    select i.variant_id, i.color_id, i.quantity, i.unit_cost_cop
    from public.purchase_receipt_items i
    where i.receipt_id = _receipt_id
    order by i.created_at
  loop
    -- Líneas creadas antes de exigir color: se revalidan aquí.
    perform public.exigir_color_valido(r.variant_id, r.color_id);

    insert into public.inventory (variant_id, location_id, color_id, qty_available, qty_reserved)
    values (r.variant_id, v_rec.location_id, r.color_id, 0, 0)
    on conflict (variant_id, location_id, color_id) do nothing;

    -- Saldo previo bloqueado: el promedio ponderado se calcula sobre lo que había.
    select qty_available, avg_cost_cop into v_saldo, v_promedio
      from public.inventory
     where variant_id = r.variant_id and location_id = v_rec.location_id
       and color_id is not distinct from r.color_id
     for update;

    -- Promedio ponderado; un costo previo en cero no se promedia.
    if v_saldo <= 0 or coalesce(v_promedio, 0) = 0 then
      v_promedio := r.unit_cost_cop;
    else
      v_promedio := round(
        ((v_saldo * v_promedio) + (r.quantity * r.unit_cost_cop))::numeric / (v_saldo + r.quantity), 2);
    end if;

    perform public.register_inventory_movement(
      r.variant_id, v_rec.location_id, 'ENTRADA', r.quantity,
      v_rec.receipt_number, 'Recepción ' || coalesce(v_rec.document_ref, v_rec.receipt_number),
      r.color_id);

    update public.inventory
       set avg_cost_cop = v_promedio, updated_at = now()
     where variant_id = r.variant_id and location_id = v_rec.location_id
       and color_id is not distinct from r.color_id;

    v_total  := v_total + (r.quantity * r.unit_cost_cop);
    v_lineas := v_lineas + 1;
  end loop;

  update public.purchase_receipts
     set status = 'CONFIRMADA', total_cop = v_total,
         confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
   where id = _receipt_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'RECEIPT_CONFIRMED', 'purchase_receipts', _receipt_id,
          jsonb_build_object('lineas', v_lineas, 'total', v_total, 'documento', v_rec.document_ref));

  return jsonb_build_object('lineas', v_lineas, 'total', v_total);
end;
$function$;

create or replace function public.mover_inventario_por_estado()
returns trigger
language plpgsql security definer set search_path to ''
as $function$
declare
  r          record;
  v_location uuid;
  v_actual   int;
  v_reservado int;
  v_kind     public.movement_kind;
  v_nuevo    int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_kind := case new.status
    when 'CONFIRMADO'        then 'RESERVA'::public.movement_kind
    when 'ENVIADO'           then 'SALIDA'::public.movement_kind
    when 'LISTO_PARA_RETIRO' then 'SALIDA'::public.movement_kind
    when 'CANCELADO'         then 'LIBERACION'::public.movement_kind
    else null
  end;

  if v_kind is null then
    return new;
  end if;

  for r in
    select oi.variant_id, oi.color_id, oi.quantity, oi.product_name
    from public.order_items oi
    where oi.order_id = new.id and oi.variant_id is not null
  loop
    v_location := public.bodega_de_despacho(new.id, r.variant_id, r.color_id);
    if v_location is null then
      continue;
    end if;

    select qty_available, qty_reserved into v_actual, v_reservado
    from public.inventory
    where variant_id = r.variant_id and location_id = v_location
      and color_id is not distinct from r.color_id
    for update;

    if v_actual is null then
      insert into public.inventory (variant_id, location_id, color_id, qty_available, qty_reserved)
      values (r.variant_id, v_location, r.color_id, 0, 0);
      v_actual := 0; v_reservado := 0;
    end if;

    if v_kind = 'RESERVA' then
      -- No se bloquea la confirmación por falta de stock: se reserva lo que haya y bodega resuelve el faltante.
      v_reservado := least(v_actual, v_reservado + r.quantity);
      v_nuevo := v_actual;
    elsif v_kind = 'LIBERACION' then
      v_reservado := greatest(0, v_reservado - r.quantity);
      v_nuevo := v_actual;
    else -- SALIDA: sale de bodega y deja de estar reservada
      v_nuevo := greatest(0, v_actual - r.quantity);
      v_reservado := greatest(0, v_reservado - r.quantity);
    end if;

    update public.inventory
       set qty_available = v_nuevo, qty_reserved = v_reservado
     where variant_id = r.variant_id and location_id = v_location
       and color_id is not distinct from r.color_id;

    insert into public.inventory_movements (
      variant_id, location_id, color_id, kind, quantity, balance_after,
      reference, notes, order_id, created_by
    ) values (
      r.variant_id, v_location, r.color_id, v_kind, r.quantity, v_nuevo,
      new.order_number,
      'Automático por cambio de estado del pedido a ' || new.status::text,
      new.id, (select auth.uid())
    );
  end loop;

  return new;
end;
$function$;

-- Pasa existencias sin clasificar (anteriores al inventario por color) a un color, con su costo.
create or replace function public.clasificar_por_color(
  _variant_id uuid, _location_id uuid, _color_id uuid, _cantidad integer)
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_costo_origen numeric(14,2);
  v_saldo_d      integer;
  v_costo_d      numeric(14,2);
  v_ref          text := 'CLASIFICACION-' || to_char(now(), 'YYYYMMDDHH24MISS');
begin
  if not (public.is_admin() or public.has_permission('inventory.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para mover inventario' using errcode = '42501';
  end if;
  perform public.exigir_color_valido(_variant_id, _color_id);

  select avg_cost_cop into v_costo_origen from public.inventory
   where variant_id = _variant_id and location_id = _location_id and color_id is null
   for update;
  if not found then
    raise exception 'NOT_FOUND: no hay existencias sin clasificar de esa referencia en ese punto' using errcode = 'P0002';
  end if;

  select qty_available, avg_cost_cop into v_saldo_d, v_costo_d from public.inventory
   where variant_id = _variant_id and location_id = _location_id and color_id = _color_id;

  perform public.register_inventory_movement(
    _variant_id, _location_id, 'SALIDA', _cantidad, v_ref, 'Clasificación por color', null);
  perform public.register_inventory_movement(
    _variant_id, _location_id, 'ENTRADA', _cantidad, v_ref, 'Clasificación por color', _color_id);

  if coalesce(v_costo_origen, 0) > 0 then
    update public.inventory
       set avg_cost_cop = case
             when coalesce(v_saldo_d, 0) <= 0 or coalesce(v_costo_d, 0) = 0 then v_costo_origen
             else round(((v_saldo_d * v_costo_d) + (_cantidad * v_costo_origen))::numeric
                        / (v_saldo_d + _cantidad), 2)
           end,
           updated_at = now()
     where variant_id = _variant_id and location_id = _location_id and color_id = _color_id;
  end if;

  return jsonb_build_object('referencia', v_ref);
end;
$function$;

-- Colores que ofrece un producto, en el orden de la lista. No deja quitar uno con existencias.
create or replace function public.definir_colores_producto(_product_id uuid, _color_ids uuid[])
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  v_con_stock text;
begin
  if not (public.is_admin() or public.has_permission('catalog.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para editar el catálogo' using errcode = '42501';
  end if;

  select string_agg(distinct c.name, ', ') into v_con_stock
    from public.inventory i
    join public.product_variants v on v.id = i.variant_id
    join public.colors c on c.id = i.color_id
   where v.product_id = _product_id and i.qty_available > 0
     and not (i.color_id = any(coalesce(_color_ids, '{}')));
  if v_con_stock is not null then
    raise exception 'COLOR_CON_EXISTENCIAS: no puedes quitar % porque tiene existencias en inventario', v_con_stock
      using errcode = '22023';
  end if;

  delete from public.product_colors
   where product_id = _product_id and not (color_id = any(coalesce(_color_ids, '{}')));

  insert into public.product_colors (product_id, color_id, sort_order)
  select _product_id, x.color_id, x.orden - 1
    from unnest(coalesce(_color_ids, '{}')) with ordinality as x(color_id, orden)
  on conflict (product_id, color_id) do update set sort_order = excluded.sort_order;
end;
$function$;

revoke all on function public.register_inventory_movement(uuid, uuid, text, integer, text, text, uuid) from public, anon;
revoke all on function public.transfer_inventory(uuid, uuid, uuid, integer, text, uuid) from public, anon;
revoke all on function public.set_reorder_point(uuid, uuid, integer, uuid) from public, anon;
revoke all on function public.clasificar_por_color(uuid, uuid, uuid, integer) from public, anon;
revoke all on function public.definir_colores_producto(uuid, uuid[]) from public, anon;
revoke all on function public.bodega_de_despacho(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.exigir_color_valido(uuid, uuid) from public, anon, authenticated;
revoke all on function public.recepcion_exige_color() from public, anon, authenticated;
grant execute on function public.register_inventory_movement(uuid, uuid, text, integer, text, text, uuid) to authenticated;
grant execute on function public.transfer_inventory(uuid, uuid, uuid, integer, text, uuid) to authenticated;
grant execute on function public.set_reorder_point(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.clasificar_por_color(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.definir_colores_producto(uuid, uuid[]) to authenticated;

-- El pedido exige un color válido por línea y lo guarda para reservar y descontar ese color.
CREATE OR REPLACE FUNCTION public.create_order_from_cart(_delivery_method text, _pickup_location_id uuid DEFAULT NULL::uuid, _shipping_address text DEFAULT NULL::text, _shipping_municipality_code text DEFAULT NULL::text, _customer_address_id uuid DEFAULT NULL::uuid, _company_branch_id uuid DEFAULT NULL::uuid, _recipient_name text DEFAULT NULL::text, _recipient_document_type text DEFAULT NULL::text, _recipient_document_number text DEFAULT NULL::text, _recipient_phone text DEFAULT NULL::text, _project_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id    uuid := (select auth.uid());
  v_cart_id    uuid;
  v_order_id   uuid;
  v_company_id uuid;
  v_subtotal   numeric := 0;
  v_descuento  numeric := 0;
  v_envio      numeric := 0;
  v_items      int := 0;
  v_metodo     public.delivery_method;
  -- Destino resuelto por el servidor.
  v_direccion  text;
  v_mun_code   text;
  v_ciudad     text;
  v_doc_tipo   public.document_type;
  r            record;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;

  v_metodo := case when _delivery_method = 'ENVIO' then 'ENVIO'::public.delivery_method
                   else 'RETIRO_TIENDA'::public.delivery_method end;

  if v_metodo = 'RETIRO_TIENDA' and _pickup_location_id is null then
    raise exception 'VALIDATION: debes elegir un punto de retiro' using errcode = '22023';
  end if;

  select p.company_id into v_company_id from public.profiles p where p.id = v_user_id;

  -- ----------------------------------------------------------
  -- Destino
  -- ----------------------------------------------------------
  if v_metodo = 'ENVIO' then
    if _company_branch_id is not null then
      -- La sede tiene que ser de la empresa de quien compra. Si no, es la sede
      -- de otro cliente y el pedido saldría hacia una dirección ajena.
      select b.address_line, b.municipality_code into v_direccion, v_mun_code
      from public.company_branches b
      where b.id = _company_branch_id
        and b.status = 'ACTIVO'
        and b.company_id = v_company_id;

      if v_direccion is null then
        raise exception 'VALIDATION: esa sede no existe o no es de tu empresa'
          using errcode = '22023';
      end if;

    elsif _customer_address_id is not null then
      select a.address_line, a.municipality_code into v_direccion, v_mun_code
      from public.customer_addresses a
      where a.id = _customer_address_id and a.user_id = v_user_id;

      if v_direccion is null then
        raise exception 'VALIDATION: esa dirección no existe o no es tuya'
          using errcode = '22023';
      end if;

    else
      -- Dirección escrita a mano: el caso de la obra.
      v_direccion := btrim(_shipping_address);
      v_mun_code  := _shipping_municipality_code;

      if coalesce(v_direccion, '') = '' then
        raise exception 'VALIDATION: la dirección de envío es obligatoria'
          using errcode = '22023';
      end if;
      if v_mun_code is null then
        raise exception 'VALIDATION: debes elegir la ciudad de envío'
          using errcode = '22023';
      end if;
    end if;

    select m.name into v_ciudad from public.municipalities m where m.code = v_mun_code;
    if v_ciudad is null then
      raise exception 'VALIDATION: esa ciudad no está en el listado oficial'
        using errcode = '22023';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- Quién recibe. Obligatorio también al retirar en tienda: el punto de venta
  -- tiene que saber a quién le entrega y con qué documento verificarlo.
  -- ----------------------------------------------------------
  if coalesce(btrim(_recipient_name), '') = '' then
    raise exception 'VALIDATION: indica el nombre de quien recibe el pedido'
      using errcode = '22023';
  end if;
  if coalesce(btrim(_recipient_document_number), '') = '' then
    raise exception 'VALIDATION: indica el número de documento de quien recibe'
      using errcode = '22023';
  end if;
  if coalesce(btrim(_recipient_phone), '') = '' then
    raise exception 'VALIDATION: indica el teléfono de quien recibe'
      using errcode = '22023';
  end if;

  begin
    v_doc_tipo := coalesce(_recipient_document_type, 'CC')::public.document_type;
  exception when invalid_text_representation then
    raise exception 'VALIDATION: ese tipo de documento no es válido'
      using errcode = '22023';
  end;

  -- ----------------------------------------------------------
  -- Carrito
  -- ----------------------------------------------------------
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

  insert into public.orders (
    order_number, user_id, company_id, project_id, status, delivery_method,
    shipping_address, shipping_city, shipping_municipality_code,
    company_branch_id, pickup_location_id, pickup_code,
    recipient_name, recipient_document_type, recipient_document_number,
    recipient_phone, notes
  ) values (
    'ORD-PNT-' || lpad(nextval('public.order_number_seq')::text, 6, '0'),
    v_user_id, v_company_id, _project_id, 'PENDIENTE', v_metodo,
    v_direccion, v_ciudad, v_mun_code,
    case when v_metodo = 'ENVIO' then _company_branch_id end,
    _pickup_location_id,
    case when v_metodo = 'RETIRO_TIENDA'
         then upper(substr(md5(gen_random_uuid()::text), 1, 6)) end,
    btrim(_recipient_name), v_doc_tipo, btrim(_recipient_document_number),
    btrim(_recipient_phone), _notes
  )
  returning id into v_order_id;

  -- Líneas: el precio se toma de la variante EN ESTE INSTANTE y se congela.
  for r in
    select ci.quantity,
           v.id as variant_id, v.label, v.price_cop,
           p.name as product_name, p.code as product_code, p.image_url,
           col.name as color_name, ci.color_id,
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
    perform public.exigir_color_valido(r.variant_id, r.color_id);

    insert into public.order_items (
      order_id, variant_id, product_name, product_code, presentation,
      color_name, color_id, unit_price_cop, quantity, subtotal_cop, image_url,
      unit_cost_cop
    ) values (
      v_order_id, r.variant_id, r.product_name, r.product_code, r.label,
      r.color_name, r.color_id, r.price_cop, r.quantity, r.price_cop * r.quantity, r.image_url,
      -- El costo se congela junto con el precio. Si se dejara para después,
      -- la utilidad de este pedido cambiaría cada vez que suba un proveedor.
      public.costo_vigente(r.variant_id, _pickup_location_id)
    );

    v_subtotal := v_subtotal + (r.price_cop * r.quantity);
  end loop;

  -- Cada kit descuenta su porcentaje configurado y solo sobre sus propias líneas.
  select coalesce(sum(round(v.price_cop * ci.quantity * s.discount_percent / 100.0, 2)), 0)
    into v_descuento
    from public.cart_items ci
    join public.product_variants v on v.id = ci.variant_id
    join public.solutions s on s.id = ci.kit_solution_id
   where ci.cart_id = v_cart_id;

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
    values (v_order_id, v_direccion, v_ciudad, 'PENDIENTE');
  end if;

  insert into public.payments (order_id, method, status, amount_cop)
  values (v_order_id, 'PSE', 'PENDIENTE', v_subtotal - v_descuento + v_envio);

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

notify pgrst, 'reload schema';
