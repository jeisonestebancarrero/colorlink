-- ============================================================
-- BACK-OFFICE · Tablero de aplicaciones
-- ============================================================
-- El lanzador de módulos toma su identidad de la paleta real de Pintuco:
-- cada aplicación es una muestra de color. Los valores viven en la base y no
-- en el código para que el administrador pueda reordenar el tablero, cambiar
-- un color o una descripción sin desplegar.
-- ============================================================

alter table public.app_views add column color text;
alter table public.app_views add column description text;
alter table public.app_views add column badge text;

alter table public.app_views
  add constraint app_views_color_valido
  check (color is null or color ~* '^#[0-9A-F]{6}$');

comment on column public.app_views.color is
  'Color de la muestra en el tablero. Tomado de la carta cromática Pintuco.';

update public.app_views set color = c.color, description = c.descripcion
from (values
  ('bo.dashboard',    '#004F9F', 'Resumen operativo del día'),
  ('bo.orders',       '#0284C7', 'Pedidos, estados y seguimiento'),
  ('bo.dispatch',     '#059669', 'Alistamiento, rutas y guías'),
  ('bo.inventory',    '#D97706', 'Existencias, traslados y conteos'),
  ('bo.projects',     '#EA580C', 'Obras, diagnósticos y patologías'),
  ('bo.visits',       '#C2410C', 'Agenda y resultados en campo'),
  ('bo.invoices',     '#002D5C', 'Facturación POS y cartera'),
  ('bo.treasury',     '#0F766E', 'Recaudos y conciliación bancaria'),
  ('bo.accounting',   '#78350F', 'Comprobantes, impuestos y cierres'),
  ('bo.conversations','#BE185D', 'Chat con clientes y trazabilidad'),
  ('bo.catalog',      '#CA8A04', 'Productos, colores y soluciones'),
  ('bo.analytics',    '#1D4ED8', 'Ventas, margen y ranking comercial'),
  ('bo.users',        '#475569', 'Personal, roles y accesos'),
  ('bo.settings',     '#334155', 'Empresa, impuestos y correo')
) as c(code, color, descripcion)
where public.app_views.code = c.code;
