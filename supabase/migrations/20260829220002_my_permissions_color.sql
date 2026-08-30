-- ============================================================
-- Corrección incremental: my_permissions debe devolver el color
-- ============================================================
-- La migración que creó esta función es anterior a las columnas de color,
-- descripción y distintivo del tablero. No se reescribe una migración ya
-- aplicada: se redefine la función aquí.
-- ============================================================

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
      select jsonb_agg(v)
      from (
        select distinct v.code, v.label, v.icon, v.route, v.area,
               v.sort_order, v.color, v.description, v.badge
        from public.user_roles ur
        join public.role_views rv on rv.role = ur.role
        join public.app_views v on v.code = rv.view_code
        where ur.user_id = (select auth.uid()) and rv.visible and v.is_active
        order by v.sort_order
      ) v
    ), '[]'::jsonb),
    'is_admin', public.is_admin(),
    'is_staff', public.is_staff()
  );
$$;

revoke execute on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;
