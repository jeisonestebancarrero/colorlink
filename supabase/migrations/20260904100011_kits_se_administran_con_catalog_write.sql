-- ============================================================
-- Los kits se administran como el resto del catálogo
-- ============================================================
-- `solutions` y `solution_products` solo aceptaban escritura de `is_admin()`,
-- mientras que productos, presentaciones, categorías y colores se administran
-- con el permiso `catalog.write`. Esa diferencia no responde a nada: un kit es
-- catálogo, y quien mantiene el catálogo debería poder armarlo sin necesitar
-- el rol de administrador de la plataforma.
--
-- Se alinea con el resto. `has_permission` ya incluye a `is_admin()`, así que
-- el administrador conserva el acceso que tenía.
-- ============================================================

drop policy if exists solutions_escritura_admin on public.solutions;
drop policy if exists solution_products_escritura_admin on public.solution_products;

create policy solutions_escritura_catalogo on public.solutions
  for all to authenticated
  using      ( (select public.has_permission('catalog.write')) )
  with check ( (select public.has_permission('catalog.write')) );

create policy solution_products_escritura_catalogo on public.solution_products
  for all to authenticated
  using      ( (select public.has_permission('catalog.write')) )
  with check ( (select public.has_permission('catalog.write')) );

-- El descuento es un porcentaje: sin tope, un cero de más regala el kit.
alter table public.solutions
  drop constraint if exists solutions_descuento_valido;
alter table public.solutions
  add constraint solutions_descuento_valido
  check (discount_percent >= 0 and discount_percent <= 100);

notify pgrst, 'reload schema';
