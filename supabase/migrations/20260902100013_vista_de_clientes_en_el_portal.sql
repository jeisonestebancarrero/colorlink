-- ============================================================
-- Vista "Clientes" en el portal interno
-- ============================================================
-- Pantalla para ver y corregir las sedes de un cliente empresa y consultar
-- las direcciones de sus usuarios. Antes no existía: si una sede tenía la
-- dirección mal o le faltaban las indicaciones de portería, despacho lo
-- resolvía por chat y el dato seguía mal en la base.
--
-- El menú del portal se arma desde `app_views` + `role_views`, así que la
-- pantalla no aparece hasta que se registra aquí. Se sitúa junto a Usuarios.

insert into public.app_views (code, label, icon, area, route, sort_order, is_active, color, description)
values (
  'bo.clients', 'Clientes', 'Building2', 'BACKOFFICE', '/clientes', 145, true,
  '#7C3AED', 'Sedes de las empresas cliente y sus direcciones'
)
on conflict (code) do update
  set label = excluded.label, icon = excluded.icon, route = excluded.route,
      sort_order = excluded.sort_order, is_active = excluded.is_active,
      color = excluded.color, description = excluded.description;

-- Quién la ve. Editar sedes lo sigue decidiendo `users.manage` en la política
-- de `company_branches`: los roles que solo consultan entran y ven, pero no
-- les aparece el botón de guardar y el servidor los rechazaría igual.
-- `role_views.role` es el enum `app_role`, así que hay que declararlo.
insert into public.role_views (role, view_code)
select r::public.app_role, 'bo.clients'
from (values
  ('ADMINISTRADOR'), ('GERENCIA'), ('SERVICIO_CLIENTE'), ('ASESOR'), ('DESPACHO')
) as v(r)
on conflict do nothing;

notify pgrst, 'reload schema';
