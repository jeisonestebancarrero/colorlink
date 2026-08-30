-- ============================================================
-- BACK-OFFICE · 02 — Permisos editables por el administrador
-- ============================================================
-- Hasta ahora el acceso estaba escrito dentro de las políticas RLS: cambiar
-- qué puede hacer un rol exigía desplegar código.
--
-- El administrador debe poder manejar permisos, vistas y restricciones sin
-- que nadie toque el código. Para eso el rol deja de ser un valor fijo y
-- pasa a ser un PAQUETE DE PERMISOS editable.
--
-- Las políticas de datos existentes NO se tocan: siguen siendo la última
-- línea de defensa. Esta capa decide qué módulos y acciones se ofrecen, y la
-- RLS sigue garantizando que nadie vea filas ajenas aunque un permiso se
-- configure mal.
-- ============================================================

create table public.permissions (
  code        text primary key,
  module      text not null,
  action      text not null,
  label       text not null,
  description text,
  -- Un permiso crítico no puede quitarse al último administrador.
  is_critical boolean not null default false,
  sort_order  int not null default 0
);

comment on table public.permissions is
  'Catálogo de permisos. Lo define el producto; el administrador no inventa permisos, los asigna.';

create table public.role_permissions (
  role            public.app_role not null,
  permission_code text not null references public.permissions (code) on delete cascade,
  granted         boolean not null default true,
  updated_by      uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (role, permission_code)
);

create index role_permissions_role_idx on public.role_permissions (role);

-- ------------------------------------------------------------
-- Vistas del back-office: qué menús ve cada rol.
-- ------------------------------------------------------------
create table public.app_views (
  code       text primary key,
  label      text not null,
  icon       text,
  area       text not null default 'BACKOFFICE',
  route      text not null,
  sort_order int not null default 0,
  is_active  boolean not null default true
);

create table public.role_views (
  role       public.app_role not null,
  view_code  text not null references public.app_views (code) on delete cascade,
  visible    boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (role, view_code)
);

-- ============================================================
-- ¿El usuario actual tiene este permiso?
-- ============================================================
create or replace function public.has_permission(_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = (select auth.uid())
      and rp.permission_code = _code
      and rp.granted
  ) or public.is_admin();
$$;

/** Permisos y vistas del usuario actual, para que la interfaz sepa qué ofrecer. */
create or replace function public.my_permissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'permissions', coalesce((
      select jsonb_agg(distinct rp.permission_code)
      from public.user_roles ur
      join public.role_permissions rp on rp.role = ur.role
      where ur.user_id = (select auth.uid()) and rp.granted
    ), '[]'::jsonb),
    'views', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'code', v.code, 'label', v.label, 'icon', v.icon,
        'route', v.route, 'area', v.area, 'sort_order', v.sort_order
      ) order by jsonb_build_object(
        'code', v.code, 'label', v.label, 'icon', v.icon,
        'route', v.route, 'area', v.area, 'sort_order', v.sort_order
      ))
      from public.user_roles ur
      join public.role_views rv on rv.role = ur.role
      join public.app_views v on v.code = rv.view_code
      where ur.user_id = (select auth.uid()) and rv.visible and v.is_active
    ), '[]'::jsonb),
    'is_admin', public.is_admin(),
    'is_staff', public.is_staff()
  );
$$;

-- ============================================================
-- Cambiar un permiso: solo administración, y con bitácora.
-- ============================================================
create or replace function public.set_role_permission(
  _role text, _permission_code text, _granted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_critico boolean;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración modifica permisos' using errcode = '42501';
  end if;

  select is_critical into v_critico from public.permissions where code = _permission_code;
  if v_critico is null then
    raise exception 'NOT_FOUND: el permiso % no existe', _permission_code using errcode = 'P0002';
  end if;

  -- Protección contra el bloqueo total: nadie puede dejar al administrador
  -- sin la capacidad de volver a otorgar permisos.
  if v_critico and _role = 'ADMINISTRADOR' and not _granted then
    raise exception 'LOCKOUT: no se puede retirar un permiso crítico al administrador'
      using errcode = '23514';
  end if;

  insert into public.role_permissions (role, permission_code, granted, updated_by)
  values (_role::public.app_role, _permission_code, _granted, (select auth.uid()))
  on conflict (role, permission_code)
  do update set granted = excluded.granted,
                updated_by = excluded.updated_by,
                updated_at = now();

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'PERMISSION_CHANGED', 'role_permissions', null,
          jsonb_build_object('role', _role, 'permission', _permission_code, 'granted', _granted));
end;
$$;

create or replace function public.set_role_view(
  _role text, _view_code text, _visible boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración modifica vistas' using errcode = '42501';
  end if;

  insert into public.role_views (role, view_code, visible, updated_by)
  values (_role::public.app_role, _view_code, _visible, (select auth.uid()))
  on conflict (role, view_code)
  do update set visible = excluded.visible,
                updated_by = excluded.updated_by,
                updated_at = now();
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.app_views        enable row level security;
alter table public.role_views       enable row level security;

revoke all on public.permissions, public.role_permissions, public.app_views, public.role_views
  from anon, authenticated;
grant select on public.permissions, public.role_permissions, public.app_views, public.role_views
  to authenticated;

-- Cualquier usuario autenticado puede leer el catálogo (la interfaz lo
-- necesita para dibujar el menú), pero escribir pasa por las funciones.
create policy "permissions_lectura" on public.permissions
  for select to authenticated using (true);
create policy "app_views_lectura" on public.app_views
  for select to authenticated using (true);
create policy "role_permissions_lectura" on public.role_permissions
  for select to authenticated using (true);
create policy "role_views_lectura" on public.role_views
  for select to authenticated using (true);

revoke execute on function public.set_role_permission(text, text, boolean) from public, anon;
revoke execute on function public.set_role_view(text, text, boolean)       from public, anon;
revoke execute on function public.my_permissions()                          from public, anon;
grant execute on function public.set_role_permission(text, text, boolean) to authenticated;
grant execute on function public.set_role_view(text, text, boolean)       to authenticated;
grant execute on function public.my_permissions()                          to authenticated;

-- is_staff debe reconocer a todo el personal interno, no solo a los tres
-- roles originales.
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
      and ur.role in (
        'ASESOR','TECNICO','ADMINISTRADOR','BODEGA','DESPACHO',
        'FACTURACION','TESORERIA','CONTABILIDAD','SERVICIO_CLIENTE',
        'MARKETING','GERENCIA'
      )
  );
$$;
