-- ============================================================
-- Clientes que son personas naturales
-- ============================================================
-- La pantalla de Clientes solo listaba `companies`. Faltaba la otra mitad del
-- negocio: el maestro de obra, el pintor independiente, el arquitecto que
-- compra a su nombre. Están en `profiles` sin `company_id`.
--
-- POR QUÉ UNA FUNCIÓN Y NO UNA CONSULTA DESDE EL NAVEGADOR: distinguir un
-- cliente de un empleado exige leer `user_roles`, y su política solo deja
-- leer los roles PROPIOS salvo que seas administrador
-- (`user_roles_select_admin`). Un asesor consultándolo directamente recibiría
-- una lista vacía. La función lee los roles por dentro y devuelve el
-- resultado ya resuelto.
--
-- Y no amplía nada: se exige `is_staff()`, el mismo requisito que la política
-- `profiles_select_staff` que ya permite leer estas filas. Lo único que añade
-- es el filtro por rol que el llamante no puede calcular por su cuenta.
--
-- SE EXCLUYE AL PERSONAL INTERNO a propósito. En esta base las cuentas
-- internas también tienen el rol CLIENTE —`admin@pintuco.demo`,
-- `asesor@pintuco.demo` y `tecnico@pintuco.demo` lo tienen—, así que sin ese
-- filtro el maestro de obra aparecería junto al administrador del sistema. Un
-- empleado que compre pintura no es un cliente del CRM.

create or replace function public.clientes_personas_naturales(_busqueda text default null)
returns table (
  id uuid,
  nombre text,
  correo text,
  telefono text,
  ciudad text,
  tipo_documento text,
  documento text,
  segmento text,
  foto_url text,
  estado text,
  pedidos bigint,
  creado timestamptz
)
language sql
security definer
set search_path = public
as $$
  with roles_del_personal as (
    -- Los mismos roles que `is_staff()` considera internos.
    select unnest(array[
      'ASESOR','TECNICO','ADMINISTRADOR','BODEGA','DESPACHO','FACTURACION',
      'TESORERIA','CONTABILIDAD','SERVICIO_CLIENTE','MARKETING','GERENCIA'
    ]::public.app_role[]) as rol
  )
  select
    p.id,
    -- El nombre completo ya viene normalizado en mayúsculas por disparador.
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as nombre,
    p.email,
    p.phone,
    p.city,
    p.document_type::text,
    p.document_number,
    p.client_type::text,
    p.avatar_url,
    p.status::text,
    (select count(*) from public.orders o where o.user_id = p.id) as pedidos,
    p.created_at
  from public.profiles p
  where public.is_staff()
    and p.company_id is null
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = p.id and ur.role in ('CLIENTE', 'CLIENTE_B2B')
    )
    and not exists (
      select 1 from public.user_roles ur
      join roles_del_personal rp on rp.rol = ur.role
      where ur.user_id = p.id
    )
    and (
      _busqueda is null or trim(_busqueda) = ''
      or p.first_name ilike '%' || trim(_busqueda) || '%'
      or p.last_name ilike '%' || trim(_busqueda) || '%'
      or p.email ilike '%' || trim(_busqueda) || '%'
      -- El documento se guarda sin puntos, así que se limpia lo que escriban.
      or p.document_number ilike '%' || regexp_replace(coalesce(_busqueda, ''), '[^0-9A-Za-z-]', '', 'g') || '%'
    )
  order by nombre nulls last;
$$;

comment on function public.clientes_personas_naturales(text) is
  'Clientes persona natural (sin empresa) para el portal interno. Excluye al '
  'personal interno, que en esta base también tiene el rol CLIENTE. Exige '
  'is_staff(): no devuelve nada que la política profiles_select_staff no '
  'permitiera ya leer.';

revoke all on function public.clientes_personas_naturales(text) from public, anon;
grant execute on function public.clientes_personas_naturales(text) to authenticated;
