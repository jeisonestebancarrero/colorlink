-- ============================================================
-- Sede en facturas, envíos, tesorería y visitas
-- ============================================================
-- Cierra el hueco que quedó del multi-sede: `inventory`,
-- `inventory_movements`, `purchase_receipts` y `orders` ya se acotan por sede,
-- pero facturación, despacho, tesorería y visitas no tenían columna, así que
-- no se podían acotar NI contar por sede.
--
-- DE DÓNDE SALE LA SEDE EN CADA UNA:
--   * invoices           — del pedido que factura. `issue_pos_invoice` factura
--                          un pedido, y el pedido ya sabe de qué sede sale.
--   * shipments          — del pedido que despacha.
--   * treasury_movements — del pedido o de la factura a la que corresponde el
--                          recaudo. Un egreso suelto no tiene sede y se queda
--                          en null, que es lo correcto: no pertenece a una.
--   * technical_visits   — NO SE PUEDE DERIVAR y se queda en null a propósito.
--                          Una visita cuelga de un proyecto, y los proyectos no
--                          tienen sede. Asignarle la sede más cercana sería
--                          inventar el dato. La columna queda lista para que el
--                          flujo de programación la fije cuando se decida qué
--                          sede atiende cada visita.
--
-- `puede_ver_sede(null)` devuelve true, así que las filas sin sede las siguen
-- viendo todos: esconderlas de todo el mundo sería peor que no acotarlas.

alter table public.invoices
  add column if not exists location_id uuid references public.pickup_locations(id);
alter table public.shipments
  add column if not exists location_id uuid references public.pickup_locations(id);
alter table public.treasury_movements
  add column if not exists location_id uuid references public.pickup_locations(id);
alter table public.technical_visits
  add column if not exists location_id uuid references public.pickup_locations(id);

create index if not exists invoices_location_idx on public.invoices (location_id);
create index if not exists shipments_location_idx on public.shipments (location_id);
create index if not exists treasury_movements_location_idx on public.treasury_movements (location_id);
create index if not exists technical_visits_location_idx on public.technical_visits (location_id);

comment on column public.invoices.location_id is
  'Sede que emitió la factura. Se deriva del pedido (ver 20260902100016).';
comment on column public.technical_visits.location_id is
  'Sede que atiende la visita. Puede ser null: un proyecto no tiene sede y no se inventa.';

-- ------------------------------------------------------------
-- Que se llene sola de aquí en adelante
-- ------------------------------------------------------------
-- Va en disparadores y no dentro de `issue_pos_invoice` para que se cumpla
-- también si la factura o el envío se crean por otro camino.

create or replace function public.invoices_heredar_sede()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.location_id is null and new.order_id is not null then
    select o.pickup_location_id into new.location_id
      from public.orders o where o.id = new.order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_zz_sede on public.invoices;
create trigger invoices_zz_sede
  before insert on public.invoices
  for each row execute function public.invoices_heredar_sede();

create or replace function public.shipments_heredar_sede()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.location_id is null and new.order_id is not null then
    select o.pickup_location_id into new.location_id
      from public.orders o where o.id = new.order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_zzz_sede on public.shipments;
create trigger shipments_zzz_sede
  before insert on public.shipments
  for each row execute function public.shipments_heredar_sede();

create or replace function public.tesoreria_heredar_sede()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.location_id is null then
    if new.order_id is not null then
      select o.pickup_location_id into new.location_id
        from public.orders o where o.id = new.order_id;
    end if;
    if new.location_id is null and new.invoice_id is not null then
      select i.location_id into new.location_id
        from public.invoices i where i.id = new.invoice_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists treasury_zz_sede on public.treasury_movements;
create trigger treasury_zz_sede
  before insert on public.treasury_movements
  for each row execute function public.tesoreria_heredar_sede();

-- ------------------------------------------------------------
-- Lo que ya está guardado
-- ------------------------------------------------------------
update public.invoices i
   set location_id = o.pickup_location_id
  from public.orders o
 where o.id = i.order_id and i.location_id is null;

update public.shipments s
   set location_id = o.pickup_location_id
  from public.orders o
 where o.id = s.order_id and s.location_id is null;

update public.treasury_movements t
   set location_id = o.pickup_location_id
  from public.orders o
 where o.id = t.order_id and t.location_id is null;

update public.treasury_movements t
   set location_id = i.location_id
  from public.invoices i
 where i.id = t.invoice_id and t.location_id is null;

-- ------------------------------------------------------------
-- El dominio
-- ------------------------------------------------------------
-- Igual que antes: se REESCRIBEN las políticas conservando su predicado
-- original y añadiendo la sede. Y el CLIENTE nunca queda acotado por sede: su
-- factura es su factura, la emita la tienda que la emita.

drop policy if exists invoices_select on public.invoices;
create policy invoices_select
  on public.invoices for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select public.is_staff())
      and (select public.puede_ver_sede(location_id))
    )
  );

drop policy if exists invoices_admin on public.invoices;
create policy invoices_admin
  on public.invoices for all to authenticated
  using (
    (select public.is_admin())
    and (select public.puede_ver_sede(location_id))
  )
  with check (
    (select public.is_admin())
    and (select public.puede_ver_sede(location_id))
  );

drop policy if exists shipments_select on public.shipments;
create policy shipments_select
  on public.shipments for select to authenticated
  using (
    exists (
      select 1 from public.orders o
       where o.id = shipments.order_id
         and (
           o.user_id = (select auth.uid())
           or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
         )
    )
    or (
      (select public.is_staff())
      and (select public.puede_ver_sede(location_id))
    )
  );

drop policy if exists shipments_staff on public.shipments;
create policy shipments_staff
  on public.shipments for all to authenticated
  using (
    (select public.is_staff())
    and (select public.puede_ver_sede(location_id))
  )
  with check (
    (select public.is_staff())
    and (select public.puede_ver_sede(location_id))
  );

drop policy if exists movimientos_finanzas on public.treasury_movements;
create policy movimientos_finanzas
  on public.treasury_movements for select to authenticated
  using (
    (
      (select public.is_admin())
      or (select public.has_permission('treasury.manage'))
      or (select public.has_permission('accounting.read'))
    )
    and (select public.puede_ver_sede(location_id))
  );

-- Visitas: se añade la sede a la rama del personal. La condición de proyecto se
-- conserva tal cual, que es la que protege la privacidad del cliente.
drop policy if exists technical_visits_staff on public.technical_visits;
create policy technical_visits_staff
  on public.technical_visits for all to authenticated
  using (
    (select public.is_staff())
    and (select public.can_access_project(technical_visits.project_id))
    and (select public.puede_ver_sede(location_id))
  )
  with check (
    (select public.is_staff())
    and (select public.can_access_project(technical_visits.project_id))
    and (select public.puede_ver_sede(location_id))
  );

notify pgrst, 'reload schema';
