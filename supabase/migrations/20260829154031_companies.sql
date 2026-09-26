-- Empresas B2B: unidad de aislamiento multi-tenant. El frontend sigue recibiendo
-- company como texto; el servicio resuelve el nombre con un join.

create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  legal_name  text,
  -- Nullable porque el registro no lo pide; único cuando existe.
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

create index companies_name_lower_idx on public.companies (lower(name));
create index companies_status_idx      on public.companies (status);

comment on table public.companies is
  'Empresas B2B. Unidad de aislamiento multi-tenant: las políticas RLS filtran por company_id.';
comment on column public.companies.nit is
  'NIT colombiano. Clave real de negocio; el nombre puede repetirse entre empresas distintas.';

-- Trigger genérico de updated_at; las migraciones siguientes lo reutilizan.
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
