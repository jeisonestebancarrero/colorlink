-- ============================================================
-- Sedes permitidas por usuario (multi-sede, al estilo de Odoo)
-- ============================================================
-- Hoy cualquier persona del personal ve el inventario, las recepciones y los
-- pedidos de las SIETE sedes. Un asesor de Barranquilla ve y puede tocar el
-- inventario de Medellín, y el panel del día le mezcla pedidos de ciudades
-- donde no trabaja.
--
-- El modelo es el de Odoo, con la misma separación de responsabilidades:
--
--   * SEDES PERMITIDAS (`user_pickup_locations`) — es la frontera de
--     SEGURIDAD. La aplica RLS. Lo que no está permitido no se puede leer ni
--     escribir, sin importar qué mande el navegador.
--   * SEDE ACTIVA — es comodidad de PANTALLA. La elige la persona en el
--     selector de la cabecera y solo acota lo que está mirando, dentro de lo
--     que ya tiene permitido. Vive en el navegador, no en la base: no es un
--     control de acceso y no debe confundirse con uno.
--
-- Confundir las dos cosas es el error clásico: si el filtro viviera solo en la
-- pantalla, bastaría cambiar el desplegable —o la petición— para ver otra
-- sede.
--
-- QUIÉN VE QUÉ:
--   * ADMINISTRADOR — todas las sedes, siempre. No se le puede dejar sin
--     acceso a una sede por un error de configuración.
--   * Personal CON sedes asignadas — solo esas.
--   * Personal SIN sedes asignadas — todas. Es el estado actual de las siete
--     cuentas internas, y cambiarlo a "ninguna" dejaría el portal inservible
--     el día del despliegue. La pantalla de Usuarios muestra cuáles no están
--     restringidas para poder acotarlas a propósito, no por accidente.

