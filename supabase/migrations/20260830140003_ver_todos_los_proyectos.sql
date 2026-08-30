-- ============================================================
-- Separar "abrir el módulo" de "ver todas las obras"
-- ============================================================
-- La migración anterior hizo que `can_access_project` aceptara a cualquiera
-- con el permiso `projects.read`. La intención era buena —conceder la
-- aplicación Proyectos a Gerencia y que no viera una lista vacía— pero el
-- efecto fue el contrario del deseado: el rol TECNICO ya tenía `projects.read`
-- en su línea base, así que todo técnico pasó a ver TODAS las obras, incluida
-- la dirección de la casa de clientes que no atiende.
--
-- El error de fondo fue confundir dos cosas distintas:
--   · `projects.read`     — puedo abrir el módulo Proyectos.
--   · `projects.read_all` — veo todas las obras, no solo las mías o las que
--                           me asignaron.
--
-- Con la separación, el técnico conserva su módulo y vuelve a ver únicamente
-- lo que le asignaron, y el administrador puede dar visión completa a quien
-- la necesite —Gerencia, Servicio al Cliente— desde la misma pantalla de
-- permisos, sin tocar código.
-- ============================================================

insert into public.permissions (code, module, action, label, description, is_critical, sort_order)
values (
  'projects.read_all', 'Proyectos', 'read_all',
  'Ver todas las obras',
  'Ver cualquier proyecto, no solo los propios o los asignados. Un proyecto incluye la dirección del cliente.',
  true, 31
)
on conflict (code) do nothing;

-- Quiénes lo tienen por su rol. El técnico NO: su alcance es la obra que le
-- asignaron, y ese era justamente el problema.
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
