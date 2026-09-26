-- Seguridad: countries no tenía RLS y la anon key podía modificarla o vaciarla.
-- Queda como departments y municipalities: lectura pública, sin escritura.

alter table public.countries enable row level security;

drop policy if exists countries_lectura_publica on public.countries;
create policy countries_lectura_publica on public.countries
  for select to anon, authenticated
  using (true);

-- TRUNCATE no pasa por RLS: se revoca el privilegio.
revoke insert, update, delete, truncate on public.countries from anon, authenticated;

notify pgrst, 'reload schema';