-- ------------------------------------------------------------
-- Asignación
-- ------------------------------------------------------------
create table if not exists public.user_pickup_locations (
  user_id     uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.pickup_locations(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create index if not exists user_pickup_locations_user_idx
  on public.user_pickup_locations (user_id);

comment on table public.user_pickup_locations is
  'Sedes que un usuario interno tiene permitidas. Sin filas = todas (ver 20260902100014).';

-- ------------------------------------------------------------
-- Helpers de autorización
-- ------------------------------------------------------------

/**
 * ¿Este usuario tiene el acceso restringido a algunas sedes?
 *
 * Se separa de `puede_ver_sede` porque la respuesta "no tiene restricción" es
 * distinta de "tiene permitidas estas": la primera abre todo y la segunda
 * cierra a una lista.
 */
create or replace function public.tiene_sedes_restringidas()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_pickup_locations upl
     where upl.user_id = (select auth.uid())
  );
$$;

/**
 * ¿Puede este usuario ver la sede indicada?
 *
 * `null` devuelve true: hay filas sin sede (un pedido de envío no sale de una
 * tienda, un movimiento de ajuste global) y no se pueden esconder de todo el
 * mundo por no tener sede.
 */
create or replace function public.puede_ver_sede(_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    _location_id is null
    or (select public.is_admin())
    or not public.tiene_sedes_restringidas()
    or exists (
      select 1 from public.user_pickup_locations upl
       where upl.user_id = (select auth.uid())
         and upl.location_id = _location_id
    );
$$;

/**
 * Sedes que el usuario puede ver, como conjunto.
 *
 * La usa el selector de la cabecera para saber qué ofrecer. Devuelve TODAS las
 * activas cuando no hay restricción, que es el caso de las siete cuentas
 * internas de hoy.
 */
create or replace function public.sedes_permitidas()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pl.id
    from public.pickup_locations pl
   where pl.status = 'ACTIVO'
     and (
       (select public.is_admin())
       or not public.tiene_sedes_restringidas()
       or exists (
         select 1 from public.user_pickup_locations upl
          where upl.user_id = (select auth.uid())
            and upl.location_id = pl.id
       )
     );
$$;

revoke all on function public.tiene_sedes_restringidas() from public;
revoke all on function public.puede_ver_sede(uuid) from public;
revoke all on function public.sedes_permitidas() from public;
grant execute on function public.tiene_sedes_restringidas() to authenticated;
grant execute on function public.puede_ver_sede(uuid) to authenticated;
grant execute on function public.sedes_permitidas() to authenticated;

-- ------------------------------------------------------------
-- Permisos sobre la asignación
-- ------------------------------------------------------------
alter table public.user_pickup_locations enable row level security;

-- Cada uno ve las suyas: el selector de la cabecera lo necesita.
drop policy if exists upl_propias on public.user_pickup_locations;
create policy upl_propias
  on public.user_pickup_locations for select to authenticated
  using (user_id = (select auth.uid()));

-- Asignarlas es administrar personal, igual que los roles.
drop policy if exists upl_administracion on public.user_pickup_locations;
create policy upl_administracion
  on public.user_pickup_locations for all to authenticated
  using ((select public.has_permission('users.manage')))
  with check ((select public.has_permission('users.manage')));

grant select, insert, update, delete on public.user_pickup_locations to authenticated;

-- ------------------------------------------------------------
-- El dominio en las tablas que YA tienen sede
-- ------------------------------------------------------------
-- Se REESCRIBEN las políticas existentes en lugar de agregar otras: dos
-- políticas SELECT sobre la misma tabla se combinan con OR, así que una nueva
-- política "permisiva" no restringiría nada.
--
-- El predicado de cada una se conserva EXACTAMENTE como estaba y solo se le
-- añade la condición de sede. Cambiar de paso quién entra —por ejemplo pasar
-- de `is_staff()` a `has_permission('inventory.read')`— sería colar una
-- modificación de accesos dentro de un cambio de multi-sede, y podría dejar
-- gente fuera sin que nadie lo pidiera.

-- Inventario: lectura de todo el personal, ahora solo de sus sedes.
drop policy if exists inventory_lectura_staff on public.inventory;
create policy inventory_lectura_staff
  on public.inventory for select to authenticated
  using (
    (select public.is_staff())
    and (select public.puede_ver_sede(location_id))
  );

-- Escritura de inventario: era solo de administradores, y el administrador ve
-- todas las sedes, así que `puede_ver_sede` no le quita nada. Se añade igual
-- para que el día que se delegue a un jefe de bodega el dominio ya esté puesto.
drop policy if exists inventory_escritura_admin on public.inventory;
create policy inventory_escritura_admin
  on public.inventory for all to authenticated
  using (
    (select public.is_admin())
    and (select public.puede_ver_sede(location_id))
  )
  with check (
    (select public.is_admin())
    and (select public.puede_ver_sede(location_id))
  );

-- Movimientos de inventario
drop policy if exists movimientos_staff on public.inventory_movements;
create policy movimientos_staff
  on public.inventory_movements for select to authenticated
  using (
    (select public.is_staff())
    and (select public.puede_ver_sede(location_id))
  );

-- Recepciones de mercancía
drop policy if exists receipts_lectura_staff on public.purchase_receipts;
create policy receipts_lectura_staff
  on public.purchase_receipts for select to authenticated
  using (
    (select public.is_staff())
    and (select public.puede_ver_sede(location_id))
  );

drop policy if exists receipts_escritura on public.purchase_receipts;
create policy receipts_escritura
  on public.purchase_receipts for all to authenticated
  using (
    ((select public.is_admin()) or (select public.has_permission('inventory.write')))
    and (select public.puede_ver_sede(location_id))
  )
  with check (
    ((select public.is_admin()) or (select public.has_permission('inventory.write')))
    and (select public.puede_ver_sede(location_id))
  );

-- Pedidos.
-- El CLIENTE sigue viendo los suyos y los de su empresa sin importar de qué
-- sede salgan: son sus compras. La restricción de sede aplica solo a la rama
-- del personal interno.
drop policy if exists orders_select_propio on public.orders;
create policy orders_select_propio
  on public.orders for select to authenticated
  using (
    user_id = (select auth.uid())
    or (company_id is not null and company_id in (select public.my_company_ids()))
    or (
      (select public.is_staff())
      and (select public.puede_ver_sede(pickup_location_id))
    )
  );

drop policy if exists orders_update_admin on public.orders;
create policy orders_update_admin
  on public.orders for update to authenticated
  using (
    (select public.is_admin())
    and (select public.puede_ver_sede(pickup_location_id))
  )
  with check (
    (select public.is_admin())
    and (select public.puede_ver_sede(pickup_location_id))
  );

notify pgrst, 'reload schema';
