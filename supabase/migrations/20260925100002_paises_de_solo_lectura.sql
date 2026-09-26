-- ============================================================================
-- El catálogo de países queda de solo lectura
-- ============================================================================
-- `countries` era la única tabla de `public` sin RLS. Supabase concede por
-- defecto todos los privilegios a `anon` y `authenticated` sobre las tablas
-- del esquema, y lo que las protege es RLS: sin ella, cualquiera con la llave
-- pública —que viaja en el JavaScript de la tienda— podía insertar, cambiar,
-- borrar o vaciar la tabla, y el registro de clientes depende de ella.
--
-- Se deja igual que `departments` y `municipalities`: lectura pública y
-- ninguna escritura desde el navegador. Salió al contar las tablas con RLS
-- para el documento de calidad (25 de septiembre de 2026).
-- ============================================================================

alter table public.countries enable row level security;

drop policy if exists countries_lectura_publica on public.countries;
create policy countries_lectura_publica on public.countries
  for select to anon, authenticated
  using (true);

-- Aunque RLS ya lo impide, TRUNCATE no pasa por RLS: se retira el privilegio.
revoke insert, update, delete, truncate on public.countries from anon, authenticated;

notify pgrst, 'reload schema';
