-- ============================================================
-- FASE 2 · 05 — Creación automática del perfil al registrarse
-- ============================================================
-- MÓDULO 1: "Crear correctamente el perfil asociado al usuario".
--
-- El trigger corre DENTRO de la transacción de Supabase Auth: si algo falla,
-- no queda un usuario huérfano sin perfil. Los datos llegan en
-- `raw_user_meta_data`, alimentado por el `options.data` de signUp().
--
-- ⚠️  DECISIÓN DE SEGURIDAD — POR QUÉ NO SE VINCULA A UNA EMPRESA EXISTENTE
-- RegisterPage.tsx pide la empresa como texto libre y obligatorio. La opción
-- "cómoda" sería buscar una empresa con ese nombre y unir al usuario a ella.
-- ESO SERÍA UNA FUGA DE DATOS ENTRE TENANTS: bastaría escribir
-- "Constructora Horizonte S.A.S." al registrarse para acceder a los proyectos
-- de esa empresa, saltándose todo el MÓDULO 62.
--
-- Por eso el registro SIEMPRE crea una empresa NUEVA con el usuario como
-- OWNER. Unirse a una empresa que ya existe requerirá invitación de su
-- OWNER/ADMIN (módulo posterior). Se permiten nombres repetidos a propósito:
-- la clave real de negocio es el NIT, no el nombre.
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
begin
  -- Validación defensiva del enum: si llega un valor desconocido en la
  -- metadata, se degrada a 'Particular' en vez de reventar el registro.
  v_client_type := case
    when new.raw_user_meta_data ->> 'client_type'
         in ('Particular', 'Constructor', 'Empresa', 'Profesional', 'Distribuidor')
    then (new.raw_user_meta_data ->> 'client_type')::public.client_type
    else 'Particular'::public.client_type
  end;

  v_city         := nullif(trim(coalesce(new.raw_user_meta_data ->> 'city', '')), '');
  v_company_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');

  -- 1) Perfil (1:1 con auth.users)
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

  -- 2) Rol base. TODO usuario nace como CLIENTE, nunca con más privilegios.
  insert into public.user_roles (user_id, role)
  values (new.id, 'CLIENTE')
  on conflict on constraint user_roles_unicos do nothing;

  -- 3) Empresa propia (ver nota de seguridad de la cabecera)
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
