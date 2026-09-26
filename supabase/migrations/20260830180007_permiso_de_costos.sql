-- Las vistas de costo leen como su dueña (el invocador ya no tiene la columna) y
-- filtran con el permiso propio costs.read en el where, no con un GRANT.

insert into public.permissions (code, module, action, label, description, is_critical, sort_order)
values (
  'costs.read', 'Costos', 'read',
  'Ver costos y márgenes',
  'Ver el costo de los productos, el costo promedio del inventario y la rentabilidad. Revela el margen del negocio.',
  true, 5
)
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code, granted)
values
  ('ADMINISTRADOR', 'costs.read', true),
  ('GERENCIA',      'costs.read', true),
  ('CONTABILIDAD',  'costs.read', true),
  ('TESORERIA',     'costs.read', true),
  ('BODEGA',        'costs.read', true)
on conflict (role, permission_code) do update set granted = excluded.granted;

drop view if exists public.v_costos_catalogo;

create view public.v_costos_catalogo as
select
  v.id            as variant_id,
  v.product_id,
  p.name          as producto,
  p.code          as codigo,
  v.label         as presentacion,
  v.sku,
  v.price_cop,
  v.cost_cop      as costo_estandar,
    -- Costo real, según las recepciones.
  (select round(avg(i.avg_cost_cop), 2)
     from public.inventory i
    where i.variant_id = v.id and i.avg_cost_cop > 0) as costo_promedio,
  case
    when v.price_cop > 0 and coalesce(
      (select round(avg(i.avg_cost_cop), 2) from public.inventory i
        where i.variant_id = v.id and i.avg_cost_cop > 0),
      v.cost_cop) > 0
    then round(
      (v.price_cop - coalesce(
        (select round(avg(i.avg_cost_cop), 2) from public.inventory i
          where i.variant_id = v.id and i.avg_cost_cop > 0),
        v.cost_cop)) * 100.0 / v.price_cop, 1)
  end             as margen_pct
from public.product_variants v
join public.products p on p.id = v.product_id
where public.has_permission('costs.read');

grant select on public.v_costos_catalogo to authenticated;

comment on view public.v_costos_catalogo is
  'Costos y margen por presentación. Lee como su dueña para alcanzar la columna confidencial; el acceso lo controla el predicado has_permission(costs.read).';

drop view if exists public.v_ventas cascade;

create view public.v_ventas as
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
    -- true = costo estándar del catálogo: el margen es aproximado.
  (oi.unit_cost_cop is null and pv.cost_cop is not null) as costo_estimado
from public.orders o
join public.order_items oi on oi.order_id = o.id
left join public.product_variants pv on pv.id = oi.variant_id
left join public.companies c on c.id = o.company_id
where o.status <> 'CANCELADO'
  and public.has_permission('analytics.read');

grant select on public.v_ventas to authenticated;

comment on view public.v_ventas is
  'Ventas por línea con su margen. El acceso lo controla el predicado has_permission(analytics.read); el margen usa el costo congelado en la venta.';
