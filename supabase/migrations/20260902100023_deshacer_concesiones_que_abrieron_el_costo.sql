-- ============================================================
-- Deshacer dos concesiones que abrieron el costo
-- ============================================================
-- Corrige un exceso de la migración 20260902100021, que al cerrar las vistas
-- de reportes concedió de más:
--
--   grant select on public.product_variants to authenticated;   -- ¡mal!
--   grant select on public.order_items      to authenticated;   -- ¡mal!
--
-- POR QUÉ ME EQUIVOQUÉ: consulté `information_schema.role_table_grants`, que
-- solo lista permisos a nivel de TABLA, y ahí `product_variants` aparecía sin
-- SELECT para `authenticated`. Concluí que activar `security_invoker` iba a
-- apagar la pantalla de costos y concedí la tabla entera. Pero el permiso ya
-- estaba, concedido COLUMNA POR COLUMNA en
-- `20260830180005_cerrar_columnas_de_costo.sql`, y esa vista no lo muestra.
-- Los permisos por columna se ven en `information_schema.column_privileges`.
--
-- LO QUE CAUSÓ: un GRANT de tabla incluye TODAS las columnas, así que
-- `cost_cop` y `unit_cost_cop` quedaron legibles por cualquiera con sesión.
-- Es exactamente el descuido contra el que se escribió aquella migración —el
-- margen de Pintuco— y peor que la fuga que la 21 venía a tapar. Lo delataron
-- dos pruebas que ya existían, `costos.test.ts` y `rls-catalog.test.ts`.
--
-- Se restituye el esquema por columna, tal cual estaba.

-- ------------------------------------------------------------
-- Volver a cerrar la tabla y devolver solo las columnas públicas
-- ------------------------------------------------------------
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

-- `cost_cop` y `unit_cost_cop` quedan fuera a propósito. Nadie los lee
-- directamente: se leen por `v_costos_catalogo`, que comprueba el permiso.

-- ------------------------------------------------------------
-- La vista de costos vuelve a ejecutarse con su dueño, y es correcto
-- ------------------------------------------------------------
-- `v_costos_catalogo` lleva la autorización DENTRO: termina en
-- `where has_permission('costs.read')`. Es lo que la hace segura, no el
-- permiso sobre la tabla. Y tiene que correr con su dueño precisamente porque
-- lee `cost_cop`, que ningún rol de la API puede leer por su cuenta —esa es la
-- razón de existir de la vista—.
--
-- Con `security_invoker = true` la vista fallaba para todo el mundo, incluido
-- el personal con `costs.read`: apagaba la pantalla en lugar de asegurarla.
alter view public.v_costos_catalogo set (security_invoker = false);

comment on view public.v_costos_catalogo is
  'Costos y margen del catálogo. `security_invoker = false` es intencional: lee '
  'columnas que ningún rol de la API puede leer. La autorización va dentro de la '
  'vista, en `where has_permission(''costs.read'')`. No conceder a anon.';

-- ------------------------------------------------------------
-- Las vistas reservadas dejan de estar concedidas a `anon`
-- ------------------------------------------------------------
-- Con `security_invoker` puesto, `anon` ya no saca nada de ellas. El permiso
-- sobraba igual, y dejarlo hacía que la protección dependiera de una sola
-- opción: un `create or replace view` futuro no la hereda, y el agujero se
-- reabriría sin que nadie tocara un GRANT.
--
-- `v_variant_availability` NO está en la lista: publica el catálogo a quien no
-- ha iniciado sesión, que es lo que tiene que hacer la tienda.
revoke all on
  public.v_cartera, public.v_balance_prueba, public.v_estado_resultados,
  public.v_libro_auxiliar, public.v_costos_catalogo, public.v_ventas
  from anon;
