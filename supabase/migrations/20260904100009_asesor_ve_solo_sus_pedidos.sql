-- El asesor sin otro rol operativo (solo_asesor) ve solo sus pedidos asignados;
-- el resto del personal y los clientes conservan su acceso.

drop policy if exists orders_select_propio on public.orders;

create policy orders_select_propio on public.orders
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (company_id is not null and company_id in (select public.my_company_ids()))
    or (
      (select public.is_staff())
      and (select public.puede_ver_sede(orders.pickup_location_id))
      and (
        not (select public.solo_asesor())
        or orders.advisor_id = (select auth.uid())
      )
    )
  );

-- order_items depende de la política de orders; no requiere cambios.

notify pgrst, 'reload schema';
