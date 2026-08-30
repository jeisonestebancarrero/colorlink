-- ============================================================
-- FASE 2 · 02 — Empresas (multi-tenant B2B)
-- ============================================================
-- Resuelve el riesgo R10 de la auditoría: hoy `User.company` es un string
-- libre en el frontend, lo que hace imposible aplicar el aislamiento entre
-- empresas que exige el MÓDULO 62.
--
-- El frontend NO cambia: seguirá recibiendo `company: string`; la capa de
-- servicio resolverá el nombre mediante join contra esta tabla.
-- ============================================================

create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  legal_name  text,
  -- NIT: identificador tributario colombiano. Nullable porque el formulario
  -- de registro actual no lo pide; único cuando está presente.
  nit         text unique,
  city        text,
  address     text,
  phone       text,
  email       text,
  status      public.company_status not null default 'ACTIVA',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint companies_name_no_vacio check (length(trim(name)) > 0)
);

-- Búsqueda por nombre sin distinguir mayúsculas (MÓDULO 47).
create index companies_name_lower_idx on public.companies (lower(name));
create index companies_status_idx      on public.companies (status);

comment on table public.companies is
  'Empresas B2B. Unidad de aislamiento multi-tenant: las políticas RLS filtran por company_id.';
comment on column public.companies.nit is
  'NIT colombiano. Clave real de negocio; el nombre puede repetirse entre empresas distintas.';

-- ------------------------------------------------------------
-- Utilidad compartida: mantener updated_at al día.
-- Se define aquí porque es la primera tabla que la necesita; las
-- migraciones posteriores la reutilizan sin volver a crearla.
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();
