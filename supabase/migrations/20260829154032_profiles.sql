-- ============================================================
-- FASE 2 · 03 — Perfiles de usuario
-- ============================================================
-- MÓDULO 1: las credenciales las gestiona EXCLUSIVAMENTE Supabase Auth
-- (auth.users). Esta tabla NO almacena contraseñas ni hashes.
--
-- `id` es a la vez PK y FK a auth.users: relación 1:1 estricta, y el borrado
-- del usuario arrastra su perfil.
--
-- SOBRE `email` (MÓDULO 52 — fuente única de verdad):
-- La autoridad del email es auth.users.email. La columna de aquí es una
-- PROYECCIÓN sincronizada por trigger, no una segunda fuente de verdad.
-- Existe porque el frontend (`User.email` en src/types/index.ts) y los
-- listados de asesores/administradores la necesitan, y el cliente no puede
-- leer auth.users directamente con la anon key.
-- ============================================================

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  first_name  text not null default '',
  last_name   text not null default '',
  phone       text,
  city        text,
  client_type public.client_type not null default 'Particular',
  company_id  uuid references public.companies (id) on delete set null,
  avatar_url  text,
  status      public.user_status not null default 'ACTIVO',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_company_id_idx  on public.profiles (company_id);
create index profiles_status_idx      on public.profiles (status);
create index profiles_email_lower_idx on public.profiles (lower(email));

comment on table public.profiles is
  'Datos de perfil asociados 1:1 a auth.users. Nunca almacena credenciales.';
comment on column public.profiles.email is
  'Proyección de auth.users.email sincronizada por trigger. La autoridad es auth.users.';
comment on column public.profiles.company_id is
  'Empresa principal. El vínculo con permisos vive en public.company_members.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Sincronización de la proyección `email` cuando cambia en Auth.
-- ------------------------------------------------------------
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.sync_profile_email();
