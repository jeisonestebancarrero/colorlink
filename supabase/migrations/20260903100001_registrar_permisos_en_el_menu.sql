-- ============================================================
-- «Permisos» nunca apareció en el menú
-- ============================================================
-- La pantalla existe y `/permisos` está enrutada en la aplicación desde hace
-- tiempo, pero **nunca se registró en `app_views`**. El menú del portal no está
-- escrito en el código: se dibuja con las vistas habilitadas para el rol de
-- quien entra. Una pantalla que no está en esa tabla no existe para nadie.
--
-- Resultado: la única forma de llegar a Permisos era escribir la URL a mano.
-- Y ahora que ahí vive la configuración de roles, era justamente lo que había
-- que poder encontrar.
--
-- Va junto a Usuarios, que es donde uno la busca: primero las personas,
-- después qué puede cada cargo.

insert into public.app_views (code, label, icon, area, route, sort_order, is_active, color, description)
values (
  'bo.permissions', 'Permisos', 'ShieldCheck', 'BACKOFFICE', '/permisos', 155, true,
  '#0F766E', 'Roles, qué ve cada uno y qué puede hacer'
)
on conflict (code) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      sort_order = excluded.sort_order, is_active = excluded.is_active,
      color = excluded.color, description = excluded.description;

-- SOLO el administrador. Es la pantalla que reparte los accesos de todos los
-- demás: dársela a otro rol sería dejar que se conceda a sí mismo lo que
-- quiera. Las funciones que hay detrás ya exigen `is_admin()`, así que esto no
-- es la barrera —es no ofrecer una puerta que el servidor va a cerrar—.
insert into public.role_views (role, view_code)
values ('ADMINISTRADOR'::public.app_role, 'bo.permissions')
on conflict (role, view_code) do update set visible = true;
