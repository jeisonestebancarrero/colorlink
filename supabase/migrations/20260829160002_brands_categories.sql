create table public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  logo_url   text,
  status     public.catalog_status not null default 'ACTIVO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- kind separa categorías de producto y de solución, que el frontend no mezcla.
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  kind        public.category_kind not null,
  parent_id   uuid references public.categories (id) on delete restrict,
  name        text not null,
  slug        text not null,
  description text,
  sort_order  int not null default 0,
  status      public.catalog_status not null default 'ACTIVO',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Único por taxonomía: el servicio traduce por nombre al literal del frontend.
  constraint categories_nombre_unico_por_tipo unique (kind, name),
  constraint categories_slug_unico_por_tipo   unique (kind, slug),
  constraint categories_sin_autopadre check (parent_id is null or parent_id <> id)
);

create index categories_parent_id_idx on public.categories (parent_id);
create index categories_kind_idx      on public.categories (kind);

comment on table public.categories is
  'Categorías jerárquicas. `kind` separa la taxonomía de productos de la de soluciones.';

create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();
