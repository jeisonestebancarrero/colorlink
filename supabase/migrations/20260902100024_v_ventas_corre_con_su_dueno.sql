-- ============================================================
-- `v_ventas` también corre con su dueño, y es correcto
-- ============================================================
-- Último ajuste al cierre de vistas de la 20260902100021. `v_ventas` es el
-- mismo caso que `v_costos_catalogo` y no lo era el resto:
--
--   coalesce(oi.unit_cost_cop, pv.cost_cop) as cost_cop
--
-- lee las dos columnas de costo que NINGÚN rol de la API puede leer —cerradas
-- a propósito en `20260830180005_cerrar_columnas_de_costo.sql`—. Con
-- `security_invoker = true` la vista fallaba incluso para el administrador, y
-- con ella la parte de la analítica que distingue un margen medido de uno
-- estimado. Lo delató `costos.test.ts`.
--
-- Correr con el dueño es seguro aquí porque la autorización va DENTRO de la
-- vista: termina en `where has_permission('analytics.read')`. Es el mismo
-- patrón de `v_costos_catalogo`, y la diferencia con `v_cartera` es
-- justamente esa: `v_cartera` no comprobaba nada, así que dependía por
-- completo de RLS y por eso sí necesitaba `security_invoker`.
--
-- Queda entonces, para que no haya que volver a deducirlo:
--
--   · Sin guarda propia  -> `security_invoker = true`, manda RLS.
--     v_cartera, v_saldos_cuenta.
--   · Con guarda propia y columnas que nadie más puede leer -> dueño.
--     v_costos_catalogo, v_ventas.
--   · Con guarda propia y columnas normales -> `security_invoker = true`,
--     doble capa. v_balance_prueba, v_estado_resultados, v_libro_auxiliar,
--     v_inventario_por_punto.
--   · Catálogo público a propósito -> dueño, sin costos. v_variant_availability.

alter view public.v_ventas set (security_invoker = false);

comment on view public.v_ventas is
  'Ventas por línea con costo y margen. `security_invoker = false` es '
  'intencional: lee `order_items.unit_cost_cop` y `product_variants.cost_cop`, '
  'cerradas a todos los roles de la API. La autorización va dentro de la vista, '
  'en `where has_permission(''analytics.read'')`. No conceder a anon.';
