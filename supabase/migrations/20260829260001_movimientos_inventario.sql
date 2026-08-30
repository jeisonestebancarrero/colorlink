-- ============================================================
-- MÓDULO 20 — Movimientos de inventario
-- ============================================================
-- La tabla `inventory` guarda el SALDO actual, pero un saldo sin historia no
-- se puede auditar: nadie puede responder "¿por qué hay 3 cuñetes menos que
-- ayer?". Estos movimientos son el libro de esa cuenta.
--
-- REGLA: el saldo NUNCA se edita a mano. Se registra un movimiento y el
-- saldo se recalcula dentro de la misma transacción. Así el saldo y su
-- historia no pueden divergir.
-- ============================================================

create type public.movement_kind as enum (
  'ENTRADA',        -- compra o devolución a bodega
  'SALIDA',         -- venta o consumo
  'TRASLADO_SALIDA',
  'TRASLADO_ENTRADA',
  'AJUSTE',         -- corrección tras conteo físico
  'RESERVA',
  'LIBERACION'
);

create table public.inventory_movements (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references public.product_variants (id) on delete restrict,
  location_id uuid not null references public.pickup_locations (id) on delete restrict,
  kind        public.movement_kind not null,
  -- Positiva siempre: el signo lo determina el tipo de movimiento.
  quantity    int not null,
  -- Saldo resultante, congelado. Permite auditar sin recalcular toda la
  -- historia y detectar si alguien tocó la tabla por fuera.
  balance_after int not null,
  reference   text,
  notes       text,
  order_id    uuid references public.orders (id) on delete set null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint inventory_movements_cantidad_positiva check (quantity > 0),
  constraint inventory_movements_saldo_no_negativo check (balance_after >= 0)
);

create index inventory_movements_variant_idx  on public.inventory_movements (variant_id, created_at desc);
create index inventory_movements_location_idx on public.inventory_movements (location_id);

comment on table public.inventory_movements is
  'Libro de movimientos. El saldo de `inventory` se deriva de aquí; nunca se edita directamente.';

-- ============================================================
-- Registrar un movimiento y actualizar el saldo, en una transacción
-- ============================================================
create or replace function public.register_inventory_movement(
  _variant_id uuid,
  _location_id uuid,
  _kind text,
  _quantity int,
  _reference text default null,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Se bloquea la fila: dos movimientos simultáneos sobre la misma variante
  -- y bodega no pueden leer el mismo saldo y pisarse.
  select qty_available, qty_reserved into v_actual, v_reservado
  from public.inventory
  where variant_id = _variant_id and location_id = _location_id
  for update;

  if v_actual is null then
    insert into public.inventory (variant_id, location_id, qty_available, qty_reserved)
    values (_variant_id, _location_id, 0, 0);
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
  -- Reservas y liberaciones mueven la parte comprometida, no el disponible.
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
   where variant_id = _variant_id and location_id = _location_id;

  insert into public.inventory_movements (
    variant_id, location_id, kind, quantity, balance_after, reference, notes, created_by
  ) values (
    _variant_id, _location_id, v_kind,
    case when v_kind = 'AJUSTE' then abs(v_delta) else _quantity end,
    v_nuevo, _reference, _notes, (select auth.uid())
  )
  returning id into v_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'INVENTORY_MOVEMENT', 'inventory_movements', v_id,
          jsonb_build_object('kind', _kind, 'qty', _quantity, 'balance', v_nuevo));

  return jsonb_build_object('id', v_id, 'balance', v_nuevo, 'reserved', v_reservado);
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.inventory_movements enable row level security;
revoke all on public.inventory_movements from anon, authenticated;
grant select on public.inventory_movements to authenticated;

create policy "movimientos_staff" on public.inventory_movements
  for select to authenticated using ( (select public.is_staff()) );

revoke execute on function public.register_inventory_movement(uuid, uuid, text, int, text, text) from public, anon;
grant execute on function public.register_inventory_movement(uuid, uuid, text, int, text, text) to authenticated;
