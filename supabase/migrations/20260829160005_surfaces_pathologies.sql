-- ============================================================
-- FASE 3 · 05 — Superficies y patologías
-- ============================================================
-- MÓDULO 6 y MÓDULO 7. Hoy ambas cosas son uniones de strings en el
-- frontend (`SurfaceType`, `ConditionType`). Al pasarlas a tablas se
-- vuelven extensibles sin desplegar código, y podrán relacionarse con
-- proyectos (FASE 5) y con el diagnóstico (FASE 6).
--
-- El seed incluye OBLIGATORIAMENTE los literales de esas uniones, para que
-- CreateProjectPage.tsx siga funcionando sin cambios.
-- ============================================================

create table public.surfaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  description text,
  -- Marca los valores que existen en la unión `SurfaceType` del frontend.
  -- Permite alimentar el selector del formulario sin ofrecer valores que
  -- el tipo TypeScript no admite todavía.
  is_frontend_type boolean not null default false,
  sort_order  int not null default 0,
  status      public.catalog_status not null default 'ACTIVO',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Compatibilidad de un producto con una superficie.
create table public.product_surfaces (
  product_id uuid not null references public.products (id) on delete cascade,
  surface_id uuid not null references public.surfaces (id) on delete cascade,
  primary key (product_id, surface_id)
);

create index product_surfaces_surface_id_idx on public.product_surfaces (surface_id);

-- ------------------------------------------------------------
-- Patologías (MÓDULO 7)
-- ------------------------------------------------------------
create table public.pathologies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  slug            text not null unique,
  description     text,
  severity        public.pathology_severity not null default 'MEDIA',
  recommendations text[] not null default '{}',
  is_frontend_type boolean not null default false,
  sort_order      int not null default 0,
  status          public.catalog_status not null default 'ACTIVO',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.pathologies is
  'Patologías de superficie (humedad, fisuras, óxido...). Espejo extensible de la unión ConditionType.';

create trigger surfaces_set_updated_at
  before update on public.surfaces
  for each row execute function public.set_updated_at();

create trigger pathologies_set_updated_at
  before update on public.pathologies
  for each row execute function public.set_updated_at();
