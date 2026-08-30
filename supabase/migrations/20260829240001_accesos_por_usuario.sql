-- ============================================================
-- Accesos por usuario, además de por rol
-- ============================================================
-- Hasta ahora el acceso se concedía solo por rol. Eso obliga a elegir entre
-- dos malas salidas cuando UNA persona necesita un módulo extra:
--   a) darle el acceso a TODO su rol — se lo damos a quien no lo necesita;
--   b) crear un rol nuevo para una sola persona — el catálogo de roles se
--      llena de casos particulares y deja de significar nada.
--
-- MODELO: el rol define la línea base; la excepción por usuario manda.
--   sin fila en user_views  -> vale lo que diga su rol
--   visible = true          -> se concede aunque el rol no lo tenga
--   visible = false         -> se retira aunque el rol sí lo tenga
--
-- La revocación explícita es tan necesaria como la concesión: permite
-- quitarle Tesorería a un contador concreto sin tocar el rol Contabilidad.
-- ============================================================

create table public.user_views (
  user_id    uuid not null references auth.users (id) on delete cascade,
  view_code  text not null references public.app_views (code) on delete cascade,
  visible    boolean not null,
  reason     text,
  granted_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, view_code)
);
create index user_views_user_id_idx on public.user_views (user_id);

create table public.user_permissions (
  user_id         uuid not null references auth.users (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  granted         boolean not null,
  reason          text,
  granted_by      uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (user_id, permission_code)
);
create index user_permissions_user_id_idx on public.user_permissions (user_id);

comment on table public.user_views is
  'Excepciones de acceso por persona. Prevalecen sobre lo que conceda el rol.';

-- ============================================================
-- has_permission: rol como base, excepción de usuario como decisión final
-- ============================================================
create or replace function public.has_permission(_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    -- 1. Si hay excepción personal, esa manda: concede o retira.
    (select up.granted
       from public.user_permissions up
      where up.user_id = (select auth.uid())
        and up.permission_code = _code),
    -- 2. Si no la hay, decide el rol.
    (select exists (
       select 1
       from public.user_roles ur
       join public.role_permissions rp on rp.role = ur.role
      where ur.user_id = (select auth.uid())
        and rp.permission_code = _code
        and rp.granted)),
    false
  ) or public.is_admin();
$$;

-- ============================================================
-- my_permissions: mismo criterio para permisos y para aplicaciones
-- ============================================================
create or replace function public.my_permissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with yo as (select (select auth.uid()) as uid),
  -- Permisos que da el rol
  por_rol as (
    select distinct rp.permission_code as code
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = (select uid from yo) and rp.granted
  ),
  -- Excepciones personales
  excepciones as (
    select up.permission_code as code, up.granted
    from public.user_permissions up
    where up.user_id = (select uid from yo)
  ),
  permisos as (
    select code from por_rol
    where code not in (select code from excepciones where not granted)
    union
    select code from excepciones where granted
  ),
  -- Aplicaciones que da el rol
  vistas_rol as (
    select distinct v.code
    from public.user_roles ur
    join public.role_views rv on rv.role = ur.role
    join public.app_views v on v.code = rv.view_code
    where ur.user_id = (select uid from yo) and rv.visible and v.is_active
  ),
  vistas_excepcion as (
    select uv.view_code as code, uv.visible
    from public.user_views uv
    where uv.user_id = (select uid from yo)
  ),
  vistas as (
    select code from vistas_rol
    where code not in (select code from vistas_excepcion where not visible)
    union
    select code from vistas_excepcion where visible
  )
  select jsonb_build_object(
    'permissions', coalesce((select jsonb_agg(code) from permisos), '[]'::jsonb),
    'views', coalesce((
      select jsonb_agg(x order by x.sort_order)
      from (
        select v.code, v.label, v.icon, v.route, v.area,
               v.sort_order, v.color, v.description, v.badge
        from public.app_views v
        where v.code in (select code from vistas) and v.is_active
      ) x
    ), '[]'::jsonb),
    'is_admin', public.is_admin(),
    'is_staff', public.is_staff()
  );
$$;

-- ============================================================
-- Conceder o retirar acceso a una persona
-- ============================================================
create or replace function public.set_user_view(
  _user_id uuid, _view_code text, _visible boolean, _reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración concede accesos' using errcode = '42501';
  end if;

  insert into public.user_views (user_id, view_code, visible, reason, granted_by)
  values (_user_id, _view_code, _visible, _reason, (select auth.uid()))
  on conflict (user_id, view_code)
  do update set visible = excluded.visible, reason = excluded.reason,
                granted_by = excluded.granted_by, updated_at = now();

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'USER_VIEW_CHANGED', 'user_views', _user_id,
          jsonb_build_object('view', _view_code, 'visible', _visible, 'reason', _reason));
end;
$$;

/** Elimina la excepción: la persona vuelve a lo que diga su rol. */
create or replace function public.clear_user_view(_user_id uuid, _view_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración concede accesos' using errcode = '42501';
  end if;

  delete from public.user_views
   where user_id = _user_id and view_code = _view_code;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'USER_VIEW_RESET', 'user_views', _user_id,
          jsonb_build_object('view', _view_code));
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.user_views       enable row level security;
alter table public.user_permissions enable row level security;

revoke all on public.user_views, public.user_permissions from anon, authenticated;
grant select on public.user_views, public.user_permissions to authenticated;

create policy "user_views_propio" on public.user_views
  for select to authenticated using ( user_id = (select auth.uid()) );
create policy "user_views_admin" on public.user_views
  for select to authenticated using ( (select public.is_admin()) );
create policy "user_permissions_propio" on public.user_permissions
  for select to authenticated using ( user_id = (select auth.uid()) );
create policy "user_permissions_admin" on public.user_permissions
  for select to authenticated using ( (select public.is_admin()) );

revoke execute on function public.set_user_view(uuid, text, boolean, text) from public, anon;
revoke execute on function public.clear_user_view(uuid, text)              from public, anon;
grant execute on function public.set_user_view(uuid, text, boolean, text) to authenticated;
grant execute on function public.clear_user_view(uuid, text)              to authenticated;
