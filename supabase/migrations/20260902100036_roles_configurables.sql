-- ============================================================
-- Roles configurables: crear, nombrar y decidir qué ve cada uno
-- ============================================================
-- Faltaban dos cosas para poder trabajar por ROL en vez de usuario por usuario:
--
--   1. `set_role_view` existía desde el principio y NO tenía pantalla. Decir
--      «este rol ya no ve Inventario» solo se podía hacer entrando a la base.
--      Lo único que había en el portal era la excepción por persona, así que
--      cada alta obligaba a repetir la misma configuración a mano.
--
--   2. No se podían crear roles. Los trece del enum eran los que había, y
--      cualquier estructura distinta —un jefe de tienda, un auxiliar— había
--      que forzarla reutilizando uno que no encajaba.
--
-- LO QUE HAY QUE SABER, Y NO ES UN DETALLE: en PostgreSQL un valor de enum se
-- puede AÑADIR pero **no se puede borrar**. Así que un rol creado no se elimina:
-- se ARCHIVA. Deja de ofrecerse para asignar y deja de aparecer en el portal,
-- pero el valor sigue existiendo en la base. Por eso el catálogo tiene una
-- columna `activo` en vez de un borrado, y por eso conviene pensar el nombre
-- antes de crearlo.

-- ------------------------------------------------------------
-- Catálogo de roles
-- ------------------------------------------------------------
-- Las etiquetas vivían en el frontend (`ETIQUETA_ROL`), así que un rol nuevo
-- habría aparecido con su código en mayúsculas hasta el siguiente despliegue.
-- Ahora viven en la base, que es lo que permite crearlos sin desplegar.
create table if not exists public.role_meta (
  role         text primary key,
  label        text not null,
  description  text,
  -- Los trece originales no se pueden archivar ni renombrar: el sistema
  -- depende de ellos (`is_staff()`, `handle_new_user`, las políticas RLS).
  es_del_sistema boolean not null default false,
  activo       boolean not null default true,
  creado_por   uuid references public.profiles(id) on delete set null,
  creado_en    timestamptz not null default now()
);

comment on table public.role_meta is
  'Nombre y estado de cada rol. Los valores viven en el enum `app_role`, que no '
  'admite borrado: por eso aquí se archiva en lugar de eliminar.';

insert into public.role_meta (role, label, description, es_del_sistema) values
  ('CLIENTE',          'Cliente',               'Compra en la tienda', true),
  ('CLIENTE_B2B',      'Cliente empresa',       'Compra a nombre de una empresa', true),
  ('ADMINISTRADOR',    'Administrador',         'Acceso total y configuración', true),
  ('ASESOR',           'Asesor comercial',      'Atiende clientes y proyectos', true),
  ('TECNICO',          'Técnico de campo',      'Visitas y diagnósticos en obra', true),
  ('BODEGA',           'Inventario y bodega',   'Existencias, traslados y conteos', true),
  ('DESPACHO',         'Despacho y logística',  'Alistamiento, rutas y guías', true),
  ('FACTURACION',      'Facturación y cartera', 'Emite y consulta facturas', true),
  ('TESORERIA',        'Tesorería',             'Recaudos, egresos y conciliación', true),
  ('CONTABILIDAD',     'Contabilidad',          'Comprobantes y libros', true),
  ('SERVICIO_CLIENTE', 'Servicio al cliente',   'Conversaciones y seguimiento', true),
  ('MARKETING',        'Marketing y contenido', 'Catálogo y colores', true),
  ('GERENCIA',         'Gerencia y analítica',  'Ventas, margen y ranking', true)
on conflict (role) do nothing;

alter table public.role_meta enable row level security;

-- Lo lee cualquiera con sesión: hace falta para pintar el nombre de un rol en
-- la ficha de un usuario. Escribir, solo el administrador.
create policy role_meta_lectura on public.role_meta
  for select to authenticated using (true);
create policy role_meta_admin on public.role_meta
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.role_meta to authenticated;

