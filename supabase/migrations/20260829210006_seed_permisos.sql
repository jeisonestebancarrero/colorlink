-- ============================================================
-- BACK-OFFICE · 06 — Catálogo de permisos y vistas por rol
-- ============================================================
-- Es el punto de partida que el administrador podrá modificar después desde
-- la interfaz. Va en una migración y no en el seed porque no son datos de
-- demostración: son la definición del producto.
-- ============================================================

insert into public.permissions (code, module, action, label, is_critical, sort_order) values
  ('catalog.read',      'Catálogo',      'read',   'Ver catálogo',                     false, 10),
  ('catalog.write',     'Catálogo',      'write',  'Editar productos, colores y precios', false, 11),
  ('projects.read',     'Proyectos',     'read',   'Ver proyectos',                    false, 20),
  ('projects.write',    'Proyectos',     'write',  'Crear y editar proyectos',         false, 21),
  ('projects.assign',   'Proyectos',     'assign', 'Asignar técnicos a proyectos',     false, 22),
  ('diagnosis.write',   'Diagnóstico',   'write',  'Emitir diagnóstico técnico',       false, 30),
  ('orders.read',       'Pedidos',       'read',   'Ver pedidos',                      false, 40),
  ('orders.status',     'Pedidos',       'status', 'Cambiar estado de pedidos',        false, 41),
  ('inventory.read',    'Inventario',    'read',   'Consultar existencias',            false, 50),
  ('inventory.write',   'Inventario',    'write',  'Registrar movimientos de bodega',  false, 51),
  ('dispatch.manage',   'Despacho',      'manage', 'Gestionar alistamiento y guías',   false, 60),
  ('invoices.read',     'Facturación',   'read',   'Ver facturas',                     false, 70),
  ('invoices.issue',    'Facturación',   'issue',  'Emitir factura POS',               false, 71),
  ('invoices.void',     'Facturación',   'void',   'Anular facturas',                  false, 72),
  ('treasury.manage',   'Tesorería',     'manage', 'Registrar recaudos y conciliar',   false, 80),
  ('accounting.read',   'Contabilidad',  'read',   'Consultar información contable',   false, 90),
  ('chat.reply',        'Conversaciones','reply',  'Responder a clientes',             false, 100),
  ('chat.internal',     'Conversaciones','note',   'Escribir notas internas',          false, 101),
  ('analytics.read',    'Analítica',     'read',   'Ver tableros y ranking comercial', false, 110),
  ('users.manage',      'Administración','manage', 'Crear usuarios y asignar roles',   true,  120),
  ('permissions.manage','Administración','manage', 'Configurar permisos y vistas',     true,  121),
  ('settings.manage',   'Administración','manage', 'Configurar empresa y correo',      true,  122)
on conflict (code) do nothing;

insert into public.app_views (code, label, icon, route, sort_order) values
  ('bo.dashboard',   'Panel',           'LayoutDashboard', '/panel',          10),
  ('bo.orders',      'Pedidos',         'ShoppingBag',     '/pedidos',        20),
  ('bo.dispatch',    'Despacho',        'Truck',           '/despacho',       30),
  ('bo.inventory',   'Inventario',      'Package',         '/inventario',     40),
  ('bo.projects',    'Proyectos',       'FolderKanban',    '/proyectos',      50),
  ('bo.visits',      'Visitas técnicas','Wrench',          '/visitas',        60),
  ('bo.invoices',    'Facturación',     'ReceiptText',     '/facturacion',    70),
  ('bo.treasury',    'Tesorería',       'Landmark',        '/tesoreria',      80),
  ('bo.accounting',  'Contabilidad',    'BookOpen',        '/contabilidad',   90),
  ('bo.conversations','Conversaciones', 'MessagesSquare',  '/conversaciones', 100),
  ('bo.catalog',     'Catálogo',        'Palette',         '/catalogo',       110),
  ('bo.analytics',   'Analítica',       'ChartLine',       '/analitica',      120),
  ('bo.users',       'Usuarios',        'Users',           '/usuarios',       130),
  ('bo.settings',    'Configuración',   'Settings',        '/configuracion',  140)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- Asignación inicial por rol
