-- ============================================================
-- El registro guarda la ubicación del diccionario
-- ============================================================
-- `handle_new_user` recibía la ciudad como texto libre y la escribía tal cual
-- en `profiles.city` y en `companies.city`. De ahí salieron 'Bogotá' en un
-- registro y 'Bogotá D.C.' en otro.
--
-- Ahora el registro manda el código DIVIPOLA del municipio, y esta función:
--   1. Lo valida contra el diccionario. Si no existe, no se guarda.
--   2. Deriva `city` del nombre oficial, para no romper lo que ya lee esa
--      columna, pero la verdad queda en `municipality_code`.
--   3. **Crea la primera dirección del cliente** con lo que escribió en el
--      registro. Es lo que hace que el carrito pueda precargarla después: sin
--      esto, "completarse con la dirección registrada" no tendría de dónde.
--   4. Si es empresa, crea además su **sede principal** con esa dirección. Así
--      una empresa recién registrada ya tiene una sede, y el carrito solo
--      tiene que preguntar cuando haya más de una.
--
-- El barrio se valida contra su municipio: un barrio de Medellín en una
-- dirección de Cali sería un dato peor que no tener barrio.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_name text;
  v_company_nit  text;
  v_company_id   uuid;
  v_existente    uuid;
  v_client_type  public.client_type;
  v_city         text;
  v_first_name   text;
  v_last_name    text;
  v_full_name    text;
  v_avatar       text;
  v_doc_type     public.document_type;
  v_doc_number   text;
  -- Ubicación del diccionario.
  v_country      text;
  v_mun_code     text;
  v_barrio_id    uuid;
  v_address      text;
  v_phone        text;
