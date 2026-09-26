-- v_ventas corre con su dueño: lee columnas de costo que ningún rol de la API puede
-- leer y se protege dentro con has_permission('analytics.read').
-- Regla: vista sin guarda propia -> security_invoker; con guarda y columnas cerradas -> dueño.

alter view public.v_ventas set (security_invoker = false);

comment on view public.v_ventas is
  'Ventas por línea con costo y margen. `security_invoker = false` es '
  'intencional: lee `order_items.unit_cost_cop` y `product_variants.cost_cop`, '
  'cerradas a todos los roles de la API. La autorización va dentro de la vista, '
  'en `where has_permission(''analytics.read'')`. No conceder a anon.';
