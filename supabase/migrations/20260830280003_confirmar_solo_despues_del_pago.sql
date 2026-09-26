-- La confirmación del pedido sale cuando se resuelve el cobro (PAGADO o a crédito),
-- no al crearlo. PAGO_RECIBIDO ya distingue ambos casos.
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

    -- Solo en la transición, para no reenviar el correo.
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
