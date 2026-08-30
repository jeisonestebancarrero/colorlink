-- ============================================================
-- Un documento no puede tener dos cuentas
-- ============================================================
-- El índice único `profiles_documento_unico` ya lo impedía, pero lo hacía de
-- la peor manera posible: reventaba el trigger de alta y GoTrue devolvía
-- "Database error saving new user". La persona veía un error de servidor y no
-- tenía forma de saber que su cédula ya estaba registrada.
--
-- Con esta función el formulario puede avisar antes: "ya existe una cuenta
-- con ese documento, inicia sesión o recupera tu contraseña".
--
-- SOBRE LA PRIVACIDAD: la función responde sí/no sobre un documento concreto,
-- así que en teoría permite comprobar si una cédula está registrada. Es el
-- mismo compromiso que asume cualquier registro que valide documento, y es
-- deliberado: sin esto la única alternativa es un error 500 sin explicación.
-- Lo que NO hace es devolver ningún dato de la persona —ni nombre, ni correo,
-- ni teléfono—, así que un documento acertado no revela a quién pertenece.
-- ============================================================

create or replace function public.documento_ya_registrado(
  _tipo   text,
  _numero text
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.document_number = nullif(trim(_numero), '')
      and p.document_type   = nullif(trim(_tipo), '')::public.document_type
  );
$$;

comment on function public.documento_ya_registrado(text, text) is
  'Responde si un documento ya tiene cuenta. No devuelve ningún dato de la persona.';

revoke all on function public.documento_ya_registrado(text, text) from public;
-- anon la necesita: la comprobación ocurre ANTES de crear la cuenta.
grant execute on function public.documento_ya_registrado(text, text) to anon, authenticated;

-- ============================================================
-- Segunda línea de defensa en el propio alta
-- ============================================================
-- La comprobación previa deja una ventana mínima (dos registros simultáneos
-- con la misma cédula). El trigger la cierra con un mensaje explícito, para
-- que en los registros del servidor quede la causa real y no un error suelto
-- de índice único.
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
begin
  v_client_type := case
    when new.raw_user_meta_data ->> 'client_type'
         in ('Particular', 'Constructor', 'Empresa', 'Profesional', 'Distribuidor')
    then (new.raw_user_meta_data ->> 'client_type')::public.client_type
    else 'Particular'::public.client_type
  end;

  v_city         := nullif(trim(coalesce(new.raw_user_meta_data ->> 'city', '')), '');
  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');
  v_company_nit  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company_nit', '')), '');
  v_doc_number   := nullif(trim(coalesce(new.raw_user_meta_data ->> 'document_number', '')), '');

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
    document_type, document_number
  )
  values (
    new.id, new.email,
    coalesce(v_first_name, ''), coalesce(v_last_name, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    v_city, v_client_type, v_avatar, v_doc_type, v_doc_number
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'CLIENTE')
  on conflict on constraint user_roles_unicos do nothing;

  if v_company_name is not null then
    -- ¿Ese NIT ya está registrado? Entonces no se crea nada: se pide permiso.
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
    insert into public.companies (name, nit, city, email, status)
    values (v_company_name, v_company_nit, v_city, new.email, 'ACTIVA')
    returning id into v_company_id;

    insert into public.company_members (company_id, user_id, company_role)
    values (v_company_id, new.id, 'OWNER');

    update public.profiles set company_id = v_company_id where id = new.id;

    insert into public.user_roles (user_id, role, company_id)
    values (new.id, 'CLIENTE_B2B', v_company_id)
    on conflict on constraint user_roles_unicos do nothing;
  end if;

  return new;
end;
$$;
