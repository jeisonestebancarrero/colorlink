-- ============================================================
-- FASE 14 — RLS del comercio y el servicio
-- ============================================================
-- Regla general: cada quien ve lo suyo; el usuario B2B ve además lo de su
-- empresa; el personal interno ve lo que le corresponde por su rol.
-- Ninguna política usa USING(true) sobre datos de cliente.
-- ============================================================

alter table public.carts              enable row level security;
alter table public.cart_items         enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.payments           enable row level security;
alter table public.shipments          enable row level security;
alter table public.technical_visits   enable row level security;
alter table public.warranties         enable row level security;
alter table public.notifications      enable row level security;
alter table public.favorites          enable row level security;
alter table public.audit_logs         enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'carts','cart_items','orders','order_items','payments','shipments',
    'technical_visits','warranties','notifications','favorites','audit_logs'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- CARRITO: estrictamente privado ----------
create policy "carts_propio" on public.carts
  for all to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

create policy "cart_items_propio" on public.cart_items
  for all to authenticated
  using ( exists (select 1 from public.carts c
                  where c.id = cart_id and c.user_id = (select auth.uid())) )
  with check ( exists (select 1 from public.carts c
                  where c.id = cart_id and c.user_id = (select auth.uid())) );

-- ---------- PEDIDOS ----------
create policy "orders_select_propio" on public.orders
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (company_id is not null and company_id in (select public.my_company_ids()))
    or (select public.is_staff())
  );

-- Los pedidos NO se insertan directamente: se crean con create_order_from_cart,
-- que es quien calcula los importes. Sin política de INSERT, nadie puede
-- fabricar un pedido con el total que le apetezca.

-- Cambiar el estado de un pedido es potestad de administración (MÓDULO 61);
-- el cliente solo puede cancelar mientras esté pendiente.
create policy "orders_update_admin" on public.orders
  for update to authenticated
  using      ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

create policy "order_items_select" on public.order_items
  for select to authenticated
  using ( exists (select 1 from public.orders o where o.id = order_id and (
            o.user_id = (select auth.uid())
            or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
            or (select public.is_staff()))) );

-- ---------- PAGOS Y ENVÍOS ----------
create policy "payments_select" on public.payments
  for select to authenticated
  using ( exists (select 1 from public.orders o where o.id = order_id and (
            o.user_id = (select auth.uid())
            or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
            or (select public.is_staff()))) );

create policy "payments_admin" on public.payments
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

create policy "shipments_select" on public.shipments
  for select to authenticated
  using ( exists (select 1 from public.orders o where o.id = order_id and (
            o.user_id = (select auth.uid())
            or (o.company_id is not null and o.company_id in (select public.my_company_ids()))
            or (select public.is_staff()))) );

create policy "shipments_staff" on public.shipments
  for all to authenticated
  using ( (select public.is_staff()) ) with check ( (select public.is_staff()) );

-- ---------- VISITAS TÉCNICAS ----------
create policy "technical_visits_select" on public.technical_visits
  for select to authenticated
  using ( (select public.can_access_project(project_id)) );

-- Programar y ejecutar visitas es trabajo del personal interno.
create policy "technical_visits_staff" on public.technical_visits
  for all to authenticated
  using      ( (select public.is_staff()) and (select public.can_access_project(project_id)) )
  with check ( (select public.is_staff()) and (select public.can_access_project(project_id)) );

-- ---------- GARANTÍAS ----------
create policy "warranties_select" on public.warranties
  for select to authenticated
  using ( user_id = (select auth.uid()) or (select public.is_staff()) );

-- Emitir una garantía es un acto de la empresa, nunca del cliente.
create policy "warranties_admin" on public.warranties
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

-- ---------- NOTIFICACIONES ----------
create policy "notifications_select_propio" on public.notifications
  for select to authenticated using ( user_id = (select auth.uid()) );

-- Solo se puede marcar como leída la propia.
create policy "notifications_update_propio" on public.notifications
  for update to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

create policy "notifications_delete_propio" on public.notifications
  for delete to authenticated using ( user_id = (select auth.uid()) );

-- Las notificaciones las emite el servidor (funciones SECURITY DEFINER) o
-- administración: un usuario no se fabrica avisos.
create policy "notifications_insert_admin" on public.notifications
  for insert to authenticated with check ( (select public.is_admin()) );

-- ---------- FAVORITOS ----------
create policy "favorites_propio" on public.favorites
  for all to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

-- ---------- AUDITORÍA: solo lectura, solo administración ----------
create policy "audit_logs_admin" on public.audit_logs
  for select to authenticated using ( (select public.is_admin()) );
