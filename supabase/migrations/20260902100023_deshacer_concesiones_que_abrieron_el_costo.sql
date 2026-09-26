-- Revierte los GRANT de tabla de la 20260902100021 sobre product_variants y order_items:
-- exponían cost_cop y unit_cost_cop. El acceso ya estaba concedido por columna
-- (20260830180005); se ve en column_privileges, no en role_table_grants.

revoke select on public.product_variants from authenticated;

grant select (
  id, product_id, external_ref, label, sku, barcode, price_cop,
  volume_liters, unit, quantity, sort_order, status, created_at, updated_at
) on public.product_variants to authenticated;

revoke select on public.order_items from authenticated;

grant select (
  id, order_id, variant_id, product_name, product_code, presentation,
  color_name, unit_price_cop, quantity, subtotal_cop, image_url
) on public.order_items to authenticated;

-- cost_cop y unit_cost_cop quedan fuera: se leen solo vía v_costos_catalogo.

-- v_costos_catalogo corre con su dueño: lee cost_cop, que ningún rol de la API puede
-- leer, y la autorización va dentro (has_permission('costs.read')).
alter view public.v_costos_catalogo set (security_invoker = false);

comment on view public.v_costos_catalogo is
  'Costos y margen del catálogo. `security_invoker = false` es intencional: lee '
  'columnas que ningún rol de la API puede leer. La autorización va dentro de la '
  'vista, en `where has_permission(''costs.read'')`. No conceder a anon.';

-- Sin grant a anon, la protección no depende solo de security_invoker, que un
-- create or replace view futuro no hereda. v_variant_availability sigue pública.
revoke all on
  public.v_cartera, public.v_balance_prueba, public.v_estado_resultados,
  public.v_libro_auxiliar, public.v_costos_catalogo, public.v_ventas
  from anon;
