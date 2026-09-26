-- RLS de identidad: denegado por defecto. Las funciones van como (select f()) para
-- evaluarse una vez por consulta y no por fila.

alter table public.companies       enable row level security;
alter table public.profiles        enable row level security;
alter table public.user_roles      enable row level security;
alter table public.company_members enable row level security;

-- RLS filtra filas, no columnas: el UPDATE se limita a columnas personales para que
-- nadie cambie su propio company_id o status.

revoke all on public.companies       from anon, authenticated;
revoke all on public.profiles        from anon, authenticated;
revoke all on public.user_roles      from anon, authenticated;
revoke all on public.company_members from anon, authenticated;

grant select on public.companies       to authenticated;
grant select on public.profiles        to authenticated;
grant select on public.user_roles      to authenticated;
grant select on public.company_members to authenticated;

-- Ausentes a propósito: id, email, company_id, status, created_at.
grant update (first_name, last_name, phone, city, avatar_url, client_type)
  on public.profiles to authenticated;

-- Editable por OWNER/ADMIN; status queda fuera.
grant update (name, legal_name, nit, city, address, phone, email)
  on public.companies to authenticated;

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

create policy "profiles_select_propio"
  on public.profiles for select to authenticated
  using ( id = (select auth.uid()) );

-- Compañeros de empresa, nunca usuarios de otras.
create policy "profiles_select_misma_empresa"
  on public.profiles for select to authenticated
  using ( company_id in (select public.my_company_ids()) );

create policy "profiles_select_staff"
  on public.profiles for select to authenticated
  using ( (select public.is_staff()) );

-- Además limitado por columna (ver grants).
create policy "profiles_update_propio"
  on public.profiles for update to authenticated
  using      ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

create policy "profiles_admin_total"
  on public.profiles for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- user_roles: sin políticas de escritura a propósito; solo grant_role/revoke_role.
create policy "user_roles_select_propio"
  on public.user_roles for select to authenticated
  using ( user_id = (select auth.uid()) );

create policy "user_roles_select_admin"
  on public.user_roles for select to authenticated
  using ( (select public.is_admin()) );

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
