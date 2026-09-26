-- Colores: fuente única de las dos paletas que hoy exporta el frontend; el servicio
-- proyecta ambas formas.

create table public.colors (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  hex                 text not null,
  rgb                 text,
  family              public.color_family not null,
  -- Texto libre: no siempre corresponde a un producto del catálogo.
  recommended_product text,
  description         text,
  status              public.catalog_status not null default 'ACTIVO',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint colors_hex_valido check (hex ~* '^#[0-9A-F]{6}$')
);

create index colors_family_idx     on public.colors (family);
create index colors_status_idx     on public.colors (status);
create index colors_name_lower_idx on public.colors (lower(name));

create table public.product_colors (
  product_id uuid not null references public.products (id) on delete cascade,
  color_id   uuid not null references public.colors (id)   on delete cascade,
  sort_order int not null default 0,
  primary key (product_id, color_id)
);

create index product_colors_color_id_idx on public.product_colors (color_id);

create trigger colors_set_updated_at
  before update on public.colors
  for each row execute function public.set_updated_at();
