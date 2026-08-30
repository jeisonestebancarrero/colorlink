-- ============================================================
-- La aplicación «Puntos de venta» en el tablero interno
-- ============================================================
-- Se registra como una aplicación más para que aparezca en el lanzador y en
-- el menú, y sobre todo para que el administrador pueda concederla o
-- retirarla desde la pantalla de permisos, igual que las demás. Una pantalla
-- que existe pero que el sistema de accesos no conoce es una puerta que nadie
-- puede cerrar.
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

-- Quién la ve por su rol. Gerencia la consulta; solo administración escribe,
-- y eso lo decide `settings.manage` dentro de la pantalla.
insert into public.role_views (role, view_code, visible)
values
  ('ADMINISTRADOR', 'bo.stores', true),
  ('GERENCIA',      'bo.stores', true),
  ('BODEGA',        'bo.stores', true),
  ('DESPACHO',      'bo.stores', true)
on conflict (role, view_code) do update set visible = excluded.visible;
