-- ============================================================
-- Un asesor ve sus pedidos, no los de todo el mundo
-- ============================================================
-- La política anterior daba a TODO el personal los pedidos de sus sedes. Se le
-- añade una condición y solo una: si quien mira es asesor y NADA MÁS, solo ve
-- los que tiene asignados.
--
-- El «y nada más» es la parte delicada. Quien es asesor y además despacha,
-- factura o administra necesita ver el resto para hacer su trabajo; taparle
-- los pedidos ajenos rompería el despacho y la facturación sin que nadie lo
-- relacione con este cambio. Por eso `solo_asesor()` excluye a quien tenga
-- cualquier otro rol operativo.
--
-- El cliente y su empresa siguen viendo lo suyo exactamente igual: esa parte
-- de la política no se toca.
-- ============================================================

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

-- Las líneas del pedido cuelgan de la política de `orders`, así que no hace
-- falta tocarlas: si el pedido no se ve, sus líneas tampoco.

notify pgrst, 'reload schema';
