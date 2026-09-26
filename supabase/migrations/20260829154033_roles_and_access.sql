-- Roles, membresías y funciones de autorización. El rol vive en una tabla sin
-- políticas de escritura: solo grant_role/revoke_role (admin) la modifican.

create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  -- Ámbito opcional: un rol limitado a una empresa.
  company_id uuid references public.companies (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),

  -- NULLS NOT DISTINCT (PG15+): sin esto, cada company_id NULL cuenta como distinto
  -- y el mismo rol global podría repetirse.
  constraint user_roles_unicos unique nulls not distinct (user_id, role, company_id)
);

create index user_roles_user_id_idx    on public.user_roles (user_id);
create index user_roles_role_idx       on public.user_roles (role);
create index user_roles_company_id_idx on public.user_roles (company_id);

comment on table public.user_roles is
  'Roles de aplicación. Un usuario puede tener varios. SIN políticas de escritura: solo se modifica vía grant_role/revoke_role.';

create table public.company_members (
  company_id   uuid not null references public.companies (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  company_role public.company_role not null default 'MEMBER',
  status       public.user_status not null default 'ACTIVO',
  joined_at    timestamptz not null default now(),

  primary key (company_id, user_id)
);

create index company_members_user_id_idx on public.company_members (user_id);

comment on table public.company_members is
  'Vínculo usuario-empresa. Determina qué datos de qué empresa puede ver cada usuario.';

-- SECURITY DEFINER evita la recursión infinita de RLS al consultar user_roles desde
-- otras políticas; STABLE permite evaluarlas una vez por consulta con (select ...).

create or replace function public.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = _role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'ADMINISTRADOR'
  );
$$;

-- Personal interno: asesores, técnicos y administradores.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('ASESOR', 'TECNICO', 'ADMINISTRADOR')
  );
$$;

-- Base del aislamiento entre tenants.
create or replace function public.my_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.company_id
  from public.company_members cm
  where cm.user_id = (select auth.uid())
    and cm.status = 'ACTIVO';
$$;

create or replace function public.is_company_member(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members cm
    where cm.user_id = (select auth.uid())
      and cm.company_id = _company_id
      and cm.status = 'ACTIVO'
  );
$$;

create or replace function public.can_manage_company(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members cm
    where cm.user_id = (select auth.uid())
      and cm.company_id = _company_id
      and cm.status = 'ACTIVO'
      and cm.company_role in ('OWNER', 'ADMIN')
  );
$$;

-- Única vía de escritura sobre user_roles; valida is_admin() en el servidor.

create or replace function public.grant_role(
  _user_id uuid,
  _role public.app_role,
  _company_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: se requiere rol ADMINISTRADOR para asignar roles'
      using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users where id = _user_id) then
    raise exception 'USER_NOT_FOUND: el usuario indicado no existe'
      using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role, company_id, granted_by)
  values (_user_id, _role, _company_id, (select auth.uid()))
  on conflict on constraint user_roles_unicos do nothing;
end;
$$;

create or replace function public.revoke_role(
  _user_id uuid,
  _role public.app_role,
  _company_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: se requiere rol ADMINISTRADOR para revocar roles'
      using errcode = '42501';
  end if;

  -- Evita dejar el sistema sin administradores.
  if _role = 'ADMINISTRADOR'
     and (select count(*) from public.user_roles where role = 'ADMINISTRADOR') <= 1 then
    raise exception 'LAST_ADMIN: no se puede revocar el único administrador del sistema'
      using errcode = '23514';
  end if;

  delete from public.user_roles ur
  where ur.user_id = _user_id
    and ur.role = _role
    and ur.company_id is not distinct from _company_id;
end;
$$;

-- Roles y empresas del usuario en una llamada, solo para la UI; RLS sigue autorizando.

create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', (select auth.uid()),
    'roles', coalesce(
      (select jsonb_agg(distinct ur.role) from public.user_roles ur
        where ur.user_id = (select auth.uid())),
      '[]'::jsonb
    ),
    'company_ids', coalesce(
      (select jsonb_agg(cm.company_id) from public.company_members cm
        where cm.user_id = (select auth.uid()) and cm.status = 'ACTIVO'),
      '[]'::jsonb
    ),
    'is_admin', public.is_admin(),
    'is_staff', public.is_staff()
  );
$$;

revoke execute on function public.grant_role(uuid, public.app_role, uuid)  from public, anon;
revoke execute on function public.revoke_role(uuid, public.app_role, uuid) from public, anon;
revoke execute on function public.my_access()                              from public, anon;

grant execute on function public.grant_role(uuid, public.app_role, uuid)  to authenticated;
grant execute on function public.revoke_role(uuid, public.app_role, uuid) to authenticated;
grant execute on function public.my_access()                              to authenticated;
