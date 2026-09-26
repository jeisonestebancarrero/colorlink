-- Mueve inventario según el estado del pedido: CONFIRMADO reserva, ENVIADO/LISTO da
-- salida y CANCELADO libera. Se reserva al confirmar para que un pedido sin pagar
-- no bloquee mercancía.

-- Retiro: el punto elegido. Envío: el de más existencias (menos traslados). Sin
-- stock en ninguno devuelve uno activo para que el fallo sea explícito.
create or replace function public.bodega_de_despacho(_order_id uuid, _variant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select o.pickup_location_id from public.orders o
      where o.id = _order_id and o.pickup_location_id is not null),
    (select i.location_id from public.inventory i
      where i.variant_id = _variant_id
      order by (i.qty_available - i.qty_reserved) desc
      limit 1),
    (select l.id from public.pickup_locations l where l.status = 'ACTIVO' limit 1)
  );
$$;

create or replace function public.mover_inventario_por_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    select oi.variant_id, oi.quantity, oi.product_name
    from public.order_items oi
    where oi.order_id = new.id and oi.variant_id is not null
  loop
    v_location := public.bodega_de_despacho(new.id, r.variant_id);
    if v_location is null then
      continue;
    end if;

    select qty_available, qty_reserved into v_actual, v_reservado
    from public.inventory
    where variant_id = r.variant_id and location_id = v_location
    for update;

    if v_actual is null then
      insert into public.inventory (variant_id, location_id, qty_available, qty_reserved)
      values (r.variant_id, v_location, 0, 0);
      v_actual := 0; v_reservado := 0;
    end if;

    if v_kind = 'RESERVA' then
      -- No frena la confirmación por falta de stock: reserva lo que haya y el
      -- faltante lo resuelve bodega.
      v_reservado := least(v_actual, v_reservado + r.quantity);
      v_nuevo := v_actual;

    elsif v_kind = 'LIBERACION' then
      v_reservado := greatest(0, v_reservado - r.quantity);
      v_nuevo := v_actual;

    else -- SALIDA: sale de bodega y deja de estar reservada.
      v_nuevo := greatest(0, v_actual - r.quantity);
      v_reservado := greatest(0, v_reservado - r.quantity);
    end if;

    update public.inventory
       set qty_available = v_nuevo, qty_reserved = v_reservado
     where variant_id = r.variant_id and location_id = v_location;

    insert into public.inventory_movements (
      variant_id, location_id, kind, quantity, balance_after,
      reference, notes, order_id, created_by
    ) values (
      r.variant_id, v_location, v_kind, r.quantity, v_nuevo,
      new.order_number,
      'Automático por cambio de estado del pedido a ' || new.status::text,
      new.id, (select auth.uid())
    );
  end loop;

  return new;
end;
$$;

create trigger orders_mover_inventario
  after update on public.orders
  for each row execute function public.mover_inventario_por_estado();

comment on function public.mover_inventario_por_estado() is
  'Conecta la máquina de estados del pedido con el inventario: reserva, salida y liberación automáticas.';
