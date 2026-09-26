-- Usuarios de demostración; solo corre en local con `db reset`, nunca en producción.
-- Contraseñas públicas de demo; el cliente principal replica INITIAL_USER de src/data/mockData.ts.

-- Alta en auth.users; handle_new_user() crea perfil, rol CLIENTE y, si hay company, la empresa.
create or replace function pg_temp.seed_user(
  _email      text,
  _password   text,
  _first_name text,
  _last_name  text,
  _phone      text,
  _city       text,
  _client_type text,
  _company    text default null
)
returns uuid
language plpgsql
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_meta    jsonb;
begin
  v_meta := jsonb_build_object(
    'first_name', _first_name,
    'last_name',  _last_name,
    'phone',      _phone,
    'city',       _city,
    'client_type', _client_type
  );
  if _company is not null then
    v_meta := v_meta || jsonb_build_object('company', _company);
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    _email,
    extensions.crypt(_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    v_meta,
    now(), now(),
    '', '', '', ''
  );

  -- GoTrue exige una identidad asociada para permitir login con contraseña.
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', _email, 'email_verified', true),
    'email',
    v_user_id::text,
    now(), now(), now()
  );

  return v_user_id;
end;
$$;

do $$
declare
  v_carlos  uuid;
  v_admin   uuid;
  v_admin_demo uuid;
  v_asesor  uuid;
  v_tecnico uuid;
  v_ana     uuid;
begin
  -- Cliente B2B principal, espejo de INITIAL_USER.
  v_carlos := pg_temp.seed_user(
    'carlos.mendoza@constructorahorizonte.com', 'pintuco2025*',
    'Carlos', 'Mendoza', '+57 (312) 458-9201', 'Medellín',
    'Constructor', 'Constructora Horizonte S.A.S.'
  );

  -- Segundo cliente B2B de otra empresa, para probar el aislamiento entre empresas.
  v_ana := pg_temp.seed_user(
    'ana.torres@edificarplus.com', 'pintuco2025*',
    'Ana', 'Torres', '+57 (301) 772-1180', 'Bogotá',
    'Constructor', 'Edificar Plus S.A.S.'
  );

  -- Personal interno: sin company, así que no reciben empresa ni CLIENTE_B2B.
  v_admin_demo := pg_temp.seed_user(
    'admin@pintuco.demo', 'pintuco2025*',
    'Administración', 'ColorLink', '+57 (604) 448-0000', 'Medellín', 'Empresa'
  );

  v_asesor := pg_temp.seed_user(
    'asesor@pintuco.demo', 'pintuco2025*',
    'Laura', 'Restrepo', '+57 (604) 448-0011', 'Medellín', 'Profesional'
  );

  v_tecnico := pg_temp.seed_user(
    'tecnico@pintuco.demo', 'pintuco2025*',
    'Jorge', 'Villa', '+57 (604) 448-0022', 'Medellín', 'Profesional'
  );

  -- Administrador principal. 'admin' salta el mínimo de longitud porque se inserta el hash:
  -- cambiarla antes de cualquier despliegue público.
  v_admin := pg_temp.seed_user(
    'admin@colorlink.com', 'admin',
    'Administrador', 'ColorLink', '+57 (604) 448-0000', 'Medellín', 'Empresa'
  );
  insert into public.user_roles (user_id, role) values (v_admin, 'ADMINISTRADOR')
  on conflict on constraint user_roles_unicos do nothing;

  -- Primer administrador insertado como superusuario; después solo vía public.grant_role().
  insert into public.user_roles (user_id, role) values
    (v_admin_demo, 'ADMINISTRADOR'),
    (v_asesor,  'ASESOR'),
    (v_tecnico, 'TECNICO')
  on conflict on constraint user_roles_unicos do nothing;

  raise notice 'Seed demo completado: 5 usuarios, 2 empresas.';
end $$;