-- ------------------------------------------------------------
-- Crear un rol
-- ------------------------------------------------------------
create or replace function public.crear_rol(
  _codigo text,
  _etiqueta text,
  _descripcion text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo un administrador crea roles' using errcode = '42501';
  end if;

  -- El código se normaliza: es un valor de enum y va a quedar para siempre.
  -- Sin tildes, sin espacios y en mayúsculas, como los que ya existen.
  v_codigo := upper(trim(_codigo));
  v_codigo := translate(v_codigo, 'ÁÉÍÓÚÑ ', 'AEIOUN_');
  v_codigo := regexp_replace(v_codigo, '[^A-Z0-9_]', '', 'g');

  if length(v_codigo) < 3 then
    raise exception 'CODIGO_INVALIDO: el código necesita al menos 3 letras'
      using errcode = '22023';
  end if;
  if coalesce(trim(_etiqueta), '') = '' then
    raise exception 'VALIDATION: ponle un nombre visible al rol' using errcode = '22023';
  end if;
  if exists (select 1 from public.role_meta where role = v_codigo) then
    raise exception 'YA_EXISTE: ya hay un rol con el código %', v_codigo using errcode = '22023';
  end if;

  -- Añadir el valor al enum. `if not exists` cubre el caso de que el valor
  -- quedara del enum pero se hubiera borrado su fila de catálogo.
  execute format('alter type public.app_role add value if not exists %L', v_codigo);

  insert into public.role_meta (role, label, description, es_del_sistema, creado_por)
  values (v_codigo, trim(_etiqueta), nullif(trim(_descripcion), ''), false, (select auth.uid()));

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'ROLE_CREATE', 'role_meta', null,
          jsonb_build_object('rol', v_codigo, 'etiqueta', trim(_etiqueta)));

  -- Nace SIN NADA. Un rol nuevo con permisos heredados de algún sitio sería la
  -- forma más silenciosa de dar acceso de más.
  return jsonb_build_object('rol', v_codigo, 'etiqueta', trim(_etiqueta), 'permisos', 0);
end;
$$;

-- ------------------------------------------------------------
-- Renombrar y archivar
-- ------------------------------------------------------------
create or replace function public.actualizar_rol(
  _codigo text,
  _etiqueta text default null,
  _descripcion text default null,
  _activo boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sistema boolean;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo un administrador configura roles' using errcode = '42501';
  end if;

  select es_del_sistema into v_sistema from public.role_meta where role = _codigo;
  if v_sistema is null then
    raise exception 'NOT_FOUND: ese rol no existe' using errcode = 'P0002';
  end if;

  -- Los del sistema se pueden renombrar pero NO archivar: `is_staff()`,
  -- `handle_new_user` y varias políticas los nombran directamente, así que
  -- apagarlos rompería el acceso sin que nada lo avisara.
  if v_sistema and _activo = false then
    raise exception 'ROL_DEL_SISTEMA: este rol es parte del funcionamiento y no se puede archivar'
      using errcode = '22023';
  end if;

  -- Archivar un rol que alguien tiene puesto lo dejaría con un acceso que ya
  -- no se puede configurar desde ninguna pantalla.
  if _activo = false and exists (select 1 from public.user_roles where role::text = _codigo) then
    raise exception 'ROL_EN_USO: hay personas con ese rol. Quítaselo antes de archivarlo.'
      using errcode = '22023';
  end if;

  update public.role_meta
     set label = coalesce(nullif(trim(_etiqueta), ''), label),
         description = coalesce(nullif(trim(_descripcion), ''), description),
         activo = coalesce(_activo, activo)
   where role = _codigo;

  insert into public.audit_logs (user_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), 'ROLE_UPDATE', 'role_meta', null,
          jsonb_build_object('rol', _codigo, 'activo', _activo));

  return (select to_jsonb(r) from public.role_meta r where r.role = _codigo);
end;
$$;

-- ------------------------------------------------------------
-- Qué ve y qué puede cada rol, en una sola consulta
-- ------------------------------------------------------------
create or replace function public.configuracion_de_roles()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then jsonb_build_object(
    'roles', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'codigo', m.role, 'etiqueta', m.label, 'descripcion', m.description,
        'delSistema', m.es_del_sistema, 'activo', m.activo,
        'personas', (select count(*) from public.user_roles ur where ur.role::text = m.role)
      ) order by m.es_del_sistema desc, m.label), '[]'::jsonb)
      from public.role_meta m
    ),
    'vistas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', v.code, 'label', v.label, 'area', v.area, 'orden', v.sort_order
      ) order by v.sort_order), '[]'::jsonb)
      from public.app_views v where v.is_active
    ),
    'porRol', (
      select coalesce(jsonb_object_agg(t.rol, t.codigos), '{}'::jsonb)
      from (
        select rv.role::text as rol, jsonb_agg(rv.view_code) as codigos
        from public.role_views rv group by rv.role
      ) t
    )
  ) else null end;
$$;

revoke all on function public.crear_rol(text, text, text) from public, anon;
revoke all on function public.actualizar_rol(text, text, text, boolean) from public, anon;
revoke all on function public.configuracion_de_roles() from public, anon;
grant execute on function public.crear_rol(text, text, text) to authenticated;
grant execute on function public.actualizar_rol(text, text, text, boolean) to authenticated;
grant execute on function public.configuracion_de_roles() to authenticated;

comment on function public.crear_rol(text, text, text) is
  'Crea un rol. Nace SIN permisos ni vistas: heredarlos de algún sitio sería la '
  'forma más silenciosa de dar acceso de más. Un valor de enum no se puede '
  'borrar, así que el rol se archiva, no se elimina.';
