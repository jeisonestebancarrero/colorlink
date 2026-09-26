-- Productos y sus presentaciones. Precio y rendimiento viven solo aquí: cálculo y
-- pedidos los leen de la base e ignoran lo que envíe el navegador.

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  -- Id del mock original; permite regenerar el seed sin duplicar filas.
  external_ref text unique,
  code         text not null unique,
  name         text not null,
  tagline      text,
  description  text,

  brand_id     uuid references public.brands (id)     on delete restrict,
  category_id  uuid references public.categories (id) on delete restrict,

  environment  public.product_environment,
  finish       public.product_finish,

  -- Texto comercial para mostrar.
  coverage     text,
  -- Valor numérico que usa el motor de cálculo.
  spread_rate_m2_per_gal numeric(8,2),
  drying_time  text,

  features     text[] not null default '{}',
  image_url    text,
  tech_sheet_url text,

  rating        numeric(2,1),
  reviews_count int not null default 0,
  is_popular    boolean not null default false,
  badge         text,

  status       public.catalog_status not null default 'ACTIVO',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint products_rating_valido check (rating is null or (rating >= 0 and rating <= 5)),
  constraint products_reviews_no_negativo check (reviews_count >= 0),
  constraint products_rendimiento_positivo
    check (spread_rate_m2_per_gal is null or spread_rate_m2_per_gal > 0)
);

create index products_category_id_idx on public.products (category_id);
create index products_brand_id_idx    on public.products (brand_id);
create index products_status_idx      on public.products (status);
create index products_is_popular_idx  on public.products (is_popular) where is_popular;
create index products_name_lower_idx  on public.products (lower(name));

comment on column public.products.spread_rate_m2_per_gal is
  'Rendimiento en m² por galón. Entrada del motor de cálculo (FASE 7). Nunca se acepta desde el cliente.';

create table public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  external_ref  text,
  label         text not null,
  sku           text unique,
  barcode       text unique,
  price_cop     numeric(14,2) not null,
  volume_liters numeric(10,3),
  unit          text not null default 'GALON',
  quantity      numeric(10,3),
  sort_order    int not null default 0,
  status        public.catalog_status not null default 'ACTIVO',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint product_variants_precio_no_negativo check (price_cop >= 0),
  constraint product_variants_volumen_positivo
    check (volume_liters is null or volume_liters > 0),
  constraint product_variants_label_unico unique (product_id, label)
);

create index product_variants_product_id_idx on public.product_variants (product_id);
create index product_variants_status_idx     on public.product_variants (status);

comment on table public.product_variants is
  'Presentaciones de un producto. El precio de venta vive aquí: es la única autoridad de precio.';

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();
