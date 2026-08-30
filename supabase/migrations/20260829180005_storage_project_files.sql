-- ============================================================
-- FASE 5 · 05 — Supabase Storage para archivos de proyecto
-- ============================================================
-- MÓDULO 31. Resuelve el riesgo R6 de la auditoría: hoy FileUploader crea
-- una URL `blob:` con URL.createObjectURL y la guarda en localStorage. Esa
-- URL muere al recargar la página, así que las fotos de un proyecto se
-- pierden siempre.
--
-- El bucket es PRIVADO: las imágenes de una obra pueden mostrar patologías,
-- direcciones y datos del cliente. El acceso se sirve con URLs firmadas de
-- vigencia corta, nunca con enlaces públicos permanentes.
--
-- CONVENIO DE RUTA:  <project_id>/<uuid>.<ext>
-- La primera carpeta ES el id del proyecto, y las políticas lo usan para
-- delegar el permiso en public.can_access_project().
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  10485760,  -- 10 MB por archivo
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

-- Extrae el id de proyecto de la primera carpeta de la ruta.
-- Devuelve NULL si el primer segmento no es un UUID, de modo que una ruta
-- mal formada no concede acceso a nada.
create or replace function public.storage_project_id(_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_primero text;
begin
  v_primero := split_part(_name, '/', 1);
  if v_primero ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return v_primero::uuid;
  end if;
  return null;
end;
$$;

create policy "project_files_leer" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-files'
    and public.storage_project_id(name) is not null
    and public.can_access_project(public.storage_project_id(name))
  );

create policy "project_files_subir" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and public.storage_project_id(name) is not null
    and public.can_access_project(public.storage_project_id(name))
  );

create policy "project_files_actualizar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'project-files'
    and public.storage_project_id(name) is not null
    and public.can_access_project(public.storage_project_id(name))
  );

create policy "project_files_borrar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-files'
    and public.storage_project_id(name) is not null
    and public.can_access_project(public.storage_project_id(name))
  );
