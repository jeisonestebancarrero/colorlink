-- Separa projects.read (abrir el módulo) de projects.read_all (ver todas las obras):
-- con solo projects.read, todo técnico veía obras y direcciones que no atiende.

insert into public.permissions (code, module, action, label, description, is_critical, sort_order)
values (
  'projects.read_all', 'Proyectos', 'read_all',
  'Ver todas las obras',
  'Ver cualquier proyecto, no solo los propios o los asignados. Un proyecto incluye la dirección del cliente.',
  true, 31
)
on conflict (code) do nothing;

-- El técnico no lo recibe: su alcance son las obras asignadas.
insert into public.role_permissions (role, permission_code, granted)
values
  ('ADMINISTRADOR',    'projects.read_all', true),
  ('GERENCIA',         'projects.read_all', true),
  ('ASESOR',           'projects.read_all', true),
  ('SERVICIO_CLIENTE', 'projects.read_all', true)
on conflict (role, permission_code) do update set granted = excluded.granted;

create or replace function public.can_access_project(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = _project_id
      and (
        p.user_id = (select auth.uid())                              -- dueño
        or (p.company_id is not null
            and p.company_id in (select public.my_company_ids()))     -- su empresa
        or public.is_admin()                                         -- administración
        or public.is_assigned_to_project(p.id)                       -- asignado a la obra
        or public.has_permission('projects.read_all')                -- visión completa
      )
  );
$$;
