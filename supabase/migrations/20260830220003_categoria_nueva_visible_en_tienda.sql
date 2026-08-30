-- ============================================================
-- Una categoría creada desde el portal tiene que verse en la tienda
-- ============================================================
-- El catálogo es un árbol: hay una categoría raíz por tipo ('Catálogo Pintuco'
-- para PRODUCT, 'Sistemas Pintuco' para SOLUTION) y de ella cuelgan las que el
-- cliente ve. La tienda lista solo las hijas (`parent_id is not null`), porque
-- la raíz no es una sección sino el contenedor de todas.
--
-- `upsert_category` insertaba con parent_id nulo, así que una categoría creada
-- desde el portal quedaba al mismo nivel de la raíz y la tienda no la mostraba
-- nunca: el usuario la creaba, le asignaba productos y esos productos
-- desaparecían de los filtros sin ninguna señal de por qué. Aquí la colgamos
-- de la raíz de su tipo.
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
  v_raiz   uuid;
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

  -- La raíz de este tipo. Si alguna vez no existiera, la creamos: es preferible
  -- a dejar la categoría huérfana e invisible.
  select id into v_raiz
    from public.categories
   where kind = v_kind::public.category_kind
     and parent_id is null
   order by sort_order
   limit 1;

  if v_raiz is null then
    insert into public.categories (name, slug, kind, sort_order, status)
    values (
      case when v_kind = 'PRODUCT' then 'Catálogo Pintuco' else 'Sistemas Pintuco' end,
      case when v_kind = 'PRODUCT' then 'catalogo-pintuco' else 'sistemas-pintuco' end,
      v_kind::public.category_kind, 0, 'ACTIVO'
    )
    returning id into v_raiz;
  end if;

  if v_id is null then
    insert into public.categories (name, slug, kind, parent_id, description, sort_order, status)
    values (
      v_nombre, v_slug, v_kind::public.category_kind, v_raiz,
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
           -- Solo si estaba huérfana. Nunca movemos la raíz ni recolgamos algo
           -- que ya tiene su lugar en el árbol.
           parent_id = case
                         when parent_id is null and name <> (
                           select c.name from public.categories c where c.id = v_raiz
                         ) then v_raiz
                         else parent_id
                       end,
           updated_at = now()
     where id = v_id;

    if not found then
      raise exception 'NOT_FOUND: esa categoría no existe' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'CATEGORY_UPSERT', 'categories', v_id, jsonb_build_object('name', v_nombre));

  return v_id;
end;
$$;

revoke all on function public.upsert_category(jsonb) from public;
grant execute on function public.upsert_category(jsonb) to authenticated;

comment on function public.upsert_category(jsonb) is
  'Crea o edita una categoría y la cuelga de la raíz de su tipo, que es la condición para que la tienda la muestre.';