-- ------------------------------------------------------------
do $$
declare
  v_rol text;
  v_perm text;
  v_vista text;
  -- rol -> permisos
  v_mapa jsonb := jsonb_build_object(
    'ADMINISTRADOR', jsonb_build_array(
      'catalog.read','catalog.write','projects.read','projects.write','projects.assign',
      'diagnosis.write','orders.read','orders.status','inventory.read','inventory.write',
      'dispatch.manage','invoices.read','invoices.issue','invoices.void','treasury.manage',
      'accounting.read','chat.reply','chat.internal','analytics.read','users.manage',
      'permissions.manage','settings.manage'),
    'ASESOR', jsonb_build_array(
      'catalog.read','projects.read','projects.write','orders.read',
      'inventory.read','invoices.read','chat.reply','chat.internal','analytics.read'),
    'TECNICO', jsonb_build_array(
      'catalog.read','projects.read','diagnosis.write','chat.reply','chat.internal'),
    'BODEGA', jsonb_build_array(
      'catalog.read','inventory.read','inventory.write','orders.read'),
    'DESPACHO', jsonb_build_array(
      'catalog.read','orders.read','orders.status','dispatch.manage','inventory.read','chat.reply'),
    'FACTURACION', jsonb_build_array(
      'catalog.read','orders.read','invoices.read','invoices.issue','invoices.void','chat.reply'),
    'TESORERIA', jsonb_build_array(
      'orders.read','invoices.read','treasury.manage','accounting.read'),
    'CONTABILIDAD', jsonb_build_array(
      'orders.read','invoices.read','accounting.read','inventory.read','analytics.read'),
    'SERVICIO_CLIENTE', jsonb_build_array(
      'catalog.read','orders.read','projects.read','chat.reply','chat.internal'),
    'MARKETING', jsonb_build_array(
      'catalog.read','catalog.write','analytics.read'),
    'GERENCIA', jsonb_build_array(
      'catalog.read','projects.read','orders.read','inventory.read','invoices.read',
      'accounting.read','analytics.read')
  );
  -- rol -> vistas
  v_vistas jsonb := jsonb_build_object(
    'ADMINISTRADOR', jsonb_build_array('bo.dashboard','bo.orders','bo.dispatch','bo.inventory','bo.projects','bo.visits','bo.invoices','bo.treasury','bo.accounting','bo.conversations','bo.catalog','bo.analytics','bo.users','bo.settings'),
    'ASESOR',        jsonb_build_array('bo.dashboard','bo.orders','bo.projects','bo.conversations','bo.catalog','bo.analytics'),
    'TECNICO',       jsonb_build_array('bo.dashboard','bo.projects','bo.visits','bo.conversations'),
    'BODEGA',        jsonb_build_array('bo.dashboard','bo.inventory','bo.orders'),
    'DESPACHO',      jsonb_build_array('bo.dashboard','bo.orders','bo.dispatch','bo.conversations'),
    'FACTURACION',   jsonb_build_array('bo.dashboard','bo.orders','bo.invoices','bo.conversations'),
    'TESORERIA',     jsonb_build_array('bo.dashboard','bo.invoices','bo.treasury'),
    'CONTABILIDAD',  jsonb_build_array('bo.dashboard','bo.invoices','bo.accounting','bo.analytics'),
    'SERVICIO_CLIENTE', jsonb_build_array('bo.dashboard','bo.orders','bo.projects','bo.conversations'),
    'MARKETING',     jsonb_build_array('bo.dashboard','bo.catalog','bo.analytics'),
    'GERENCIA',      jsonb_build_array('bo.dashboard','bo.analytics','bo.orders','bo.invoices')
  );
begin
  for v_rol in select jsonb_object_keys(v_mapa) loop
    for v_perm in select jsonb_array_elements_text(v_mapa -> v_rol) loop
      insert into public.role_permissions (role, permission_code, granted)
      values (v_rol::public.app_role, v_perm, true)
      on conflict (role, permission_code) do nothing;
    end loop;
  end loop;

  for v_rol in select jsonb_object_keys(v_vistas) loop
    for v_vista in select jsonb_array_elements_text(v_vistas -> v_rol) loop
      insert into public.role_views (role, view_code, visible)
      values (v_rol::public.app_role, v_vista, true)
      on conflict (role, view_code) do nothing;
    end loop;
  end loop;
end $$;

-- Los roles de cliente NO reciben ninguna vista del back-office: su lista
-- queda vacía a propósito. El portal interno no existe para ellos.
