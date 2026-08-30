-- ============================================================
-- Acceso con Google — adaptación del alta de usuario
-- ============================================================
-- Un registro con correo y contraseña llega con metadata completa desde
-- RegisterPage: first_name, last_name, phone, city, client_type y company.
--
-- Un acceso con Google NO trae nada de eso. Google entrega `full_name` (o
-- `name`), `avatar_url`, `email` y poco más. Sin adaptar el trigger, esos
-- usuarios quedarían con nombre vacío y sin foto.
--
-- DECISIÓN SOBRE LA EMPRESA:
-- El alta por Google NO crea empresa. Un registro por formulario sí lo hace
-- porque el usuario escribió su razón social de forma explícita; con Google
-- no hay ese dato y no se puede inventar. El usuario entra como CLIENTE y
-- completará su empresa desde el perfil. Esto además mantiene la regla de
-- la FASE 2: nunca vincular a una empresa preexistente automáticamente.
-- ============================================================

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
  v_first_name   text;
  v_last_name    text;
  v_full_name    text;
  v_avatar       text;
begin
  v_client_type := case
    when new.raw_user_meta_data ->> 'client_type'
         in ('Particular', 'Constructor', 'Empresa', 'Profesional', 'Distribuidor')
    then (new.raw_user_meta_data ->> 'client_type')::public.client_type
    else 'Particular'::public.client_type
  end;

  v_city         := nullif(trim(coalesce(new.raw_user_meta_data ->> 'city', '')), '');
  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');

  -- Nombre: primero los campos del formulario propio; si no existen, se
  -- deriva del nombre completo que envía el proveedor externo.
  v_first_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  v_last_name  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');

  if v_first_name is null then
    v_full_name := nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), '');

    if v_full_name is not null then
      v_first_name := split_part(v_full_name, ' ', 1);
      -- Todo lo que sigue al primer espacio se toma como apellidos: en
      -- Colombia son habituales dos apellidos y partirlos sería peor.
      v_last_name  := coalesce(
        nullif(trim(substr(v_full_name, length(split_part(v_full_name, ' ', 1)) + 1)), ''),
        v_last_name
      );
    end if;
  end if;

  v_avatar := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture',
    ''
  )), '');

  -- 1) Perfil
  insert into public.profiles (
    id, email, first_name, last_name, phone, city, client_type, avatar_url
  )
  values (
    new.id,
    new.email,
    coalesce(v_first_name, ''),
    coalesce(v_last_name, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    v_city,
    v_client_type,
    v_avatar
  )
  on conflict (id) do nothing;

  -- 2) Rol base
  insert into public.user_roles (user_id, role)
  values (new.id, 'CLIENTE')
  on conflict on constraint user_roles_unicos do nothing;

  -- 3) Empresa propia, SOLO si el usuario la declaró explícitamente.
  if v_company_name is not null then
    insert into public.companies (name, city, email, status)
    values (v_company_name, v_city, new.email, 'ACTIVA')
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

comment on function public.handle_new_user() is
  'Alta de usuario. Soporta registro propio (metadata completa) y proveedores externos como Google (deriva nombre y avatar). Nunca vincula a empresas preexistentes.';
