-- Bucket para el logotipo, solo escribible por admin (como app_settings): no se usa
-- el de productos porque catalog.write no debe poder cambiar la marca.
insert into storage.buckets (id, name, public)
values ('marca', 'marca', true)
on conflict (id) do nothing;

drop policy if exists marca_lectura_publica on storage.objects;
drop policy if exists marca_escritura on storage.objects;
drop policy if exists marca_actualizacion on storage.objects;
drop policy if exists marca_borrado on storage.objects;

-- Lectura pública: el logotipo sale en la tienda, correos y facturas.
create policy marca_lectura_publica on storage.objects
  for select using (bucket_id = 'marca');

create policy marca_escritura on storage.objects
  for insert to authenticated
  with check (bucket_id = 'marca' and (select public.is_admin()));

create policy marca_actualizacion on storage.objects
  for update to authenticated
  using (bucket_id = 'marca' and (select public.is_admin()))
  with check (bucket_id = 'marca' and (select public.is_admin()));

create policy marca_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'marca' and (select public.is_admin()));
