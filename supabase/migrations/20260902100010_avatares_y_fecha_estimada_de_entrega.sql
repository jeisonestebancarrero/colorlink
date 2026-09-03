-- ============================================================
-- Foto de perfil y fecha estimada de entrega
-- ============================================================
-- Dos huecos del bloque de cuenta:
--
-- 1. FOTO DE PERFIL. La columna `profiles.avatar_url` existía desde el
--    principio y la llenaba únicamente Google al entrar con su proveedor.
--    Quien se registraba con correo no tenía forma de poner una foto, y una
--    empresa tampoco su logo.
--
-- 2. FECHA ESTIMADA DE ENTREGA. El retiro en tienda tenía
--    `pickup_scheduled_date` y el envío no tenía nada: el cliente veía "24-48
--    horas" escrito en la interfaz, sin una fecha guardada en el pedido, y el
--    despacho no tenía contra qué medirse.

-- ------------------------------------------------------------
-- 1. Bucket de avatares
-- ------------------------------------------------------------
-- PÚBLICO, como `productos` y `tiendas`. Una foto de perfil se muestra en la
-- cabecera y en los hilos de conversación; servirla con URL firmada obligaría
-- a renovar el enlace en cada render. No es dato sensible: la pone la persona
-- para que se vea.
--
-- 2 MB es suficiente para un avatar y evita que alguien suba una foto de 8 MB
-- que haga lenta cada pantalla donde aparezca.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares', 'avatares', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatares_lectura_publica" on storage.objects;
create policy "avatares_lectura_publica" on storage.objects
  for select to public
  using (bucket_id = 'avatares');

-- CADA UNO EN SU CARPETA. La ruta tiene que empezar por el id del usuario, y
-- la política lo comprueba: sin esto, cualquier cliente autenticado podría
-- sobrescribir la foto de otro, que es el defecto clásico de un bucket
-- compartido. `storage.foldername(name)` devuelve las carpetas de la ruta.
drop policy if exists "avatares_escritura_propia" on storage.objects;
create policy "avatares_escritura_propia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatares_actualizacion_propia" on storage.objects;
create policy "avatares_actualizacion_propia" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatares_borrado_propio" on storage.objects;
create policy "avatares_borrado_propio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Logo de la empresa. La columna no existía.
alter table public.companies
  add column if not exists logo_url text;

comment on column public.companies.logo_url is
  'Logo de la empresa cliente. Lo sube el OWNER o ADMIN desde su perfil.';

-- ------------------------------------------------------------
-- 2. Fecha estimada de entrega
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists estimated_delivery_date date;

comment on column public.orders.estimated_delivery_date is
  'Fecha estimada de entrega del envío. La calcula el servidor al crear el pedido; el retiro en tienda usa pickup_scheduled_date.';

alter table public.shipments
  add column if not exists estimated_delivery_date date;

/**
 * Días hábiles de entrega según a dónde va.
 *
 * Se calcula en el SERVIDOR y no en el navegador: es una promesa comercial
 * que va al correo y a la pantalla de despacho, y no puede depender de la
 * hora del computador del cliente.
 *
 * Los tramos son los que Pintuco puede sostener hoy con sus cinco puntos:
 *   * misma ciudad de un punto de venta — 2 días
 *   * resto del departamento de un punto — 3 días
 *   * cualquier otro municipio          — 5 días
 * Se cuentan días HÁBILES: prometer una entrega en domingo es prometer algo
 * que no va a pasar.
 */
create or replace function public.dias_de_entrega(_municipality_code text)
returns int
language plpgsql
stable
set search_path = ''
as $$
declare
  v_mismo_municipio boolean;
  v_mismo_depto     boolean;
begin
  if _municipality_code is null then
    return 5;
  end if;

  -- Los puntos de venta guardan la ciudad como texto, así que la comparación
  -- se hace contra el nombre del municipio del diccionario. Cuando
  -- `pickup_locations` migre a `municipality_code`, esto se simplifica.
  select exists (
    select 1
    from public.pickup_locations pl
    join public.municipalities m on public.normalizar_texto_mayusculas(m.name)
                                 = public.normalizar_texto_mayusculas(pl.city)
    where pl.status = 'ACTIVO' and m.code = _municipality_code
  ) into v_mismo_municipio;

  if v_mismo_municipio then
    return 2;
  end if;

  select exists (
    select 1
    from public.pickup_locations pl
    join public.municipalities m on public.normalizar_texto_mayusculas(m.name)
                                 = public.normalizar_texto_mayusculas(pl.city)
    join public.municipalities destino on destino.code = _municipality_code
    where pl.status = 'ACTIVO'
      and m.department_code = destino.department_code
  ) into v_mismo_depto;

  return case when v_mismo_depto then 3 else 5 end;
end;
$$;

/**
 * Suma días hábiles a una fecha, saltando sábados y domingos.
 *
 * `extract(isodow)` devuelve 6 para sábado y 7 para domingo.
 */
create or replace function public.sumar_dias_habiles(_desde date, _dias int)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_fecha date := _desde;
  v_faltan int := greatest(coalesce(_dias, 0), 0);
begin
  while v_faltan > 0 loop
    v_fecha := v_fecha + 1;
    if extract(isodow from v_fecha) < 6 then
      v_faltan := v_faltan - 1;
    end if;
  end loop;
  return v_fecha;
end;
$$;

notify pgrst, 'reload schema';
