-- ============================================================
-- La matriz de roles tiene que mirar `visible`
-- ============================================================
-- Corrige `configuracion_de_roles` de la migración anterior.
--
-- `set_role_view` NO borra la fila cuando se le quita una aplicación a un rol:
-- deja la fila con `visible = false`. Es lo correcto —así queda constancia de
-- quién lo cambió y cuándo, en `updated_by`— pero yo armé el resumen contando
-- todas las filas sin mirar esa columna.
--
-- Consecuencia: la matriz habría mostrado la casilla MARCADA en una aplicación
-- que el rol ya no ve. Quien reparte accesos se habría quedado creyendo que
-- alguien tiene un permiso que en realidad no tiene, que es exactamente el
-- error que esta pantalla existe para evitar.

create or replace function public.configuracion_de_roles()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then jsonb_build_object(
    'roles', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'codigo', m.role, 'etiqueta', m.label, 'descripcion', m.description,
        'delSistema', m.es_del_sistema, 'activo', m.activo,
        'personas', (select count(*) from public.user_roles ur where ur.role::text = m.role)
      ) order by m.es_del_sistema desc, m.label), '[]'::jsonb)
      from public.role_meta m
    ),
    'vistas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', v.code, 'label', v.label, 'area', v.area, 'orden', v.sort_order
      ) order by v.sort_order), '[]'::jsonb)
      from public.app_views v where v.is_active
    ),
    'porRol', (
      select coalesce(jsonb_object_agg(t.rol, t.codigos), '{}'::jsonb)
      from (
        select rv.role::text as rol, jsonb_agg(rv.view_code) as codigos
        from public.role_views rv
        -- Aquí estaba el fallo: sin este filtro, una aplicación retirada
        -- seguía apareciendo marcada.
        where rv.visible
        group by rv.role
      ) t
    )
  ) else null end;
$$;

comment on function public.configuracion_de_roles() is
  'Roles, aplicaciones y qué ve cada rol. Solo cuenta las vistas con '
  '`visible = true`: `set_role_view` no borra la fila al retirar una, la marca.';
