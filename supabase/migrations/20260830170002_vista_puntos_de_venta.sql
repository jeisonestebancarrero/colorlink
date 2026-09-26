-- Registra «Puntos de venta» como app para que el sistema de accesos pueda concederla o retirarla.
insert into public.app_views (code, label, icon, route, area, sort_order, is_active, color, description)
values (
  'bo.stores', 'Puntos de venta', 'Store', '/puntos-venta', 'BACKOFFICE', 135, true,
  '#0EA5E9',
  'Tiendas, fotos y servicios de retiro'
)
on conflict (code) do update
  set label = excluded.label,
      icon = excluded.icon,
      route = excluded.route,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active,
      color = excluded.color,
      description = excluded.description;

-- La escritura dentro de la pantalla la controla settings.manage.
insert into public.role_views (role, view_code, visible)
values
  ('ADMINISTRADOR', 'bo.stores', true),
  ('GERENCIA',      'bo.stores', true),
  ('BODEGA',        'bo.stores', true),
  ('DESPACHO',      'bo.stores', true)
on conflict (role, view_code) do update set visible = excluded.visible;
