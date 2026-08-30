-- ============================================================
-- FASE 4 · 02 — Precio de referencia del paso de kit
-- ============================================================
-- MOTIVO (detectado por la prueba de fidelidad del catálogo):
-- 6 de los 11 pasos de kit citan una presentación que NO existe como
-- variante del producto. Unos por diferencia de redacción
-- ("1 Galón" vs "1 Galón (3.785 L)", "1 Galón (4.5 Kg)" vs "Galón 4.5 Kg")
-- y otros porque la etiqueta no es una presentación en absoluto
-- ("Pack Completo Obra", "2 Cuñetes de 5 Galones").
--
-- Sin esta columna, esos pasos quedaban con precio 0: una regresión visible
-- en SolutionKitsPage y un error de precio al añadir el kit al carrito.
--
-- SOBRE LA FUENTE ÚNICA DE VERDAD (MÓDULO 52):
-- Esto NO es un segundo precio compitiendo con el de la variante. El orden
-- de autoridad es explícito y lo aplica el traductor:
--   1. Si el paso resuelve una variante real -> manda el precio de la variante.
--   2. Si no la resuelve -> se usa este precio publicado del kit.
-- El caso 2 es una deuda de datos que Pintuco debe sanear corrigiendo las
-- etiquetas o dando de alta esas presentaciones. La columna la hace visible
-- en vez de esconderla tras un cero.
-- ============================================================

alter table public.solution_products
  add column unit_price_cop numeric(14,2);

alter table public.solution_products
  add constraint solution_products_precio_no_negativo
  check (unit_price_cop is null or unit_price_cop >= 0);

comment on column public.solution_products.unit_price_cop is
  'Precio publicado del paso del kit. Solo se usa cuando variant_id es NULL; si hay variante, manda el precio de la variante.';
