-- v_ventas calcula el margen con el costo congelado en la venta, no con el del
-- catálogo, para que un cambio de costo no reescriba la utilidad histórica.
create or replace view public.v_ventas
with (security_invoker = true) as
select
  o.id                                  as order_id,
  o.order_number,
  o.created_at,
  date_trunc('month', o.created_at)     as mes,
  o.status,
  o.user_id,
  o.company_id,
  c.name                                as empresa,
  o.total_cop,
  o.subtotal_cop,
  o.discount_cop,
  oi.variant_id,
  oi.product_name,
  oi.quantity,
  oi.subtotal_cop                       as linea_total,
  coalesce(oi.unit_cost_cop, pv.cost_cop) as cost_cop,
  case
    when coalesce(oi.unit_cost_cop, pv.cost_cop) is null then null::numeric
    else oi.subtotal_cop - (coalesce(oi.unit_cost_cop, pv.cost_cop) * oi.quantity)
  end                                   as margen_linea,
    -- Al final porque create or replace view no permite reordenar columnas.
    -- true = costo estándar del catálogo: el margen es aproximado.
  (oi.unit_cost_cop is null and pv.cost_cop is not null) as costo_estimado
from public.orders o
join public.order_items oi on oi.order_id = o.id
left join public.product_variants pv on pv.id = oi.variant_id
left join public.companies c on c.id = o.company_id
where o.status <> 'CANCELADO';

grant select on public.v_ventas to authenticated;