begin
  v_client_type := case
    when new.raw_user_meta_data ->> 'client_type'
         in ('Particular', 'Constructor', 'Empresa', 'Profesional', 'Distribuidor')
    then (new.raw_user_meta_data ->> 'client_type')::public.client_type
    else 'Particular'::public.client_type
  end;

  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');
  v_company_nit  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company_nit', '')), '');
  v_doc_number   := nullif(trim(coalesce(new.raw_user_meta_data ->> 'document_number', '')), '');
  v_address      := nullif(trim(coalesce(new.raw_user_meta_data ->> 'address', '')), '');
  v_phone        := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');

  -- ----------------------------------------------------------
  -- Ubicación
  -- ----------------------------------------------------------
  v_country := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'country_code', '')), ''), 'CO');
  if not exists (select 1 from public.countries where code = v_country) then
    v_country := 'CO';
  end if;

  v_mun_code := nullif(trim(coalesce(new.raw_user_meta_data ->> 'municipality_code', '')), '');
  -- Un código que no está en DIVIPOLA se descarta: mejor sin ciudad que con
  -- una inventada, porque la clave ajena de `profiles` la rechazaría y el alta
  -- entera reventaría dentro del disparador.
  if v_mun_code is not null
     and not exists (select 1 from public.municipalities where code = v_mun_code) then
    v_mun_code := null;
  end if;

  -- `city` se deriva del nombre oficial. Si no vino municipio, se respeta el
  -- texto que haya llegado, para no perder el dato de un registro por Google.
  if v_mun_code is not null then
    select m.name into v_city from public.municipalities m where m.code = v_mun_code;
  else
    v_city := nullif(trim(coalesce(new.raw_user_meta_data ->> 'city', '')), '');
  end if;

  begin
    v_barrio_id := nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'neighborhood_id', '')), '')::uuid;
  exception when invalid_text_representation then
    v_barrio_id := null;
  end;
  -- El barrio tiene que ser de ESE municipio.
  if v_barrio_id is not null and (
    v_mun_code is null or not exists (
      select 1 from public.neighborhoods n
      where n.id = v_barrio_id and n.municipality_code = v_mun_code
    )
  ) then
    v_barrio_id := null;
  end if;

  -- ----------------------------------------------------------
  -- Documento e identidad
  -- ----------------------------------------------------------
  v_doc_type := case
    when new.raw_user_meta_data ->> 'document_type' in ('CC','CE','NIT','PASAPORTE','PEP')
    then (new.raw_user_meta_data ->> 'document_type')::public.document_type
    else null
  end;

  if v_doc_number is not null and exists (
    select 1 from public.profiles p
    where p.document_number = v_doc_number
      and p.document_type is not distinct from v_doc_type
  ) then
    raise exception 'DOCUMENT_TAKEN: ya existe una cuenta con ese documento'
      using errcode = '23505';
  end if;

  v_first_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  v_last_name  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');

  -- Proveedor externo (Google): solo llega el nombre completo.
  if v_first_name is null then
    v_full_name := nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name', '')), '');
    if v_full_name is not null then
      v_first_name := split_part(v_full_name, ' ', 1);
      v_last_name := coalesce(
        nullif(trim(substr(v_full_name, length(split_part(v_full_name, ' ', 1)) + 1)), ''),
        v_last_name);
    end if;
  end if;

  v_avatar := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture', '')), '');

  insert into public.profiles (
    id, email, first_name, last_name, phone, city, client_type, avatar_url,
    document_type, document_number,
    country_code, municipality_code, neighborhood_id, address
  )
  values (
    new.id, new.email,
    coalesce(v_first_name, ''), coalesce(v_last_name, ''),
    v_phone, v_city, v_client_type, v_avatar, v_doc_type, v_doc_number,
    v_country, v_mun_code, v_barrio_id, v_address
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'CLIENTE')
  on conflict on constraint user_roles_unicos do nothing;

  -- ----------------------------------------------------------
  -- Primera dirección del cliente
  -- ----------------------------------------------------------
  -- Solo si trajo dirección Y municipio válido: una dirección sin ciudad no la
  -- acepta la tabla, y con razón.
  if v_address is not null and v_mun_code is not null then
    insert into public.customer_addresses (
      user_id, label, address_line, municipality_code, neighborhood_id, is_default
    )
    values (new.id, 'Principal', v_address, v_mun_code, v_barrio_id, true)
    on conflict do nothing;
  end if;

  -- ----------------------------------------------------------
  -- Empresa
  -- ----------------------------------------------------------
  if v_company_name is not null then
    select id into v_existente
      from public.companies
     where v_company_nit is not null and nit = v_company_nit;

    if v_existente is not null then
      insert into public.company_join_requests (company_id, user_id, requested_nit)
      values (v_existente, new.id, v_company_nit)
      on conflict do nothing;

      insert into public.notifications (user_id, title, message, type)
      select m.user_id,
             'Solicitud de vinculación',
             coalesce(v_first_name, new.email) || ' pidió unirse a tu cuenta empresarial.',
             'info'::public.notification_type
        from public.company_members m
       where m.company_id = v_existente
         and m.company_role in ('OWNER', 'ADMIN');

      return new;
    end if;

    -- Se crea SIEMPRE una empresa nueva, nunca se vincula por nombre: bastaría
    -- escribir el nombre de otra constructora para acceder a sus proyectos.
    insert into public.companies (
      name, nit, city, email, status, country_code, municipality_code, neighborhood_id, address
    )
    values (
      v_company_name, v_company_nit, v_city, new.email, 'ACTIVA',
      v_country, v_mun_code, v_barrio_id, v_address
    )
    returning id into v_company_id;

    insert into public.company_members (company_id, user_id, company_role)
    values (v_company_id, new.id, 'OWNER');

    update public.profiles set company_id = v_company_id where id = new.id;

    insert into public.user_roles (user_id, role, company_id)
    values (new.id, 'CLIENTE_B2B', v_company_id)
    on conflict on constraint user_roles_unicos do nothing;

    -- Sede principal con la dirección del registro. Una empresa recién
    -- registrada queda con UNA sede, así que el carrito no le pregunta nada
    -- hasta que registre la segunda.
    if v_address is not null and v_mun_code is not null then
      insert into public.company_branches (
        company_id, name, address_line, municipality_code, neighborhood_id,
        contact_name, contact_phone, is_default
      )
      values (
        v_company_id, 'Sede principal', v_address, v_mun_code, v_barrio_id,
        nullif(trim(coalesce(v_first_name, '') || ' ' || coalesce(v_last_name, '')), ''),
        v_phone, true
      )
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
