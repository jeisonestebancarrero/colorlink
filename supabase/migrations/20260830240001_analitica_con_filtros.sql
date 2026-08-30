-- ============================================================
-- Analítica: una sola consulta, con filtros y todas las aperturas
-- ============================================================
-- La pantalla anterior solo respondía "cuánto vendimos". Faltaba lo que de
-- verdad se pregunta un gerente: en qué mes se ganó más, qué punto de venta
-- rinde, qué producto deja margen y qué producto se vende mucho pero no deja
-- nada.
--
-- Todo se calcula a nivel de LÍNEA de pedido, no de pedido. Es la única forma
-- de poder filtrar por producto: el total del pedido no se puede repartir
-- entre sus productos sin inventar una regla. Los pedidos se cuentan aparte,
-- como distintos, para que el ticket medio siga teniendo sentido.
--
-- El costo sale de `order_items.unit_cost_cop` (el congelado en la venta) y
-- solo si falta se recurre al del catálogo. Ver 20260830230002.
create or replace function public.analitica_ventas(
  _desde       date default null,
  _hasta       date default null,
  _puntos      uuid[] default null,
  _categorias  uuid[] default null,
  _productos   uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_ver_costos boolean;
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
      and (_puntos     is null or o.pickup_location_id = any(_puntos))
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
$$;

revoke all on function public.analitica_ventas(date, date, uuid[], uuid[], uuid[]) from public;
grant execute on function public.analitica_ventas(date, date, uuid[], uuid[], uuid[]) to authenticated;

comment on function public.analitica_ventas(date, date, uuid[], uuid[], uuid[]) is
  'Analítica de ventas por mes, año, punto de venta, categoría y producto, con filtros combinables. El margen solo se calcula para quien tenga costs.read.';

-- ------------------------------------------------------------
-- Opciones de los filtros
-- ------------------------------------------------------------
-- Se resuelven en la base para que la pantalla no tenga que traer el catálogo
-- entero solo para llenar tres desplegables.
create or replace function public.analitica_filtros()
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

  select jsonb_build_object(
    'puntos', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nombre', name, 'ciudad', city)
                       order by name)
        from public.pickup_locations), '[]'::jsonb),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nombre', name) order by sort_order, name)
        from public.categories
       where kind = 'PRODUCT' and parent_id is not null), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nombre', name, 'codigo', code)
                       order by name)
        from public.products), '[]'::jsonb),
    -- Desde cuándo hay ventas: la pantalla lo usa para no ofrecer años vacíos.
    'anios', coalesce((
      select jsonb_agg(distinct date_part('year', created_at)::int)
        from public.orders where status <> 'CANCELADO'), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.analitica_filtros() from public;
grant execute on function public.analitica_filtros() to authenticated;
