-- ============================================================
-- Administrar los puntos de venta
-- ============================================================
-- Hasta ahora las tiendas solo se podían crear o corregir con SQL: no había
-- pantalla. La tabla `pickup_locations` ya permitía escritura al
-- administrador, pero nadie podía ejercerla desde la aplicación.
--
-- Lo importante es que no hay nada que "sincronizar": la tienda del cliente y
-- el portal interno leen LA MISMA tabla. Lo que se guarde aquí es lo que el
-- cliente ve en Puntos de Retiro; el único retraso es el cache de catálogo
-- del navegador, que dura cinco minutos.

-- ------------------------------------------------------------
-- 1. Bucket público para las fotos de las tiendas
-- ------------------------------------------------------------
-- Público a propósito: la foto de una tienda es contenido de la vitrina, la
-- ve cualquiera que entre a buscar dónde retirar. Distinto de
-- `project-files`, que es privado porque guarda fotos de obras de clientes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tiendas', 'tiendas', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cualquiera lee: es la foto que se muestra en la tienda pública.
create policy "tiendas_lectura_publica" on storage.objects
  for select to public
  using (bucket_id = 'tiendas');

-- Solo administración sube, reemplaza o borra.
create policy "tiendas_escritura_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tiendas' and (select public.is_admin()));

create policy "tiendas_actualizacion_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'tiendas' and (select public.is_admin()))
  with check (bucket_id = 'tiendas' and (select public.is_admin()));

create policy "tiendas_borrado_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tiendas' and (select public.is_admin()));

-- ------------------------------------------------------------
-- 2. El personal necesita ver también las tiendas inactivas
-- ------------------------------------------------------------
-- La política pública solo muestra las ACTIVO, y con razón: una tienda
-- cerrada no debe ofrecerse para retiro. Pero entonces, al desactivar una
-- desde el portal interno, desaparecía de la propia pantalla que acababa de
-- desactivarla y ya no había forma de volver a activarla.
create policy "pickup_locations_lectura_staff" on public.pickup_locations
  for select to authenticated
  using ( (select public.is_staff()) );

-- ------------------------------------------------------------
-- 3. Crear y editar una tienda
-- ------------------------------------------------------------
-- Pasa por función y no por UPDATE directo para validar en un solo sitio lo
-- que no puede quedar al criterio de la pantalla: que el identificador sea
-- único, que las coordenadas caigan dentro de Colombia y que quede auditoría
-- de quién tocó qué. Una tienda mal ubicada manda a un cliente a otra ciudad.
create or replace function public.upsert_pickup_location(_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := nullif(_datos ->> 'id', '')::uuid;
  v_ref     text := nullif(trim(_datos ->> 'external_ref'), '');
  v_nombre  text := nullif(trim(_datos ->> 'name'), '');
  v_ciudad  text := nullif(trim(_datos ->> 'city'), '');
  v_dir     text := nullif(trim(_datos ->> 'address'), '');
  v_lat     numeric := nullif(_datos ->> 'latitude', '')::numeric;
  v_lon     numeric := nullif(_datos ->> 'longitude', '')::numeric;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo administración puede gestionar puntos de venta'
      using errcode = '42501';
  end if;

  if v_nombre is null or v_ciudad is null or v_dir is null then
    raise exception 'CAMPOS_OBLIGATORIOS: el nombre, la ciudad y la dirección son obligatorios'
      using errcode = '22023';
  end if;

  -- Colombia va de ~-4.2 a ~13.4 de latitud y de ~-79 a ~-66.8 de longitud.
  -- Un punto fuera de ese rango es casi siempre latitud y longitud
  -- invertidas, y el mapa del cliente lo dibujaría en medio del océano.
  if v_lat is not null and (v_lat < -4.5 or v_lat > 13.5) then
    raise exception 'COORDENADA_FUERA_DE_RANGO: la latitud no corresponde a Colombia'
      using errcode = '22023';
  end if;
  if v_lon is not null and (v_lon < -79.5 or v_lon > -66.5) then
    raise exception 'COORDENADA_FUERA_DE_RANGO: la longitud no corresponde a Colombia'
      using errcode = '22023';
  end if;

  if v_id is null then
    -- `external_ref` es la llave estable con la que la aplicación reconoce la
    -- tienda. Si no la escriben, se deriva del nombre.
    if v_ref is null then
      -- Se quitan las tildes a mano en vez de instalar la extensión
      -- `unaccent`: es una sola línea y evita añadir una dependencia al
      -- despliegue por un identificador que además se puede escribir a mano.
      v_ref := translate(lower(v_nombre), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN');
      v_ref := 'store-' || regexp_replace(v_ref, '[^a-z0-9]+', '-', 'g');
      v_ref := left(trim(both '-' from v_ref), 60);
    end if;

    if exists (select 1 from public.pickup_locations where external_ref = v_ref) then
      raise exception 'REF_DUPLICADA: ya existe un punto de venta con el identificador %', v_ref
        using errcode = '23505';
    end if;

    insert into public.pickup_locations (
      external_ref, name, city, address, phone, hours, image_url,
      has_color_studio, has_tech_advisor, has_express_pickup,
      stock_readiness_hours, latitude, longitude, status
    ) values (
      v_ref, v_nombre, v_ciudad, v_dir,
      nullif(trim(_datos ->> 'phone'), ''),
      nullif(trim(_datos ->> 'hours'), ''),
      nullif(trim(_datos ->> 'image_url'), ''),
      coalesce((_datos ->> 'has_color_studio')::boolean, false),
      coalesce((_datos ->> 'has_tech_advisor')::boolean, false),
      coalesce((_datos ->> 'has_express_pickup')::boolean, false),
      coalesce((_datos ->> 'stock_readiness_hours')::integer, 24),
      v_lat, v_lon,
      coalesce((_datos ->> 'status')::public.catalog_status, 'ACTIVO')
    )
    returning id into v_id;

    insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'STORE_CREATED', 'pickup_locations', v_id,
            jsonb_build_object('nombre', v_nombre, 'ciudad', v_ciudad));
  else
    update public.pickup_locations
       set name  = v_nombre,
           city  = v_ciudad,
           address = v_dir,
           phone = nullif(trim(_datos ->> 'phone'), ''),
           hours = nullif(trim(_datos ->> 'hours'), ''),
           image_url = nullif(trim(_datos ->> 'image_url'), ''),
           has_color_studio   = coalesce((_datos ->> 'has_color_studio')::boolean, has_color_studio),
           has_tech_advisor   = coalesce((_datos ->> 'has_tech_advisor')::boolean, has_tech_advisor),
           has_express_pickup = coalesce((_datos ->> 'has_express_pickup')::boolean, has_express_pickup),
           stock_readiness_hours = coalesce((_datos ->> 'stock_readiness_hours')::integer, stock_readiness_hours),
           latitude  = coalesce(v_lat, latitude),
           longitude = coalesce(v_lon, longitude),
           status = coalesce((_datos ->> 'status')::public.catalog_status, status),
           updated_at = now()
     where id = v_id;

    if not found then
      raise exception 'NOT_FOUND: ese punto de venta no existe' using errcode = 'P0002';
    end if;

    insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'STORE_UPDATED', 'pickup_locations', v_id,
            jsonb_build_object('nombre', v_nombre));
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_pickup_location(jsonb) from public, anon;
grant execute on function public.upsert_pickup_location(jsonb) to authenticated;
