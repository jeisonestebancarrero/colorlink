-- Registra la vista «Clientes» del portal (sedes y direcciones de clientes empresa).

insert into public.app_views (code, label, icon, area, route, sort_order, is_active, color, description)
values (
  'bo.clients', 'Clientes', 'Building2', 'BACKOFFICE', '/clientes', 145, true,
  '#7C3AED', 'Sedes de las empresas cliente y sus direcciones'
)
on conflict (code) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      sort_order = excluded.sort_order, is_active = excluded.is_active,
      color = excluded.color, description = excluded.description;

-- Ver no es editar: editar sedes lo decide users.manage en la política de company_branches.
insert into public.role_views (role, view_code)
select r::public.app_role, 'bo.clients'
from (values
  ('ADMINISTRADOR'), ('GERENCIA'), ('SERVICIO_CLIENTE'), ('ASESOR'), ('DESPACHO')
) as v(r)
on conflict do nothing;

notify pgrst, 'reload schema';
