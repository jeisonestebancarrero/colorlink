-- Bucket de fotos de perfil y logos, y fecha estimada de entrega para envíos.

-- Público: el avatar se muestra en muchas pantallas y no es sensible. Límite de 2 MB.
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

-- La ruta debe empezar por el id del usuario para que nadie sobrescriba la foto de otro.
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

alter table public.companies
  add column if not exists logo_url text;

comment on column public.companies.logo_url is
  'Logo de la empresa cliente. Lo sube el OWNER o ADMIN desde su perfil.';

alter table public.orders
  add column if not exists estimated_delivery_date date;

comment on column public.orders.estimated_delivery_date is
  'Fecha estimada de entrega del envío. La calcula el servidor al crear el pedido; el retiro en tienda usa pickup_scheduled_date.';

alter table public.shipments
  add column if not exists estimated_delivery_date date;

/**
 * Días hábiles de entrega calculados en el servidor: 2 misma ciudad de un punto,
 * 3 mismo departamento, 5 resto del país.
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

    -- pickup_locations guarda la ciudad como texto; se compara por nombre de municipio.
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

/** Suma días hábiles saltando fines de semana (isodow 6 y 7). */
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
