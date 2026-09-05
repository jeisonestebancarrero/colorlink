-- Depósito para el logotipo de la empresa.
--
-- El campo del logotipo solo aceptaba una URL, así que para cambiarlo había
-- que subir la imagen a algún otro sitio primero. En la práctica eso significa
-- que nadie lo cambia, o que el logotipo de la empresa acaba colgando de un
-- servidor ajeno que un día deja de responder —y entonces desaparece de las
-- facturas y de los correos, que es donde más se nota—.
--
-- No se reutiliza el depósito `productos`, aunque sería más corto: escribir
-- ahí se concede con `catalog.write`, el permiso de quien administra el
-- catálogo. La identidad de la marca no es catálogo, y quien puede cambiar el
-- precio de un galón no tiene por qué poder cambiar el logotipo que sale en
-- las facturas. Se ata a la misma regla que protege `app_settings`: solo un
-- administrador.
insert into storage.buckets (id, name, public)
values ('marca', 'marca', true)
on conflict (id) do nothing;

drop policy if exists marca_lectura_publica on storage.objects;
drop policy if exists marca_escritura on storage.objects;
drop policy if exists marca_actualizacion on storage.objects;
drop policy if exists marca_borrado on storage.objects;

-- El logotipo se ve en la tienda, en los correos y en las facturas: se lee sin
-- sesión a propósito.
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
