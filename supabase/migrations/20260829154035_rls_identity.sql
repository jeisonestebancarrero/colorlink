-- ============================================================
-- FASE 2 · 06 — Row Level Security sobre las tablas de identidad
-- ============================================================
-- MÓDULO 30: ninguna política usa `USING (true)` sobre datos sensibles.
-- Las tablas quedan denegadas por defecto: sin política que la permita,
-- una operación es imposible incluso para un usuario autenticado.
--
-- Nota de rendimiento: las funciones se invocan como `(select public.f())`
-- para que Postgres las evalúe una vez por consulta (InitPlan) en lugar de
-- una vez por fila (MÓDULO 45).
-- ============================================================

alter table public.companies       enable row level security;
alter table public.profiles        enable row level security;
alter table public.user_roles      enable row level security;
alter table public.company_members enable row level security;

-- ============================================================
-- PERMISOS DE TABLA Y COLUMNA
-- ============================================================
-- RLS filtra FILAS pero no COLUMNAS. Para impedir que un usuario se cambie
-- a sí mismo el `company_id` (saltando a otro tenant) o el `status`, se
-- restringe el UPDATE a la lista blanca de columnas de datos personales.
-- Sin esto, una política "puede editar su propio perfil" permitiría
-- `update profiles set company_id = '<empresa ajena>'`.
-- ============================================================

revoke all on public.companies       from anon, authenticated;
revoke all on public.profiles        from anon, authenticated;
revoke all on public.user_roles      from anon, authenticated;
revoke all on public.company_members from anon, authenticated;

grant select on public.companies       to authenticated;
grant select on public.profiles        to authenticated;
grant select on public.user_roles      to authenticated;
grant select on public.company_members to authenticated;

-- Únicas columnas que el propio usuario puede modificar de su perfil.
-- Ausentes a propósito: id, email, company_id, status, created_at.
grant update (first_name, last_name, phone, city, avatar_url, client_type)
  on public.profiles to authenticated;

-- Datos de la empresa que puede editar su OWNER/ADMIN. `status` queda fuera.
grant update (name, legal_name, nit, city, address, phone, email)
  on public.companies to authenticated;

-- ============================================================
-- COMPANIES
-- ============================================================
create policy "companies_select_miembros"
  on public.companies for select to authenticated
  using ( id in (select public.my_company_ids()) );

create policy "companies_select_staff"
  on public.companies for select to authenticated
  using ( (select public.is_staff()) );

create policy "companies_update_gestores"
  on public.companies for update to authenticated
  using      ( (select public.can_manage_company(id)) )
  with check ( (select public.can_manage_company(id)) );

create policy "companies_admin_total"
  on public.companies for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- ============================================================
-- PROFILES
-- ============================================================
create policy "profiles_select_propio"
  on public.profiles for select to authenticated
  using ( id = (select auth.uid()) );

-- Un usuario B2B ve a sus compañeros de empresa (nombre, cargo, contacto),
-- nunca a usuarios de otras empresas.
create policy "profiles_select_misma_empresa"
  on public.profiles for select to authenticated
  using ( company_id in (select public.my_company_ids()) );

create policy "profiles_select_staff"
  on public.profiles for select to authenticated
  using ( (select public.is_staff()) );

-- El UPDATE queda además limitado por columna (ver grants arriba).
create policy "profiles_update_propio"
  on public.profiles for update to authenticated
  using      ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

create policy "profiles_admin_total"
  on public.profiles for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- ============================================================
-- USER_ROLES  —  LA TABLA MÁS SENSIBLE DEL SISTEMA
-- ============================================================
-- Solo lectura. NO se define ninguna política de INSERT, UPDATE ni DELETE
-- para usuarios: la escritura pasa obligatoriamente por grant_role() /
-- revoke_role(), que verifican is_admin() en el servidor.
-- Esta ausencia es deliberada; no es un olvido.
-- ============================================================
create policy "user_roles_select_propio"
  on public.user_roles for select to authenticated
  using ( user_id = (select auth.uid()) );

create policy "user_roles_select_admin"
  on public.user_roles for select to authenticated
  using ( (select public.is_admin()) );

-- ============================================================
-- COMPANY_MEMBERS
-- ============================================================
create policy "company_members_select_propio"
  on public.company_members for select to authenticated
  using ( user_id = (select auth.uid()) );

create policy "company_members_select_misma_empresa"
  on public.company_members for select to authenticated
  using ( company_id in (select public.my_company_ids()) );

create policy "company_members_select_staff"
  on public.company_members for select to authenticated
  using ( (select public.is_staff()) );

create policy "company_members_admin_total"
  on public.company_members for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );
