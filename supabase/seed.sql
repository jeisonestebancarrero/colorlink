-- ============================================================
-- SEED DEMO — FASE 2 (identidad)
-- ============================================================
-- MÓDULO 40: datos de demostración claramente identificados y separados.
-- Este archivo SOLO se ejecuta en el entorno local, al hacer `db reset`.
-- Nunca forma parte de las migraciones ni viaja a un entorno productivo.
--
-- Las contraseñas aquí son de demostración pública (LoginPage.tsx ya las
-- muestra prellenadas en el formulario). No representan credenciales reales.
--
-- El caso de prueba del MÓDULO 39 se reproduce tal cual: Carlos Mendoza,
-- Constructora Horizonte S.A.S., Medellín — los mismos datos que hoy están
-- en src/data/mockData.ts (INITIAL_USER), para que nada cambie visualmente.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: alta de usuario en Supabase Auth.
-- Al insertar en auth.users se dispara public.handle_new_user(), que crea
-- el perfil, el rol CLIENTE y —si se indica empresa— la empresa propia.
-- ------------------------------------------------------------
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
  -- ----------------------------------------------------------
  -- 1) CLIENTE B2B — caso de prueba oficial (MÓDULO 39)
  --    Espejo exacto de INITIAL_USER en src/data/mockData.ts
  -- ----------------------------------------------------------
  v_carlos := pg_temp.seed_user(
    'carlos.mendoza@constructorahorizonte.com', 'pintuco2025*',
    'Carlos', 'Mendoza', '+57 (312) 458-9201', 'Medellín',
    'Constructor', 'Constructora Horizonte S.A.S.'
  );

  -- ----------------------------------------------------------
  -- 2) SEGUNDO CLIENTE B2B, EMPRESA DISTINTA
  --    Existe para poder demostrar el aislamiento multi-tenant del
  --    MÓDULO 62: Ana jamás debe ver los proyectos de Carlos.
  -- ----------------------------------------------------------
  v_ana := pg_temp.seed_user(
    'ana.torres@edificarplus.com', 'pintuco2025*',
    'Ana', 'Torres', '+57 (301) 772-1180', 'Bogotá',
    'Constructor', 'Edificar Plus S.A.S.'
  );

  -- ----------------------------------------------------------
  -- 3) PERSONAL INTERNO PINTUCO
  --    Sin metadata `company`: no se les crea empresa propia y por
  --    tanto no reciben el rol CLIENTE_B2B.
  -- ----------------------------------------------------------
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

  -- ----------------------------------------------------------
  -- 3b) ADMINISTRADOR PRINCIPAL
  -- Cuenta solicitada para operar el back-office.
  --
  -- ⚠️ La contraseña 'admin' tiene 5 caracteres y NO pasaría la validación
  -- de registro (minimum_password_length = 6). Funciona porque el seed
  -- inserta el hash directamente, y esa longitud solo se valida al
  -- registrarse o al cambiarla, no al iniciar sesión.
  -- ANTES DE DESPLEGAR EN RENDER hay que cambiarla: una contraseña de
  -- administrador de 5 caracteres en internet se rompe en segundos.
  -- ----------------------------------------------------------
  v_admin := pg_temp.seed_user(
    'admin@colorlink.com', 'admin',
    'Administrador', 'ColorLink', '+57 (604) 448-0000', 'Medellín', 'Empresa'
  );
  insert into public.user_roles (user_id, role) values (v_admin, 'ADMINISTRADOR')
  on conflict on constraint user_roles_unicos do nothing;

  -- ----------------------------------------------------------
  -- 4) Bootstrap de roles privilegiados.
  --    Se insertan directamente porque el seed corre como superusuario:
  --    es el único momento en que se puede crear el primer administrador.
  --    A partir de aquí, la única vía es public.grant_role().
  -- ----------------------------------------------------------
  insert into public.user_roles (user_id, role) values
    (v_admin_demo, 'ADMINISTRADOR'),
    (v_asesor,  'ASESOR'),
    (v_tecnico, 'TECNICO')
  on conflict on constraint user_roles_unicos do nothing;

  raise notice 'Seed demo completado: 5 usuarios, 2 empresas.';
end $$;
