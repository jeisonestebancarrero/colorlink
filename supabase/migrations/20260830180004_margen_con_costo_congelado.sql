-- ============================================================
-- El margen sale del costo de la venta, no del catálogo
-- ============================================================
-- `v_ventas` calculaba el margen con `product_variants.cost_cop`, el costo
-- estándar del catálogo. Es exactamente el error que este módulo existe para
-- evitar: con esa fórmula, corregir hoy el costo de una referencia cambia la
-- utilidad de todos los pedidos ya vendidos. La rentabilidad de marzo no
-- puede depender de lo que se pague en septiembre.
--
-- Ahora el margen usa `order_items.unit_cost_cop`, congelado en el momento de
-- la venta, y cae al costo estándar solo cuando la venta es anterior a este
-- módulo y no tiene costo capturado. Esa distinción se expone en la columna
-- `costo_estimado` para que nadie confunda una utilidad medida con una
-- aproximada.
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
  -- Va al final porque `create or replace view` no permite reordenar
  -- columnas existentes. Es true cuando el costo no se capturó en la venta y
  -- se está usando el estándar del catálogo: entonces el margen es una
  -- aproximación, no una medición, y la pantalla debe decirlo.
  (oi.unit_cost_cop is null and pv.cost_cop is not null) as costo_estimado
from public.orders o
join public.order_items oi on oi.order_id = o.id
left join public.product_variants pv on pv.id = oi.variant_id
left join public.companies c on c.id = o.company_id
where o.status <> 'CANCELADO';

grant select on public.v_ventas to authenticated;
