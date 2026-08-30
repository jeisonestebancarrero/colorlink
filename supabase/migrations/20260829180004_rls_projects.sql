-- ============================================================
-- FASE 5 · 04 — RLS de proyectos
-- ============================================================
-- Toda la visibilidad se apoya en public.can_access_project(), de modo que
-- proyecto, superficies, patologías, diagnóstico, cronología y archivos NO
-- puedan divergir en sus reglas. Si mañana cambia quién puede ver un
-- proyecto, se cambia en un solo sitio.
-- ============================================================

alter table public.projects              enable row level security;
alter table public.project_surfaces      enable row level security;
alter table public.project_pathologies   enable row level security;
alter table public.project_diagnoses     enable row level security;
alter table public.project_timeline_steps enable row level security;
alter table public.project_files         enable row level security;
alter table public.project_assignments   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'projects','project_surfaces','project_pathologies','project_diagnoses',
    'project_timeline_steps','project_files','project_assignments'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ============================================================
-- PROJECTS
-- ============================================================
create policy "projects_select_autorizado" on public.projects
  for select to authenticated
  using ( (select public.can_access_project(id)) );

-- Solo se puede crear un proyecto A NOMBRE PROPIO. Sin este `with check`,
-- un usuario podría crear proyectos atribuidos a otra persona.
create policy "projects_insert_propio" on public.projects
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (company_id is null or company_id in (select public.my_company_ids()))
  );

-- El dueño edita el suyo; el personal interno puede intervenir cualquiera
-- al que tenga acceso (asesor de la cartera, técnico asignado, admin).
create policy "projects_update_dueno" on public.projects
  for update to authenticated
  using      ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

create policy "projects_update_staff" on public.projects
  for update to authenticated
  using      ( (select public.is_staff()) and (select public.can_access_project(id)) )
  with check ( (select public.is_staff()) and (select public.can_access_project(id)) );

-- Borrado: solo el dueño o administración. Un asesor no borra proyectos.
create policy "projects_delete_dueno_o_admin" on public.projects
  for delete to authenticated
  using ( user_id = (select auth.uid()) or (select public.is_admin()) );

-- ============================================================
-- TABLAS HIJAS — heredan la regla del proyecto padre
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'project_surfaces','project_pathologies','project_diagnoses',
    'project_timeline_steps','project_files'
  ] loop
    execute format(
      'create policy "%s_select" on public.%I for select to authenticated '
      'using ((select public.can_access_project(project_id)))', t, t);
    execute format(
      'create policy "%s_insert" on public.%I for insert to authenticated '
      'with check ((select public.can_access_project(project_id)))', t, t);
    execute format(
      'create policy "%s_update" on public.%I for update to authenticated '
      'using ((select public.can_access_project(project_id))) '
      'with check ((select public.can_access_project(project_id)))', t, t);
    execute format(
      'create policy "%s_delete" on public.%I for delete to authenticated '
      'using ((select public.can_access_project(project_id)))', t, t);
  end loop;
end $$;

-- ============================================================
-- ASIGNACIONES
-- ============================================================
-- Cada quien ve sus propias asignaciones; el personal interno ve las del
-- proyecto. Asignar personal es potestad exclusiva de administración: un
-- técnico no puede auto-asignarse un proyecto para verlo.
create policy "project_assignments_select_propio" on public.project_assignments
  for select to authenticated
  using ( user_id = (select auth.uid()) );

create policy "project_assignments_select_staff" on public.project_assignments
  for select to authenticated
  using ( (select public.is_staff()) and (select public.can_access_project(project_id)) );

create policy "project_assignments_admin" on public.project_assignments
  for all to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );
