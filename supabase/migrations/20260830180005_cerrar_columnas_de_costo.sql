-- ============================================================
-- Cerrar de verdad las columnas de costo
-- ============================================================
-- La migración anterior hacía `revoke select (cost_cop) ... from anon`, y no
-- servía de nada: en PostgreSQL un GRANT a nivel de TABLA ya implica todas
-- las columnas, y revocar una sola encima de él no lo recorta. Comprobado
-- contra la API: `anon` seguía leyendo `cost_cop` con respuesta 200.
--
-- La forma correcta —la misma que ya usaba `app_settings` para la contraseña
-- del correo— es revocar la tabla y volver a conceder columna por columna,
-- dejando fuera las confidenciales.
--
-- Hoy las columnas están vacías y no se ha filtrado nada. Esto se cierra
-- ANTES de cargar los costos reales, que es cuando el descuido se volvería
-- una fuga del margen de Pintuco.

-- ------------------------------------------------------------
-- product_variants: todo es público menos el costo
-- ------------------------------------------------------------
revoke select on public.product_variants from anon, authenticated;

grant select (
  id, product_id, external_ref, label, sku, barcode, price_cop,
  volume_liters, unit, quantity, sort_order, status, created_at, updated_at
) on public.product_variants to anon, authenticated;

-- El personal interno sí necesita el costo, y quién es «personal» lo decide
-- RLS, no el GRANT. Aquí solo se abre la puerta; la política de la tabla
-- sigue filtrando las filas.
grant select (cost_cop) on public.product_variants to authenticated;

-- ------------------------------------------------------------
-- inventory: el promedio ponderado es interno
-- ------------------------------------------------------------
-- `anon` no puede leer esta tabla de todos modos —su política exige personal
-- interno—, pero el permiso se recorta igual: una política mal editada en el
-- futuro no debería alcanzar para exponer costos.
revoke select on public.inventory from anon;

-- ------------------------------------------------------------
-- order_items: el costo congelado tampoco se publica
-- ------------------------------------------------------------
-- El cliente sí lee sus propias líneas de pedido —las necesita para ver qué
-- compró—, así que aquí no se puede revocar la tabla y ya: hay que devolver
-- explícitamente todas las columnas menos el costo.
revoke select on public.order_items from anon, authenticated;

grant select (
  id, order_id, variant_id, product_name, product_code, presentation,
  color_name, unit_price_cop, quantity, subtotal_cop, image_url
) on public.order_items to anon, authenticated;

-- El costo de la venta lo lee el personal para calcular márgenes.
-- La vista `v_ventas` ya restringe quién puede consultarla.
grant select (unit_cost_cop) on public.order_items to authenticated;
