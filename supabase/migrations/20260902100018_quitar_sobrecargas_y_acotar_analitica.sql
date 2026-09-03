-- ============================================================
-- Fuera las sobrecargas antiguas y analítica acotada
-- ============================================================
-- 20260902100017 agregó `_sedes` a `resumen_panel` y `resumen_ventas`. Como el
-- parámetro es nuevo, PostgreSQL creó una SOBRECARGA en lugar de reemplazar:
-- quedaron `resumen_panel()` y `resumen_panel(uuid[])` a la vez.
--
-- Eso no es cosmético. PostgREST resuelve la llamada por los parámetros que
-- recibe, así que una petición sin `_sedes` seguiría cayendo en la versión
-- VIEJA —la que no acota por sede— y el hueco quedaría abierto justo por el
-- camino que usan las pantallas hoy. Se dejan solo las versiones con `_sedes`,
-- cuyo parámetro tiene valor por defecto.
--
-- Y `analitica_ventas` pasa a cruzar el punto pedido con lo permitido: también
-- es SECURITY DEFINER, así que RLS no la protegía.

drop function if exists public.resumen_panel();
drop function if exists public.resumen_ventas(date, date);

CREATE OR REPLACE FUNCTION public.analitica_ventas(_desde date DEFAULT NULL::date, _hasta date DEFAULT NULL::date, _puntos uuid[] DEFAULT NULL::uuid[], _categorias uuid[] DEFAULT NULL::uuid[], _productos uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_resultado jsonb;
  v_ver_costos boolean;
  -- El punto que pide la pantalla, CRUZADO con las sedes permitidas. Esta
  -- función es SECURITY DEFINER, así que RLS no aplica dentro: sin este cruce,
  -- mandar el id de una sede ajena devolvía sus ventas.
  v_sedes uuid[] := public.sedes_efectivas(_puntos);
begin
  if not (public.is_admin() or public.has_permission('analytics.read')) then
    raise exception 'FORBIDDEN: no tienes permiso para ver la analítica' using errcode = '42501';
  end if;

  -- El margen es información de costos. Quien no tenga ese permiso ve las
  -- ventas completas pero no la rentabilidad.
  v_ver_costos := public.is_admin() or public.has_permission('costs.read');

  with rango as (
    select coalesce(_desde, (current_date - interval '730 days')::date) as d,
           coalesce(_hasta, current_date) as h
  ),
  base as (
    select
      o.id                as order_id,
      o.created_at,
      date_trunc('month', o.created_at) as mes,
      date_part('year', o.created_at)::int as anio,
      o.pickup_location_id,
      pl.name             as punto,
      pl.city             as ciudad,
      coalesce(cat.name, 'Sin categoría') as categoria,
      p.id                as product_id,
      coalesce(p.name, oi.product_name)  as producto,
      coalesce(p.code, oi.product_code)  as codigo,
      oi.quantity,
      oi.subtotal_cop     as ingreso,
      coalesce(oi.unit_cost_cop, pv.cost_cop) * oi.quantity as costo,
      (oi.unit_cost_cop is null and pv.cost_cop is not null) as costo_estimado,
      coalesce(oi.unit_cost_cop, pv.cost_cop) is null        as sin_costo
    from public.orders o
    join public.order_items oi        on oi.order_id = o.id
    left join public.product_variants pv on pv.id = oi.variant_id
    left join public.products p          on p.id = pv.product_id
    left join public.categories cat      on cat.id = p.category_id
    left join public.pickup_locations pl on pl.id = o.pickup_location_id
    cross join rango r
    where o.status <> 'CANCELADO'
      and o.created_at::date between r.d and r.h
      and (o.pickup_location_id is null or o.pickup_location_id = any(v_sedes))
      and (_categorias is null or p.category_id = any(_categorias))
      and (_productos  is null or p.id = any(_productos))
  ),
  -- Un pedido puede tener líneas de varios productos; al filtrar por producto
  -- solo cuentan las líneas que pasaron el filtro, pero el pedido es uno.
  pedidos as (select distinct order_id from base),
  meses as (
    select to_char(mes, 'YYYY-MM') as mes,
           sum(ingreso) as ingresos,
           sum(costo)   as costo,
           sum(ingreso) - coalesce(sum(costo), 0) as margen,
           count(distinct order_id) as pedidos,
           sum(quantity) as unidades
      from base group by mes
  )
  select jsonb_build_object(
    'ingresos',    coalesce((select sum(ingreso) from base), 0),
    'costo',       case when v_ver_costos then coalesce((select sum(costo) from base), 0) end,
    'margen',      case when v_ver_costos
                        then (select sum(ingreso) - coalesce(sum(costo), 0) from base
                               where not sin_costo) end,
    'pedidos',     (select count(*) from pedidos),
    'unidades',    coalesce((select sum(quantity) from base), 0),
    'ticket_medio', coalesce((
      select round(sum(ingreso) / nullif(count(distinct order_id), 0), 0) from base), 0),
    'lineas',            (select count(*) from base),
    'lineas_sin_costo',  (select count(*) from base where sin_costo),
    'lineas_estimadas',  (select count(*) from base where costo_estimado),
    'ver_costos',        v_ver_costos,

    'por_mes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'mes', m.mes, 'ingresos', m.ingresos, 'pedidos', m.pedidos,
               'unidades', m.unidades,
               'margen', case when v_ver_costos then m.margen end
             ) order by m.mes)
      from meses m), '[]'::jsonb),

    'por_anio', coalesce((
      select jsonb_agg(x order by x.anio)
      from (select anio,
                   sum(ingreso) as ingresos,
                   count(distinct order_id) as pedidos,
                   case when v_ver_costos
                        then sum(ingreso) - coalesce(sum(costo), 0) end as margen
              from base group by anio) x), '[]'::jsonb),

    -- El mes que más dejó. Si no hay costos visibles, el de más ingresos.
    'mejor_mes', (
      select jsonb_build_object('mes', m.mes, 'ingresos', m.ingresos,
                                'margen', case when v_ver_costos then m.margen end)
        from meses m
       order by case when v_ver_costos then m.margen else m.ingresos end desc nulls last
       limit 1),

    'por_punto', coalesce((
      select jsonb_agg(x order by x.ingresos desc)
      from (select coalesce(punto, 'Sin punto asignado') as punto,
                   ciudad,
                   sum(ingreso) as ingresos,
                   count(distinct order_id) as pedidos,
                   sum(quantity) as unidades,
                   case when v_ver_costos
                        then sum(ingreso) - coalesce(sum(costo), 0) end as margen
              from base group by punto, ciudad) x), '[]'::jsonb),

    'por_categoria', coalesce((
      select jsonb_agg(x order by x.ingresos desc)
      from (select categoria,
                   sum(ingreso) as ingresos,
                   sum(quantity) as unidades,
                   case when v_ver_costos
                        then sum(ingreso) - coalesce(sum(costo), 0) end as margen
              from base group by categoria) x), '[]'::jsonb),

    'por_producto', coalesce((
      select jsonb_agg(x order by x.ingresos desc)
      from (select producto, codigo,
                   sum(quantity) as unidades,
                   sum(ingreso) as ingresos,
                   case when v_ver_costos
                        then sum(ingreso) - coalesce(sum(costo), 0) end as margen,
                   case when v_ver_costos and sum(ingreso) > 0
                        then round(100 * (sum(ingreso) - coalesce(sum(costo), 0))
                                       / sum(ingreso), 1) end as margen_pct
              from base group by producto, codigo
             order by sum(ingreso) desc limit 20) x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;

notify pgrst, 'reload schema';
