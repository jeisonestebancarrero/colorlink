-- RLS de proyectos: toda la visibilidad pasa por can_access_project() para que el
-- proyecto y sus tablas hijas no diverjan.

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

create policy "projects_select_autorizado" on public.projects
  for select to authenticated
  using ( (select public.can_access_project(id)) );

-- Sin este with check se podrían crear proyectos a nombre de otro.
create policy "projects_insert_propio" on public.projects
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (company_id is null or company_id in (select public.my_company_ids()))
  );

-- El dueño edita el suyo; el personal, cualquiera al que tenga acceso.
create policy "projects_update_dueno" on public.projects
  for update to authenticated
  using      ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

create policy "projects_update_staff" on public.projects
  for update to authenticated
  using      ( (select public.is_staff()) and (select public.can_access_project(id)) )
  with check ( (select public.is_staff()) and (select public.can_access_project(id)) );

-- Un asesor no borra proyectos.
create policy "projects_delete_dueno_o_admin" on public.projects
  for delete to authenticated
  using ( user_id = (select auth.uid()) or (select public.is_admin()) );

-- Las tablas hijas heredan la regla del proyecto padre.
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

-- Solo administración asigna: un técnico no puede auto-asignarse para ver un proyecto.
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
