-- Completa el perfil tras un acceso con Google. Es RPC y no un UPDATE del cliente
-- porque otorgar CLIENTE_B2B escribe en user_roles, que no tiene política de INSERT.

create or replace function public.complete_profile(
  _first_name  text default null,
  _last_name   text default null,
  _phone       text default null,
  _city        text default null,
  _client_type text default null,
  _company     text default null
)
returns jsonb
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
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión iniciada' using errcode = '28000';
  end if;

  v_client_type := case
    when _client_type in ('Particular','Constructor','Empresa','Profesional','Distribuidor')
    then _client_type::public.client_type
    else null
  end;

  update public.profiles p
     set first_name  = coalesce(nullif(trim(_first_name), ''), p.first_name),
         last_name   = coalesce(nullif(trim(_last_name),  ''), p.last_name),
         phone       = coalesce(nullif(trim(_phone), ''), p.phone),
         city        = coalesce(nullif(trim(_city),  ''), p.city),
         client_type = coalesce(v_client_type, p.client_type)
   where p.id = v_user_id
   returning p.company_id, p.email into v_actual, v_email;

  -- Solo si aún no tiene empresa; cambiar de empresa es tarea administrativa.
  if v_actual is null and coalesce(trim(_company), '') <> '' then
    insert into public.companies (name, city, email, status)
    values (trim(_company), nullif(trim(_city), ''), v_email, 'ACTIVA')
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

revoke execute on function public.complete_profile(text, text, text, text, text, text) from public, anon;
grant execute on function public.complete_profile(text, text, text, text, text, text) to authenticated;
