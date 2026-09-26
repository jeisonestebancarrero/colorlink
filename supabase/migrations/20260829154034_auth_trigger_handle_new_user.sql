-- Crea perfil, rol y empresa al registrarse, dentro de la transacción de Auth.
-- Siempre crea una empresa nueva: unir por nombre dejaría entrar a cualquiera en un tenant ajeno.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_name text;
  v_company_id   uuid;
  v_client_type  public.client_type;
  v_city         text;
begin
  -- Valor desconocido en la metadata: se degrada a 'Particular' en vez de fallar el registro.
  v_client_type := case
    when new.raw_user_meta_data ->> 'client_type'
         in ('Particular', 'Constructor', 'Empresa', 'Profesional', 'Distribuidor')
    then (new.raw_user_meta_data ->> 'client_type')::public.client_type
    else 'Particular'::public.client_type
  end;

  v_city         := nullif(trim(coalesce(new.raw_user_meta_data ->> 'city', '')), '');
  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');

  insert into public.profiles (
    id, email, first_name, last_name, phone, city, client_type
  )
  values (
    new.id,
    new.email,
    coalesce(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'last_name'), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    v_city,
    v_client_type
  )
  on conflict (id) do nothing;

  -- Todo usuario nace como CLIENTE, sin más privilegios.
  insert into public.user_roles (user_id, role)
  values (new.id, 'CLIENTE')
  on conflict on constraint user_roles_unicos do nothing;

  -- Empresa propia, nunca una existente (ver cabecera).
  if v_company_name is not null then
    insert into public.companies (name, city, email, status)
    values (v_company_name, v_city, new.email, 'ACTIVA')
    returning id into v_company_id;

    insert into public.company_members (company_id, user_id, company_role)
    values (v_company_id, new.id, 'OWNER');

    update public.profiles
      set company_id = v_company_id
      where id = new.id;

    insert into public.user_roles (user_id, role, company_id)
    values (new.id, 'CLIENTE_B2B', v_company_id)
    on conflict on constraint user_roles_unicos do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea perfil, rol CLIENTE y empresa propia al registrarse. Nunca vincula a empresas preexistentes (aislamiento multi-tenant).';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
