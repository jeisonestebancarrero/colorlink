-- Sedes permitidas por usuario: frontera de seguridad aplicada por RLS. La sede
-- activa del selector es solo filtro de pantalla. Administrador y personal sin
-- sedes asignadas ven todas.

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

/** Distingue «sin restricción» (ve todo) de «restringido a una lista». */
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

/** null devuelve true: las filas sin sede no se ocultan a todos. */
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

/** Sedes visibles para el usuario; todas las activas si no tiene restricción. */
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

alter table public.user_pickup_locations enable row level security;

-- Cada usuario ve las suyas, para el selector.
drop policy if exists upl_propias on public.user_pickup_locations;
create policy upl_propias
  on public.user_pickup_locations for select to authenticated
  using (user_id = (select auth.uid()));

-- Asignar sedes es administrar personal.
drop policy if exists upl_administracion on public.user_pickup_locations;
create policy upl_administracion
  on public.user_pickup_locations for all to authenticated
  using ((select public.has_permission('users.manage')))
  with check ((select public.has_permission('users.manage')));

grant select, insert, update, delete on public.user_pickup_locations to authenticated;

-- Se reescriben las políticas existentes (varias SELECT se combinan con OR) y se
-- conserva cada predicado original añadiendo solo la condición de sede.

drop policy if exists inventory_lectura_staff on public.inventory;
create policy inventory_lectura_staff
  on public.inventory for select to authenticated
  using (
    (select public.is_staff())
    and (select public.puede_ver_sede(location_id))
  );

-- Hoy solo escribe el administrador, que ve todo; la sede queda puesta para cuando se delegue.
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

drop policy if exists movimientos_staff on public.inventory_movements;
create policy movimientos_staff
  on public.inventory_movements for select to authenticated
  using (
    (select public.is_staff())
    and (select public.puede_ver_sede(location_id))
  );

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

-- La restricción de sede aplica solo a la rama del personal; el cliente ve todos sus pedidos.
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
