-- ============================================================
-- Mantener el catálogo desde el portal interno
-- ============================================================
-- Hasta ahora el catálogo solo se podía tocar con SQL: no había pantalla.
--
-- La escritura pasa por funciones y no por UPDATE directo desde el navegador
-- por una razón concreta que apareció al cerrar el costo: `product_variants`
-- ya no tiene SELECT a nivel de tabla —la columna del costo es confidencial—
-- y PostgREST necesita ese SELECT para devolver la fila modificada. Con
-- funciones eso deja de importar, y de paso se valida en un solo sitio lo que
-- no puede quedar al criterio de la pantalla: que no haya códigos repetidos,
-- que un precio no sea negativo y que quede auditoría de quién cambió qué.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Producto
-- ------------------------------------------------------------
create or replace function public.upsert_product(_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := nullif(_datos ->> 'id', '')::uuid;
  v_codigo text := nullif(trim(_datos ->> 'code'), '');
  v_nombre text := nullif(trim(_datos ->> 'name'), '');
  v_tasa   numeric := nullif(_datos ->> 'tax_rate', '')::numeric;
begin
  if not (public.is_admin() or public.has_permission('catalog.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para modificar el catálogo'
      using errcode = '42501';
  end if;

  if v_nombre is null then
    raise exception 'CAMPOS_OBLIGATORIOS: el nombre del producto es obligatorio'
      using errcode = '22023';
  end if;
  if v_codigo is null then
    raise exception 'CAMPOS_OBLIGATORIOS: el código del producto es obligatorio'
      using errcode = '22023';
  end if;

  -- El IVA en Colombia es 0, 5 o 19. Un valor distinto casi siempre es un
  -- dedazo, y sale mal en la factura de todos los pedidos de ese producto.
  if v_tasa is not null and v_tasa not in (0, 5, 19) then
    raise exception 'IVA_INVALIDO: el IVA debe ser 0, 5 o 19' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.products
     where code = v_codigo and (v_id is null or id <> v_id)
  ) then
    raise exception 'CODIGO_DUPLICADO: ya existe un producto con el código %', v_codigo
      using errcode = '23505';
  end if;

  if v_id is null then
    insert into public.products (
      external_ref, code, name, tagline, description, brand_id, category_id,
      environment, finish, coverage, spread_rate_m2_per_gal, drying_time,
      features, image_url, tech_sheet_url, badge, tax_rate, status
    ) values (
      nullif(trim(_datos ->> 'external_ref'), ''),
      v_codigo, v_nombre,
      nullif(trim(_datos ->> 'tagline'), ''),
      nullif(trim(_datos ->> 'description'), ''),
      nullif(_datos ->> 'brand_id', '')::uuid,
      nullif(_datos ->> 'category_id', '')::uuid,
      nullif(_datos ->> 'environment', '')::public.product_environment,
      nullif(_datos ->> 'finish', '')::public.product_finish,
      nullif(trim(_datos ->> 'coverage'), ''),
      nullif(_datos ->> 'spread_rate_m2_per_gal', '')::numeric,
      nullif(trim(_datos ->> 'drying_time'), ''),
      -- `features` es NOT NULL con valor por defecto. Pasar NULL explícito
      -- anula ese default y la inserción falla; se manda un arreglo vacío.
      coalesce(
        case when _datos ? 'features'
             then (select array_agg(value::text) from jsonb_array_elements_text(_datos -> 'features'))
             end,
        '{}'::text[]),
      nullif(trim(_datos ->> 'image_url'), ''),
      nullif(trim(_datos ->> 'tech_sheet_url'), ''),
      nullif(trim(_datos ->> 'badge'), ''),
      coalesce(v_tasa, 19),
      coalesce((_datos ->> 'status')::public.catalog_status, 'ACTIVO')
    )
    returning id into v_id;

    insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'PRODUCT_CREATED', 'products', v_id,
            jsonb_build_object('codigo', v_codigo, 'nombre', v_nombre));
  else
    update public.products
       set code = v_codigo,
           name = v_nombre,
           tagline = nullif(trim(_datos ->> 'tagline'), ''),
           description = nullif(trim(_datos ->> 'description'), ''),
           brand_id = coalesce(nullif(_datos ->> 'brand_id', '')::uuid, brand_id),
           category_id = coalesce(nullif(_datos ->> 'category_id', '')::uuid, category_id),
           environment = coalesce(nullif(_datos ->> 'environment', '')::public.product_environment, environment),
           finish = coalesce(nullif(_datos ->> 'finish', '')::public.product_finish, finish),
           coverage = nullif(trim(_datos ->> 'coverage'), ''),
           spread_rate_m2_per_gal = nullif(_datos ->> 'spread_rate_m2_per_gal', '')::numeric,
           drying_time = nullif(trim(_datos ->> 'drying_time'), ''),
           features = case when _datos ? 'features'
                           then (select array_agg(value::text) from jsonb_array_elements_text(_datos -> 'features'))
                           else features end,
           image_url = nullif(trim(_datos ->> 'image_url'), ''),
           tech_sheet_url = nullif(trim(_datos ->> 'tech_sheet_url'), ''),
           badge = nullif(trim(_datos ->> 'badge'), ''),
           tax_rate = coalesce(v_tasa, tax_rate),
           status = coalesce((_datos ->> 'status')::public.catalog_status, status),
           updated_at = now()
     where id = v_id;

    if not found then
      raise exception 'NOT_FOUND: ese producto no existe' using errcode = 'P0002';
    end if;

    insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'PRODUCT_UPDATED', 'products', v_id,
            jsonb_build_object('codigo', v_codigo));
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 2. Presentación (variante)
-- ------------------------------------------------------------
create or replace function public.upsert_variant(_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := nullif(_datos ->> 'id', '')::uuid;
  v_prod    uuid := nullif(_datos ->> 'product_id', '')::uuid;
  v_label   text := nullif(trim(_datos ->> 'label'), '');
  v_sku     text := nullif(trim(_datos ->> 'sku'), '');
  v_precio  numeric := nullif(_datos ->> 'price_cop', '')::numeric;
begin
  if not (public.is_admin() or public.has_permission('catalog.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para modificar el catálogo'
      using errcode = '42501';
  end if;

  if v_label is null then
    raise exception 'CAMPOS_OBLIGATORIOS: la presentación necesita nombre (ej. «1 Galón»)'
      using errcode = '22023';
  end if;
  if v_precio is null or v_precio <= 0 then
    raise exception 'PRECIO_INVALIDO: el precio debe ser mayor que cero'
      using errcode = '22023';
  end if;

  if v_sku is not null and exists (
    select 1 from public.product_variants
     where sku = v_sku and (v_id is null or id <> v_id)
  ) then
    raise exception 'SKU_DUPLICADO: ya existe una presentación con el SKU %', v_sku
      using errcode = '23505';
  end if;

  if v_id is null then
    if v_prod is null then
      raise exception 'CAMPOS_OBLIGATORIOS: falta el producto' using errcode = '22023';
    end if;

    insert into public.product_variants (
      product_id, external_ref, label, sku, barcode, price_cop,
      volume_liters, unit, quantity, sort_order, status
    ) values (
      v_prod,
      nullif(trim(_datos ->> 'external_ref'), ''),
      v_label, v_sku,
      nullif(trim(_datos ->> 'barcode'), ''),
      v_precio,
      nullif(_datos ->> 'volume_liters', '')::numeric,
      -- `unit` es NOT NULL con valor por defecto ('GALON'). Pasar NULL
      -- explícito anula el default y la inserción falla.
      coalesce(nullif(trim(_datos ->> 'unit'), ''), 'GALON'),
      nullif(_datos ->> 'quantity', '')::numeric,
      coalesce((_datos ->> 'sort_order')::integer, 0),
      coalesce((_datos ->> 'status')::public.catalog_status, 'ACTIVO')
    )
    returning id into v_id;

    insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'VARIANT_CREATED', 'product_variants', v_id,
            jsonb_build_object('label', v_label, 'precio', v_precio));
  else
    -- El costo NO se toca aquí: sale de las recepciones. Para el costo
    -- estándar de referencia está `set_standard_cost`, que es explícito.
    update public.product_variants
       set label = v_label,
           sku = v_sku,
           barcode = nullif(trim(_datos ->> 'barcode'), ''),
           price_cop = v_precio,
           volume_liters = nullif(_datos ->> 'volume_liters', '')::numeric,
           unit = coalesce(nullif(trim(_datos ->> 'unit'), ''), unit),
           quantity = nullif(_datos ->> 'quantity', '')::numeric,
           sort_order = coalesce((_datos ->> 'sort_order')::integer, sort_order),
           status = coalesce((_datos ->> 'status')::public.catalog_status, status),
           updated_at = now()
     where id = v_id;

    if not found then
      raise exception 'NOT_FOUND: esa presentación no existe' using errcode = 'P0002';
    end if;

    insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'VARIANT_UPDATED', 'product_variants', v_id,
            jsonb_build_object('label', v_label, 'precio', v_precio));
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. Color
-- ------------------------------------------------------------
create or replace function public.upsert_color(_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := nullif(_datos ->> 'id', '')::uuid;
  v_code   text := nullif(trim(upper(_datos ->> 'code')), '');
  v_nombre text := nullif(trim(_datos ->> 'name'), '');
  v_hex    text := nullif(trim(upper(_datos ->> 'hex')), '');
  v_rgb    text;
begin
  if not (public.is_admin() or public.has_permission('catalog.write')) then
    raise exception 'FORBIDDEN: no tienes permiso para modificar el catálogo'
      using errcode = '42501';
  end if;

  if v_code is null or v_nombre is null then
    raise exception 'CAMPOS_OBLIGATORIOS: el código y el nombre del color son obligatorios'
      using errcode = '22023';
  end if;

  if v_hex is null or v_hex !~ '^#[0-9A-F]{6}$' then
    raise exception 'HEX_INVALIDO: el color debe ir en formato #RRGGBB' using errcode = '22023';
  end if;

  if exists (select 1 from public.colors where code = v_code and (v_id is null or id <> v_id)) then
    raise exception 'CODIGO_DUPLICADO: ya existe un color con el código %', v_code
      using errcode = '23505';
  end if;

  -- El RGB se deriva del hexadecimal en vez de pedirlo aparte: son el mismo
  -- dato en dos formatos, y tenerlos separados garantiza que tarde o
  -- temprano digan colores distintos. Ya pasó en la carta original.
  v_rgb := format('%s, %s, %s',
    ('x' || substr(v_hex, 2, 2))::bit(8)::int,
    ('x' || substr(v_hex, 4, 2))::bit(8)::int,
    ('x' || substr(v_hex, 6, 2))::bit(8)::int);

  if v_id is null then
    insert into public.colors (code, name, hex, rgb, family, recommended_product, description, is_palette, status)
    values (
      v_code, v_nombre, v_hex, v_rgb,
      coalesce(nullif(_datos ->> 'family', '')::public.color_family, 'Blancos & Neutros'),
      nullif(trim(_datos ->> 'recommended_product'), ''),
      nullif(trim(_datos ->> 'description'), ''),
      coalesce((_datos ->> 'is_palette')::boolean, false),
      coalesce((_datos ->> 'status')::public.catalog_status, 'ACTIVO')
    )
    returning id into v_id;
  else
    update public.colors
       set code = v_code, name = v_nombre, hex = v_hex, rgb = v_rgb,
           family = coalesce(nullif(_datos ->> 'family', '')::public.color_family, family),
           recommended_product = nullif(trim(_datos ->> 'recommended_product'), ''),
           description = nullif(trim(_datos ->> 'description'), ''),
           is_palette = coalesce((_datos ->> 'is_palette')::boolean, is_palette),
           status = coalesce((_datos ->> 'status')::public.catalog_status, status),
           updated_at = now()
     where id = v_id;

    if not found then
      raise exception 'NOT_FOUND: ese color no existe' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values (auth.uid(), case when _datos ? 'id' and nullif(_datos ->> 'id','') is not null
                           then 'COLOR_UPDATED' else 'COLOR_CREATED' end,
          'colors', v_id, jsonb_build_object('codigo', v_code, 'hex', v_hex));

  return v_id;
end;
$$;

revoke all on function public.upsert_product(jsonb) from public, anon;
revoke all on function public.upsert_variant(jsonb) from public, anon;
revoke all on function public.upsert_color(jsonb)   from public, anon;
grant execute on function public.upsert_product(jsonb) to authenticated;
grant execute on function public.upsert_variant(jsonb) to authenticated;
grant execute on function public.upsert_color(jsonb)   to authenticated;

-- ------------------------------------------------------------
-- 4. Recepciones como aplicación del tablero
-- ------------------------------------------------------------
insert into public.app_views (code, label, icon, route, area, sort_order, is_active, color, description)
values (
  'bo.receipts', 'Recepciones', 'PackagePlus', '/recepciones', 'BACKOFFICE', 45, true,
  '#0F766E', 'Entrada de mercancía y costos'
)
on conflict (code) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      sort_order = excluded.sort_order, is_active = excluded.is_active,
      color = excluded.color, description = excluded.description;

insert into public.role_views (role, view_code, visible)
values
  ('ADMINISTRADOR', 'bo.receipts', true),
  ('BODEGA',        'bo.receipts', true),
  ('GERENCIA',      'bo.receipts', true)
on conflict (role, view_code) do update set visible = excluded.visible;

-- El catálogo ya existía como vista del tablero; se le da color y descripción
-- para que la tarjeta no salga con el texto genérico.
update public.app_views
   set color = '#EA580C', description = 'Productos, presentaciones y colores'
 where code = 'bo.catalog';
