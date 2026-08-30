-- ============================================================
-- FASE 2 · 04 — Roles, membresías y funciones de autorización
-- ============================================================
-- PRINCIPIO DE SEGURIDAD CENTRAL (MÓDULO 29/30):
-- El rol NO vive en una columna del perfil. Si estuviera en `profiles.role`
-- y el usuario puede editar su propio perfil, cualquiera se ascendería a
-- ADMINISTRADOR desde la consola del navegador. Por eso vive en una tabla
-- aparte que NO tiene ninguna política de INSERT/UPDATE/DELETE: la única vía
-- de escritura son las funciones `grant_role` / `revoke_role`, que exigen
-- ser administrador.
-- ============================================================

-- ------------------------------------------------------------
-- Asignación de roles de aplicación
-- ------------------------------------------------------------
create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  -- Ámbito opcional: permite que un ASESOR lo sea solo para una empresa.
  company_id uuid references public.companies (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),

  -- NULLS NOT DISTINCT (PostgreSQL 15+) evita duplicados cuando company_id
  -- es NULL; sin esta cláusula Postgres trataría cada NULL como distinto y
  -- un usuario podría acumular el mismo rol global varias veces.
  constraint user_roles_unicos unique nulls not distinct (user_id, role, company_id)
);

create index user_roles_user_id_idx    on public.user_roles (user_id);
create index user_roles_role_idx       on public.user_roles (role);
create index user_roles_company_id_idx on public.user_roles (company_id);

comment on table public.user_roles is
  'Roles de aplicación. Un usuario puede tener varios. SIN políticas de escritura: solo se modifica vía grant_role/revoke_role.';

-- ------------------------------------------------------------
-- Pertenencia a empresas (multi-tenant, MÓDULO 62)
-- ------------------------------------------------------------
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

-- ============================================================
-- FUNCIONES DE AUTORIZACIÓN
-- ============================================================
-- Todas son SECURITY DEFINER con search_path bloqueado. Esto NO es
-- cosmético: sin SECURITY DEFINER, una política sobre `projects` que
-- consulte `user_roles` (que a su vez tiene RLS) provoca RECURSIÓN INFINITA.
--
-- Se declaran STABLE para que Postgres las evalúe una sola vez por consulta
-- cuando se invocan como `(select public.is_admin())` dentro de una política,
-- en lugar de una vez por fila.
-- ============================================================

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

-- Personal interno de Pintuco: asesores, técnicos y administradores.
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

-- Empresas activas del usuario actual. Base del aislamiento entre tenants.
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

-- Puede administrar la empresa (OWNER o ADMIN de esa empresa).
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

-- ============================================================
-- RPC DE ADMINISTRACIÓN DE ROLES
-- ============================================================
-- Única puerta de escritura sobre user_roles. Verifica is_admin() en el
-- servidor: da igual lo que envíe el navegador.
-- ============================================================

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

  -- Protección contra bloqueo total del sistema: no se puede revocar el
  -- último ADMINISTRADOR que queda.
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

-- ============================================================
-- LECTURA DE PERMISOS PARA EL FRONTEND
-- ============================================================
-- Devuelve roles y empresas del usuario actual en una sola llamada, para
-- que AuthContext pueda decidir qué botones mostrar (capa 3, solo UX).
-- La autorización real la sigue aplicando RLS en cada consulta.
-- ============================================================

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

-- ------------------------------------------------------------
-- Permisos de ejecución: `anon` no necesita ninguna de estas funciones.
-- ------------------------------------------------------------
revoke execute on function public.grant_role(uuid, public.app_role, uuid)  from public, anon;
revoke execute on function public.revoke_role(uuid, public.app_role, uuid) from public, anon;
revoke execute on function public.my_access()                              from public, anon;

grant execute on function public.grant_role(uuid, public.app_role, uuid)  to authenticated;
grant execute on function public.revoke_role(uuid, public.app_role, uuid) to authenticated;
grant execute on function public.my_access()                              to authenticated;
