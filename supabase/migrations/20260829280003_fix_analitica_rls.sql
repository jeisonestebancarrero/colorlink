-- ============================================================
-- CORRECCIÓN DE SEGURIDAD: la analítica exponía las ventas de todos
-- ============================================================
-- En PostgreSQL una vista se ejecuta por defecto con los privilegios de
-- QUIEN LA CREÓ, no de quien la consulta. `v_ventas` quedó así y con SELECT
-- concedido a `authenticated`: cualquier cliente con sesión podía leer los
-- pedidos, importes y márgenes de TODAS las empresas.
--
-- Dos capas de corrección:
--   1. La vista pasa a security_invoker: vuelve a aplicar RLS, de modo que
--      cada quien ve solo lo que ya tenía permitido ver.
--   2. Las funciones de analítica siguen siendo SECURITY DEFINER —necesitan
--      ver el total para poder agregar— pero ahora EXIGEN el permiso
--      `analytics.read` antes de devolver nada.
-- ============================================================

alter view public.v_ventas set (security_invoker = true);

create or replace function public.resumen_ventas(_desde date default null, _hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_resultado jsonb;
begin
  if not (public.is_admin() or public.has_permission('analytics.read')) then
    raise exception 'FORBIDDEN: no tienes permiso para ver la analítica' using errcode = '42501';
  end if;

  with rango as (
    select coalesce(_desde, (current_date - interval '365 days')::date) as d,
           coalesce(_hasta, current_date) as h
  ),
  base as (
    select o.id as order_id, o.total_cop, date_trunc('month', o.created_at) as mes,
           o.company_id, c.name as empresa,
           oi.quantity, oi.product_name, oi.subtotal_cop as linea_total,
           pv.cost_cop,
           case when pv.cost_cop is null then null
                else oi.subtotal_cop - (pv.cost_cop * oi.quantity) end as margen_linea
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    left join public.product_variants pv on pv.id = oi.variant_id
    left join public.companies c on c.id = o.company_id
    cross join rango r
    where o.status <> 'CANCELADO' and o.created_at::date between r.d and r.h
  ),
  pedidos as (select distinct order_id, total_cop, mes, empresa from base)
  select jsonb_build_object(
    'ingresos',     coalesce((select sum(total_cop) from pedidos), 0),
    'pedidos',      coalesce((select count(*) from pedidos), 0),
    'unidades',     coalesce((select sum(quantity) from base), 0),
    'ticket_medio', coalesce((select round(avg(total_cop), 0) from pedidos), 0),
    'margen',       (select sum(margen_linea) from base where margen_linea is not null),
    'lineas_sin_costo', coalesce((select count(*) from base where cost_cop is null), 0),
    'por_mes', coalesce((
      select jsonb_agg(x order by x.mes)
      from (select to_char(mes,'YYYY-MM') as mes, sum(total_cop) as total, count(*) as pedidos
            from pedidos group by mes) x), '[]'::jsonb),
    'top_productos', coalesce((
      select jsonb_agg(x)
      from (select product_name, sum(quantity) as unidades, sum(linea_total) as total
            from base group by product_name order by sum(linea_total) desc limit 8) x), '[]'::jsonb),
    'top_empresas', coalesce((
      select jsonb_agg(x)
      from (select coalesce(empresa,'Cliente particular') as empresa,
                   count(*) as pedidos, sum(total_cop) as total
            from pedidos group by empresa order by sum(total_cop) desc limit 8) x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

create or replace function public.ranking_comercial(_desde date default null, _hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_resultado jsonb;
begin
  if not (public.is_admin() or public.has_permission('analytics.read')) then
    raise exception 'FORBIDDEN: no tienes permiso para ver el ranking' using errcode = '42501';
  end if;

  with rango as (
    select coalesce(_desde, (current_date - interval '365 days')::date) as d,
           coalesce(_hasta, current_date) as h
  ),
  pedidos as (
    select distinct o.id, o.total_cop, o.project_id
    from public.orders o cross join rango r
    where o.status <> 'CANCELADO' and o.created_at::date between r.d and r.h
  ),
  atribuidos as (
    select p.id, p.total_cop, pa.user_id as asesor
    from pedidos p
    left join public.project_assignments pa
      on pa.project_id = p.project_id and pa.assignment_role = 'ASESOR'
  )
  select jsonb_build_object(
    'asesores', coalesce((
      select jsonb_agg(x order by x.total desc)
      from (select pr.first_name || ' ' || pr.last_name as nombre,
                   count(*) as pedidos, sum(a.total_cop) as total
            from atribuidos a
            join public.profiles pr on pr.id = a.asesor
            where a.asesor is not null
            group by pr.first_name, pr.last_name) x), '[]'::jsonb),
    'sin_asesor', jsonb_build_object(
      'pedidos', coalesce((select count(*) from atribuidos where asesor is null), 0),
      'total',   coalesce((select sum(total_cop) from atribuidos where asesor is null), 0))
  ) into v_resultado;

  return v_resultado;
end;
$$;
