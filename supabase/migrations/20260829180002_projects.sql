-- ============================================================
-- FASE 5 · 02 — Proyectos (MÓDULO 9)
-- ============================================================

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  user_id     uuid not null references auth.users (id)     on delete restrict,
  company_id  uuid references public.companies (id)        on delete set null,

  name        text not null,
  description text,
  city        text,
  address     text,
  project_type public.project_type not null default 'Otro',
  area_m2     numeric(12,2),

  -- Texto libre a propósito: el dato real contiene valores como "20 días",
  -- no solo fechas. Convertirlo a `date` perdería información.
  required_date text,

  -- Superficie y ambiente principales del proyecto. El detalle por zonas
  -- vive en project_surfaces (MÓDULO 10).
  surface     text,
  environment public.environment_type,
  current_color text,
  -- Color elegido {name, code, hex, family}. Se guarda como jsonb porque el
  -- dato incluye la familia tal como se mostró, y el catálogo de color puede
  -- cambiar sin que deba cambiar lo que el cliente eligió en su momento.
  selected_color jsonb,

  custom_condition text,
  client_notes     text,

  status public.project_status not null default 'PENDIENTE',
  current_step_progress int,
  next_recommended_action jsonb,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,

  constraint projects_nombre_no_vacio check (length(trim(name)) > 0),
  constraint projects_area_positiva check (area_m2 is null or area_m2 > 0),
  constraint projects_paso_valido
    check (current_step_progress is null or current_step_progress between 1 and 8),
  -- Coherencia de estado: un proyecto completado debe tener fecha de cierre.
  constraint projects_completado_con_fecha
    check (status <> 'COMPLETADO' or completed_at is not null)
);

create index projects_user_id_idx    on public.projects (user_id);
create index projects_company_id_idx on public.projects (company_id);
create index projects_status_idx     on public.projects (status);
create index projects_created_at_idx on public.projects (created_at desc);
create index projects_name_lower_idx on public.projects (lower(name));

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Código de proyecto generado en el SERVIDOR.
--
-- Antes se calculaba en el navegador como `projects.length + 1`, lo que
-- produce códigos duplicados en cuanto dos usuarios crean un proyecto a la
-- vez, y además hacía visible a un usuario cuántos proyectos existen.
-- Una secuencia de base de datos es atómica y no depende del cliente.
-- ------------------------------------------------------------
create sequence public.project_code_seq;

create or replace function public.assign_project_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code is null or length(trim(new.code)) = 0 then
    new.code := 'PLK-' || to_char(pg_catalog.now(), 'YYYY') || '-' ||
                lpad(nextval('public.project_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger projects_assign_code
  before insert on public.projects
  for each row execute function public.assign_project_code();

-- ------------------------------------------------------------
-- Asignación de personal a proyectos.
-- Es lo que permite que un TECNICO vea únicamente los proyectos que le
-- corresponden, tal como se definió en la FASE 2.
-- ------------------------------------------------------------
create table public.project_assignments (
  project_id      uuid not null references public.projects (id) on delete cascade,
  user_id         uuid not null references auth.users (id)      on delete cascade,
  assignment_role public.assignment_role not null default 'TECNICO',
  assigned_by     uuid references auth.users (id) on delete set null,
  assigned_at     timestamptz not null default now(),
  primary key (project_id, user_id, assignment_role)
);

create index project_assignments_user_id_idx on public.project_assignments (user_id);

-- ------------------------------------------------------------
-- Funciones de acceso a proyecto. Completan las de la FASE 2.
-- ------------------------------------------------------------
create or replace function public.is_assigned_to_project(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_assignments pa
    where pa.project_id = _project_id
      and pa.user_id = (select auth.uid())
  );
$$;

/**
 * Regla ÚNICA de visibilidad de un proyecto. La usan las políticas de
 * projects y las de todas sus tablas hijas, para que no puedan divergir.
 */
create or replace function public.can_access_project(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = _project_id
      and (
        p.user_id = (select auth.uid())                              -- dueño
        or (p.company_id is not null
            and p.company_id in (select public.my_company_ids()))     -- su empresa
        or public.has_role('ASESOR')                                 -- asesoría
        or public.is_admin()                                         -- administración
        or public.is_assigned_to_project(p.id)                       -- técnico asignado
      )
  );
$$;

revoke execute on function public.is_assigned_to_project(uuid) from public, anon;
revoke execute on function public.can_access_project(uuid)     from public, anon;
grant execute on function public.is_assigned_to_project(uuid) to authenticated;
grant execute on function public.can_access_project(uuid)     to authenticated;
