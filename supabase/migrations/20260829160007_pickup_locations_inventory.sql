-- Puntos de retiro e inventario. El inventario es la única fuente de disponibilidad;
-- stockStatus se deriva de aquí.

create table public.pickup_locations (
  id           uuid primary key default gen_random_uuid(),
  external_ref text unique,
  name         text not null,
  city         text not null,
  address      text not null,
  phone        text,
  hours        text,
  has_color_studio   boolean not null default false,
  has_tech_advisor   boolean not null default false,
  has_express_pickup boolean not null default false,
  stock_readiness_hours int not null default 24,
  latitude     numeric(9,6),
  longitude    numeric(9,6),
  status       public.catalog_status not null default 'ACTIVO',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint pickup_locations_horas_no_negativas check (stock_readiness_hours >= 0)
);

create index pickup_locations_city_idx   on public.pickup_locations (city);
create index pickup_locations_status_idx on public.pickup_locations (status);

create table public.inventory (
  id            uuid primary key default gen_random_uuid(),
  variant_id    uuid not null references public.product_variants (id)  on delete cascade,
  location_id   uuid not null references public.pickup_locations (id)  on delete cascade,
  qty_available int not null default 0,
  qty_reserved  int not null default 0,
  updated_at    timestamptz not null default now(),

  constraint inventory_unico_por_variante_y_punto unique (variant_id, location_id),
  constraint inventory_disponible_no_negativo check (qty_available >= 0),
  constraint inventory_reservado_no_negativo  check (qty_reserved  >= 0),
  constraint inventory_reservado_menor_o_igual check (qty_reserved <= qty_available)
);

create index inventory_variant_id_idx  on public.inventory (variant_id);
create index inventory_location_id_idx on public.inventory (location_id);

comment on table public.inventory is
  'Existencias por variante y punto de retiro. Única fuente de disponibilidad (MÓDULO 20).';

create trigger pickup_locations_set_updated_at
  before update on public.pickup_locations
  for each row execute function public.set_updated_at();

create trigger inventory_set_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();

-- security_invoker = false a propósito: el público ve el estado de stock sin poder
-- leer inventory, reservado al personal.
create view public.v_variant_availability
with (security_invoker = false) as
  select
    v.id as variant_id,
    -- Nunca la cantidad: revelaría existencias a visitantes anónimos.
    case
      when coalesce(sum(i.qty_available - i.qty_reserved), 0) >= 10 then 'InStock'
      when coalesce(sum(i.qty_available - i.qty_reserved), 0) > 0   then 'LowStock'
      else 'PreOrder'
    end as stock_status
  from public.product_variants v
  left join public.inventory i on i.variant_id = v.id
  group by v.id;

comment on view public.v_variant_availability is
  'Disponibilidad derivada por variante. Deliberadamente SECURITY DEFINER para exponer el estado sin revelar existencias.';
