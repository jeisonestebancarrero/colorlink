-- ============================================================
-- Categorías administrables e imágenes de producto
-- ============================================================

-- ------------------------------------------------------------
-- 1. Crear y editar categorías
-- ------------------------------------------------------------
-- Las categorías existían pero solo se podían tocar con SQL. Y hay una
-- distinción que la pantalla debe respetar: `kind` separa las categorías de
-- PRODUCTOS de las de SOLUCIONES (los kits). Mezclarlas hace que un producto
-- termine clasificado en una categoría de kits y desaparezca de la tienda.
create or replace function public.upsert_category(_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := nullif(_datos ->> 'id', '')::uuid;
  v_nombre text := nullif(trim(_datos ->> 'name'), '');
  v_slug   text := nullif(trim(lower(_datos ->> 'slug')), '');
  v_kind   text := coalesce(nullif(_datos ->> 'kind', ''), 'PRODUCT');
begin
  if not (public.is_admin() or public.has_permission('catalog.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para modificar el catálogo'
      using errcode = '42501';
  end if;

  if v_nombre is null then
    raise exception 'CAMPOS_OBLIGATORIOS: la categoría necesita un nombre'
      using errcode = '22023';
  end if;

  if v_kind not in ('PRODUCT', 'SOLUTION') then
    raise exception 'TIPO_INVALIDO: el tipo de categoría no es válido' using errcode = '22023';
  end if;

  -- El slug se deriva del nombre si no lo escriben. Es lo que la tienda usa
  -- en la URL, así que va sin tildes ni espacios.
  if v_slug is null then
    v_slug := translate(lower(v_nombre), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN');
    v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
    v_slug := left(trim(both '-' from v_slug), 60);
  end if;

  if exists (
    select 1 from public.categories
     where lower(name) = lower(v_nombre)
       and kind = v_kind::public.category_kind
       and (v_id is null or id <> v_id)
  ) then
    raise exception 'NOMBRE_DUPLICADO: ya existe una categoría con ese nombre'
      using errcode = '23505';
  end if;

  if v_id is null then
    insert into public.categories (name, slug, kind, description, sort_order, status)
    values (
      v_nombre, v_slug, v_kind::public.category_kind,
      nullif(trim(_datos ->> 'description'), ''),
      coalesce((_datos ->> 'sort_order')::integer, 0),
      coalesce((_datos ->> 'status')::public.catalog_status, 'ACTIVO')
    )
    returning id into v_id;
  else
    update public.categories
       set name = v_nombre,
           slug = v_slug,
           description = nullif(trim(_datos ->> 'description'), ''),
           sort_order = coalesce((_datos ->> 'sort_order')::integer, sort_order),
           status = coalesce((_datos ->> 'status')::public.catalog_status, status),
           updated_at = now()
     where id = v_id;

    if not found then
      raise exception 'NOT_FOUND: esa categoría no existe' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(),
          case when _datos ? 'id' and nullif(_datos ->> 'id','') is not null
               then 'CATEGORY_UPDATED' else 'CATEGORY_CREATED' end,
          'categories', v_id, jsonb_build_object('nombre', v_nombre, 'tipo', v_kind));

  return v_id;
end;
$$;

revoke all on function public.upsert_category(jsonb) from public, anon;
grant execute on function public.upsert_category(jsonb) to authenticated;

-- ------------------------------------------------------------
-- 2. Bucket público para las imágenes de producto
-- ------------------------------------------------------------
-- Público igual que el de las tiendas: la foto de un producto es la vitrina,
-- la ve cualquiera que entre a comprar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'productos', 'productos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "productos_lectura_publica" on storage.objects
  for select to public
  using (bucket_id = 'productos');

create policy "productos_escritura" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'productos'
    and ((select public.is_admin()) or (select public.has_permission('catalog.write')))
  );

create policy "productos_actualizacion" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'productos'
    and ((select public.is_admin()) or (select public.has_permission('catalog.write')))
  )
  with check (
    bucket_id = 'productos'
    and ((select public.is_admin()) or (select public.has_permission('catalog.write')))
  );

create policy "productos_borrado" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'productos'
    and ((select public.is_admin()) or (select public.has_permission('catalog.write')))
  );
