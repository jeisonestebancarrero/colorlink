-- Soluciones y kits en una tabla con discriminador is_kit: un kit es una solución
-- comprable y comparte la misma relación con productos.

create table public.solutions (
  id           uuid primary key default gen_random_uuid(),
  external_ref text unique,
  name         text not null,
  category_id  uuid references public.categories (id) on delete restrict,
  is_kit       boolean not null default false,

  description  text,
  image_url    text,
  badge        text,

  -- Catálogo técnico (SolutionCatalogItem).
  application        text,
  surface_summary    text,
  features           text[] not null default '{}',
  system_summary     text,
  durability_estimate text,
  spread_rate_info   text,
  packagings         text[] not null default '{}',
  step_by_step_guide text[] not null default '{}',
  -- jsonb y no FK: las muestras no siempre existen en colors.
  color_swatches     jsonb not null default '[]'::jsonb,

  -- Kit comprable (SolutionKit).
  subtitle         text,
  problem_target   text,
  ideal_for        text,
  warranty         text,
  discount_percent numeric(5,2) not null default 0,
  tools_included   text[] not null default '{}',

  status     public.catalog_status not null default 'ACTIVO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint solutions_descuento_valido
    check (discount_percent >= 0 and discount_percent <= 100),
  constraint solutions_descuento_solo_en_kits
    check (is_kit or discount_percent = 0)
);

create index solutions_category_id_idx on public.solutions (category_id);
create index solutions_is_kit_idx      on public.solutions (is_kit);
create index solutions_status_idx      on public.solutions (status);

create table public.solution_products (
  id          uuid primary key default gen_random_uuid(),
  solution_id uuid not null references public.solutions (id)        on delete cascade,
  product_id  uuid not null references public.products (id)         on delete restrict,
  -- Anulable: algunos pasos citan etiquetas que no son una variante existente.
  variant_id  uuid references public.product_variants (id)          on delete set null,
  presentation_label text,

  step_number int not null,
  phase       public.solution_phase,
  role_description text,
  -- Cantidad comercial del kit para 85 m², no un resultado del motor de cálculo.
  quantity_for_85m2 numeric(10,2),
  image_url   text,
  sort_order  int not null default 0,

  constraint solution_products_paso_unico unique (solution_id, step_number),
  constraint solution_products_paso_positivo check (step_number > 0),
  constraint solution_products_cantidad_positiva
    check (quantity_for_85m2 is null or quantity_for_85m2 > 0)
);

create index solution_products_solution_id_idx on public.solution_products (solution_id);
create index solution_products_product_id_idx  on public.solution_products (product_id);

comment on column public.solution_products.quantity_for_85m2 is
  'Cantidad comercial del kit para el proyecto tipo de 85 m². El cálculo real por área lo produce el motor de la FASE 7.';

create trigger solutions_set_updated_at
  before update on public.solutions
  for each row execute function public.set_updated_at();
