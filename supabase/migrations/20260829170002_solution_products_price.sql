-- Precio publicado del paso de kit para pasos sin variante real (evita precio 0).
-- Si el paso resuelve una variante, manda el precio de la variante.

alter table public.solution_products
  add column unit_price_cop numeric(14,2);

alter table public.solution_products
  add constraint solution_products_precio_no_negativo
  check (unit_price_cop is null or unit_price_cop >= 0);

comment on column public.solution_products.unit_price_cop is
  'Precio publicado del paso del kit. Solo se usa cuando variant_id es NULL; si hay variante, manda el precio de la variante.';
