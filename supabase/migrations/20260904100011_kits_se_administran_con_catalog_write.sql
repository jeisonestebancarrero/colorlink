-- solutions y solution_products pasan de is_admin() a catalog.write, como el resto
-- del catálogo; has_permission ya incluye al admin.

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

-- Tope al porcentaje de descuento: un cero de más regalaría el kit.
alter table public.solutions
  drop constraint if exists solutions_descuento_valido;
alter table public.solutions
  add constraint solutions_descuento_valido
  check (discount_percent >= 0 and discount_percent <= 100);

notify pgrst, 'reload schema';
