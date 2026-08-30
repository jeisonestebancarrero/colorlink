-- ============================================================
-- El margen se calcula con el costo de la venta, no con el de hoy
-- ============================================================
-- Dos correcciones sobre `resumen_ventas`:
--
-- 1. Usaba `product_variants.cost_cop` directamente. Ese es el costo estándar
--    de HOY, así que subir el costo de un producto reescribía hacia atrás el
--    margen de ventas ya cerradas. El costo bueno es el que quedó congelado en
--    la línea del pedido (`order_items.unit_cost_cop`); el del catálogo solo
--    sirve de respaldo cuando la venta es anterior a que existiera esa columna.
--    Es el mismo orden que ya aplica la vista `v_ventas`.
--
-- 2. Se distingue el margen calculado con costo real del calculado con el
--    respaldo del catálogo. Sin esa señal, una cifra estimada se lee como un
--    hecho, y quien decide precios con ella no sabe que está mirando un
--    supuesto.
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
           coalesce(oi.unit_cost_cop, pv.cost_cop) as cost_cop,
           -- Estimada: la venta no guardó su costo y estamos usando el del
           -- catálogo, que pudo cambiar desde entonces.
           (oi.unit_cost_cop is null and pv.cost_cop is not null) as costo_estimado,
           case when coalesce(oi.unit_cost_cop, pv.cost_cop) is null then null
                else oi.subtotal_cop - (coalesce(oi.unit_cost_cop, pv.cost_cop) * oi.quantity)
           end as margen_linea
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
    'lineas_sin_costo',  coalesce((select count(*) from base where cost_cop is null), 0),
    'lineas_estimadas',  coalesce((select count(*) from base where costo_estimado), 0),
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

revoke all on function public.resumen_ventas(date, date) from public;
grant execute on function public.resumen_ventas(date, date) to authenticated;
