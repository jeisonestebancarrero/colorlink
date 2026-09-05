-- El documento se pide en CUALQUIER registro, también en el de Google.
--
-- El registro por correo lo exigía; el de Google no lo pedía nunca, porque
-- Google no lo entrega. Resultado: todas las cuentas creadas con Google
-- quedaban sin documento, y el documento no es un dato de contacto — es con lo
-- que se identifica a la persona en la factura y por lo que responde la
-- empresa ante la DIAN. Facturar sin él obliga a pedirlo por teléfono en el
-- mostrador, que es donde se escriben mal.
--
-- Entra por aquí y solo por aquí: `authenticated` NO tiene permiso de UPDATE
-- sobre esas dos columnas, así que nadie puede escribirlas desde la aplicación
-- ni desde la API. Esta función lo hace con permisos de dueño, y solo cuando
-- el perfil todavía no tiene documento. Corregir uno ya puesto sigue siendo
-- cosa de quien administra clientes, que deja rastro y avisa.
drop function if exists public.complete_profile(text, text, text, text, text, text, text, text);

create or replace function public.complete_profile(
  _first_name        text default null,
  _last_name         text default null,
  _phone             text default null,
  _city              text default null,
  _client_type       text default null,
  _company           text default null,
  _country_code      text default null,
  _municipality_code text default null,
  _document_type     text default null,
  _document_number   text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := (select auth.uid());
  v_company_id  uuid;
  v_actual      uuid;
  v_client_type public.client_type;
  v_email       text;
  v_country     text;
  v_mun_code    text;
  v_city        text;
  v_doc_tipo    public.document_type;
  v_doc_num     text;
  v_tiene_doc   boolean;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;

  v_client_type := case
    when _client_type in ('Particular','Constructor','Empresa','Profesional','Distribuidor')
    then _client_type::public.client_type
    else null
  end;

  v_country  := nullif(trim(coalesce(_country_code, '')), '');
  v_mun_code := nullif(trim(coalesce(_municipality_code, '')), '');

  if v_mun_code is not null
     and not exists (select 1 from public.municipalities where code = v_mun_code) then
    raise exception 'MUNICIPIO_INVALIDO: ese municipio no existe en el catálogo'
      using errcode = '23503';
  end if;
  if v_country is not null
     and not exists (select 1 from public.countries where code = v_country) then
    raise exception 'PAIS_INVALIDO: ese país no existe en el catálogo'
      using errcode = '23503';
  end if;

  if v_mun_code is not null then
    select m.name into v_city from public.municipalities m where m.code = v_mun_code;
  else
    v_city := nullif(trim(coalesce(_city, '')), '');
  end if;

  -- ── Documento ──────────────────────────────────────────────────────
  select document_number is not null into v_tiene_doc
    from public.profiles where id = v_user_id;

  v_doc_num := public.normalizar_documento(_document_number);
  if v_doc_num = '' then v_doc_num := null; end if;

  v_doc_tipo := case
    when _document_type in ('CC','CE','NIT','PASAPORTE','PEP')
    then _document_type::public.document_type
    else null
  end;

  if v_doc_num is not null and not v_tiene_doc then
    if v_doc_tipo is null then
      raise exception 'TIPO_DOCUMENTO_INVALIDO: elige el tipo de documento'
        using errcode = '22023';
    end if;
    if length(v_doc_num) < 5 then
      raise exception 'DOCUMENTO_CORTO: el número de documento no parece válido'
        using errcode = '22023';
    end if;
    -- El índice único lo impediría igual, pero reventaría con un error de base
    -- de datos que no le dice nada a quien está llenando el formulario.
    if exists (
      select 1 from public.profiles p
       where p.document_number = v_doc_num
         and p.document_type = v_doc_tipo
         and p.id <> v_user_id
    ) then
      raise exception 'DOCUMENTO_YA_REGISTRADO: ya existe una cuenta con ese documento'
        using errcode = '23505';
    end if;
  end if;

  update public.profiles p
     set first_name        = coalesce(nullif(trim(_first_name), ''), p.first_name),
         last_name         = coalesce(nullif(trim(_last_name),  ''), p.last_name),
         phone             = coalesce(nullif(trim(_phone), ''), p.phone),
         city              = coalesce(v_city, p.city),
         country_code      = coalesce(v_country, p.country_code),
         municipality_code = coalesce(v_mun_code, p.municipality_code),
         client_type       = coalesce(v_client_type, p.client_type),
         -- Solo se RELLENA. Cambiar uno ya puesto es cosa de quien administra
         -- clientes, con su rastro y su aviso.
         document_type     = case when v_tiene_doc then p.document_type
                                  else coalesce(v_doc_tipo, p.document_type) end,
         document_number   = case when v_tiene_doc then p.document_number
                                  else coalesce(v_doc_num, p.document_number) end
   where p.id = v_user_id
   returning p.company_id, p.email into v_actual, v_email;

  if v_actual is null and coalesce(trim(_company), '') <> '' then
    insert into public.companies (name, city, email, status, country_code, municipality_code)
    values (trim(_company), v_city, v_email, 'ACTIVA', coalesce(v_country, 'CO'), v_mun_code)
    returning id into v_company_id;

    insert into public.company_members (company_id, user_id, company_role)
    values (v_company_id, v_user_id, 'OWNER')
    on conflict do nothing;

    update public.profiles set company_id = v_company_id where id = v_user_id;

    insert into public.user_roles (user_id, role, company_id)
    values (v_user_id, 'CLIENTE_B2B', v_company_id)
    on conflict on constraint user_roles_unicos do nothing;
  end if;

  return jsonb_build_object('ok', true, 'company_id', coalesce(v_company_id, v_actual));
end;
$$;

revoke all on function public.complete_profile(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.complete_profile(text, text, text, text, text, text, text, text, text, text) to authenticated, service_role;

-- Sin documento, el perfil se considera incompleto: así el modal vuelve a
-- pedirlo a quien ya entró con Google y todavía no lo tiene.
notify pgrst, 'reload schema';
