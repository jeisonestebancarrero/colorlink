-- ============================================================
-- El correo de confirmación sale DESPUÉS del pago, no antes
-- ============================================================
-- `orders_correo_creado` se disparaba al fijarse el total del pedido, que
-- ocurre en el mismo instante en que se crea. El cliente recibía "Recibimos tu
-- pedido" antes de pagar, y si abandonaba el pago se quedaba con un correo de
-- una compra que nunca existió.
--
-- El pedido no es una venta hasta que hay cobro. Así que la confirmación se
-- manda cuando el cobro se resuelve, en cualquiera de sus dos formas:
--   · pago aprobado por la pasarela (status = PAGADO), o
--   · pedido a crédito de una empresa con cupo (is_credit), donde no hay cobro
--     en línea pero sí un compromiso en firme.
--
-- La plantilla PAGO_RECIBIDO ya distingue los dos casos y escribe el texto que
-- corresponde, incluida la fecha de vencimiento del crédito.
drop trigger if exists orders_correo_creado on public.orders;
drop function if exists public.correo_pedido_creado();

create or replace function public.correo_pago_recibido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_user  uuid;
  v_confirmado boolean;
  v_antes      boolean;
begin
  v_confirmado := new.status = 'PAGADO' or new.is_credit;
  v_antes      := old.status = 'PAGADO' or old.is_credit;

  -- Solo en la transición. Un pago ya confirmado que se vuelve a tocar no
  -- puede mandar el correo otra vez.
  if v_confirmado and not v_antes then
    select o.user_id, p.email into v_user, v_email
      from public.orders o
      join public.profiles p on p.id = o.user_id
     where o.id = new.order_id;
    perform public.enviar_correo(v_email, 'PAGO_RECIBIDO', new.order_id, v_user);
  end if;

  return new;
end;
$$;

drop trigger if exists payments_correo_pago on public.payments;
create trigger payments_correo_pago
  after update on public.payments
  for each row execute function public.correo_pago_recibido();
