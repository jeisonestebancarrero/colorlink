-- Punto de reorden, traslados entre puntos de venta y resumen por punto.

-- Punto de reorden por referencia y bodega (cada tienda rota distinto).
-- 0 = sin definir: solo se avisa de lo agotado.
alter table public.inventory
  add column min_qty integer not null default 0
  constraint inventory_min_qty_no_negativo check (min_qty >= 0);

comment on column public.inventory.min_qty is
  'Punto de reorden: por debajo de esta cantidad hay que reponer. 0 = sin definir.';

create or replace function public.set_reorder_point(
  _variant_id  uuid,
  _location_id uuid,
  _min_qty     integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.has_permission('inventory.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para modificar el inventario'
      using errcode = '42501';
  end if;

  if _min_qty is null or _min_qty < 0 then
    raise exception 'BAD_QTY: el punto de reorden no puede ser negativo'
      using errcode = '22023';
  end if;

  update public.inventory
     set min_qty = _min_qty, updated_at = now()
   where variant_id = _variant_id and location_id = _location_id;

  if not found then
    raise exception 'NOT_FOUND: esa referencia no existe en ese punto de venta'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_reorder_point(uuid, uuid, integer) from public, anon;
grant execute on function public.set_reorder_point(uuid, uuid, integer) to authenticated;

-- Salida y entrada en la misma transacción: la mercancía no puede quedar en el aire.
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
  v_ref        text;
  -- register_inventory_movement devuelve jsonb con el saldo, no un entero.
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

  -- Bloqueo de origen: dos traslados simultáneos no pueden sacar el mismo stock.
  select qty_available into v_disponible
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

  -- Si el destino nunca tuvo la referencia, se crea en cero.
  insert into public.inventory (variant_id, location_id, qty_available, qty_reserved)
  values (_variant_id, _destino, 0, 0)
  on conflict (variant_id, location_id) do nothing;

  v_ref := 'TRASLADO-' || to_char(now(), 'YYYYMMDDHH24MISS');

  v_salida := public.register_inventory_movement(
    _variant_id, _origen, 'TRASLADO_SALIDA', _cantidad, v_ref, _notas);
  v_entrada := public.register_inventory_movement(
    _variant_id, _destino, 'TRASLADO_ENTRADA', _cantidad, v_ref, _notas);

  return jsonb_build_object(
    'referencia', v_ref,
    'saldo_origen', (v_salida ->> 'balance')::integer,
    'saldo_destino', (v_entrada ->> 'balance')::integer
  );
end;
$$;

revoke all on function public.transfer_inventory(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.transfer_inventory(uuid, uuid, uuid, integer, text) to authenticated;

-- Totales por punto calculados en la base. security_invoker es obligatorio: sin él
-- cualquier autenticado vería todo el inventario.
create or replace view public.v_inventario_por_punto
with (security_invoker = true) as
select
  l.id            as location_id,
  l.name          as punto,
  l.city          as ciudad,
  count(i.*)                                              as referencias,
  coalesce(sum(i.qty_available), 0)                       as disponible,
  coalesce(sum(i.qty_reserved), 0)                        as reservado,
  coalesce(sum(i.qty_available - i.qty_reserved), 0)      as neto,
  count(*) filter (
    where i.qty_available - i.qty_reserved <= 0
  )                                                       as agotadas,
  count(*) filter (
    where i.min_qty > 0
      and i.qty_available - i.qty_reserved > 0
      and i.qty_available - i.qty_reserved <= i.min_qty
  )                                                       as bajo_reorden
from public.pickup_locations l
left join public.inventory i on i.location_id = l.id
-- pickup_locations es público: sin is_staff() un cliente vería la lista con totales en cero.
where l.status = 'ACTIVO' and public.is_staff()
group by l.id, l.name, l.city;

grant select on public.v_inventario_por_punto to authenticated;
