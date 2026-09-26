-- Registra /permisos en app_views: el menú se arma desde esa tabla y la pantalla
-- no aparecía. Se ubica junto a Usuarios.

insert into public.app_views (code, label, icon, area, route, sort_order, is_active, color, description)
values (
  'bo.permissions', 'Permisos', 'ShieldCheck', 'BACKOFFICE', '/permisos', 155, true,
  '#0F766E', 'Roles, qué ve cada uno y qué puede hacer'
)
on conflict (code) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      sort_order = excluded.sort_order, is_active = excluded.is_active,
      color = excluded.color, description = excluded.description;

-- Solo administrador: reparte los accesos de todos. Las funciones ya exigen is_admin();
-- esto solo evita ofrecer la entrada.
insert into public.role_views (role, view_code)
values ('ADMINISTRADOR'::public.app_role, 'bo.permissions')
on conflict (role, view_code) do update set visible = true;
