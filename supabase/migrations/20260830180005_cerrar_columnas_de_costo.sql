-- Revoca SELECT de tabla y lo concede por columna sin las de costo: revocar una
-- columna encima de un GRANT de tabla no tiene efecto en PostgreSQL.

revoke select on public.product_variants from anon, authenticated;

grant select (
  id, product_id, external_ref, label, sku, barcode, price_cop,
  volume_liters, unit, quantity, sort_order, status, created_at, updated_at
) on public.product_variants to anon, authenticated;

-- La columna se abre a authenticated; RLS sigue filtrando quién ve las filas.
grant select (cost_cop) on public.product_variants to authenticated;

-- Defensa en profundidad: la política ya bloquea a anon.
revoke select on public.inventory from anon;

-- El cliente lee sus líneas de pedido: se conceden todas las columnas menos el costo.
revoke select on public.order_items from anon, authenticated;

grant select (
  id, order_id, variant_id, product_name, product_code, presentation,
  color_name, unit_price_cop, quantity, subtotal_cop, image_url
) on public.order_items to anon, authenticated;

-- v_ventas restringe quién consulta el costo congelado.
grant select (unit_cost_cop) on public.order_items to authenticated;
