-- El modal de «Completa tu perfil» pedía la ciudad como texto libre, y
-- `complete_profile` la guardaba tal cual: quien entraba con Google terminaba
-- con «medellin», «Medellín », «Mede» o cualquier cosa en `profiles.city` y con
-- `municipality_code` en nulo. El registro normal nunca funcionó así —el
-- trigger de alta valida el código DIVIPOLA y deriva la ciudad del nombre
-- oficial del municipio—, de modo que las dos puertas de entrada dejaban al
-- cliente en estados distintos. Esta función se alinea con el trigger.
--
-- Se DROPEA antes de crear porque cambia la lista de argumentos: un
-- `create or replace` con firma distinta deja las dos versiones vivas y
-- PostgREST ya no sabría cuál llamar.
drop function if exists public.complete_profile(text, text, text, text, text, text);

create or replace function public.complete_profile(
  _first_name        text default null,
  _last_name         text default null,
  _phone             text default null,
  _city              text default null,
  _client_type       text default null,
  _company           text default null,
  _country_code      text default null,
  _municipality_code text default null
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

  -- Un código que no está en el diccionario es un error de programación, no
  -- una variación de captura: la pantalla solo ofrece municipios reales. Se
  -- levanta en vez de guardarse en nulo, porque un nulo silencioso deja el
  -- perfil incompleto y el modal reapareciendo para siempre sin explicación.
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

  -- Con municipio, la ciudad es su nombre oficial y no lo que se haya escrito:
  -- así `city` y `municipality_code` no pueden contradecirse.
  if v_mun_code is not null then
    select m.name into v_city from public.municipalities m where m.code = v_mun_code;
  else
    v_city := nullif(trim(coalesce(_city, '')), '');
  end if;

  update public.profiles p
     set first_name        = coalesce(nullif(trim(_first_name), ''), p.first_name),
         last_name         = coalesce(nullif(trim(_last_name),  ''), p.last_name),
         phone             = coalesce(nullif(trim(_phone), ''), p.phone),
         city              = coalesce(v_city, p.city),
         country_code      = coalesce(v_country, p.country_code),
         municipality_code = coalesce(v_mun_code, p.municipality_code),
         client_type       = coalesce(v_client_type, p.client_type)
   where p.id = v_user_id
   returning p.company_id, p.email into v_actual, v_email;

  -- La empresa solo se crea si el usuario la declara y todavía no tiene una.
  -- Nunca se reasigna: cambiar de empresa es una operación administrativa.
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

revoke all on function public.complete_profile(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.complete_profile(text, text, text, text, text, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
